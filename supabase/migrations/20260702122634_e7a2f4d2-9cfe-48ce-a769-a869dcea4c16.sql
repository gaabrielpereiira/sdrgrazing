
-- 1. support_cases table
CREATE TABLE IF NOT EXISTS public.support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  grupo_suporte text NOT NULL,
  categoria_suporte text NOT NULL,
  requer_agente_humano boolean NOT NULL,
  status_resolucao text NOT NULL,
  responsavel_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  causa text,
  resumo text,
  sentimento text,
  order_number text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_cases_grupo_check CHECK (
    grupo_suporte IN ('entrega','produto','pedido_pagamento','outros')
  ),
  CONSTRAINT support_cases_status_check CHECK (
    status_resolucao IN ('resolvido_pela_ia','encaminhado_agente')
  ),
  CONSTRAINT support_cases_categoria_grupo_check CHECK (
    (grupo_suporte = 'entrega' AND categoria_suporte IN (
      'atraso_entrega','nao_entregue','endereco_incorreto','dificuldade_acesso','embalagem_danificada'
    )) OR
    (grupo_suporte = 'produto' AND categoria_suporte IN (
      'produto_diferente','produto_incompleto','qualidade_abaixo_esperado','produto_avariado','divergencia_foto_site'
    )) OR
    (grupo_suporte = 'pedido_pagamento' AND categoria_suporte IN (
      'erro_pedido','problema_pagamento','cancelamento','reembolso_troca'
    )) OR
    (grupo_suporte = 'outros' AND categoria_suporte IN (
      'elogio_feedback_positivo','duvida_geral_pos_compra','outro'
    ))
  )
);

CREATE INDEX IF NOT EXISTS support_cases_created_at_idx ON public.support_cases(created_at DESC);
CREATE INDEX IF NOT EXISTS support_cases_categoria_idx ON public.support_cases(categoria_suporte);
CREATE INDEX IF NOT EXISTS support_cases_status_idx ON public.support_cases(status_resolucao);
CREATE INDEX IF NOT EXISTS support_cases_conversation_idx ON public.support_cases(conversation_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_cases TO authenticated;
GRANT ALL ON public.support_cases TO service_role;

ALTER TABLE public.support_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can access all support cases"
  ON public.support_cases
  FOR ALL
  TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE TRIGGER support_cases_updated_at
  BEFORE UPDATE ON public.support_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_cases;

-- 2. nina_settings.producao_user_id
ALTER TABLE public.nina_settings
  ADD COLUMN IF NOT EXISTS producao_user_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL;
