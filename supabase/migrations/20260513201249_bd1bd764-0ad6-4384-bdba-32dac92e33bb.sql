ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_webhook_events_retry
  ON public.webhook_events (next_retry_at)
  WHERE processed = false AND next_retry_at IS NOT NULL;