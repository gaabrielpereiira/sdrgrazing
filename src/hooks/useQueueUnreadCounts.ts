import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface QueueUnreadCounts {
  sales: number;
  support: number;
}

/**
 * Counts unread incoming messages grouped by conversation queue.
 * Refreshes on a 30s interval and on every realtime message INSERT/UPDATE.
 */
export function useQueueUnreadCounts(): QueueUnreadCounts {
  const [counts, setCounts] = useState<QueueUnreadCounts>({ sales: 0, support: 0 });

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('conversation_id, conversations!inner(queue)')
        .eq('from_type', 'user')
        .is('read_at', null)
        .limit(5000);
      if (error) {
        console.warn('[useQueueUnreadCounts] error:', error);
        return;
      }
      let sales = 0, support = 0;
      for (const row of (data || []) as any[]) {
        const q = row.conversations?.queue;
        if (q === 'support') support++;
        else sales++;
      }
      setCounts({ sales, support });
    } catch (e) {
      console.warn('[useQueueUnreadCounts] refresh failed:', e);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);

    const channel = supabase
      .channel('queue-unread-counts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, refresh)
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return counts;
}
