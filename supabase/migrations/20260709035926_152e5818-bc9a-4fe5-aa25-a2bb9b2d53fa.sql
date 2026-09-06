-- Re-assert column-level revokes (idempotent).
REVOKE UPDATE (is_premium) ON public.profiles FROM authenticated, anon, PUBLIC;
REVOKE UPDATE (is_official_melik) ON public.recipes FROM authenticated, anon, PUBLIC;
REVOKE UPDATE (share_token) ON public.recipes FROM authenticated, anon, PUBLIC;

-- Trigger-only SECURITY DEFINER helpers should not be callable via the API.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;