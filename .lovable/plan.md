## Objetivo

Garantir que toda conversa tenha um responsável claro:
- **Auto-atribuição sticky**: quando um humano responde uma conversa sem responsável, ele vira o dono.
- **Visibilidade**: o primeiro nome do responsável aparece na lista lateral do chat (junto do avatar).

## Mudanças

### 1. Auto-atribuir no envio (sticky)

Arquivo: `src/services/api.ts`

Em `sendMessage`, `sendMediaMessage` e `sendTemplateMessage`, logo depois de identificar o `senderUserId` da sessão:

1. Buscar a conversa selecionando `assigned_user_id` e `contact_id` (já é buscada hoje, só estender o select).
2. Se `assigned_user_id` **for null** e existir `senderUserId`:
   - Procurar `team_members` com `user_id = senderUserId` → pegar `team_members.id`.
   - Se encontrar, reutilizar `api.assignConversation(conversationId, teamMemberId, contactId)` para já gravar a atribuição no banco **e** sincronizar o `owner_id` do deal.
3. Se já tiver responsável, não muda nada (sticky).
4. Falhas na atribuição apenas logam (`console.warn`) — não bloqueiam o envio da mensagem.

Observação: o estado local da UI já atualiza via Realtime do `useConversations` quando `conversations.assigned_user_id` muda, então não precisa de trabalho extra no hook.

### 2. Mostrar nome do responsável na lista lateral

Arquivo: `src/components/ChatInterface.tsx`

No bloco da listagem (linhas ~1277-1288) onde hoje renderiza só o avatar:

- Manter o `<img>` do avatar.
- Adicionar ao lado um `<span>` com o **primeiro nome** (`member.name.split(' ')[0]`), em texto pequeno (`text-[10px]`), cor `text-slate-400`, com `max-w-[60px] truncate` pra não estourar.
- Mantém o `title` para nome completo no hover.

Layout final do badge: `[avatar] João` agrupado num `<span className="inline-flex items-center gap-1 ...">`.

### 3. Sem mudanças de schema

- `conversations.assigned_user_id` e `deals.owner_id` já existem.
- `api.assignConversation` já cuida da sincronização conversa ↔ deal.
- Nenhuma migration necessária.

## Detalhes técnicos

- A regra "sticky" é avaliada por envio: lemos o valor atual de `assigned_user_id` no banco (não confiamos só no cache local) para evitar corrida entre duas pessoas respondendo ao mesmo tempo.
- O lookup do team_member é por `user_id` (auth) → `team_members.id`, porque a coluna `assigned_user_id` da conversa hoje guarda `team_members.id` (é o valor usado no `<select>` de Responsável).
- Para trocar de responsável, o usuário continua usando o seletor "Responsável" no painel direito da conversa (comportamento atual preservado).

## Fora do escopo

- Notificação ao novo responsável.
- Mudança automática quando responsável fica inativo / sai da equipe.
- Filtro "Minhas conversas" na lista (pode virar próximo passo, se quiser).