## Problema

O follow-up "Oi! Vi que você começou uma conversa..." está indo em qualquer conversa em que a última mensagem não é do cliente — inclusive quando a última mensagem é um **template de automação** (ex.: `PEDIDO_RETIRADO` disparado pelo WooCommerce). Isso gera o cenário do print: cliente recebeu aviso de entrega e, 1h depois, tomou um follow-up de "não seguiu a conversa".

O follow-up deve rodar **só no cenário original**: lead novo entrou, a Donatella respondeu a saudação, e o lead não voltou.

## Verificado

- `supabase/functions/followup-inactive-leads/index.ts` filtra por `status='nina'`, `queue='sales'`, `is_active`, `last_message_at` na janela, e apenas confirma que a última mensagem não é do usuário. Nada impede que essa última mensagem seja um template outbound de automação.
- Templates de automação são gravados em `messages` com `from_type != 'user'` (Nina/sistema) e `message_type = 'template'` (ou `metadata.template` / `metadata.automation_rule_id`), então passam batido no filtro atual.
- Idempotência é por `metadata.welcome_followup_sent`, então cada conversa só toma um follow-up — mas o gatilho errado já basta para o problema relatado.

## Mudanças

### 1. Restringir o candidato a "primeira interação inbound sem resposta do lead" (`supabase/functions/followup-inactive-leads/index.ts`)

Depois de buscar os candidatos e antes de enfileirar, aplicar estas checagens por conversa (em vez de só olhar `lastMsg.from_type`):

- Contar mensagens do cliente na conversa: `select count from messages where conversation_id = X and from_type = 'user'`. Se `> 1`, pular (não é mais "lead que não deu andamento" — a conversa já teve troca).
- Buscar as últimas ~10 mensagens outbound (`from_type in ('nina','human','system')`) da conversa e verificar se **alguma** foi:
  - `message_type = 'template'`, **ou**
  - `metadata->>automation_rule_id` presente, **ou**
  - `metadata->>welcome_followup` = `true` (a própria de follow-up), **ou**
  - `metadata->>kind` indicando template/automação.
  
  Se **qualquer** dessas existir, pular a conversa. Follow-up é só quando a última interação outbound foi a saudação orgânica da Nina.
- Manter a checagem atual `lastMsg.from_type !== 'user'` e a janela temporal.

Isso descarta os casos do tipo `PEDIDO_RETIRADO` / `PEDIDO_PAGO` / qualquer automação WooCommerce que gere um outbound recente.

### 2. Marcar as mensagens de automação/template para o filtro (`supabase/functions/automation-runner/index.ts`)

Confirmar (e ajustar se preciso) que toda mensagem enfileirada pelo `automation-runner` grave em `send_queue.metadata` o `automation_rule_id` (e/ou `template_name`) para que, ao virar `messages`, o filtro acima funcione com robustez. Se já grava, não precisa mudar; se não grava, incluir `metadata: { automation_rule_id, template_name }` no insert do `send_queue`.

### 3. (Opcional, defensivo) Marcar a saudação inicial como elegível

No `nina-orchestrator`, quando a Nina envia a primeira resposta a um lead novo (onboarding/saudação), gravar `metadata.welcome_greeting = true` na mensagem. Ajustar o `followup-inactive-leads` para exigir que o **último outbound** tenha `metadata.welcome_greeting = true`. Isso é o inverso do filtro do item 1 e torna a regra explícita ("só faz follow-up de saudação"). Deixo como opcional porque o item 1 já resolve o bug reportado; se você quiser a versão mais estrita, incluímos.

## Fora de escopo

- Sem mudanças de UI, schema ou RLS.
- Sem mexer no `pg_cron` — a frequência (15 min) continua igual.
- Sem alterar a mensagem de follow-up nem o tempo configurado em Settings.

## Como validar

1. Simular um template outbound recente (ex.: `PEDIDO_RETIRADO`) em uma conversa `status='nina'` e rodar `followup-inactive-leads` manualmente → deve retornar `skipped` para essa conversa.
2. Criar uma conversa nova só com 1 mensagem do cliente + 1 resposta orgânica da Nina, aguardar a janela → deve disparar o follow-up.
3. Conferir o caso do print (Kátia R.): não deveria mais receber follow-up após um `PEDIDO_RETIRADO`.