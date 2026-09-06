
-- Elimina la SECURITY DEFINER expuesta directamente en public
DROP FUNCTION IF EXISTS public.my_bakery_unlocks_summary();

-- Recreación en `private` (no expuesta por la API)
CREATE OR REPLACE FUNCTION private.my_bakery_unlocks_summary(_user_id uuid)
 RETURNS TABLE (
   paid_months_total integer,
   unlocks_earned integer,
   unlocks_claimed integer,
   unlocks_available integer
 )
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  months integer := 0;
  claimed integer := 0;
  earned integer := 0;
BEGIN
  IF _user_id IS NULL THEN
    RETURN QUERY SELECT 0, 0, 0, 0;
    RETURN;
  END IF;

  SELECT COALESCE(p.paid_months_total, 0) INTO months
    FROM public.profiles p WHERE p.id = _user_id;

  SELECT COUNT(*)::int INTO claimed
    FROM public.bakery_unlocks WHERE user_id = _user_id;

  IF months >= 1 THEN
    earned := ((months - 1) / 3) + 1;
  ELSE
    earned := 0;
  END IF;

  RETURN QUERY SELECT months, earned, claimed, GREATEST(earned - claimed, 0);
END;
$function$;

-- Wrapper público SECURITY INVOKER, sólo mira al usuario que llama
CREATE OR REPLACE FUNCTION public.my_bakery_unlocks_summary()
 RETURNS TABLE (
   paid_months_total integer,
   unlocks_earned integer,
   unlocks_claimed integer,
   unlocks_available integer
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT * FROM private.my_bakery_unlocks_summary(auth.uid());
$function$;

GRANT EXECUTE ON FUNCTION public.my_bakery_unlocks_summary() TO authenticated;
