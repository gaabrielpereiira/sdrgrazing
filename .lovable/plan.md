## Objetivo
Se um lead novo receber a mensagem de boas-vindas da Donatella e não interagir (não apertar botão, não responder) dentro de 1h, a Donatella envia automaticamente um follow-up para reengajar.

## Como vai funcionar

**Gatilho:** cron a cada 15 min varre `conversations` procurando candidatos ao follow-up.

**Um lead é candidato quando TODOS forem verdadeiros:**
- `status = 'nina'` (ainda com a IA — se já foi para humano/pausado, não faz sentido)
- `queue = 'sales'` (não dispara em suporte)
- `is_active = true`
- Última mensagem foi da própria Donatella (`from_type in ('nina','human')`) — ou seja, o lead está calado
- `last_message_at` entre 60 min e 24 h atrás (janela: já passou 1 h, mas não é lead antigo esquecido)
- Não existe follow-up prévio: `metadata->>'welcome_followup_sent'` é diferente de `true`

**Ação:** insere no `send_queue` uma mensagem de texto usando o template configurável (padrão sugerido: *"Oi! Vi que você começou uma conversa com a gente e não seguiu — posso te ajudar com alguma coisa da nossa loja?"*), marca `conversations.metadata.welcome_followup_sent = true` + `welcome_followup_at = now()`, insere a mensagem em `messages` como `from_type='nina'` e dispara `whatsapp-sender`. Não altera `status`; a IA volta a responder normalmente se o lead retornar.

**Idempotência:** o flag no metadata garante um único follow-up por conversa. Se o lead responder e depois a conversa reabrir (novo `started_at`), pode-se reavaliar em uma segunda fase — fora do escopo agora.

## Componentes

1. **Migração** — adicionar em `nina_settings`:
   - `welcome_followup_enabled boolean default true`
   - `welcome_followup_minutes int default 60`
   - `welcome_followup_message text default 'Oi! Vi que você começou uma conversa com a gente há pouco e não seguiu. Posso te ajudar com alguma coisa? 💛'`

2. **Edge function** `supabase/functions/followup-inactive-leads/index.ts`:
   - Lê `nina_settings` (respeita `enabled` e `minutes`).
   - Query filtrada; para cada candidato: insere `messages` (from_type=nina) + `send_queue` + atualiza `conversations.metadata` + dispara `whatsapp-sender`.
   - Batch limit 25 por execução; logs.

3. **Cron** — via `supabase--insert` (não migração, é dado do projeto):
   ```
   select cron.schedule('followup-inactive-leads', '*/15 * * * *', ...net.http_post(...functions/v1/followup-inactive-leads))
   ```
   Habilita `pg_cron` / `pg_net` se ainda não estiverem.

4. **UI em Settings → Agente** (`src/components/settings/AgentSettings.tsx`):
   - Toggle "Follow-up automático quando lead não responde".
   - Input numérico "Enviar após X minutos" (default 60).
   - Textarea da mensagem.
   - Persiste em `nina_settings`.

## Observações
- Não altera o comportamento da Nina em conversas ativas nem cria loops: só dispara quando a **última** mensagem foi da própria Donatella.
- Se você quiser suportar múltiplos follow-ups em cascata (ex: 1h, 24h, 3 dias), fica trivial depois — basta trocar o boolean por um contador `welcome_followup_step`.
