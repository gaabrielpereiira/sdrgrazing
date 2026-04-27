# Plano: Atividades agendadas no chat + Indicador de atendente

## O que será adicionado

### 1. Atividades/Lembretes da conversa (com data e hora)
Dentro de cada conversa no chat, será possível criar tarefas como "Ligar para o cliente amanhã às 14h", "Enviar proposta sexta", etc. Essas atividades aparecem de forma visível e disparam lembretes quando chega a hora.

**Onde aparece:**
- **Painel direito do chat**: nova seção "Atividades & Lembretes" logo abaixo de "Responsável", com:
  - Botão "+ Nova atividade" (abre modal com título, descrição opcional, data/hora, tipo: ligar/enviar mensagem/reunião/outro)
  - Lista das próximas atividades pendentes (ordenadas por data), com botão "Concluir" e "Editar"
  - Atividades vencidas aparecem destacadas em vermelho
- **Header do chat**: badge amarelo "⏰ Lembrete em 2h" quando houver atividade pendente próxima (< 24h)
- **Lista de conversas (sidebar esquerda)**: ícone de relógio ao lado do nome do contato quando há atividade pendente para hoje
- **Sino de notificações** (já existente): notificação criada automaticamente quando a hora da atividade chega

### 2. Indicador de atendente no chat
Saber visualmente quem está conversando com cada cliente.

**Onde aparece:**
- **Header do chat (topo)**: ao lado do status (Nina/Humano), mostra avatar + nome do atendente responsável (ex: "👤 João Silva"). Se ninguém atribuído e status=humano, mostra "Sem responsável" em laranja como alerta.
- **Lista de conversas**: pequeno avatar do responsável no canto inferior do item da lista (quando atribuído)

## Detalhes técnicos

### Banco de dados
Reaproveitar a tabela existente `deal_activities` não serve (é vinculada a deal). Criar nova tabela:

```sql
CREATE TABLE public.conversation_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  activity_type text NOT NULL DEFAULT 'call', -- call|message|meeting|other
  scheduled_at timestamptz NOT NULL,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  reminder_sent boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- RLS permissivo (single-tenant) + index em scheduled_at + adicionar à publicação realtime
```

### Edge function de lembrete
Nova função `activity-reminder-checker` (chamada a cada minuto via setTimeout auto-agendado, padrão já usado pelo message-grouper):
- Busca atividades com `scheduled_at <= now()` e `reminder_sent = false` e `is_completed = false`
- Para cada uma, insere em `notifications` (`type='activity_reminder'`) e marca `reminder_sent = true`
- Aciona-se também manualmente quando uma atividade é criada com horário próximo

### Frontend
- **`src/services/api.ts`**: adicionar `fetchConversationActivities(convId)`, `createConversationActivity()`, `updateConversationActivity()`, `completeConversationActivity()`, `deleteConversationActivity()`
- **`src/hooks/useConversationActivities.ts`** (novo): hook com realtime subscription na tabela, retorna atividades da conversa selecionada
- **`src/components/chat/ActivitiesPanel.tsx`** (novo): seção do painel direito com lista + botão criar
- **`src/components/chat/ActivityModal.tsx`** (novo): modal para criar/editar com date/time picker (shadcn Calendar + Input time)
- **`src/components/ChatInterface.tsx`**:
  - Importar e renderizar `ActivitiesPanel` no painel direito (após "Responsável")
  - No header do chat: adicionar badge de lembrete próximo + bloco do responsável (avatar + nome buscado de `teamMembers` via `assignedUserId`)
  - Na lista de conversas (item): ícone relógio se houver atividade hoje, mini-avatar do responsável
- **`src/hooks/useNotifications.ts`**: já trata novos tipos genericamente; ao clicar em notificação `activity_reminder`, navegar para `/chat?conversation=<id>`

### Fluxo de criação
Ao salvar nova atividade pelo modal:
1. Insere em `conversation_activities`
2. Toast "Atividade agendada para DD/MM às HH:mm"
3. Realtime atualiza painel imediatamente
4. Quando `scheduled_at` chegar, edge function gera notificação no sino

## Resumo do entregável
- Tabela nova `conversation_activities` + migration
- Edge function `activity-reminder-checker` (auto-agendada)
- Hook + 2 componentes novos no chat
- Edição de `ChatInterface.tsx` para mostrar responsável no header e integrar painel de atividades
- Notificações de lembrete no sino existente