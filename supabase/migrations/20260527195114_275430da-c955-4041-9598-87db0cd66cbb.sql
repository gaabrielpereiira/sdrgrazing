
-- 1. Idempotency table: one row per (rule, target transition)
CREATE TABLE IF NOT EXISTS public.automation_executions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id uuid NOT NULL,
  external_id text NOT NULL,
  target_signature text NOT NULL,
  event_id uuid,
  executed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_id, external_id, target_signature)
);

GRANT SELECT, INSERT ON public.automation_executions TO authenticated;
GRANT ALL ON public.automation_executions TO service_role;

ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read automation_executions"
ON public.automation_executions FOR SELECT TO authenticated USING (true);

-- 2. Webhook event deduplication: prevent identical retransmissions
-- (same source+topic+external order id+payload signature)
ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS event_signature text;

CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_dedup_idx
  ON public.webhook_events (source, topic, external_id, event_signature)
  WHERE external_id IS NOT NULL AND event_signature IS NOT NULL;

-- 3. Migrate existing rules: convert `eq` on `status` to `changed_to`
--    so they only fire on real transitions, not on every re-delivery.
UPDATE public.automation_rules
SET filters = jsonb_set(
  filters,
  '{conditions}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN c->>'field' = 'status' AND c->>'operator' = 'eq'
          THEN jsonb_set(c, '{operator}', '"changed_to"')
        ELSE c
      END
    )
    FROM jsonb_array_elements(filters->'conditions') c
  )
)
WHERE trigger_topic LIKE 'order.%'
  AND filters ? 'conditions'
  AND jsonb_array_length(filters->'conditions') > 0;
