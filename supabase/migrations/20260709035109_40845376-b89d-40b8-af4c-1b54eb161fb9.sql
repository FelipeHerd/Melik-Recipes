REVOKE UPDATE (is_premium) ON public.profiles FROM authenticated, anon;
REVOKE UPDATE (is_official_melik) ON public.recipes FROM authenticated, anon;
REVOKE UPDATE (share_token) ON public.recipes FROM authenticated, anon;