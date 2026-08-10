# Monitoramento silencioso de suporte em conversas humanas

Permitir que a Donatella detecte pedidos de suporte pós-venda mesmo quando a conversa já está atribuída a um atendente humano (`status = 'human'`). Ela não responde ao cliente nesse modo — apenas escuta, classifica, abre ticket e alerta a Produção.

## 1. O que muda no fluxo de mensagens

Hoje o `message-grouper` só enfileira mensagens para a Nina quando `conversation.status = 'nina'`. A partir desta mudança, mensagens de conversas `status = 'human'` também serão enfileiradas, mas com uma flag de modo silencioso.

- `status = 'nina'` → comportamento atual: Donatella responde normalmente ao cliente.
- `status = 'human'` → novo modo silencioso: Donatella classifica em segundo plano, sem mandar mensagem para o cliente.

Em ambos os casos, a detecção de suporte pós-venda continua usando a ferramenta `request_human_handoff` com reason pós-venda (`complaint`, `order_status`, `cancel_change`, `payment_invoice`).

## 2. Alterações técnicas

### 2.1 `supabase/functions/message-grouper/index.ts`

- No bloco que hoje verifica `if (conversation.status === 'nina')`, expandir a condição para também enfileirar quando `conversation.status === 'human'`.
- Adicionar no `context_data` da fila `nina_processing_queue` a flag `is_silent_monitoring: true` quando for humano, e `false` quando for Nina.
- Manter a idempotência via índice único parcial em `message_id`.

### 2.2 `supabase/functions/nina-orchestrator/index.ts`

- Ler `context_data.is_silent_monitoring` no início do processamento de cada item da fila.
- Quando `is_silent_monitoring = true`:
  - Injetar uma instrução extra no system prompt informando que a conversa está com um humano, que a IA deve apenas detectar pedidos de suporte pós-venda e usar `request_human_handoff`, e que não deve responder ao cliente.
  - Não chamar `queueTextResponse` nem gerar resposta em áudio.
  - Não inserir nada na `send_queue` como resposta da Nina.
- Processar o tool call `request_human_handoff` normalmente:
  - Se for pós-venda (`complaint`, `order_status`, `cancel_change`, `payment_invoice`):
    - Mover a conversa para `queue = 'support'` (o `status` continua `human`, pois há um humano atribuído).
    - Classificar o motivo via `classifySupportIntake`.
    - Abrir/atualizar `support_cases` para essa conversa.
    - Atribuir o responsável da Produção (`producao_user_id`) e a equipe de Produção.
    - Disparar o alerta de plantão (`dispatchSupportAlert`).
  - Se não for pós-venda, não fazer nada (lead qualificado ou dúvida comercial continua com o humano).
- Adicionar guarda contra ticket duplicado: se já existir um `support_cases` aberto (`closed_at IS NULL`) para a conversa, não criar um novo; apenas atualizar o alerta se necessário.
- Registrar no metadata do `support_cases` o gatilho `triggered_by: 'donatella_silent_monitor'` para diferenciar tickets criados por humanos versus pela IA em modo silencioso.

### 2.3 Ajustes no system prompt

- Incluir uma seção curta de `monitoring_mode` que seja ativada apenas quando `is_silent_monitoring = true`.
- Exemplo de instrução: "Esta conversa está sendo conduzida por um atendente humano. Você está monitorando silenciosamente. Não responda ao cliente. Se a mensagem indicar um problema pós-venda, use `request_human_handoff` com reason pós-venda. Caso contrário, não faça nada."

## 3. O que não muda

- A detecção de suporte continua baseada na intenção identificada pela IA, sem botões.
- A taxonomia de 19 categorias de suporte permanece a mesma.
- O handoff pós-venda mantém a criação do ticket, atribuição da Produção e envio do alerta de plantão.
- A resposta ao cliente só acontece em conversas `status = 'nina'`.

## 4. Validação e deploy

- Revisar typecheck e deploy das duas funções:
  - `message-grouper`
  - `nina-orchestrator`
- Testar cenário: conversa com `status = 'human'` e mensagem do cliente indicando problema de entrega → espera-se que:
  - a conversa mude para `queue = 'support'`;
  - um `support_cases` seja criado com categoria correta;
  - o alerta de plantão seja enfileirado;
  - nenhuma resposta da Nina seja enviada ao cliente.