
# Tabela `orders` para pedidos WooCommerce

## Objetivo
Persistir todos os pedidos recebidos via webhook do WooCommerce em uma tabela estruturada, vinculada ao `contact` quando possível, para consultas, relatórios e histórico por lead.

## 1. Estrutura da tabela `public.orders`

Campos principais (extraídos do payload já em uso):

| Coluna | Tipo | Origem |
|---|---|---|
| `id` | uuid PK | gen_random_uuid() |
| `woo_order_id` | bigint UNIQUE | `payload.id` |
| `contact_id` | uuid (nullable) | match por `billing.phone` |
| `status` | text | `payload.status` (processing, completed, pending, etc) |
| `total` | numeric(12,2) | `payload.total` |
| `currency` | text | `payload.currency` |
| `customer_id` | bigint | `payload.customer_id` |
| `customer_email` | text | `payload.billing.email` |
| `customer_phone` | text | normalizado de `billing.phone` |
| `customer_name` | text | `billing.first_name + last_name` |
| `payment_method` | text | `payload.payment_method` |
| `payment_method_title` | text | `payload.payment_method_title` |
| `is_first_order` | boolean | `payload._is_first_order` |
| `line_items` | jsonb | `payload.line_items` (mantém itens estruturados) |
| `billing` | jsonb | `payload.billing` completo |
| `raw_payload` | jsonb | payload completo para auditoria |
| `order_created_at` | timestamptz | `payload.date_created` |
| `created_at` / `updated_at` | timestamptz | now() |

Índices: `woo_order_id` (unique), `contact_id`, `customer_phone`, `status`, `order_created_at desc`.

RLS: padrão single-tenant do projeto — `authenticated` tem acesso total.
GRANTs: `authenticated` (full) + `service_role` (all).

## 2. Lógica de gravação (sem novas funções)

Atualizar `supabase/functions/automation-runner/index.ts`:

- Em `processEvent`, antes de iterar as regras, se `event.topic` começar com `order.` (created/updated/completed), fazer **upsert** em `orders` por `woo_order_id`:
  - Extrair campos do `event.payload`.
  - Normalizar telefone com `normalizePhone`.
  - Buscar `contact_id` por `phone_number` (sem criar contato — apenas vincula se já existe).
  - `upsert(..., { onConflict: 'woo_order_id' })` — assim `order.updated` e `order.completed` atualizam o mesmo registro.
- Erros no upsert não devem bloquear automações: log de warning e segue o fluxo normal (as regras continuam rodando).

Comportamento:
- Pedido novo → cria linha.
- Mudança de status no Woo → atualiza `status`, `total` e `raw_payload`.
- Se o contato ainda não existe quando o pedido chega, `contact_id` fica nulo; pode ser preenchido depois (opcional: pequeno backfill quando o contato for criado, fora do escopo desta task).

## 3. O que NÃO está incluído

- Não cria UI nova (sem aba "Pedidos" no lead ainda).
- Não altera o fluxo de matching de contato das automações (continua por `billing.phone`).
- Não importa pedidos antigos do Woo — só passa a guardar daqui pra frente. Backfill pode ser feito depois rodando `automation-runner` em eventos antigos da `webhook_events` se quiser.

## Próximo passo natural (não incluso, mas fácil depois)
Card "Pedidos" no perfil do contato listando `orders` filtrados por `contact_id` com total, status e data.
