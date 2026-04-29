
-- Templates do WhatsApp Cloud API (single-tenant)
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_template_id text,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'MARKETING',
  language text NOT NULL DEFAULT 'pt_BR',
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  samples jsonb,
  status text NOT NULL DEFAULT 'draft',
  quality_rating text,
  rejected_reason text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_templates_name_language_unique UNIQUE (name, language)
);

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can access all whatsapp_templates" ON public.whatsapp_templates;
CREATE POLICY "Authenticated users can access all whatsapp_templates"
ON public.whatsapp_templates
FOR ALL
TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Public can access whatsapp_templates" ON public.whatsapp_templates;
CREATE POLICY "Public can access whatsapp_templates"
ON public.whatsapp_templates
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- updated_at trigger
DROP TRIGGER IF EXISTS update_whatsapp_templates_updated_at ON public.whatsapp_templates;
CREATE TRIGGER update_whatsapp_templates_updated_at
BEFORE UPDATE ON public.whatsapp_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add to realtime publication (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'whatsapp_templates'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_templates;
  END IF;
END $$;
