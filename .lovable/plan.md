## Objetivo
Reorganizar as abas e filtros do painel de chat para que cada atendente veja com facilidade o que é dele, e admins consigam segmentar por pessoa ou equipe.

## Mudanças de UI (apenas frontend)

### 1. Abas da lista de conversas (`src/components/ChatInterface.tsx`)
Substituir o `Tabs` de 2 colunas (Geral / Finalizadas) por 3 colunas:

```
[ Geral ] [ Meus bate-papos ] [ Arquivados ]
```

- **Geral**: comportamento atual da aba "Geral" (todas as conversas ativas).
- **Meus bate-papos** (novo): conversas com `assignedUserId` igual ao `team_members.id` do usuário logado E `is_active=true`. Mostrar badge com a contagem.
- **Arquivados**: renomear "Finalizadas" para "Arquivados" em todos os pontos visíveis (chip do header, label da aba, badge no header, mensagem de confirmação de encerramento na linha ~1535: "movida para a aba 'Arquivados'").

Estado: trocar o tipo do `mainTab` para `'geral' | 'meus' | 'arquivados'`. Continuar mapeando para `chatTab: 'active' | 'finished'` (meus e geral → active; arquivados → finished).

### 2. Resolver "meu team_member id"
Pequeno hook local (ou `useMemo` dentro do componente) usando `useAuth().user.id` para buscar uma vez `team_members.id` via `supabase.from('team_members').select('id').eq('user_id', user.id).maybeSingle()`. Guardar no estado para usar no filtro de "Meus".

### 3. Filtros acima da lista (dois dropdowns)
Logo abaixo das abas e acima do campo de busca, adicionar uma linha com 2 `Select` (shadcn) compactos:

- **Responsável**: opção "Todos" + lista de `team_members` ativos (nome). Filtra por `chat.assignedUserId`.
- **Departamento**: opção "Todos" + lista de `teams` ativos. Filtra por `chat.assignedTeam` (que é o slug/id do time já presente em `UIConversation`).

Carregar listas com um `useEffect` no mount (`supabase.from('team_members').select('id,name').eq('status','active')` e `supabase.from('teams').select('id,name').eq('is_active',true)`).

Filtros aplicam em todas as abas (Geral / Meus / Arquivados), conforme escolha do usuário. Estado persistido em `localStorage` (`chat.filters.responsible`, `chat.filters.team`) para não resetar a cada navegação.

Quando algum filtro estiver ativo, mostrar um pequeno botão "Limpar" ao lado dos selects.

### 4. Atualizar `filteredConversations` (linha ~809)
Adicionar antes do filtro de busca:
- Se aba = "meus" → filtrar `chat.assignedUserId === myMemberId`.
- Se filtro responsável ≠ "todos" → filtrar por `assignedUserId`.
- Se filtro departamento ≠ "todos" → filtrar por `assignedTeam`.

### 5. Contagem nas abas
Atualizar `useConversationTabCounts` (`src/hooks/useConversationTabCounts.ts`) para incluir também `mine` (conversas ativas com `assigned_user_id` = team_member do usuário atual). Aceitar `myMemberId` opcional como parâmetro e, quando presente, contar a aba "Meus". Exibir o badge na aba.

## Fora de escopo
- Nenhuma mudança de backend, RLS, schema ou edge functions.
- Lógica de auto-atribuição (já implementada) permanece como está.
- Permissões por papel continuam iguais — todos veem as 3 abas e os 2 filtros.

## Resultado esperado
- Atendente abre o chat, clica em "Meus bate-papos" e vê só o que está sob sua responsabilidade.
- Coordenador filtra por "Departamento: Produção" para acompanhar a fila de suporte/produção.
- "Finalizadas" some do vocabulário visível; tudo encerrado passa a se chamar "Arquivados".
