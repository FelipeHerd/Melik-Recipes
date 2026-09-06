ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;
UPDATE public.recipes SET is_draft = false WHERE is_draft IS NULL;
CREATE INDEX IF NOT EXISTS recipes_user_draft_idx ON public.recipes (user_id, is_draft, created_at DESC);