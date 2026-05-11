
-- 1. Add queue column to conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS queue text NOT NULL DEFAULT 'sales';

-- Constraint validating allowed queue values
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversations_queue_check'
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_queue_check
      CHECK (queue IN ('sales','support'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_queue_last_msg
  ON public.conversations(queue, last_message_at DESC);

-- 2. Helper: which queues a user can access
CREATE OR REPLACE FUNCTION public.user_queue_access(_user_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_role(_user_id, 'admin'::app_role) THEN ARRAY['sales','support']
    WHEN public.has_role(_user_id, 'support'::app_role) THEN ARRAY['support']
    WHEN public.has_role(_user_id, 'sdr'::app_role) THEN ARRAY['sales']
    ELSE ARRAY['sales']
  END
$$;

-- 3. Replace conversations RLS to filter by queue access
DROP POLICY IF EXISTS "Authenticated users can access all conversations" ON public.conversations;

CREATE POLICY "Users can view conversations in allowed queues"
ON public.conversations
FOR SELECT
TO authenticated
USING (queue = ANY(public.user_queue_access(auth.uid())));

CREATE POLICY "Users can insert conversations in allowed queues"
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (queue = ANY(public.user_queue_access(auth.uid())));

CREATE POLICY "Users can update conversations in allowed queues"
ON public.conversations
FOR UPDATE
TO authenticated
USING (queue = ANY(public.user_queue_access(auth.uid())))
WITH CHECK (queue = ANY(public.user_queue_access(auth.uid())));

CREATE POLICY "Admins can delete conversations"
ON public.conversations
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Replace messages RLS to follow the parent conversation queue
DROP POLICY IF EXISTS "Authenticated users can access all messages" ON public.messages;

CREATE POLICY "Users can view messages in allowed conversations"
ON public.messages
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.conversations c
  WHERE c.id = messages.conversation_id
    AND c.queue = ANY(public.user_queue_access(auth.uid()))
));

CREATE POLICY "Users can insert messages in allowed conversations"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.conversations c
  WHERE c.id = messages.conversation_id
    AND c.queue = ANY(public.user_queue_access(auth.uid()))
));

CREATE POLICY "Users can update messages in allowed conversations"
ON public.messages
FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.conversations c
  WHERE c.id = messages.conversation_id
    AND c.queue = ANY(public.user_queue_access(auth.uid()))
));
