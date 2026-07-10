## Objetivo
Trocar automaticamente o responsável da conversa sempre que um humano diferente do atual responsável enviar uma mensagem pelo chat.

## Comportamento atual
`api._autoAssignIfUnassigned` (src/services/api.ts, linha ~2010) só define responsável quando a conversa está **sem** ninguém atribuído. Uma vez assumida por Carol, o Allan responder não altera nada.

## Mudança
Substituir a lógica por "sticky no último humano que responde":

- Ao enviar mensagem (`sendMessage`, `sendTemplate`, `sendAttachment` — os 3 pontos que já chamam `_autoAssignIfUnassigned`), resolver o `team_member` do usuário autenticado.
- Se o `team_member.id` for **diferente** do `assigned_user_id` atual, reatribuir via `api.assignConversation(...)` (que já grava histórico, atualiza `conversations.assigned_user_id` e reflete no chat/painel).
- Se for igual, no-op.
- Se não houver `senderAuthUserId` (auth desabilitado) ou o usuário não estiver em `team_members`, ignorar silenciosamente — nunca desatribuir.
- Não alterar nada quando a mensagem for da Nina (IA) — o fluxo só passa por essa função em envios humanos.

## Arquivos
- `src/services/api.ts`: renomear/relaxar `_autoAssignIfUnassigned` (manter o nome para não mexer nos 3 call sites) removendo o early-return por `currentAssignedUserId` e comparando `member.id !== currentAssignedUserId` antes de chamar `assignConversation`.

Nenhuma migração, edge function ou UI adicional é necessária — `assignConversation` já dispara os side effects (notificação/atualização em tempo real) que o painel consome.
