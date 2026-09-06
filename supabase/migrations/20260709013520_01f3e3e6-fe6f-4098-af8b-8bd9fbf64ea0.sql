ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS is_baker_mode boolean NOT NULL DEFAULT false;

UPDATE public.recipes
   SET is_baker_mode = true
 WHERE category ~* '(pan|masa|sourdough|focaccia|baguette|pizza|brioche|croissant)';