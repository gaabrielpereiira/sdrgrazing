import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// In-memory cache shared across hook instances. Key = id (could be either
// team_members.id or auth.users.id), value = resolved display name.
const nameCache = new Map<string, string>();
const nullCache = new Set<string>(); // ids we already tried but couldn't resolve

/**
 * Resolves a list of "sender ids" (which can be either team_members.id or
 * auth.users.id) to display names. Mirrors the cascade used by the
 * whatsapp-sender edge function so the internal UI matches what the
 * customer sees on WhatsApp.
 */
export function useAttendantNames(ids: string[]) {
  const [namesById, setNamesById] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const id of ids) {
      const cached = nameCache.get(id);
      if (cached) initial[id] = cached;
    }
    return initial;
  });

  // Stable key for the effect dep
  const key = ids.slice().sort().join(',');

  useEffect(() => {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    const missing = unique.filter((id) => !nameCache.has(id) && !nullCache.has(id));

    if (missing.length === 0) {
      // Sync state with cache for currently requested ids
      const next: Record<string, string> = {};
      for (const id of unique) {
        const cached = nameCache.get(id);
        if (cached) next[id] = cached;
      }
      setNamesById((prev) => {
        // Avoid unnecessary updates
        const sameLen = Object.keys(prev).length === Object.keys(next).length;
        if (sameLen && Object.keys(next).every((k) => prev[k] === next[k])) return prev;
        return next;
      });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // 1) team_members where id is in missing
        const { data: tmById } = await supabase
          .from('team_members')
          .select('id, name')
          .in('id', missing);
        tmById?.forEach((row: any) => {
          if (row?.name) nameCache.set(row.id, row.name);
        });

        // Recompute still-missing after first pass
        const stillMissing = missing.filter((id) => !nameCache.has(id));

        // 2) team_members where user_id is in stillMissing
        if (stillMissing.length > 0) {
          const { data: tmByUser } = await supabase
            .from('team_members')
            .select('user_id, name')
            .in('user_id', stillMissing);
          tmByUser?.forEach((row: any) => {
            if (row?.user_id && row?.name) nameCache.set(row.user_id, row.name);
          });
        }

        // 3) profiles.full_name
        const stillMissing2 = missing.filter((id) => !nameCache.has(id));
        if (stillMissing2.length > 0) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('user_id, full_name')
            .in('user_id', stillMissing2);
          profs?.forEach((row: any) => {
            if (row?.user_id && row?.full_name) nameCache.set(row.user_id, row.full_name);
          });
        }

        // Mark anything still unresolved as null so we don't refetch
        missing.forEach((id) => {
          if (!nameCache.has(id)) nullCache.add(id);
        });

        if (cancelled) return;

        const next: Record<string, string> = {};
        for (const id of unique) {
          const cached = nameCache.get(id);
          if (cached) next[id] = cached;
        }
        setNamesById(next);
      } catch (err) {
        console.warn('[useAttendantNames] resolve failed', err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return namesById;
}
