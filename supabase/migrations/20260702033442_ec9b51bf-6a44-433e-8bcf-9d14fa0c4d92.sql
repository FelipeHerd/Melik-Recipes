
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false;

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS is_official_melik boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS recipes_official_created_idx
  ON public.recipes (created_at DESC)
  WHERE is_official_melik = true;
