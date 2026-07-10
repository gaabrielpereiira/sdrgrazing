
ALTER TABLE public.nina_settings
  ADD COLUMN IF NOT EXISTS welcome_followup_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS welcome_followup_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS welcome_followup_message text NOT NULL DEFAULT 'Oi! Vi que você começou uma conversa com a gente há pouco e não seguiu. Posso te ajudar com alguma coisa? 💛';
