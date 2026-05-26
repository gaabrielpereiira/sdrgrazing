## Objetivo
Mostrar automaticamente o número do último pedido WooCommerce no card do Deal (Kanban), vinculado pelo telefone do cliente.

## O que já existe (não muda)
- `wc-receiver` recebe webhook do WooCommerce
- `automation-runner` → `upsertOrderFromEvent` já grava na tabela `orders` e tenta vincular `contact_id` via `billing.phone` em **toda** chegada
- Tabela `orders` já tem `woo_order_id`, `status`, `total`, `contact_id`

## Mudanças (apenas frontend)

### 1. `src/types.ts` — estender `Deal`
Adicionar campo opcional:
```ts
lastOrder?: {
  wooOrderId: number;
  status: string;       // ex: "processing"
  statusLabel: string;  // ex: "Pago Online"
  total: number;
  currency: string;
  createdAt: string;
};
```

### 2. `src/services/api.ts` — `fetchPipeline`
Depois da query de `deals` + `conversations`, fazer uma terceira query:
```ts
supabase.from('orders')
  .select('woo_order_id,status,total,currency,order_created_at,contact_id')
  .in('contact_id', contactIds)
  .order('order_created_at', { ascending: false });
```
Reduzir para `Map<contactId, latestOrder>` (primeira ocorrência = mais recente). Mapear para `deal.lastOrder` usando `ORDER_STATUSES` (já existente em `useAutomations`) para o `statusLabel`.

### 3. `src/components/Kanban.tsx` — render no card
Logo abaixo da linha de tags (linha 417), adicionar quando `deal.lastOrder` existir:
```
[#1234 · Pago Online · R$ 297]
```
Pequeno badge com ícone `ShoppingBag`, cor por status (processing=cyan, completed=emerald, cancelled/failed=red, on-hold/pending=amber). Sem alterar lógica de drag/click.

### 4. Mover `ORDER_STATUSES` para arquivo compartilhado
Hoje vive dentro de `useAutomations.ts`. Exportar de lá (ou criar `src/lib/orderStatus.ts`) para reutilizar no `api.ts` e no Kanban sem duplicar.

## O que NÃO mudar
- Webhook receiver, automation-runner, schema do banco — vínculo já é automático.
- Outros componentes (Contatos, Chat, Deal Detail) — fora do escopo pedido.

## Verificação
Após implementar: abrir `/kanban`, conferir que deals de contatos com pedidos mostram o badge com nº do pedido e status amigável; deals sem pedido não mostram nada.
