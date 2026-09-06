
-- 1) ai_usage: registro fire-and-forget de peticiones a Kiko
CREATE TABLE public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('chef','discover','title')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ai_usage TO service_role;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
-- No policies: bloqueado a authenticated/anon; sólo service_role accede.

CREATE INDEX ai_usage_created_at_idx ON public.ai_usage (created_at DESC);
CREATE INDEX ai_usage_user_created_idx ON public.ai_usage (user_id, created_at DESC);

-- 2) admin_audit_log: trazabilidad de acciones del panel
CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_user_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX admin_audit_log_created_idx ON public.admin_audit_log (created_at DESC);
CREATE INDEX admin_audit_log_target_idx ON public.admin_audit_log (target_user_id);

-- 3) error_reports: índice + policy UPDATE para admin/dev
CREATE INDEX IF NOT EXISTS error_reports_status_created_idx
  ON public.error_reports (status, created_at DESC);

DROP POLICY IF EXISTS "Admins can update error reports" ON public.error_reports;
CREATE POLICY "Admins can update error reports"
  ON public.error_reports
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

DROP POLICY IF EXISTS "Admins can read error reports" ON public.error_reports;
CREATE POLICY "Admins can read error reports"
  ON public.error_reports
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

-- 4) RPC: top consumidores de Kiko
CREATE OR REPLACE FUNCTION public.admin_top_kiko_users(_since timestamptz, _limit int DEFAULT 5)
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

REVOKE ALL ON FUNCTION public.admin_top_kiko_users(timestamptz, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_top_kiko_users(timestamptz, int) TO authenticated;
