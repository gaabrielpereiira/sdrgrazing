
-- 1) Vincular team_members existentes a auth users por email (case-insensitive)
UPDATE public.team_members tm
SET user_id = u.id,
    status  = 'active'::member_status,
    updated_at = now()
FROM auth.users u
WHERE tm.user_id IS NULL
  AND lower(tm.email) = lower(u.email);

-- 2) Criar team_member para cada auth user que ainda não existe na tabela
INSERT INTO public.team_members (name, email, role, status, user_id, weight)
SELECT
  COALESCE(NULLIF(trim(p.full_name), ''), split_part(u.email, '@', 1)),
  u.email,
  CASE WHEN ur.role = 'admin' THEN 'admin'::member_role ELSE 'agent'::member_role END,
  'active'::member_status,
  u.id,
  1
FROM auth.users u
LEFT JOIN public.profiles p   ON p.user_id = u.id
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
WHERE NOT EXISTS (
  SELECT 1 FROM public.team_members tm WHERE lower(tm.email) = lower(u.email)
);

-- 3) Atualizar handle_new_user para também sincronizar team_members
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_first_user boolean;
  assigned_role app_role;
  resolved_name text;
BEGIN
  -- Profile
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name')
  ON CONFLICT (user_id) DO NOTHING;

  -- Role: first user = admin, else user
  is_first_user := (SELECT COUNT(*) FROM public.user_roles) = 0;
  assigned_role := CASE WHEN is_first_user THEN 'admin'::app_role ELSE 'user'::app_role END;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, assigned_role)
  ON CONFLICT DO NOTHING;

  -- Team member sync: se já existe convite com mesmo email, atualiza; senão cria novo
  resolved_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    split_part(NEW.email, '@', 1)
  );

  IF EXISTS (SELECT 1 FROM public.team_members WHERE lower(email) = lower(NEW.email)) THEN
    UPDATE public.team_members
    SET user_id = NEW.id,
        status  = 'active'::member_status,
        name    = COALESCE(NULLIF(trim(name), ''), resolved_name),
        role    = CASE WHEN is_first_user THEN 'admin'::member_role ELSE role END,
        updated_at = now()
    WHERE lower(email) = lower(NEW.email);
  ELSE
    INSERT INTO public.team_members (name, email, role, status, user_id, weight)
    VALUES (
      resolved_name,
      NEW.email,
      CASE WHEN is_first_user THEN 'admin'::member_role ELSE 'agent'::member_role END,
      'active'::member_status,
      NEW.id,
      1
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- Garantir trigger no auth.users (idempotente)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4) Função RPC para resync manual
CREATE OR REPLACE FUNCTION public.sync_team_members_with_auth()
RETURNS TABLE(linked int, created int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_linked int := 0;
  v_created int := 0;
BEGIN
  WITH upd AS (
    UPDATE public.team_members tm
    SET user_id = u.id,
        status = 'active'::member_status,
        updated_at = now()
    FROM auth.users u
    WHERE tm.user_id IS NULL
      AND lower(tm.email) = lower(u.email)
    RETURNING tm.id
  )
  SELECT count(*) INTO v_linked FROM upd;

  WITH ins AS (
    INSERT INTO public.team_members (name, email, role, status, user_id, weight)
    SELECT
      COALESCE(NULLIF(trim(p.full_name), ''), split_part(u.email, '@', 1)),
      u.email,
      CASE WHEN ur.role = 'admin' THEN 'admin'::member_role ELSE 'agent'::member_role END,
      'active'::member_status,
      u.id,
      1
    FROM auth.users u
    LEFT JOIN public.profiles p   ON p.user_id = u.id
    LEFT JOIN public.user_roles ur ON ur.user_id = u.id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.team_members tm WHERE lower(tm.email) = lower(u.email)
    )
    RETURNING id
  )
  SELECT count(*) INTO v_created FROM ins;

  RETURN QUERY SELECT v_linked, v_created;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_team_members_with_auth() TO authenticated;
