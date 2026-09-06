
-- Move sensitive SECURITY DEFINER body to private schema, expose SECURITY INVOKER wrapper.
CREATE SCHEMA IF NOT EXISTS private;

DROP FUNCTION IF EXISTS public.admin_top_kiko_users(timestamptz, int);

CREATE OR REPLACE FUNCTION private.admin_top_kiko_users(_since timestamptz, _limit int DEFAULT 5)
RETURNS TABLE (
  user_id uuid,
  username text,
  first_name text,
  avatar_url text,
  request_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT u.user_id, p.username, p.first_name, p.avatar_url, u.request_count
  FROM (
    SELECT au.user_id, COUNT(*)::bigint AS request_count
    FROM public.ai_usage au
    WHERE au.created_at >= _since
    GROUP BY au.user_id
    ORDER BY COUNT(*) DESC
    LIMIT _limit
  ) u
  LEFT JOIN public.profiles p ON p.id = u.user_id;
END;
$$;

REVOKE ALL ON FUNCTION private.admin_top_kiko_users(timestamptz, int) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.admin_top_kiko_users(_since timestamptz, _limit int DEFAULT 5)
RETURNS TABLE (
  user_id uuid,
  username text,
  first_name text,
  avatar_url text,
  request_count bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT * FROM private.admin_top_kiko_users(_since, _limit);
$$;

REVOKE ALL ON FUNCTION public.admin_top_kiko_users(timestamptz, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_top_kiko_users(timestamptz, int) TO authenticated;
