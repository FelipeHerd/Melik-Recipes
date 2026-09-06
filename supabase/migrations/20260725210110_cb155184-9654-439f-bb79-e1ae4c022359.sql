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
  ELSIF auth.uid() IS NOT NULL
        AND public.has_role(auth.uid(), 'admin'::public.app_role) THEN
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