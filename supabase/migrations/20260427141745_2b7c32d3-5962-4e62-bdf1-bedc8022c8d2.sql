-- Garantir REPLICA IDENTITY FULL para realtime payloads completos
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- Re-adicionar à publicação realtime (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- Índice para consulta rápida do badge (não lidas, ordenadas por data)
CREATE INDEX IF NOT EXISTS idx_notifications_unread_created
  ON public.notifications (is_read, created_at DESC);