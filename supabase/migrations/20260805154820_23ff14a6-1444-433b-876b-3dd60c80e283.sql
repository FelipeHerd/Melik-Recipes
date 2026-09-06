ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS voice_seconds_used_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS voice_usage_date date;

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
    IF NEW.voice_seconds_used_today IS DISTINCT FROM OLD.voice_seconds_used_today THEN NEW.voice_seconds_used_today := OLD.voice_seconds_used_today; END IF;
    IF NEW.voice_usage_date IS DISTINCT FROM OLD.voice_usage_date THEN NEW.voice_usage_date := OLD.voice_usage_date; END IF;
  END IF;
  RETURN NEW;
END;
$function$;