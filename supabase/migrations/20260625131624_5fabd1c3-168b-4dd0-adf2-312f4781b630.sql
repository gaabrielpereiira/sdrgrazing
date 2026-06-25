
-- 1) team_business_hours
CREATE TABLE public.team_business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_open boolean NOT NULL DEFAULT true,
  start_time time NOT NULL DEFAULT '08:00',
  end_time time NOT NULL DEFAULT '18:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, day_of_week)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_business_hours TO authenticated;
GRANT ALL ON public.team_business_hours TO service_role;
ALTER TABLE public.team_business_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage business hours"
  ON public.team_business_hours FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER team_business_hours_updated_at
  BEFORE UPDATE ON public.team_business_hours
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) team_holidays
CREATE TABLE public.team_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  date date NOT NULL,
  name text NOT NULL,
  is_open boolean NOT NULL DEFAULT false,
  start_time time,
  end_time time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX team_holidays_team_date_unique
  ON public.team_holidays (COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid), date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_holidays TO authenticated;
GRANT ALL ON public.team_holidays TO service_role;
ALTER TABLE public.team_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage holidays"
  ON public.team_holidays FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER team_holidays_updated_at
  BEFORE UPDATE ON public.team_holidays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) nina_settings — auto-reply fora do horário
ALTER TABLE public.nina_settings
  ADD COLUMN IF NOT EXISTS out_of_hours_auto_reply text
    DEFAULT 'Olá! Recebemos sua mensagem fora do nosso horário de atendimento. Retornaremos {{horario}}.',
  ADD COLUMN IF NOT EXISTS out_of_hours_cooldown_minutes integer NOT NULL DEFAULT 360;

-- 4) Seed inicial para as equipes existentes (Produção e Comercial)
DO $$
DECLARE
  v_prod uuid;
  v_com uuid;
  d smallint;
BEGIN
  SELECT id INTO v_prod FROM public.teams WHERE lower(name) = 'produção' LIMIT 1;
  SELECT id INTO v_com  FROM public.teams WHERE lower(name) = 'comercial' LIMIT 1;

  IF v_prod IS NOT NULL THEN
    -- Seg-Sáb 08-20
    FOR d IN 1..6 LOOP
      INSERT INTO public.team_business_hours (team_id, day_of_week, is_open, start_time, end_time)
      VALUES (v_prod, d, true, '08:00', '20:00')
      ON CONFLICT (team_id, day_of_week) DO NOTHING;
    END LOOP;
    -- Domingo 08-17
    INSERT INTO public.team_business_hours (team_id, day_of_week, is_open, start_time, end_time)
    VALUES (v_prod, 0, true, '08:00', '17:00')
    ON CONFLICT (team_id, day_of_week) DO NOTHING;
  END IF;

  IF v_com IS NOT NULL THEN
    -- Seg-Sex 08-18
    FOR d IN 1..5 LOOP
      INSERT INTO public.team_business_hours (team_id, day_of_week, is_open, start_time, end_time)
      VALUES (v_com, d, true, '08:00', '18:00')
      ON CONFLICT (team_id, day_of_week) DO NOTHING;
    END LOOP;
    -- Sáb e Dom fechados
    INSERT INTO public.team_business_hours (team_id, day_of_week, is_open, start_time, end_time)
    VALUES (v_com, 0, false, '08:00', '18:00'), (v_com, 6, false, '08:00', '18:00')
    ON CONFLICT (team_id, day_of_week) DO NOTHING;
  END IF;
END $$;
