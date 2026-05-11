import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ConversationTabCounts {
  activeSales: number;
  finishedSales: number;
  activeSupport: number;
  finishedSupport: number;
  activeTotal: number;
  finishedTotal: number;
}

const ZERO: ConversationTabCounts = {
  activeSales: 0,
  finishedSales: 0,
  activeSupport: 0,
  finishedSupport: 0,
  activeTotal: 0,
  finishedTotal: 0,
};

/**
 * Counts conversations grouped by queue (sales/support) and is_active.
 * Refreshes every 30s and on conversations realtime changes.
 */
export function useConversationTabCounts(): ConversationTabCounts {
  const [counts, setCounts] = useState<ConversationTabCounts>(ZERO);

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('id, queue, is_active')
        .limit(5000);
      if (error) {
        console.warn('[useConversationTabCounts] error:', error);
        return;
      }
      const next = { ...ZERO };
      for (const row of (data || []) as any[]) {
        const isSupport = row.queue === 'support';
        const isActive = row.is_active !== false;
        if (isActive) {
          next.activeTotal++;
          if (isSupport) next.activeSupport++;
          else next.activeSales++;
        } else {
          next.finishedTotal++;
          if (isSupport) next.finishedSupport++;
          else next.finishedSales++;
        }
      }
      setCounts(next);
    } catch (e) {
      console.warn('[useConversationTabCounts] refresh failed:', e);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);

    const channel = supabase
      .channel('conversation-tab-counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, refresh)
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return counts;
}
