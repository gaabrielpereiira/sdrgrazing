## Diagnóstico

Confirmei no banco de dados:
- A notificação **foi criada com sucesso** pelo orchestrator às 14:12:17 (título: "🚨 URGENTE — Reclamação: Gabriel Pereira", `is_read=false`)
- A tabela `notifications` está corretamente na publicação `supabase_realtime`
- A política RLS permite leitura por qualquer usuário autenticado
- O componente `NotificationsBell` está renderizado no `Sidebar` e o hook `useNotifications` faz fetch inicial + subscrição realtime

Ou seja, **a notificação existe no backend** — o problema é que o sino no Sidebar não está exibindo o badge / popover não lista o item para o usuário. Provavelmente:

1. O `unreadCount` não está sendo recalculado/exibido corretamente em algum estado
2. A subscrição realtime do `notifications-feed` pode estar conflitando com outros canais
3. Pode faltar `REPLICA IDENTITY FULL` na tabela (afeta updates), mas o fetch inicial deveria pegar mesmo assim
4. Pode haver erro silencioso de RLS quando `auth.role()` retorna algo diferente de `'authenticated'` no client

## Plano de correção

### 1. Ajustar a tabela `notifications` (migração)
- Adicionar `REPLICA IDENTITY FULL` para garantir payloads completos no realtime
- Confirmar/re-adicionar à publicação `supabase_realtime` (idempotente)
- Adicionar índice em `(is_read, created_at DESC)` para performance do badge

### 2. Tornar o `useNotifications` mais resiliente
- Logar erros e contagem retornada (`console.info('[Notifications] fetched X, unread Y')`)
- Adicionar polling de fallback a cada 15s caso a subscrição falhe (mesmo padrão usado em `useConversations`)
- Garantir que o canal realtime tenha nome único (ex.: `notifications-feed-${random}`) para evitar colisão entre múltiplas montagens
- Ordenar por `created_at DESC` consistentemente após inserts

### 3. Garantir notificação também em handoff manual
Atualmente só o orchestrator (AI) cria notificação. Quando o **usuário muda manualmente** o status para `human` pela UI (como aconteceu nos logs: `status updated to nina` → `human`), nenhuma notificação é gerada para outros membros da equipe.

Em `src/services/api.ts`, no método que altera `conversations.status` para `human`, **inserir também** uma notificação do tipo `handoff_manual` na tabela `notifications`, contendo o nome do contato e link para a conversa.

### 4. Melhorar feedback visual no `NotificationsBell`
- Mostrar pequeno indicador de "ao vivo" quando o canal realtime estiver `SUBSCRIBED`
- Quando o popover abrir, fazer um `refetch()` defensivo para garantir sincronização

### 5. Marcar notificação atual como visível
Após o deploy da migração, abrir o sino mostrará a notificação pendente do Gabriel Pereira que ficou "perdida".

## Arquivos afetados

- `supabase/migrations/<nova>.sql` — REPLICA IDENTITY + índice + publicação
- `src/hooks/useNotifications.ts` — logs, polling fallback, canal único, refetch
- `src/components/NotificationsBell.tsx` — indicador de live + refetch ao abrir
- `src/services/api.ts` — criar notificação em handoff manual

Sem mudanças em edge functions — o orchestrator já está correto.