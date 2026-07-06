import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SupportCaseSummary {
  grupo: string;
  categoria: string;
}

/**
 * Loads the most recent support_case per conversation_id for the given IDs.
 * Refreshes on realtime INSERT/UPDATE of support_cases.
 */
export function useSupportCaseByConversation(conversationIds: string[]) {
  const [map, setMap] = useState<Record<string, SupportCaseSummary>>({});
  const idsKey = useMemo(() => [...conversationIds].sort().join(','), [conversationIds]);
  const idsRef = useRef<string[]>([]);
  idsRef.current = conversationIds;

  useEffect(() => {
    let alive = true;
    const ids = idsRef.current;
    if (ids.length === 0) {
      setMap({});
      return;
    }

    const load = async () => {
      const { data, error } = await supabase
        .from('support_cases')
        .select('conversation_id, grupo_suporte, categoria_suporte, created_at')
        .in('conversation_id', ids)
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('[useSupportCaseByConversation] error:', error);
        return;
      }
      if (!alive) return;
      const next: Record<string, SupportCaseSummary> = {};
      for (const row of (data || []) as any[]) {
        if (!row.conversation_id) continue;
        if (next[row.conversation_id]) continue; // keep most recent (first)
        next[row.conversation_id] = {
          grupo: row.grupo_suporte,
          categoria: row.categoria_suporte,
        };
      }
      setMap(next);
    };

    load();

    const channel = supabase
      .channel(`support-cases-chat-${idsKey.slice(0, 40)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_cases' },
        (payload: any) => {
          const row = payload.new;
          if (!row?.conversation_id) return;
          if (!idsRef.current.includes(row.conversation_id)) return;
          setMap((prev) => ({
            ...prev,
            [row.conversation_id]: { grupo: row.grupo_suporte, categoria: row.categoria_suporte },
          }));
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'support_cases' },
        () => load(),
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [idsKey]);

  return map;
}
