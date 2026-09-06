ALTER TABLE public.recipes ADD COLUMN share_token uuid UNIQUE;
CREATE INDEX IF NOT EXISTS recipes_share_token_idx ON public.recipes(share_token) WHERE share_token IS NOT NULL;