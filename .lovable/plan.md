## Diagnóstico

Investiguei o banco e encontrei a raiz dos três sintomas:

### Estado atual no banco

**`team_members`** (3 registros — todos com `user_id = NULL` e `status = 'invited'`):
- Gabriel — `gabriel@sharkassessoria.com.br` — id `ffec7a15…`
- Tais Sodre — `tais.sodre@grazingtable.com.br` — id `4d1f5b8f…`
- Allan Abrunhosa — `allan.abrunhosa@grazingtable.com.br` — id `237e4b6e…`

**`auth.users` + `profiles`** (3 usuários reais já cadastrados, com os MESMOS emails):
- Gabriel Pereira — auth id `cb616480…`
- Allan Abrunhosa — auth id `45b14871…`
- Tais Sodre dos Santos — auth id `996bf7ab…`

**`conversations.assigned_user_id`** está armazenando o `team_members.id` (ex.: `ffec7a15…`, `4d1f5b8f…`), e NÃO o `auth.users.id`.

### Os 3 bugs explicados

**Bug 1 — "Todos aparecem como Pendente"**
`team_members.status` nunca é atualizado para `'active'` quando o convidado realmente cria conta. A criação do membro insere com `status: 'invited'` e `user_id: null` e nada nunca religa isso ao `auth.users`.

**Bug 2 — "Não aparece todos os usuários corretamente"**
A página Equipe lista somente o que existe em `team_members`. Se um usuário se cadastrou via `Auth` (existe em `auth.users` + `profiles`) mas ninguém o convidou via UI, ele simplesmente não aparece. Não há sincronização entre `auth.users` e `team_members`.

**Bug 3 — "Nome de quem está atendendo está errado"**
No `whatsapp-sender/index.ts`, `resolveHumanSenderName` busca `team_members.user_id = assigned_user_id`. Mas `conversations.assigned_user_id` na verdade contém o `team_members.id` (não o auth user id). Resultado: a query falha, cai no fallback `nina_settings.sdr_name` (nome genérico da casa) ou pega outro membro errado, e o cliente vê o nome errado.

---

## Plano de correção

### 1. Migration: vincular team_members a auth.users por email + ativar status

```sql
-- Vincular membros existentes ao auth user correspondente (case-insensitive)
UPDATE public.team_members tm
SET user_id = u.id,
    status  = 'active',
    updated_at = now()
FROM auth.users u
WHERE tm.user_id IS NULL
  AND lower(tm.email) = lower(u.email);

-- Criar team_member para qualquer auth user que ainda não tem entrada
INSERT INTO public.team_members (name, email, role, status, user_id, weight)
SELECT
  COALESCE(p.full_name, split_part(u.email, '@', 1)),
  u.email,
  CASE WHEN ur.role = 'admin' THEN 'admin'::member_role ELSE 'agent'::member_role END,
  'active'::member_status,
  u.id,
  1
FROM auth.users u
LEFT JOIN public.profiles p   ON p.user_id = u.id
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
WHERE NOT EXISTS (
  SELECT 1 FROM public.team_members tm WHERE lower(tm.email) = lower(u.email)
);
```

### 2. Trigger automático para futuros signups

Estender `handle_new_user()` (já existe) para também:
- Inserir/atualizar registro em `team_members` com `user_id`, `status='active'` e nome do `raw_user_meta_data.full_name`.
- Se já existe um `team_members` com mesmo email (convite enviado antes do signup), só atualiza `user_id` + `status='active'` + `name`.

### 3. Corrigir resolução de nome no WhatsApp sender

`supabase/functions/whatsapp-sender/index.ts` — função `resolveHumanSenderName`:

Estratégia de busca, em ordem:
1. Buscar `conversations.assigned_user_id` da conversa.
2. Tratar esse valor como **podendo ser `team_members.id` OU `auth.users.id`**:
   - Tentar `team_members WHERE id = assigned_user_id` → pega `name`.
   - Se não achar, tentar `team_members WHERE user_id = assigned_user_id` → `name`.
   - Se ainda não achar, `profiles WHERE user_id = assigned_user_id` → `full_name`.
3. Repetir o passo 2 com `metadata.sender_user_id`.
4. Fallback `nina_settings.sdr_name`.

Isso garante que mesmo conversas antigas (com `team_members.id` salvo no `assigned_user_id`) e novas (com `auth.users.id`) resolvam o nome correto.

### 4. UI Equipe — mostrar quem é o usuário logado da plataforma

Em `src/components/Team.tsx`, na linha do membro:
- Adicionar badge "Conta vinculada" quando `team_members.user_id IS NOT NULL`.
- O selector de status já existe via `getStatusBadge`. Como agora `status` será atualizado corretamente pela migration + trigger, o "Pendente" só aparecerá para convites reais (sem signup ainda).

### 5. (Opcional) Botão "Sincronizar usuários" na página Equipe

Botão admin que invoca uma função RPC `sync_team_members_with_auth()` que executa o mesmo SQL da migration (passo 1) — útil para recuperar caso alguém crie usuário direto no Auth.

---

## Arquivos alterados

- **Nova migration** — vincular existentes + atualizar `handle_new_user()` + criar função `sync_team_members_with_auth()`.
- `supabase/functions/whatsapp-sender/index.ts` — `resolveHumanSenderName` aceita id como `team_members.id` OU `auth.users.id`.
- `src/components/Team.tsx` — badge "Conta vinculada" + botão "Sincronizar usuários" (admin).
- `src/services/api.ts` — adicionar `syncTeamMembers()` que chama a RPC.

Sem mudanças destrutivas — só adições e atualizações.
