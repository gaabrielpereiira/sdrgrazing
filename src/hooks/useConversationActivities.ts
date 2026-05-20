import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type ActivityType = 'call' | 'message' | 'meeting' | 'other';

export interface ConversationActivity {
  id: string;
  conversation_id: string;
  contact_id: string;
  title: string;
  description: string | null;
  activity_type: ActivityType;
  scheduled_at: string;
  is_completed: boolean;
  completed_at: string | null;
  reminder_sent: boolean;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateActivityInput {
  conversation_id: string;
  contact_id: string;
  title: string;
  description?: string;
  activity_type: ActivityType;
  scheduled_at: string; // ISO
  assigned_to?: string | null;
}

/**
 * Hook to manage conversation activities for a single conversation.
 * If conversationId is null, returns empty list.
 */
export function useConversationActivities(conversationId: string | null) {
  const [activities, setActivities] = useState<ConversationActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef<any>(null);

  const fetchActivities = useCallback(async () => {
    if (!conversationId) {
      setActivities([]);
      return;
    }
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('conversation_activities')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('scheduled_at', { ascending: true });

    if (error) {
      console.error('[useConversationActivities] fetch error', error);
    } else {
      setActivities((data as ConversationActivity[]) || []);
    }
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    fetchActivities();
    if (!conversationId) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`conv-activities-${conversationId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_activities',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          fetchActivities();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [conversationId, fetchActivities]);

  const createActivity = useCallback(async (input: CreateActivityInput) => {
    // Optimistic insert with temp id
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: ConversationActivity = {
      id: tempId,
      conversation_id: input.conversation_id,
      contact_id: input.contact_id,
      title: input.title,
      description: input.description ?? null,
      activity_type: input.activity_type,
      scheduled_at: input.scheduled_at,
      is_completed: false,
      completed_at: null,
      reminder_sent: false,
      assigned_to: input.assigned_to ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setActivities(prev => [...prev, optimistic].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)));

    const { error } = await (supabase as any)
      .from('conversation_activities')
      .insert(input);
    if (error) {
      console.error('[useConversationActivities] create error', error);
      toast.error('Erro ao criar atividade');
      // Revert
      setActivities(prev => prev.filter(a => a.id !== tempId));
      throw error;
    }
    const dt = new Date(input.scheduled_at);
    toast.success(`Atividade agendada para ${dt.toLocaleDateString('pt-BR')} às ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
    supabase.functions.invoke('activity-reminder-checker', { body: { trigger: 'create' } }).catch(() => {});
    fetchActivities();
  }, [fetchActivities]);

  const completeActivity = useCallback(async (id: string) => {
    const snapshot = activities;
    setActivities(prev => prev.map(a => a.id === id ? { ...a, is_completed: true, completed_at: new Date().toISOString() } : a));
    const { error } = await (supabase as any)
      .from('conversation_activities')
      .update({ is_completed: true, completed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      setActivities(snapshot);
      toast.error('Erro ao concluir atividade');
      throw error;
    }
    toast.success('Atividade concluída');
  }, [activities]);

  const deleteActivity = useCallback(async (id: string) => {
    const snapshot = activities;
    setActivities(prev => prev.filter(a => a.id !== id));
    const { error } = await (supabase as any)
      .from('conversation_activities')
      .delete()
      .eq('id', id);
    if (error) {
      setActivities(snapshot);
      toast.error('Erro ao remover atividade');
      throw error;
    }
    toast.success('Atividade removida');
  }, [activities]);

  return { activities, loading, createActivity, completeActivity, deleteActivity, refetch: fetchActivities };
}

/**
 * Lightweight global hook: returns map of conversationId -> { hasPendingToday, nextAt }
 * Used to show indicators in the conversations list.
 */
export function useAllPendingActivities() {
  const [byConv, setByConv] = useState<Record<string, { nextAt: string; count: number }>>({});

  const fetchAll = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from('conversation_activities')
      .select('conversation_id, scheduled_at')
      .eq('is_completed', false)
      .order('scheduled_at', { ascending: true });

    if (error) {
      console.error('[useAllPendingActivities] error', error);
      return;
    }
    const map: Record<string, { nextAt: string; count: number }> = {};
    (data || []).forEach((row: any) => {
      if (!map[row.conversation_id]) {
        map[row.conversation_id] = { nextAt: row.scheduled_at, count: 1 };
      } else {
        map[row.conversation_id].count += 1;
      }
    });
    setByConv(map);
  }, []);

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel(`all-conv-activities-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_activities' }, () => {
        fetchAll();
      })
      .subscribe();
    const interval = setInterval(fetchAll, 60_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchAll]);

  return byConv;
}
