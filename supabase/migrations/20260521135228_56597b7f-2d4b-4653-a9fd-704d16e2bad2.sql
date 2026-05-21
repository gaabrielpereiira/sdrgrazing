ALTER TABLE public.nina_settings
  ADD COLUMN IF NOT EXISTS wc_site_url text,
  ADD COLUMN IF NOT EXISTS wc_consumer_key text,
  ADD COLUMN IF NOT EXISTS wc_consumer_secret text,
  ADD COLUMN IF NOT EXISTS wc_products_enabled boolean NOT NULL DEFAULT false;