-- 1. Columnas
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS original_author text NULL;

-- 2. Backfill: los borradores nunca son públicos
UPDATE public.recipes SET is_public = false WHERE is_draft = true;

-- 3. Índice parcial para el feed de la comunidad
CREATE INDEX IF NOT EXISTS recipes_public_feed_idx
  ON public.recipes (created_at DESC)
  WHERE is_public = true AND is_draft = false AND is_official_melik = false;

-- 4. Política de lectura pública (solo autenticados; no borradores; no oficiales)
DROP POLICY IF EXISTS "Authenticated users can view public recipes" ON public.recipes;
CREATE POLICY "Authenticated users can view public recipes"
  ON public.recipes
  FOR SELECT
  TO authenticated
  USING (is_public = true AND is_draft = false AND is_official_melik = false);

-- 5. Trigger de blindaje de atribución
CREATE OR REPLACE FUNCTION public.protect_original_author()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.original_author IS NOT NULL
     AND NEW.original_author IS DISTINCT FROM OLD.original_author THEN
    NEW.original_author := OLD.original_author;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_original_author_trigger ON public.recipes;
CREATE TRIGGER protect_original_author_trigger
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_original_author();