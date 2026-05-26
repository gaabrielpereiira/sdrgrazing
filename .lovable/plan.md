## Objetivo

Tornar o campo "Variáveis do template" amigável: em vez de digitar caminhos como `billing.first_name`, escolher de uma lista nomeada (Nome do cliente, Número do pedido, Total, etc.) com **preview ao vivo** do valor que será enviado, usando o último webhook recebido como exemplo.

## O que muda

### 1. `src/hooks/useAutomations.ts` — Catálogo rico de campos

Substituir o array simples `FIELD_SUGGESTIONS` por um catálogo agrupado:

```ts
export const WEBHOOK_FIELDS = [
  { group: 'Cliente', items: [
    { path: 'billing.first_name', label: 'Nome do cliente' },
    { path: 'billing.last_name',  label: 'Sobrenome do cliente' },
    { path: 'billing.phone',      label: 'Telefone' },
    { path: 'billing.email',      label: 'E-mail' },
    { path: 'billing.company',    label: 'Empresa' },
    { path: 'billing.city',       label: 'Cidade' },
  ]},
  { group: 'Pedido', items: [
    { path: 'id',                 label: 'Número do pedido' },
    { path: 'number',             label: 'Número de exibição' },
    { path: 'total',              label: 'Valor total' },
    { path: 'currency',           label: 'Moeda' },
    { path: 'status',             label: 'Status' },
    { path: 'payment_method_title', label: 'Forma de pagamento' },
    { path: 'date_created',       label: 'Data do pedido' },
    { path: 'line_items[0].name', label: 'Nome do 1º produto' },
    { path: 'line_items[0].quantity', label: 'Qtd. do 1º produto' },
  ]},
];
```

Manter `FIELD_SUGGESTIONS` exportado (achatado a partir de `WEBHOOK_FIELDS`) para compatibilidade com os filtros "SE".

### 2. `src/components/AutomationFormModal.tsx` — Picker + preview

Na seção "Variáveis do template":

- Trocar o `<input>` por um `<select>` agrupado (`<optgroup>`) com os rótulos amigáveis, mais a opção **"Personalizado…"** que abre o input livre atual (mantém poder para usuários técnicos).
- Ao lado de cada linha `{{n}}`, mostrar o **valor resolvido** consultando o último `webhook_events.payload` cujo `topic` casa com o `trigger` escolhido. Caixa cinza tipo `"João"` ou `(vazio)`.
- Acima da lista de variáveis, renderizar um **preview do corpo do template** com as variáveis substituídas por `[Nome do cliente]`, `[Total]`, etc. (rótulos), para o usuário visualizar a mensagem antes de salvar.
- Adicionar botão **"Auto-preencher"**: para cada `{{n}}` do template, sugerir automaticamente um campo (ex.: `{{1}}` → `billing.first_name`) com base em heurística simples sobre o texto ao redor do placeholder (ex.: "Olá {{1}}" → nome). Usuário pode ajustar.

### 3. Buscar payload de exemplo

Adicionar `useEffect` no modal que carrega o último webhook do tópico atual:

```ts
supabase.from('webhook_events')
  .select('payload')
  .eq('topic', trigger)
  .order('received_at', { ascending: false })
  .limit(1).maybeSingle()
  .then(({ data }) => setSamplePayload(data?.payload || null));
```

E função local `getByPath()` (igual à do edge function) para resolver caminhos com suporte a `line_items[0].name`.

## Fora de escopo

- Backend (`automation-runner`) não muda — ele já resolve `cfg.variables` pelo caminho. O fix do erro `#131008` que você viu antes acontece automaticamente quando o usuário preencher as variáveis pelo novo picker.
- Sem alteração no schema do banco.

## Resultado

Ao editar a automação "PEDIDO_FEITO", o usuário vê:

```
{{1}}  [Nome do cliente ▾]   → "João"
{{2}}  [Número do pedido ▾]  → "131008"

Preview: "Olá [Nome do cliente], Recebemos o seu pedido [Número do pedido]!"
```
