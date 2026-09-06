INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'dev'::public.app_role FROM auth.users u
WHERE u.email = 'pipex.hernandezd@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;