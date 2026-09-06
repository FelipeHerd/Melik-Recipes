-- Align profiles_username_format_chk with is_username_available / set_my_username,
-- which already allow dots (but not leading, trailing, or consecutive dots).
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_username_format_chk;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format_chk
  CHECK (
    username IS NULL
    OR (
      username ~ '^[a-z0-9_.]{3,20}$'
      AND username !~ '(^\.|\.$|\.\.)'
    )
  );