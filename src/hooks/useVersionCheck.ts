import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

/**
 * Polls /index.html periodically and detects when the deployed bundle hash
 * changes. Shows a sticky toast with a "Atualizar" button so users stuck
 * in an old tab can reload to the new version without manual cache clearing.
 */
export function useVersionCheck(intervalMs = 60_000) {
  const initialBundleRef = useRef<string | null>(null);
  const notifiedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const extractBundle = (html: string): string | null => {
      const m = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
      return m ? m[0] : null;
    };

    const check = async () => {
      try {
        const res = await fetch(`/index.html?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const html = await res.text();
        const bundle = extractBundle(html);
        if (!bundle) return;
        if (initialBundleRef.current == null) {
          initialBundleRef.current = bundle;
          return;
        }
        if (bundle !== initialBundleRef.current && !notifiedRef.current) {
          notifiedRef.current = true;
          toast.info('Nova versão disponível', {
            description: 'Recarregue para usar a versão mais recente do sistema.',
            duration: Infinity,
            action: {
              label: 'Atualizar',
              onClick: () => window.location.reload(),
            },
          });
        }
      } catch {
        // network errors are silent
      }
    };

    check();
    const id = setInterval(() => { if (!cancelled) check(); }, intervalMs);
    const onFocus = () => { if (!cancelled) check(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [intervalMs]);
}
