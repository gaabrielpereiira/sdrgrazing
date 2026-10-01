import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface QueueUnreadCounts {
  sales: number;
  support: number;
}

const DEBOUNCE_MS = 2000;

/**
 * Counts unread incoming messages grouped by conversation queue.
 * Counting happens in the database (get_queue_unread_counts). Realtime events
 * are debounced and refreshes pause while the browser tab is hidden.
 */
export function useQueueUnreadCounts(): QueueUnreadCounts {
  const [counts, setCounts] = useState<QueueUnreadCounts>({ sales: 0, support: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const { data, error } = await (supabase as any).rpc('get_queue_unread_counts');
      if (error) {
        console.warn('[useQueueUnreadCounts] error:', error);
        return;
      }
      const d = (data || {}) as { sales?: number; support?: number };
      setCounts({ sales: Number(d.sales) || 0, support: Number(d.support) || 0 });
    } catch (e) {
      console.warn('[useQueueUnreadCounts] refresh failed:', e);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      refresh();
    }, DEBOUNCE_MS);
  }, [refresh]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);

    const channel = supabase
      .channel(`queue-unread-counts-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, scheduleRefresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, scheduleRefresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, scheduleRefresh)
      .subscribe();

    return () => {
      clearInterval(interval);
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [refresh, scheduleRefresh]);

  return counts;
}
