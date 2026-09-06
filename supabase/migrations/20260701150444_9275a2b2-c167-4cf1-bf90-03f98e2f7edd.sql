ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS ingredients_json JSONB,
  ADD COLUMN IF NOT EXISTS instructions_json JSONB;