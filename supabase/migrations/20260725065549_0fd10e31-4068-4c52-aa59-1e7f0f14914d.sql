-- admin_audit_log: allow admins/devs to read
CREATE POLICY "Admins and devs can view audit log"
ON public.admin_audit_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'dev'::public.app_role));

-- ai_usage: owner can view/insert their own usage
CREATE POLICY "Users can view own AI usage"
ON public.ai_usage
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own AI usage"
ON public.ai_usage
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);