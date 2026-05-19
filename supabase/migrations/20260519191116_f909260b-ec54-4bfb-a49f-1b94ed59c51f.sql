-- conversations: shared single-tenant
DROP POLICY IF EXISTS "Users can view conversations in allowed queues"   ON public.conversations;
DROP POLICY IF EXISTS "Users can insert conversations in allowed queues" ON public.conversations;
DROP POLICY IF EXISTS "Users can update conversations in allowed queues" ON public.conversations;
DROP POLICY IF EXISTS "Admins can delete conversations"                  ON public.conversations;

CREATE POLICY "Authenticated users can access all conversations"
  ON public.conversations FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- messages: shared single-tenant
DROP POLICY IF EXISTS "Users can view messages in allowed conversations"   ON public.messages;
DROP POLICY IF EXISTS "Users can insert messages in allowed conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can update messages in allowed conversations" ON public.messages;

CREATE POLICY "Authenticated users can access all messages"
  ON public.messages FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- conversation_states: shared single-tenant
DROP POLICY IF EXISTS "Users can access states of their conversations" ON public.conversation_states;

CREATE POLICY "Authenticated users can access all conversation_states"
  ON public.conversation_states FOR ALL TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
