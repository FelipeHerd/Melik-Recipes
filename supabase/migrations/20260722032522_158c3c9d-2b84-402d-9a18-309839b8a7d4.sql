
-- 1. Contador acumulado de meses pagados
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS paid_months_total INTEGER NOT NULL DEFAULT 0;

-- Backfill: usuarios que ya son premium reciben crédito por 1 mes (=1 desbloqueo)
UPDATE public.profiles
  SET paid_months_total = 1
  WHERE is_premium = true AND paid_months_total = 0;

-- 2. Reforzar trigger anti-escalada para blindar paid_months_total
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('role', true) <> 'service_role'
     AND (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
    IF NEW.is_premium IS DISTINCT FROM OLD.is_premium THEN NEW.is_premium := OLD.is_premium; END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN NEW.role := OLD.role; END IF;
    IF NEW.kiko_blocked_until IS DISTINCT FROM OLD.kiko_blocked_until THEN NEW.kiko_blocked_until := OLD.kiko_blocked_until; END IF;
    IF NEW.premium_until IS DISTINCT FROM OLD.premium_until THEN NEW.premium_until := OLD.premium_until; END IF;
    IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN NEW.subscription_status := OLD.subscription_status; END IF;
    IF NEW.gateway_customer_id IS DISTINCT FROM OLD.gateway_customer_id THEN NEW.gateway_customer_id := OLD.gateway_customer_id; END IF;
    IF NEW.paid_months_total IS DISTINCT FROM OLD.paid_months_total THEN NEW.paid_months_total := OLD.paid_months_total; END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3. Tabla de desbloqueos permanentes de Melik Bakery
CREATE TABLE IF NOT EXISTS public.bakery_unlocks (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipe_id   uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  claimed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, recipe_id)
);

GRANT SELECT, INSERT ON public.bakery_unlocks TO authenticated;
GRANT ALL ON public.bakery_unlocks TO service_role;

ALTER TABLE public.bakery_unlocks ENABLE ROW LEVEL SECURITY;

-- Solo puede ver y crear sus propios desbloqueos. UPDATE/DELETE bloqueados por defecto.
CREATE POLICY "Users read own unlocks"
  ON public.bakery_unlocks
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own unlocks"
  ON public.bakery_unlocks
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 4. Summary autoritativo (SECURITY DEFINER — bypassa RLS pero solo devuelve
--    filas del propio usuario).
CREATE OR REPLACE FUNCTION public.my_bakery_unlocks_summary()
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
  uid uuid := auth.uid();
  months integer := 0;
  claimed integer := 0;
  earned integer := 0;
BEGIN
  IF uid IS NULL THEN
    RETURN QUERY SELECT 0, 0, 0, 0;
    RETURN;
  END IF;

  SELECT COALESCE(p.paid_months_total, 0) INTO months
    FROM public.profiles p WHERE p.id = uid;

  SELECT COUNT(*)::int INTO claimed
    FROM public.bakery_unlocks WHERE user_id = uid;

  IF months >= 1 THEN
    earned := ((months - 1) / 3) + 1;
  ELSE
    earned := 0;
  END IF;

  RETURN QUERY SELECT months, earned, claimed, GREATEST(earned - claimed, 0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.my_bakery_unlocks_summary() TO authenticated;
