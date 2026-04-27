# Corrigir erro ao criar Deal na Pipeline

## Problema identificado

Logs do banco mostram o erro real:

```
null value in column "stage_id" of relation "deals" violates not-null constraint
```

A coluna `deals.stage_id` é **NOT NULL** e **não tem valor default**. Porém o fluxo atual em `CreateDealModal` chama `api.createDeal()` sem passar `stage_id`, e a função `createDeal` em `src/services/api.ts` (linhas 1005-1009) remove o campo quando ele é undefined esperando que o DB use um default — que não existe. Resultado: insert falha com erro genérico "Erro ao criar deal".

## Correção

Buscar automaticamente o **primeiro estágio ativo** do pipeline e usá-lo como `stage_id` padrão sempre que o caller não informar um.

### Mudança em `src/services/api.ts` (função `createDeal`)

Quando `stage_id` não for fornecido:
1. Consultar `pipeline_stages` filtrando `is_active = true`, ordenado por `position` ascendente, `limit 1`.
2. Usar o `id` retornado como `stage_id` do novo deal.
3. Se nenhum estágio existir, lançar erro claro: "Nenhum estágio de pipeline configurado. Configure a pipeline primeiro."

Isso corrige o caso atual (estágios já existem: "Novos Leads" position 0 será usado) e mantém compatibilidade com chamadas que já passam `stage_id`.

### Mudança em `src/components/CreateDealModal.tsx` (opcional, melhor UX)

No `catch` do `onSubmit`, exibir a mensagem real do erro no toast em vez de "Erro ao criar deal" genérico:

```ts
toast.error(error?.message || 'Erro ao criar deal');
```

Assim, falhas futuras ficam visíveis para o usuário sem precisar olhar logs.

## Observação

O trigger `create_deal_for_new_contact` (que cria deal automaticamente para novos contatos via DB function) já busca corretamente o primeiro `pipeline_stages.id`. Estamos apenas alinhando o fluxo manual a esse mesmo comportamento.

## Arquivos afetados
- `src/services/api.ts` — ajuste em `createDeal`
- `src/components/CreateDealModal.tsx` — toast com mensagem real (opcional)
