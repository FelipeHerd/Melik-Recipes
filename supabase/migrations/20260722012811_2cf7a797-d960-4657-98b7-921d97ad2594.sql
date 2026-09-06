ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'inactive'
    CHECK (subscription_status IN ('inactive','active','canceled','past_due'));

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('role', true) <> 'service_role'
     AND (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
    IF NEW.is_premium IS DISTINCT FROM OLD.is_premium THEN NEW.is_premium := OLD.is_premium; END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN NEW.role := OLD.role; END IF;
    IF NEW.kiko_blocked_until IS DISTINCT FROM OLD.kiko_blocked_until THEN NEW.kiko_blocked_until := OLD.kiko_blocked_until; END IF;
    IF NEW.premium_until IS DISTINCT FROM OLD.premium_until THEN NEW.premium_until := OLD.premium_until; END IF;
    IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN NEW.subscription_status := OLD.subscription_status; END IF;
  END IF;
  RETURN NEW;
END;
$$;