ALTER TABLE public.nina_settings
  ADD COLUMN IF NOT EXISTS support_alert_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS support_alert_phone text,
  ADD COLUMN IF NOT EXISTS support_alert_template text;