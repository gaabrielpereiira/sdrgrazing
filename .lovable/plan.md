## Diagnóstico

As 4 automações estão *ativas* e o runner *roda* — mas os filtros `changed_to` estão sendo avaliados contra um `prev_status` incorreto. Hoje só 4 disparos com sucesso saíram (contra ~70/dia na semana anterior).

Três causas identificadas:

1. **Pedido pago direto** — Pedidos novos chegam como `order.created` já com status `processing`/`completed` (pago no checkout). As regras escutam só `order.updated`, então nunca disparam para esses pedidos.
2. **Eventos fora de ordem** — Em vários pedidos (ex.: 21961) o `order.updated` chega *antes* do `order.created`. O runner faz upsert na tabela `orders` antes de avaliar regras, então o `order.created` lê `prev_status = current_status` e `changed_to` falha.
3. **Regra de CRM "pago" com filtro impossível** — A regra `f80dce44 "Pedido atualizado | pago"` está com `logic:AND` exigindo `changed_to processing` *E* `changed_to completed` simultaneamente — nunca pode ser verdade. A versão WhatsApp da mesma regra está com `OR` (correta).

## Mudanças

### 1) `supabase/functions/automation-runner/index.ts`

**a) Avaliar regras de `order.updated` também em eventos `order.created`**
- Quando o topic for `order.created`, além das regras de `order.created`, buscar também as de `order.updated` e avaliá-las.
- Cada regra logada/idempotency-claimed normalmente — a guarda `automation_executions(rule_id, external_id, target_signature)` já evita disparo duplicado se o `order.updated` correspondente chegar depois.

**b) Corrigir leitura de `prev_status` quando eventos chegam fora de ordem**
- Antes de ler `prev_status` da tabela `orders`, checar se já existe um `webhook_event` *anterior* (mesmo `woo_order_id`, `received_at` menor) que foi processado. Se o pedido foi inserido pelo evento mais novo, usar `prev_status = null` em vez do status atual.
- Implementação simples: ler `prev_status` *antes* de qualquer `upsert`, e quando o registro de `orders` existe mas foi `created_at`/`updated_at` há menos de 5s, tratar como `null` (provável race do mesmo lote de webhooks).
- Alternativa mais robusta: armazenar o "último status visto" em uma coluna `last_processed_status` na própria tabela `orders`, atualizada apenas *depois* do processamento das regras. Vou usar essa, evita ambiguidades.

```ts
// pseudocódigo
const { data: prevOrder } = await supabase
  .from('orders').select('last_processed_status')
  .eq('woo_order_id', wooId).maybeSingle();
prevState.status = prevOrder?.last_processed_status ?? null;

// ... avaliar regras ...

// ao final do processamento do evento:
await supabase.from('orders')
  .update({ last_processed_status: event.payload.status })
  .eq('woo_order_id', wooId);
```

### 2) Migração — adicionar coluna `last_processed_status` em `orders`

```sql
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS last_processed_status text;
-- Seed com o status atual para não disparar tudo retroativamente:
UPDATE public.orders SET last_processed_status = status WHERE last_processed_status IS NULL;
```

### 3) Corrigir regra `f80dce44` (CRM "pago")

Trocar `logic` de `AND` para `OR` para que `changed_to processing` OU `changed_to completed` dispare a atualização de CRM. Feito via `UPDATE` em `automation_rules`.

## O que NÃO muda

- Schema de `automation_rules`, `automation_logs`, `webhook_events`, `automation_executions`.
- Lógica de cooldown, idempotência, send_queue, whatsapp-sender.
- Demais regras (Retirado, Cancelado, Pedido criado) — passam a funcionar corretamente automaticamente porque o `prev_status` ficará correto e o `order.created` passará a ser considerado.

## Validação após deploy

1. Reprocessar manualmente os eventos `65cc7056` (21960 processing) e `ce1fb1bc` (21961 pending) e conferir nos `automation_logs` que as regras corretas disparam.
2. Acompanhar o próximo pedido pago real e confirmar que a mensagem WhatsApp "pedido_feito" sai.
