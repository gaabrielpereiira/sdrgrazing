## Problema

A Helena está fazendo **orçamento** (pré-venda) e apareceu marcada como "Suporte" na lista.

Causa: hoje, sempre que a IA chama `request_human_handoff`, o código força `queue = 'support'` — independente do motivo. Ou seja, **qualquer** handoff para humano vira ticket de suporte.

Regra correta: **Suporte = pós-compra**. A conversa só deve ir para a fila de Suporte em **dois casos**:

1. O cliente clicou no botão **"Suporte"** na triagem inicial (fluxo da Donatella / `await_support_*`).
2. A IA transferiu para humano com um motivo **pós-venda**: reclamação, status de pedido, cancelamento/alteração, boleto/nota fiscal.

Nos demais casos (lead qualificado, dúvida comercial, orçamento, "outro" pré-venda), a conversa **continua em Vendas** com `status = 'human'` para o time atender.

## Correção — `supabase/functions/nina-orchestrator/index.ts`

### 1. Tool `request_human_handoff` (linha ~2287)

Classificar os `reason` em duas categorias:

- **Pós-venda → `queue: 'support'`**: `complaint`, `order_status`, `cancel_change`, `payment_invoice`
- **Pré-venda / geral → mantém a fila atual (Vendas)**: `qualified_lead`, `other`

O update passa a montar dinamicamente:

```text
update = { status: 'human' }
if (reason ∈ pós-venda) update.queue = 'support'
```

### 2. Safety net (linha ~2393)

Quando o texto interno vaza da IA e não há `reason` confiável, **não** forçar `queue: 'support'`. Só marcar `status: 'human'`. Se for suporte de verdade, o operador reclassifica manualmente pelo chat.

### 3. Fluxo da Donatella (linha ~1581) — sem mudanças

O caminho `await_support_issue` é acionado **exatamente** quando o cliente clicou em "Suporte" na triagem, então continua setando `queue: 'support'` + `assigned_team = producao`. Esse é o caso (1) da regra.

### 4. Prompt da IA (mesmo arquivo)

Reforçar na descrição do tool e no system prompt:

- `qualified_lead`, orçamento, dúvidas comerciais → chama humano mas **segue em Vendas**.
- `complaint`, `order_status`, `cancel_change`, `payment_invoice` → pós-compra, vai para **Suporte**.

## Limpeza das conversas já mal-classificadas (Helena e outras)

Duas opções:

- **Manual (recomendado):** você move pelo próprio chat — o botão de trocar de fila já existe.
- **Automático:** rodar um one-off que reseta `queue = 'sales'` para conversas em `support` **sem** `support_cases` associado (foram para suporte só pelo handoff antigo, não pelo fluxo da Donatella). Me avisa se quiser esse "faxinão".

## Fora de escopo

- Badge da lista e card "Tickets de Suporte" no painel do lead permanecem iguais — já mostram o motivo corretamente quando existe `support_case`. O problema era só a classificação errada de fila.
- Sem mudanças de schema.
