
## Objetivo
Após o cliente escolher "Suporte" na triagem, a Donatella faz uma coleta mínima (número do pedido + descrição do problema), classifica motivo/sentimento e transfere automaticamente para o time **Produção** com um resumo interno. Hoje o fluxo escolhe um tópico via botão e já transfere em branco — vamos substituir por uma mini-conversa guiada pela IA.

## Mudanças

### 1. `supabase/functions/nina-orchestrator/index.ts`
- **Remover** o early-return `queue === 'support' → skip Nina`. A Donatella precisa continuar respondendo enquanto está em modo coleta. (Após o handoff, ela para porque o `is_active` da conversa muda — ver passo 3.)
- **Substituir o passo `await_support_topic`** por um novo modo `support_intake`:
  - Pergunta sequencial: (a) "Qual é o número do pedido?" (b) "Em poucas palavras, o que aconteceu?"
  - As respostas ficam em `nina_context.support_intake = { order_number, issue_text }`.
  - Aceita "não tenho/não sei" como resposta válida para o número do pedido.
- **Após coletar**, a Donatella chama uma única vez o LLM com um prompt focado em classificar:
  - `reason` ∈ SUPPORT_REASONS (`cobranca | acesso | bug | duvida | pedido | outro`)
  - `sentiment` ∈ `calmo | neutro | frustrado | urgente`
  - `summary` (1-2 linhas para o atendente)
  - `customer_message` (mensagem amigável confirmando que vai acionar a Produção)
- Em seguida invoca `request_human_handoff` internamente com `target_team = 'producao'` e os campos acima, e envia `customer_message` ao cliente.

### 2. `request_human_handoff` tool
- Adicionar parâmetro opcional `target_team` (`producao` | `comercial`, default `comercial`).
- No `execute` da tool: resolver o `team_id` do time pelo nome (case-insensitive `Produção` / `Comercial`) e atualizar `conversations.assigned_team = <team_id>`, `queue = 'support'`, `status = 'human'`, `is_active = false` (Nina para de responder), `tags += ['motivo:<reason>', 'sentimento:<sentiment>']`.
- Criar `notifications` apontando para o time Produção com o resumo.
- Registrar uma mensagem interna (system note) na conversa: "Donatella transferiu para Produção · Motivo: Pedido · Sentimento: frustrado · Resumo: …" para ficar visível no chat.

### 3. Atendimento (lado esquerdo do fluxograma)
- Não muda: a Donatella continua conversando livremente; só escala via gatilho existente (`request_human_handoff` com `target_team = 'comercial'`).
- Aproveitar a mesma extensão de `target_team` para permitir que a IA roteie corretamente quando o caso pede o time comercial.

### 4. `src/lib/supportReasons.ts`
- Adicionar export `SUPPORT_SENTIMENTS` (`calmo|neutro|frustrado|urgente`) e helper `sentimentTag(key)` com prefixo `sentimento:`, simétrico ao `motivo:`. UI de chat já lê tags arbitrárias, então as novas aparecem automaticamente nos badges.

### 5. UI mínima
- `ChatInterface.tsx`: já mostra tags da conversa; nenhuma alteração estrutural. Apenas garantir que o badge de "Motivo" e o novo de "Sentimento" sejam exibidos com cor diferente (ajuste cosmético).

## Fora do escopo
- Não vamos mudar a triagem inicial (botões Atendimento/Suporte continuam iguais).
- Não vamos alterar horários de atendimento — se a Produção estiver fora do horário, a Donatella ainda transfere e o aviso de fora-de-horário sai naturalmente como já está implementado.
- Não cria novos times nem altera RLS.

## Validação
1. Enviar "Suporte" no triage → Donatella pergunta nº do pedido → cliente responde → pergunta o problema → cliente descreve.
2. Conferir nos logs do `nina-orchestrator` que ocorreu uma classificação e a chamada do `request_human_handoff` com `target_team=producao`.
3. Conferir no chat: conversa aparece na fila do time Produção, com tags `motivo:*` e `sentimento:*`, e a Donatella parou de responder.
