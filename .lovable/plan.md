## Sintomas
1. **Tag de suporte persiste** quando contato antigo volta a falar, mesmo depois do ticket finalizado.
2. **Nina retoma o assunto antigo** sem perguntar se o cliente quer continuar de onde parou ou tratar outro tema.

## Diagnóstico

### Causa 1 — Reabertura não limpa contexto de atendimento
`supabase/functions/whatsapp-webhook/index.ts` (linhas 216-233) reabre a conversa antiga assim:
```ts
.update({ is_active: true, status: 'nina', last_message_at: now })
```
**Falta:** resetar `queue` (continua `support`), `assigned_user_id`, `assigned_team` e `nina_context`. Consequências:
- Conversa em `queue='support'` faz a Nina **pular completamente** a mensagem (`nina-orchestrator` linha 229: `Skipped: support queue (human-only)`).
- Visual do chat continua marcado como suporte mesmo o ticket tendo sido encerrado.

### Causa 2 — Nina lê histórico inteiro como contínuo
`nina-orchestrator/index.ts` linhas 785-791 carrega as últimas 20 mensagens sem nenhum corte temporal nem aviso de retomada. Se o último contato foi há dias/semanas, o modelo recebe o final do assunto velho e simplesmente continua dele.

## Comportamento desejado (definido agora)
Quando o contato volta depois de uma pausa significativa:
1. Nina **detecta a retomada** (gap de tempo entre a última mensagem dela e a nova mensagem do cliente).
2. Carrega **um resumo curto** do assunto anterior (não o histórico cru de 20 mensagens).
3. Sempre **pergunta ao cliente**: "Vi que da última vez conversamos sobre X. Quer continuar daquele assunto ou prefere tratar de outra coisa hoje?"
4. Só usa o histórico antigo no prompt se o cliente confirmar que quer retomar; senão, trata como nova interação.

## Fix técnico

### Fix 1 — Reset de roteamento na reabertura (`whatsapp-webhook/index.ts`)
No update de reabertura (linhas 218-227), também setar:
- `queue: 'sales'`
- `assigned_user_id: null`, `assigned_team: null`
- `nina_context: {}`
- `started_at: now()` (marco da nova sessão)
- `metadata.resumption`: `{ previous_last_message_at, previous_topic_summary, asked_resume_question: false, user_confirmed_resume: null }`

**Não mexer em `tags` da conversa nem do contato** — pode ter info útil (VIP etc.).

### Fix 2 — Resumo do assunto anterior na reabertura (`whatsapp-webhook/index.ts`)
Logo após detectar reabertura e antes do update, fazer chamada leve ao Lovable AI Gateway (`gemini-2.5-flash-lite`) com as últimas ~15 mensagens da conversa antiga pedindo um resumo de 1 frase do tema central. Gravar em `metadata.resumption.previous_topic_summary`. Falha silenciosa: se a chamada der erro, fica `null` e Nina pergunta genericamente.

### Fix 3 — Detectar retomada e perguntar (`nina-orchestrator/index.ts`)
Antes de montar `conversationHistory`:

```text
if conversation.metadata.resumption.asked_resume_question === false:
  // Nina ainda não perguntou — primeira mensagem pós-retomada
  Substituir conversationHistory por:
    - system note: "Cliente retornou após {dias} dias de pausa. Resumo do assunto anterior: {summary}. NÃO retome o assunto antigo automaticamente. Cumprimente e pergunte se ele quer continuar onde paramos (mencione o assunto) ou tratar de outra coisa."
    - apenas a mensagem atual do cliente
  Marcar metadata.resumption.asked_resume_question = true
  
else if asked_resume_question === true && user_confirmed_resume === null:
  // Cliente respondeu à pergunta — interpretar
  Adicionar tool/instrução: classificar resposta como "retomar" | "novo assunto" | "ambíguo"
  Gravar user_confirmed_resume e usar histórico completo só se confirmou retomada
  
else:
  Fluxo normal (com ou sem histórico antigo conforme user_confirmed_resume)
```

Definição de "pausa significativa": **gap ≥ 24h** entre `previous_last_message_at` e a nova mensagem. Abaixo disso, é continuação natural e não pergunta.

## Passos de debug que vou rodar antes
1. Consultar conversas ativas com `queue='support'` cujo `last_message_at` é recente — confirmar quantas estão presas nesse estado.
2. Para 2-3 contatos suspeitos, listar gap entre mensagens consecutivas pra ver tamanhos típicos de pausa.
3. Olhar logs do `nina-orchestrator` filtrando por `Skipped: support queue`.

## Fora de escopo
- UI do chat (badges, etc.) — backend resolve sozinho.
- Mexer em dedupe, agendamento, WooCommerce, handoff humano, áudio.
- Criar tabela nova — tudo cabe em `conversations.metadata` e `nina_context`.
- Não limpar `tags` da conversa nem do contato.

## Confirmação que preciso de você
- **24h como limite de "pausa"** está bom? (alternativas: 12h, 48h, 7 dias)
