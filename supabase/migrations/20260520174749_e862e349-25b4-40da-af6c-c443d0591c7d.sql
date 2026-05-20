
-- 1) Replica identity FULL
ALTER TABLE public.team_members    REPLICA IDENTITY FULL;
ALTER TABLE public.profiles        REPLICA IDENTITY FULL;
ALTER TABLE public.nina_settings   REPLICA IDENTITY FULL;
ALTER TABLE public.tag_definitions REPLICA IDENTITY FULL;
ALTER TABLE public.system_settings REPLICA IDENTITY FULL;
ALTER TABLE public.user_roles      REPLICA IDENTITY FULL;
ALTER TABLE public.teams           REPLICA IDENTITY FULL;
ALTER TABLE public.team_functions  REPLICA IDENTITY FULL;

-- 2) Add to realtime publication (idempotent)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','nina_settings','tag_definitions','system_settings','user_roles']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- 3) Permissive anon SELECT policies so the realtime channel delivers events
--    (writes remain restricted to existing admin/authenticated policies)
DROP POLICY IF EXISTS "Public can read team_members"    ON public.team_members;
DROP POLICY IF EXISTS "Public can read profiles"        ON public.profiles;
DROP POLICY IF EXISTS "Public can read nina_settings"   ON public.nina_settings;
DROP POLICY IF EXISTS "Public can read tag_definitions" ON public.tag_definitions;
DROP POLICY IF EXISTS "Public can read system_settings_anon" ON public.system_settings;
DROP POLICY IF EXISTS "Public can read user_roles"      ON public.user_roles;
DROP POLICY IF EXISTS "Public can read teams"           ON public.teams;
DROP POLICY IF EXISTS "Public can read team_functions"  ON public.team_functions;

CREATE POLICY "Public can read team_members"    ON public.team_members    FOR SELECT TO anon USING (true);
CREATE POLICY "Public can read profiles"        ON public.profiles        FOR SELECT TO anon USING (true);
CREATE POLICY "Public can read nina_settings"   ON public.nina_settings   FOR SELECT TO anon USING (true);
CREATE POLICY "Public can read tag_definitions" ON public.tag_definitions FOR SELECT TO anon USING (true);
CREATE POLICY "Public can read user_roles"      ON public.user_roles      FOR SELECT TO anon USING (true);
CREATE POLICY "Public can read teams"           ON public.teams           FOR SELECT TO anon USING (true);
CREATE POLICY "Public can read team_functions"  ON public.team_functions  FOR SELECT TO anon USING (true);
