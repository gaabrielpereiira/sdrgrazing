## Problemas identificados

### 1. Histórico do chat parando em 16/05 (apesar do badge "299")

Em `src/services/api.ts` → `fetchConversations` (linha 1372), a query tem `.limit(50)`. Como ordena por `last_message_at DESC`, só carregamos as **50 conversas mais recentes** de cada aba.

- O contador "299" em `useConversationTabCounts` faz outra query (`limit(5000)`) só com `id, queue, is_active` — por isso o número bate certo.
- A lista só vê 50, então em "Finalizadas" o corte cai por volta de 16/05.

### 2. "Última Interação" não aparece em Contatos

Em `api.fetchContacts` (linha 444), o campo já é convertido para string formatada:
```ts
lastContact: new Date(c.last_activity).toLocaleDateString('pt-BR')
```
Depois, em `Contacts.tsx` (linha 318), o componente faz **outra vez**:
```ts
new Date(contact.lastContact).toLocaleDateString('pt-BR')
```
`new Date("26/05/2026")` retorna `Invalid Date` → a coluna mostra "Invalid Date". Além disso, `fetchContacts` também tem `.limit(100)`, escondendo a maioria dos contatos.

## Correções propostas

### A. `src/services/api.ts` — `fetchConversations`
- Subir o limite para **500** (suficiente para o volume atual; mantém payload controlado).
- Continuar ordenando por `last_message_at DESC` para preservar UX.
- Manter `.limit(300)` por conversa nas mensagens (já está bom).

### B. `src/services/api.ts` — `fetchContacts`
- Retornar `lastContact` como **ISO string** (`c.last_activity`) em vez de string formatada — assim o componente consegue formatar corretamente.
- Subir o limite de `100` para **500**.

### C. `src/types.ts` (se necessário)
- Nenhuma mudança de tipo: `Contact.lastContact` continua `string`, só muda o conteúdo (ISO em vez de "dd/mm/yyyy").

### D. `src/components/Contacts.tsx`
- Manter `new Date(contact.lastContact).toLocaleDateString('pt-BR')` (agora funciona porque vem ISO).
- Adicionar fallback `—` se a data for inválida/ausente.

### Fora de escopo
- Paginação real / scroll infinito da lista de conversas (pode ser feito depois se 500 ficar pouco).
- Mudanças no contador das abas (`useConversationTabCounts` já está correto).
- Tabela `orders`, multi-provider IA, ou outras seções.

## Resultado esperado
- Aba "Finalizadas" passa a mostrar todo o histórico recente (até 500 conversas) em vez de cortar em 50.
- Coluna "Última Interação" em Contatos exibe a data correta (ex.: `26/05/2026`) em vez de "Invalid Date".
