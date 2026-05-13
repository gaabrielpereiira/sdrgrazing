CREATE OR REPLACE FUNCTION public.cleanup_webhook_data()
RETURNS TABLE(events_deleted bigint, logs_deleted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_events bigint := 0;
  v_logs bigint := 0;
BEGIN
  WITH d AS (
    DELETE FROM public.webhook_events
    WHERE processed = true AND received_at < now() - interval '90 days'
    RETURNING 1
  ) SELECT count(*) INTO v_events FROM d;

  WITH d AS (
    DELETE FROM public.automation_logs
    WHERE executed_at < now() - interval '30 days'
    RETURNING 1
  ) SELECT count(*) INTO v_logs FROM d;

  RETURN QUERY SELECT v_events, v_logs;
END;
$$;

-- Indexes for monitor + logs UI performance
CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at_desc ON public.webhook_events (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON public.webhook_events (processed, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_rule_executed ON public.automation_logs (rule_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_event ON public.automation_logs (event_id);

-- Enable realtime for logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.automation_logs;