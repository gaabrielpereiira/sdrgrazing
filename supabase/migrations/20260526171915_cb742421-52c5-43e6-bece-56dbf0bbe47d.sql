ALTER TABLE public.nina_settings
  ADD COLUMN IF NOT EXISTS ai_provider text NOT NULL DEFAULT 'google',
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS ai_api_keys jsonb NOT NULL DEFAULT '{}'::jsonb;