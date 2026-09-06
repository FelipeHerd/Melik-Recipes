
-- 1. profiles: nuevas columnas
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'
    CHECK (role IN ('user','admin','dev')),
  ADD COLUMN IF NOT EXISTS kiko_blocked_until timestamptz NULL,
  ADD COLUMN IF NOT EXISTS premium_until timestamptz NULL;

-- Backfill: sync desde user_roles existente
UPDATE public.profiles p
SET role = 'admin'
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = p.id AND ur.role = 'admin'
);

-- Endurecer trigger anti-escalada
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('role', true) <> 'service_role'
     AND (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
    IF NEW.is_premium IS DISTINCT FROM OLD.is_premium THEN
      NEW.is_premium := OLD.is_premium;
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      NEW.role := OLD.role;
    END IF;
    IF NEW.kiko_blocked_until IS DISTINCT FROM OLD.kiko_blocked_until THEN
      NEW.kiko_blocked_until := OLD.kiko_blocked_until;
    END IF;
    IF NEW.premium_until IS DISTINCT FROM OLD.premium_until THEN
      NEW.premium_until := OLD.premium_until;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation_trg ON public.profiles;
CREATE TRIGGER prevent_profile_privilege_escalation_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 2. Trigger de sincronización profiles.role -> user_roles
CREATE OR REPLACE FUNCTION public.sync_role_to_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.user_roles WHERE user_id = NEW.id;
  INSERT INTO public.user_roles(user_id, role)
  VALUES (NEW.id, NEW.role::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_role_to_user_roles_trg ON public.profiles;
CREATE TRIGGER sync_role_to_user_roles_trg
AFTER UPDATE OF role ON public.profiles
FOR EACH ROW
WHEN (NEW.role IS DISTINCT FROM OLD.role)
EXECUTE FUNCTION public.sync_role_to_user_roles();

-- 3. error_reports
CREATE TABLE IF NOT EXISTS public.error_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  error_code text,
  error_message text NOT NULL,
  route text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','triaged','resolved','ignored')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.error_reports TO authenticated;
GRANT ALL ON public.error_reports TO service_role;

ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own error reports"
ON public.error_reports FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins and devs can view all error reports"
ON public.error_reports FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dev'));

CREATE POLICY "Admins and devs can update error reports"
ON public.error_reports FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dev'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dev'));

CREATE INDEX IF NOT EXISTS error_reports_status_created_idx
  ON public.error_reports(status, created_at DESC);

-- 4. notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'system'
    CHECK (type IN ('system','kiko','melik_plus','admin')),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
ON public.notifications FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notifications"
ON public.notifications FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins and devs can view all notifications"
ON public.notifications FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dev'));

CREATE INDEX IF NOT EXISTS notifications_user_read_created_idx
  ON public.notifications(user_id, is_read, created_at DESC);

-- Anti-tamper trigger: usuarios solo pueden modificar is_read
CREATE OR REPLACE FUNCTION public.prevent_notification_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('role', true) <> 'service_role'
     AND (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
    NEW.user_id    := OLD.user_id;
    NEW.title      := OLD.title;
    NEW.message    := OLD.message;
    NEW.type       := OLD.type;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS prevent_notification_tampering_trg ON public.notifications;
CREATE TRIGGER prevent_notification_tampering_trg
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.prevent_notification_tampering();
