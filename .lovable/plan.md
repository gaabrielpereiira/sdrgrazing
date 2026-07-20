## Objetivo

Restringir o follow-up para disparar **apenas** quando a última mensagem enviada foi a **mensagem de triagem** (botões "Atendimento" / "Suporte pós-venda") e o lead não respondeu dentro do tempo configurado.

## Verificado

- `nina-orchestrator/index.ts` envia a triagem via `sendInteractiveButtons(...)` e persiste em `messages.metadata` como `{ onboarding: true, interactive: { kind: 'button', buttons: [...] } }`.
- O estado da conversa fica em `conversations.nina_context.onboarding.step = 'await_triage'` enquanto o lead ainda não clicou nenhum botão. Assim que o lead responde (botão ou texto), o step muda (para `sales`, `await_support_order`, etc.).
- Portanto "triagem enviada e sem resposta" ≡ `nina_context.onboarding.step === 'await_triage'` **e** o último outbound tem `metadata.onboarding === true` + `metadata.interactive.kind === 'button'`.

## Mudanças

Ajustar `supabase/functions/followup-inactive-leads/index.ts`:

1. Incluir `nina_context` no `select` dos candidatos.
2. Após o `lastMsg` check, exigir:
   - `conv.nina_context?.onboarding?.step === 'await_triage'`. Se não for, `skipped++; continue;`
3. Buscar o **último outbound** (limit 1, `from_type in ('nina','human','system')`) e exigir que:
   - `metadata.onboarding === true`, **e**
   - `metadata.interactive?.kind === 'button'`.
   
   Se não bater, `skipped++; continue;`.
4. Remover o bloco anterior de "contar mensagens do usuário / varrer últimos 10 outbounds procurando template/automação" — a condição `await_triage` + último outbound = botões de triagem já cobre tudo (e é o que o usuário pediu explicitamente).
5. Manter a idempotência via `metadata.welcome_followup_sent`.

## Fora de escopo

- Sem mudanças de UI, schema, cron ou mensagem configurada.
- Sem alterações no orquestrador — a marcação `onboarding: true` + `interactive.kind: 'button'` já existe.

## Validação

1. Conversa da Kátia R. (print): last outbound = template `PEDIDO_RETIRADO`, sem `onboarding: true` → **skip**.
2. Lead novo que recebe a triagem e não responde 1h → **envia** follow-up.
3. Lead novo que clica "Atendimento" → step muda de `await_triage` → **skip**.