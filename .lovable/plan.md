## Objetivo

1. O sininho ao lado do nome do lead (na lista de chats) deve ficar **vermelho e pulsante** quando uma tarefa daquela conversa estiver **vencida ou no horário** (alerta visual).
2. Ao criar uma atividade no chat, permitir escolher um **responsável** (membro do time).
3. As **atividades/tarefas** devem aparecer também na aba **Agendamentos**, junto com os appointments, mostrando nome do lead, título da tarefa e horário.

---

## Mudanças

### 1. Sininho vermelho quando a tarefa estiver na hora (`src/components/ChatInterface.tsx`)

Hoje, em `~linha 706-714`, o badge do sininho aparece sempre âmbar quando há atividade pendente. Vamos calcular se a próxima atividade está vencida (ou prestes a vencer) e trocar a cor:

- Se `nextAt <= agora`: badge **vermelho** (`bg-rose-500/20 text-rose-300 border-rose-500/40`) com `animate-pulse`.
- Caso contrário: mantém âmbar atual.

Também replicar o destaque vermelho no header do chat ativo, se já existir indicador equivalente (manter consistência simples — só ajustar o badge da lista por agora).

### 2. Responsável na criação de atividade

**Schema (migration)** — adicionar coluna em `conversation_activities`:
```sql
ALTER TABLE public.conversation_activities
  ADD COLUMN IF NOT EXISTS assigned_to uuid;
```
(Sem FK para `auth.users`; armazenamos o `team_members.id` ou `user_id`. Vamos usar `team_members.id` por consistência com `conversations.assigned_user_id` que já é o id do team member.)

**Hook `useConversationActivities.ts`**:
- Adicionar `assigned_to?: string | null` em `ConversationActivity` e `CreateActivityInput`.
- Repassar no insert.

**`ActivityModal.tsx`**:
- Carregar lista de `team_members` (status = `active`) via supabase.
- Adicionar `<select>` "Responsável" (opcional) com avatar/nome.
- Enviar `assigned_to` no `onCreate`.

**`ActivitiesPanel.tsx`**:
- Mostrar mini-avatar/nome do responsável ao lado do título de cada `ActivityItem` quando presente.

### 3. Tarefas aparecendo na aba Agendamentos (`src/components/Scheduling.tsx`)

- Criar novo hook leve (ou inline no Scheduling) que busca `conversation_activities` (não concluídas) com join por `contact_id` para obter o nome do lead.
- Normalizar para o formato esperado pelos renderizadores Month/Week/Day, criando "pseudo-appointments" com:
  - `id`: `task-{activity.id}`
  - `title`: `📋 {activity.title} · {contactName}`
  - `date` / `time`: derivados de `scheduled_at`
  - `duration`: 30 (default visual)
  - `type`: novo tipo visual `'task'` → cor âmbar; se `scheduled_at < now` e não concluída → vermelho.
  - `metadata.source = 'activity'` para distinguir.
- Mesclar `appointments` + `taskAppointments` ao renderizar.
- Atualizar `getEventTypeColor` para incluir `task` (âmbar) e tratar overdue (vermelho) usando uma função auxiliar.
- Ao clicar em uma "task" no calendário: abrir um modal simples mostrando título/descrição/horário/lead e botão "Abrir conversa" que navega para `/chat?conversation={conversation_id}`. (Não reutilizar o modal de edição de appointment para evitar acoplamento.)
- Adicionar realtime subscription também em `conversation_activities` (além do `appointments` já existente).

### 4. Detalhes técnicos

- Migration aplicada via tool de migração (apenas DDL para `assigned_to`).
- Sem alteração de RLS (a policy permissiva existente já cobre).
- Sem mudanças em edge functions.

---

## Arquivos afetados

- `supabase/migrations/*` (nova migration: coluna `assigned_to`)
- `src/hooks/useConversationActivities.ts`
- `src/components/chat/ActivityModal.tsx`
- `src/components/chat/ActivitiesPanel.tsx`
- `src/components/ChatInterface.tsx` (cor do sino)
- `src/components/Scheduling.tsx` (mesclar tasks no calendário)
