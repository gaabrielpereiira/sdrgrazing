
ALTER TABLE public.automation_rules
  ADD COLUMN IF NOT EXISTS delay_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancel_if_changed boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.automation_scheduled (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.webhook_events(id) ON DELETE SET NULL,
  external_id text,
  target_signature text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status_at_schedule text,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  cancel_reason text,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_scheduled TO authenticated;
GRANT ALL ON public.automation_scheduled TO service_role;

ALTER TABLE public.automation_scheduled ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can access all automation_scheduled" ON public.automation_scheduled;
CREATE POLICY "Authenticated users can access all automation_scheduled"
  ON public.automation_scheduled FOR ALL
  TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_automation_scheduled_pending
  ON public.automation_scheduled (status, scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_automation_scheduled_rule
  ON public.automation_scheduled (rule_id, status);

DROP TRIGGER IF EXISTS update_automation_scheduled_updated_at ON public.automation_scheduled;
CREATE TRIGGER update_automation_scheduled_updated_at
  BEFORE UPDATE ON public.automation_scheduled
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
