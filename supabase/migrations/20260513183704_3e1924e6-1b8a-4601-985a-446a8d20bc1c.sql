
-- 1. nina_settings: secret do Woo
ALTER TABLE public.nina_settings ADD COLUMN IF NOT EXISTS wc_webhook_secret text;

-- 2. webhook_events
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'woocommerce',
  received_at timestamptz NOT NULL DEFAULT now(),
  processed boolean NOT NULL DEFAULT false,
  error text
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_topic ON public.webhook_events(topic);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON public.webhook_events(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at ON public.webhook_events(received_at DESC);
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can access webhook_events" ON public.webhook_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. automation_rules
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger_topic text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{"conditions":[],"logic":"AND"}'::jsonb,
  action_type text NOT NULL,
  action_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  cooldown_hours integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_automation_rules_topic_active ON public.automation_rules(trigger_topic, active);
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can access automation_rules" ON public.automation_rules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_automation_rules_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. automation_logs
CREATE TABLE IF NOT EXISTS public.automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.webhook_events(id) ON DELETE SET NULL,
  status text NOT NULL,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  executed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_automation_logs_rule ON public.automation_logs(rule_id, executed_at DESC);
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can access automation_logs" ON public.automation_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. contact_cooldowns
CREATE TABLE IF NOT EXISTS public.contact_cooldowns (
  contact_phone text NOT NULL,
  rule_id uuid NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_phone, rule_id)
);
ALTER TABLE public.contact_cooldowns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can access contact_cooldowns" ON public.contact_cooldowns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. Realtime publication
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.webhook_events;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.automation_rules;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
