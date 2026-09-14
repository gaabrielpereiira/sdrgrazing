CREATE TABLE public.product_catalog_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  media_url TEXT,
  caption TEXT,
  visual_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  searched_terms TEXT[] NOT NULL DEFAULT '{}'::text[],
  catalog_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_product JSONB,
  confidence NUMERIC(5,4),
  final_response TEXT,
  handoff_requested BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'completed', 'needs_human', 'failed')),
  error_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_catalog_audit_conversation ON public.product_catalog_audit(conversation_id, created_at DESC);
CREATE INDEX idx_product_catalog_audit_message ON public.product_catalog_audit(message_id);

GRANT SELECT ON public.product_catalog_audit TO authenticated;
GRANT ALL ON public.product_catalog_audit TO service_role;

ALTER TABLE public.product_catalog_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read product catalog audit"
ON public.product_catalog_audit
FOR SELECT
TO authenticated
USING (auth.role() = 'authenticated');