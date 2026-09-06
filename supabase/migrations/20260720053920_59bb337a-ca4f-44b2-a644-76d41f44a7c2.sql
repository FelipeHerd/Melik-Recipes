
-- 1. Add column
ALTER TABLE public.recipes
  ADD COLUMN is_premium_only boolean NOT NULL DEFAULT false;

-- 2. Partial index to speed up official-catalog queries
CREATE INDEX IF NOT EXISTS recipes_official_created_idx
  ON public.recipes (created_at DESC)
  WHERE is_official_melik = true;

-- 3. Rewrite the public SELECT policy so premium-only rows are unreachable
--    to non-owners via PostgREST. Server functions with the service role
--    bypass RLS to decide censorship.
DROP POLICY IF EXISTS "Authenticated users can view public recipes" ON public.recipes;
DROP POLICY IF EXISTS "Anyone can view official Melik recipes" ON public.recipes;

CREATE POLICY "Public and official recipes visible to authenticated"
  ON public.recipes
  FOR SELECT
  TO authenticated
  USING (
    is_premium_only = false
    AND is_draft = false
    AND (
      (is_public = true AND is_official_melik = false)
      OR is_official_melik = true
    )
  );

-- Owner reads keep the existing "Users can view their own recipes" policy.
-- Admin/dev reads happen through server functions using the service role;
-- no separate RLS policy is needed for them.

-- 4. Harden the privilege-escalation trigger: only admins/devs (or the
--    service role) can flip is_premium_only. Regular users trying to inject
--    the flag get it silently forced back to the previous value (UPDATE) or
--    false (INSERT).
CREATE OR REPLACE FUNCTION public.prevent_recipe_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_privileged boolean := false;
BEGIN
  IF current_setting('role', true) = 'service_role'
     OR (auth.jwt() ->> 'role') = 'service_role' THEN
    is_privileged := true;
  ELSIF auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
  ) THEN
    is_privileged := true;
  END IF;

  IF NOT is_privileged THEN
    IF TG_OP = 'UPDATE' THEN
      IF NEW.is_official_melik IS DISTINCT FROM OLD.is_official_melik THEN
        NEW.is_official_melik := OLD.is_official_melik;
      END IF;
      IF NEW.is_premium_only IS DISTINCT FROM OLD.is_premium_only THEN
        NEW.is_premium_only := OLD.is_premium_only;
      END IF;
    ELSIF TG_OP = 'INSERT' THEN
      IF NEW.is_official_melik IS TRUE THEN
        NEW.is_official_melik := false;
      END IF;
      IF NEW.is_premium_only IS TRUE THEN
        NEW.is_premium_only := false;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure the trigger fires on INSERT too (previous version was UPDATE-only).
DROP TRIGGER IF EXISTS recipes_prevent_priv_escalation ON public.recipes;
CREATE TRIGGER recipes_prevent_priv_escalation
BEFORE INSERT OR UPDATE ON public.recipes
FOR EACH ROW EXECUTE FUNCTION public.prevent_recipe_privilege_escalation();
