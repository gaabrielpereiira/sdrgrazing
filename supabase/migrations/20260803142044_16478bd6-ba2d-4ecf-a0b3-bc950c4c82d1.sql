ALTER TABLE public.support_cases
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_note text;

CREATE INDEX IF NOT EXISTS support_cases_contact_created_idx
  ON public.support_cases (contact_id, created_at DESC);