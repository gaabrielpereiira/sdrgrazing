## Problema

Excluir um membro/usuário pela tela de Equipe falha por dois motivos:

1. **RLS bloqueia o DELETE.** A policy `Admins can modify team_members` exige `has_role(auth.uid(), 'admin')`. Como a autenticação está temporariamente desativada no app (memória registrada), `auth.uid()` chega como `null` no banco e o delete é negado silenciosamente.

2. **Mesmo quando funciona, o usuário não some de verdade.** `api.deleteTeamMember` apaga só a linha em `team_members` — `auth.users`, `user_roles` e `profiles` continuam intactos. Logo o "usuário" reaparece (sync recria o `team_members` a partir de `auth.users`).

## Solução

Criar uma **Edge Function `delete-user`** que roda com `SERVICE_ROLE_KEY` (ignora RLS) e remove o usuário de verdade, em ordem:

1. Recebe `{ memberId: string }` no body, valida com Zod.
2. Busca o `team_members` por `id` → pega `user_id` e `email`.
3. Se houver `user_id`:
   - `supabase.auth.admin.deleteUser(user_id)` (apaga `auth.users`; user_roles cascateia via FK ou é apagado explicitamente).
   - `delete from user_roles where user_id = ...`
   - `delete from profiles where user_id = ...`
4. `delete from team_members where id = memberId`.
5. Retorna `{ ok: true }` com CORS.
6. Config: `verify_jwt = false` (auth está bypassada no app) e função tolerante a JWT ausente, alinhado ao restante do projeto.

## Frontend

- `src/services/api.ts` → trocar `deleteTeamMember` para invocar a edge function via `supabase.functions.invoke('delete-user', { body: { memberId: id } })` em vez do `.delete()` direto.
- `src/components/Team.tsx` → nenhuma mudança de UX; apenas o toast de erro passará a mostrar a mensagem real vinda da função quando falhar.

## Arquivos

- **Novo:** `supabase/functions/delete-user/index.ts`
- **Editado:** `src/services/api.ts` (só o corpo de `deleteTeamMember`)

## Fora de escopo

- Não vou mexer nas RLS policies de `team_members` — manter `has_role` é o correto para quando a auth voltar.
- Não vou criar UI nova; o botão "Excluir" já existe em `Team.tsx`.
