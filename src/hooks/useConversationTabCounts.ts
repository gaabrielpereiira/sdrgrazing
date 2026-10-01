import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ConversationTabCounts {
  activeSales: number;
  finishedSales: number;
  activeSupport: number;
  finishedSupport: number;
  activeSupportTickets: number;
  finishedSupportTickets: number;
  activeTotal: number;
  finishedTotal: number;
  mine: number;
  /** Conversation ids that have at least one open support ticket */
  openTicketConversationIds: Set<string>;
}

const ZERO: ConversationTabCounts = {
  activeSales: 0,
  finishedSales: 0,
  activeSupport: 0,
  finishedSupport: 0,
  activeSupportTickets: 0,
  finishedSupportTickets: 0,
  activeTotal: 0,
  finishedTotal: 0,
  mine: 0,
  openTicketConversationIds: new Set<string>(),
};

const DEBOUNCE_MS = 2000;

/**
 * Counts conversations grouped by queue (sales/support), is_active, and
 * (optionally) the active conversations assigned to the current team_member.
 * Counting happens in the database (get_conversation_tab_counts). Realtime
 * events are debounced and refreshes pause while the browser tab is hidden.
 */
export function useConversationTabCounts(
  myMemberId?: string | null,
  restrictTeamId?: string | null,
): ConversationTabCounts {
  const [counts, setCounts] = useState<ConversationTabCounts>(ZERO);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const { data, error } = await (supabase as any).rpc('get_conversation_tab_counts', {
        _member_id: myMemberId || null,
        _team_id: restrictTeamId || null,
      });
      if (error) {
        console.warn('[useConversationTabCounts] error:', error);
        return;
      }
      const d = (data || {}) as Record<string, any>;
      const n = (k: string) => Number(d[k]) || 0;
      const activeSupport = n('activeSupport');
      const finishedSupport = n('finishedSupport');
      setCounts({
        activeSales: n('activeSales'),
        finishedSales: n('finishedSales'),
        activeSupport,
        finishedSupport,
        activeSupportTickets: activeSupport,
        finishedSupportTickets: finishedSupport,
        activeTotal: n('activeTotal'),
        finishedTotal: n('finishedTotal'),
        mine: n('mine'),
        openTicketConversationIds: new Set<string>(
          ((d.openTicketConversationIds || []) as string[]).filter(Boolean),
        ),
      });
    } catch (e) {
      console.warn('[useConversationTabCounts] refresh failed:', e);
    } finally {
      inFlightRef.current = false;
    }
  }, [myMemberId, restrictTeamId]);

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
      .channel(`conversation-tab-counts-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_cases' }, scheduleRefresh)
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
