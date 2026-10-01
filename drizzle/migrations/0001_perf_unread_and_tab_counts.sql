CREATE INDEX IF NOT EXISTS idx_messages_unread_user
  ON public.messages (conversation_id)
  WHERE from_type = 'user' AND read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_support_cases_open_conv
  ON public.support_cases (conversation_id)
  WHERE closed_at IS NULL;

ALTER POLICY "Authenticated users can access all conversations" ON public.conversations
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

ALTER POLICY "Authenticated users can access all messages" ON public.messages
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

CREATE OR REPLACE FUNCTION public.get_queue_unread_counts()
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT json_build_object(
    'sales', count(*) FILTER (WHERE c.queue IS DISTINCT FROM 'support'),
    'support', count(*) FILTER (WHERE c.queue = 'support')
  )
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  WHERE m.from_type = 'user' AND m.read_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_conversation_tab_counts(_member_id text DEFAULT NULL, _team_id text DEFAULT NULL)
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH open_t AS (
    SELECT DISTINCT conversation_id FROM public.support_cases
    WHERE closed_at IS NULL AND conversation_id IS NOT NULL
  ),
  conv AS (
    SELECT c.id,
           (c.is_active IS DISTINCT FROM false) AS active,
           (c.queue = 'support' OR o.conversation_id IS NOT NULL) AS support,
           c.assigned_user_id
    FROM public.conversations c
    LEFT JOIN open_t o ON o.conversation_id = c.id
    WHERE _team_id IS NULL OR c.assigned_team::text = _team_id
  )
  SELECT json_build_object(
    'activeTotal', count(*) FILTER (WHERE active),
    'activeSupport', count(*) FILTER (WHERE active AND support),
    'activeSales', count(*) FILTER (WHERE active AND NOT support),
    'finishedTotal', count(*) FILTER (WHERE NOT active),
    'finishedSupport', count(*) FILTER (WHERE NOT active AND support),
    'finishedSales', count(*) FILTER (WHERE NOT active AND NOT support),
    'mine', count(*) FILTER (WHERE active AND _member_id IS NOT NULL AND assigned_user_id::text = _member_id),
    'openTicketConversationIds', COALESCE((SELECT json_agg(conversation_id) FROM open_t), '[]'::json)
  )
  FROM conv;
$$;

GRANT EXECUTE ON FUNCTION public.get_queue_unread_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_conversation_tab_counts(text, text) TO authenticated;