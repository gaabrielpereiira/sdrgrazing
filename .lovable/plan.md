## Webhook WooCommerce — Fase 1

Recebe eventos do WooCommerce, armazena no banco e deixa o usuário criar regras pela UI. Runner e logs detalhados ficam para a Fase 2 — nesta entrega o `wc-receiver` já chama o runner em modo "stub" (apenas marca `processed`) para a estrutura ficar pronta.

---

### 1. Banco de dados (1 migration)

**`webhook_events`** — fila de eventos brutos
- `topic` (text), `payload` (jsonb), `source` (text default `woocommerce`)
- `received_at`, `processed` (bool), `error` (text)
- Índices: `topic`, `processed`, `received_at desc`

**`automation_rules`** — regras criadas pelo usuário
- `name`, `trigger_topic`, `filters` (jsonb default `{}`), `action_type`, `action_config` (jsonb), `active` (bool), `cooldown_hours` (int default 0)
- `created_at`, `updated_at`

**`automation_logs`** — execuções (estrutura criada agora, populada na Fase 2)
- `rule_id`, `event_id`, `status` (`success|failed|skipped`), `result` (jsonb), `executed_at`

**`contact_cooldowns`** — controle anti-spam
- PK composta `(contact_phone, rule_id)`, `last_sent_at`

**RLS** — todas as 4 tabelas: política permissiva para `authenticated` (padrão single-tenant do projeto). `webhook_events` também aceita insert via service role da edge function.

**`nina_settings`** — adicionar coluna `wc_webhook_secret text` (nullable). Credencial fica no banco como o resto do projeto.

**Realtime** — adicionar `webhook_events` e `automation_rules` à publicação `supabase_realtime`.

---

### 2. Edge Function `wc-receiver`

`supabase/functions/wc-receiver/index.ts` + entrada em `supabase/config.toml` com `verify_jwt = false`.

Fluxo:
1. `OPTIONS` → CORS.
2. Lê body cru (necessário para HMAC) e header `x-wc-webhook-signature`.
3. Lê `wc_webhook_secret` de `nina_settings` (fallback triplo: user_id → global → any, padrão do projeto).
4. Calcula HMAC-SHA256 base64 e compara em tempo constante. Se falhar → `401`.
5. Lê header `x-wc-webhook-topic` para o `topic`.
6. `INSERT` em `webhook_events` com `processed=false`.
7. Responde `200` imediato.
8. Em background (sem aguardar): chama `automation-runner` via `fetch` com `SERVICE_ROLE_KEY` passando o evento. **Nesta fase o runner ainda não existe** — deixo a chamada comentada/atrás de uma flag para ativar na Fase 2 sem novo deploy.

URL pública para colar no WooCommerce:
`https://ggwqkyftxhgahqyevsac.supabase.co/functions/v1/wc-receiver`

---

### 3. UI — nova página `Automações`

Arquivos:
- `src/components/Automations.tsx` — listagem
- `src/components/AutomationFormModal.tsx` — criar/editar
- Item novo no `Sidebar.tsx` (ícone Zap), rota nova em `App.tsx`
- `src/hooks/useAutomations.ts` — fetch + realtime

**Listagem**
- Tabela (desktop) / cards (mobile, seguindo padrão do Contacts) com: nome, trigger, status, cooldown, criada em, ações (toggle ativo, editar, excluir).
- Botão "Nova automação" no topo, busca por nome.
- Badge de "X eventos pendentes" lendo `webhook_events.processed=false` (read-only nesta fase).

**Modal de criação (3 blocos)**
- **Quando**: select de `trigger_topic` com os 6 topics do doc (`order.created`, `order.updated`, `order.deleted`, `customer.created`, `customer.updated`, `product.updated`).
- **Se** (filtros, opcional): builder de filtros — linha com `field` (texto livre, com sugestões `total`, `status`, `billing.phone`, `billing.first_name`, `customer_id`, `line_items[0].product_id`), operador (`eq`, `neq`, `gte`, `lte`, `contains`, `is_first_order`), valor. Toggle AND/OR. Preview JSON colapsável.
- **Então**: select de `action_type`, por enquanto apenas `whatsapp_message` totalmente funcional (os outros aparecem como "em breve"). Para WhatsApp:
  - Select de template puxando de `whatsapp_templates` onde `status='APPROVED'`
  - Campo `phone_field` (default `billing.phone`)
  - Variáveis: lista dinâmica conforme placeholders do template
  - Campo `cooldown_hours`

Salva em `automation_rules`. Validação com Zod no submit.

**Configuração do secret**
- Em `Settings → APIs`, adicionar campo "WooCommerce Webhook Secret" + texto explicativo com a URL do `wc-receiver` para colar no admin do Woo. Salva em `nina_settings.wc_webhook_secret`.

---

### Fora desta fase (deixar pronto para Fase 2)

- `automation-runner` (avaliação de filtros, cooldown, execução).
- Integração com `send_queue` / `whatsapp-sender` (já decidida: reusar).
- Tela de logs por regra e monitor de eventos brutos.
- Política de retenção de `webhook_events` (>90d).
- Demais `action_type` (`crm_update`, `internal_notification`, `outbound_webhook`).

---

### Detalhes técnicos (resumo)

- Tudo segue o padrão do projeto: RLS permissiva, secret em `nina_settings`, edge function com `verify_jwt = false`, chamadas via `fetch` + `SERVICE_ROLE_KEY` (sem `pg_net`/cron).
- HMAC: `crypto.subtle.importKey` + `sign('HMAC', ...)` no Deno, comparação em tempo constante.
- `webhook_events.payload` indexável depois com GIN se necessário (não nesta fase).
- Sem alteração em fluxos existentes (chat, deals, send_queue).
