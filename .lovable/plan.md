## Diagnóstico

O screenshot mostra a seção **TAGS** do lead **Nara Campagna** com a tag `nota_fiscal` repetida **24 vezes** (confirmado no banco: `contacts.tags = {nota_fiscal, nota_fiscal, ...×24}`). Assumo que quando você disse "task" quis dizer essas **tags** duplicadas — se for outra coisa (ex.: atividades do painel "Atividades"), me avise que ajusto o plano.

### Causa raiz

Em `ChatInterface.handleToggleTag`, `activeChat.tags` é uma **mescla de `conversation.tags + contact.tags`** (feita em `src/types.ts:357` e no realtime de `useConversations.ts:516`). Ao clicar em uma tag, essa lista mesclada é gravada de volta em **`contacts.tags`** via `api.updateContactTags`. Cada realtime tick pode acabar re-mesclando as tags do contato dentro do array e regravando — resultado: crescimento geométrico do mesmo `nota_fiscal`.

Confirmado no banco:
- Nenhuma automação adiciona `nota_fiscal` (só há `crm_update` de estágio).
- Nenhum outro contato tem `array_length(tags) > 5` — o problema aparece após muitos toggles/realtime ticks no mesmo lead.

## Mudanças

### 1. Corrigir a duplicação (root cause)

**`src/services/api.ts` → `updateContactTags`**
- Deduplicar sempre: `Array.from(new Set(tags.filter(Boolean)))` antes do `update`.

**`src/components/ChatInterface.tsx` → `handleToggleTag`**
- Não gravar a lista mesclada. Buscar tags apenas do contato (via `activeChat.contactTags` — novo campo) e operar em cima delas.

**`src/types.ts` e `src/hooks/useConversations.ts`**
- Expor `contactTags: string[]` separado no `activeChat` (já existe `_contactTags` como convenção interna — vou promover para `contactTags`).
- Manter `tags` mesclado só para exibição/badges; toggle usa `contactTags`.

### 2. Permitir excluir/limpar tags facilmente

Hoje já existe o botão `X` por tag, mas ele só aparece no **hover** (`opacity-0 group-hover:opacity-100`) — inútil no mobile/toque e fácil de perder.

**`src/components/ChatInterface.tsx`**
- Tornar o `X` sempre visível (remover `opacity-0 group-hover:opacity-100`).
- Adicionar um botão **"Limpar todas"** no cabeçalho da seção TAGS quando houver ≥ 2 tags (com `confirm()`).

### 3. Limpeza dos dados existentes

Rodar um `UPDATE` único (via tool `supabase--insert`) para deduplicar todos os `contacts.tags`:
```sql
UPDATE public.contacts
SET tags = ARRAY(SELECT DISTINCT unnest(tags))
WHERE array_length(tags,1) > array_length(ARRAY(SELECT DISTINCT unnest(tags)),1);
```

## Fora de escopo

- Sem mudanças no orquestrador, automações, ou schema.
- Sem mexer em `conversation_activities` (o painel de "Atividades" já tem exclusão própria).

## Validação

1. Nara Campagna: TAGS mostra `Nota fiscal` **uma vez** após o cleanup.
2. Clicar em outra tag adiciona/remove sem duplicar; realtime reflete sem crescer o array.
3. Botão `X` visível sem hover; botão "Limpar todas" some quando fica ≤ 1 tag.
