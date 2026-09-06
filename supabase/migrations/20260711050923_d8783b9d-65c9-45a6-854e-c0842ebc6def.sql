
-- 1) Private schema not exposed via PostgREST
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- 2) Move SECURITY DEFINER internals into `private`
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION private.is_username_available(_username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _username ~ '^[a-z0-9_.]{3,20}$'
    AND _username !~ '(^\.|\.$|\.\.)'
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE username = _username
    );
$$;

CREATE OR REPLACE FUNCTION private.set_my_username(_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  updated_username text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF _username IS NULL
     OR _username !~ '^[a-z0-9_.]{3,20}$'
     OR _username ~ '(^\.|\.$|\.\.)' THEN
    RAISE EXCEPTION 'invalid_format';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = _username) THEN
    RAISE EXCEPTION 'username_taken';
  END IF;

  UPDATE public.profiles
    SET username = _username
    WHERE id = uid AND username IS NULL
    RETURNING username INTO updated_username;

  IF updated_username IS NULL THEN
    RAISE EXCEPTION 'username_already_set';
  END IF;

  RETURN updated_username;
END;
$$;

REVOKE EXECUTE ON FUNCTION
  private.has_role(uuid, public.app_role),
  private.is_username_available(text),
  private.set_my_username(text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  private.has_role(uuid, public.app_role),
  private.is_username_available(text),
  private.set_my_username(text)
TO authenticated, service_role;

-- 3) Replace the public DEFINER functions with SECURITY INVOKER wrappers
--    that simply delegate. Drop the old DEFINER copies first so the linter
--    stops flagging authenticated executability.
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.is_username_available(text);
DROP FUNCTION IF EXISTS public.set_my_username(text);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT private.has_role(_user_id, _role);
$$;

CREATE OR REPLACE FUNCTION public.is_username_available(_username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT private.is_username_available(_username);
$$;

CREATE OR REPLACE FUNCTION public.set_my_username(_username text)
RETURNS text
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT private.set_my_username(_username);
$$;

REVOKE EXECUTE ON FUNCTION
  public.has_role(uuid, public.app_role),
  public.is_username_available(text),
  public.set_my_username(text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.is_username_available(text),
  public.set_my_username(text)
TO authenticated;

GRANT EXECUTE ON FUNCTION
  public.has_role(uuid, public.app_role),
  public.is_username_available(text),
  public.set_my_username(text)
TO service_role;
