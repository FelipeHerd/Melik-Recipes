-- Hardening RLS notifications: UPDATE column-level
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT SELECT, DELETE ON public.notifications TO authenticated;
GRANT UPDATE (is_read) ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- Notificación de prueba para felipe.herd (lookup dinámico, portátil)
INSERT INTO public.notifications (id, user_id, title, message, type, is_read)
SELECT
  gen_random_uuid(),
  u.id,
  'Bienvenido al centro de notificaciones',
  'Esta es una notificación de prueba. Márcala como leída o elimínala para verificar el flujo.',
  'system',
  false
FROM auth.users u
WHERE u.id = (SELECT id FROM public.profiles WHERE username = 'felipe.herd');
