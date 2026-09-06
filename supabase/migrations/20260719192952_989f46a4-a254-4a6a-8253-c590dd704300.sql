
-- Auto-stamp original_author with the creator's current username the first
-- time a recipe is public and has no author set. The existing
-- protect_original_author trigger then freezes it forever.
CREATE OR REPLACE FUNCTION public.stamp_original_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uname TEXT;
BEGIN
  IF NEW.is_public IS TRUE AND (NEW.original_author IS NULL OR NEW.original_author = '') THEN
    SELECT username INTO uname FROM public.profiles WHERE id = NEW.user_id;
    IF uname IS NOT NULL AND uname <> '' THEN
      NEW.original_author := uname;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recipes_stamp_original_author ON public.recipes;
-- Run BEFORE protect_original_author (alphabetical order: "recipes_protect..." < "recipes_stamp..."),
-- so stamp fills NULL, then protect freezes it.
CREATE TRIGGER recipes_stamp_original_author
BEFORE INSERT OR UPDATE ON public.recipes
FOR EACH ROW EXECUTE FUNCTION public.stamp_original_author();

-- Backfill existing public recipes without attribution.
UPDATE public.recipes r
SET original_author = p.username
FROM public.profiles p
WHERE r.user_id = p.id
  AND r.is_public IS TRUE
  AND (r.original_author IS NULL OR r.original_author = '')
  AND p.username IS NOT NULL
  AND p.username <> '';
