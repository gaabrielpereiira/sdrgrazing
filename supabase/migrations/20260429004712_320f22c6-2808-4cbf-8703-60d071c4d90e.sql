ALTER TABLE public.conversation_activities
  ADD COLUMN IF NOT EXISTS assigned_to uuid;