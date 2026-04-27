-- ==========================================
-- 1. SUPABASE REALTIME PUBLICATION
-- Add all application tables to realtime publication
-- ==========================================

-- First, ensure the publication exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- Add tables to publication (safe to re-run)
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.deals;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.pipeline_stages;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.teams;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.team_functions;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.team_members;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.appointments;

-- ==========================================
-- 2. DATABASE TRIGGERS
-- ==========================================

-- 2a. Trigger: auto_create_deal_on_contact
-- Automatically creates a deal when a new contact is inserted
CREATE OR REPLACE FUNCTION public.auto_create_deal_on_contact()
RETURNS TRIGGER AS $$
DECLARE
  v_first_stage_id UUID;
BEGIN
  -- Get the first pipeline stage (ordered by position)
  SELECT id INTO v_first_stage_id
  FROM public.pipeline_stages
  ORDER BY position ASC
  LIMIT 1;

  -- Create a deal for the new contact
  INSERT INTO public.deals (
    contact_id,
    stage_id,
    title,
    value,
    status
  ) VALUES (
    NEW.id,
    v_first_stage_id,
    COALESCE(NEW.name, 'Novo contato'),
    0,
    'open'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists (idempotent)
DROP TRIGGER IF EXISTS auto_create_deal_on_contact_trigger ON public.contacts;

-- Create trigger
CREATE TRIGGER auto_create_deal_on_contact_trigger
AFTER INSERT ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_deal_on_contact();

-- 2b. Trigger: update conversation timestamps
CREATE OR REPLACE FUNCTION public.update_conversation_last_message_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Update conversation's updated_at and last_message_at
  UPDATE public.conversations
  SET 
    updated_at = NOW(),
    last_message_at = NEW.sent_at
  WHERE id = NEW.conversation_id;

  -- Also update contact's updated_at
  UPDATE public.contacts
  SET updated_at = NOW()
  WHERE id = (
    SELECT contact_id FROM public.conversations WHERE id = NEW.conversation_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS update_conversation_last_message_trigger ON public.messages;

CREATE TRIGGER update_conversation_last_message_trigger
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.update_conversation_last_message_trigger();

-- 2c. Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create updated_at triggers for relevant tables
DROP TRIGGER IF EXISTS update_contacts_updated_at ON public.contacts;
CREATE TRIGGER update_contacts_updated_at
BEFORE UPDATE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_conversations_updated_at ON public.conversations;
CREATE TRIGGER update_conversations_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_conversation_states_updated_at ON public.conversation_states;
CREATE TRIGGER update_conversation_states_updated_at
BEFORE UPDATE ON public.conversation_states
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_nina_processing_queue_updated_at ON public.nina_processing_queue;
CREATE TRIGGER update_nina_processing_queue_updated_at
BEFORE UPDATE ON public.nina_processing_queue
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_message_processing_queue_updated_at ON public.message_processing_queue;
CREATE TRIGGER update_message_processing_queue_updated_at
BEFORE UPDATE ON public.message_processing_queue
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_send_queue_updated_at ON public.send_queue;
CREATE TRIGGER update_send_queue_updated_at
BEFORE UPDATE ON public.send_queue
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_nina_settings_updated_at ON public.nina_settings;
CREATE TRIGGER update_nina_settings_updated_at
BEFORE UPDATE ON public.nina_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_tag_definitions_updated_at ON public.tag_definitions;
CREATE TRIGGER update_tag_definitions_updated_at
BEFORE UPDATE ON public.tag_definitions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==========================================
-- 3. RLS POLICIES (Single-Tenant Shared Access)
-- ==========================================

-- 3a. Deals: replace owner-scoped policy with shared authenticated access
DROP POLICY IF EXISTS "Users can manage own deals" ON public.deals;
DROP POLICY IF EXISTS "Authenticated users can access all deals" ON public.deals;

CREATE POLICY "Authenticated users can access all deals"
ON public.deals
FOR ALL
TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- 3b. Appointments: replace owner-scoped policy with shared authenticated access
DROP POLICY IF EXISTS "Users can manage own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Authenticated users can access all appointments" ON public.appointments;

CREATE POLICY "Authenticated users can access all appointments"
ON public.appointments
FOR ALL
TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');