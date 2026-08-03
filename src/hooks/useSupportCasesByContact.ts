import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SupportCaseRow {
  id: string;
  created_at: string;
  grupo_suporte: string;
  categoria_suporte: string;
  status_resolucao: string;
  resumo: string | null;
  order_number: string | null;
  causa: string | null;
  closed_at: string | null;
  resolution_note: string | null;
  responsavel_name: string | null;
}

/**
 * Loads all support_cases for a given contact_id (full history), ordered by created_at desc.
 * Refreshes on realtime INSERT/UPDATE of support_cases for this contact.
 */
export function useSupportCasesByContact(contactId: string | null | undefined) {
  const [cases, setCases] = useState<SupportCaseRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let alive = true;
    if (!contactId) {
      setCases([]);
      return;
    }

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('support_cases')
        .select('id, created_at, grupo_suporte, categoria_suporte, status_resolucao, resumo, order_number, causa, closed_at, resolution_note, responsavel:team_members(name)')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });
      if (!alive) return;
      setLoading(false);
      if (error) {
        console.warn('[useSupportCasesByContact] error:', error);
        return;
      }
      setCases(((data || []) as any[]).map((r) => ({
        ...r,
        responsavel_name: r.responsavel?.name ?? null,
      })) as SupportCaseRow[]);
    };

    load();

    const channel = supabase
      .channel(`support-cases-contact-${contactId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_cases', filter: `contact_id=eq.${contactId}` },
        () => load(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'support_cases', filter: `contact_id=eq.${contactId}` },
        () => load(),
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [contactId]);

  return { cases, loading };
}
