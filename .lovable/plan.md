## Objetivo
Permitir filtrar automações por **status do pedido** WooCommerce, usando a lista de 12 status que vocês têm (Core + Custom), sem precisar digitar o slug à mão.

## O que muda

### 1. `src/hooks/useAutomations.ts`
Adicionar uma constante exportada com os status que aparecem na sua tela:

```ts
export const ORDER_STATUSES = [
  { slug: 'pending',        label: 'Novo Pedido' },
  { slug: 'on-hold',        label: 'Em orçamento' },
  { slug: 'checkout-draft', label: 'Rascunho' },
  { slug: 'processing',     label: 'Pago Online' },
  { slug: 'completed',      label: 'Pago Manual / Confirmado' },
  { slug: 'em-producao',    label: 'Impresso' },
  { slug: 'pedido-pronto',  label: 'Pronto' },
  { slug: 'retirado-entrega', label: 'Retirado' },
  { slug: 'negado',         label: 'Proposta negada' },
  { slug: 'cancelled',      label: 'Cancelado' },
  { slug: 'refunded',       label: 'Estornado' },
  { slug: 'failed',         label: 'CHARGEBACK' },
];
```

Garantir que `status` está em `FIELD_SUGGESTIONS` (já está).

### 2. `src/components/AutomationFormModal.tsx`
Na linha do filtro (input "campo" + operador + input "valor"):
- Quando `c.field === 'status'` **e** o operador for `eq` / `neq`, trocar o `<input value>` por um `<select>` com as opções de `ORDER_STATUSES` (mostra "Pago Online (processing)" e salva o slug `processing` em `c.value`).
- Para outros operadores (`contains`, etc.) ou campos diferentes, manter o input livre atual.
- Adicionar um pequeno hint abaixo do filtro de status: "Status do pedido WooCommerce" — só visual.

Nada muda no schema, no payload salvo (`filters.conditions[].value` continua sendo a string do slug) nem na execução da automação no backend. É puramente UI.

## Fora de escopo
- Não busco status dinamicamente da loja Woo (lista hardcoded conforme imagem; se um dia mudar, edito a constante).
- Não mexo nas outras ações (WhatsApp, CRM, webhook).
- Não toco no edge function `automation-runner`.
