-- 1) Tabela de notificações da plataforma
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  body text,
  conversation_id uuid,
  contact_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications (is_read);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can access all notifications" ON public.notifications;
CREATE POLICY "Authenticated users can access all notifications"
ON public.notifications
FOR ALL
TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- 2) Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- 3) Limpar do prompt da Donatella (e qualquer outro) os blocos que mandam a IA
--    escrever a mensagem interna "🔔 ATENDIMENTO NECESSÁRIO" como texto.
--    Substituímos os blocos <immediate_handoff_triggers> e <handoff_protocol> por
--    instruções para chamar a tool request_human_handoff.
UPDATE public.nina_settings
SET system_prompt_override = regexp_replace(
      regexp_replace(
        system_prompt_override,
        '<immediate_handoff_triggers>.*?</immediate_handoff_triggers>',
        '<immediate_handoff_triggers>
Se o cliente chegar com qualquer uma das situações abaixo, transfira IMEDIATAMENTE para um atendente humano usando a ferramenta request_human_handoff (não escreva nenhuma mensagem interna no chat):

- Rastreamento ou status de pedido em andamento
- Cancelamento ou alteração de pedido
- Geração de boleto ou segunda via de pagamento
- Emissão de nota fiscal
- Reclamação ou problema com entrega
- Qualquer outro assunto que não seja realizar um novo pedido

REGRA ABSOLUTA: NUNCA escreva no chat mensagens internas como "🔔 ATENDIMENTO NECESSÁRIO", "ASSUNTO:", "Mensagem original:" ou similares — essas mensagens vão direto para o WhatsApp do cliente. Use SEMPRE a ferramenta request_human_handoff.

Ao chamar a ferramenta, preencha:
- reason: "complaint" (reclamação), "order_status" (status), "cancel_change" (cancelamento), "payment_invoice" (boleto/NF) ou "other"
- urgency: "urgent" para reclamações/problemas, "normal" para o resto
- summary: resumo curto do que o cliente precisa (uso interno)
- customer_message_for_client: a mensagem amigável que o cliente verá, ex: "Entendido! Vou acionar um dos nossos especialistas agora para te ajudar com isso. ✨ Em instantes alguém estará com você."
</immediate_handoff_triggers>',
        'gs'
      ),
      '<handoff_protocol>.*?</handoff_protocol>',
      '<handoff_protocol>
Assim que todas as informações da <qualification_checklist> forem coletadas:
1. Confirme os dados com o cliente de forma elegante e resumida.
2. Chame a ferramenta request_human_handoff com:
   - reason: "qualified_lead"
   - urgency: "normal"
   - summary: resumo dos dados coletados (nome, ocasião, nº pessoas, data, CEP/bairro)
   - customer_message_for_client: "Perfeito, {{ cliente_nome }}! Já tenho tudo que preciso para garantir uma experiência à altura do seu momento. Em instantes, um dos nossos especialistas vai te atender com a curadoria ideal. ✨"

REGRA ABSOLUTA: NUNCA escreva no chat mensagens internas como "🔔 LEAD QUALIFICADO", "PASSAR PARA ATENDIMENTO HUMANO" ou listas de campos internos — isso iria direto para o WhatsApp do cliente. SEMPRE use a ferramenta request_human_handoff.
</handoff_protocol>',
      'gs'
    )
WHERE system_prompt_override IS NOT NULL
  AND (system_prompt_override LIKE '%🔔%' OR system_prompt_override LIKE '%ATENDIMENTO NECESS%' OR system_prompt_override LIKE '%PASSAR PARA ATENDIMENTO HUMANO%');