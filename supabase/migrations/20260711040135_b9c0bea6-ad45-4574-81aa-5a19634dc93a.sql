
-- Allow dots in usernames (no leading/trailing dot, no consecutive dots)
CREATE OR REPLACE FUNCTION public.is_username_available(_username text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    _username ~ '^[a-z0-9_.]{3,20}$'
    AND _username !~ '(^\.|\.$|\.\.)'
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE username = _username
    );
$function$;

CREATE OR REPLACE FUNCTION public.set_my_username(_username text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  fn TEXT;
  ln TEXT;
  full_name TEXT;
  uname TEXT;
BEGIN
  fn := meta->>'first_name';
  ln := meta->>'last_name';
  full_name := COALESCE(meta->>'full_name', meta->>'name');
  IF (fn IS NULL OR fn = '') AND full_name IS NOT NULL THEN
    fn := split_part(full_name, ' ', 1);
    IF ln IS NULL OR ln = '' THEN
      ln := NULLIF(trim(substring(full_name FROM position(' ' IN full_name) + 1)), '');
    END IF;
  END IF;

  uname := lower(COALESCE(meta->>'username', ''));
  IF uname !~ '^[a-z0-9_.]{3,20}$' OR uname ~ '(^\.|\.$|\.\.)' THEN
    uname := NULL;
  ELSIF EXISTS (SELECT 1 FROM public.profiles WHERE username = uname) THEN
    uname := NULL;
  END IF;

  INSERT INTO public.profiles (id, first_name, last_name, avatar_url, username)
  VALUES (
    NEW.id,
    fn,
    ln,
    meta->>'avatar_url',
    uname
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Reset all usernames so every user re-chooses under the new rules
UPDATE public.profiles SET username = NULL WHERE username IS NOT NULL;
