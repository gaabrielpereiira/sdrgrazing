CREATE TABLE public.conversation_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  activity_type text NOT NULL DEFAULT 'call',
  scheduled_at timestamptz NOT NULL,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  reminder_sent boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conv_activities_scheduled ON public.conversation_activities(scheduled_at) WHERE is_completed = false;
CREATE INDEX idx_conv_activities_conversation ON public.conversation_activities(conversation_id);
CREATE INDEX idx_conv_activities_pending_reminder ON public.conversation_activities(scheduled_at) WHERE reminder_sent = false AND is_completed = false;

ALTER TABLE public.conversation_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can access all conversation_activities"
ON public.conversation_activities
FOR ALL
TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Public can access conversation_activities"
ON public.conversation_activities
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

CREATE TRIGGER update_conversation_activities_updated_at
BEFORE UPDATE ON public.conversation_activities
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.conversation_activities REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversation_activities'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_activities';
  END IF;
END $$;