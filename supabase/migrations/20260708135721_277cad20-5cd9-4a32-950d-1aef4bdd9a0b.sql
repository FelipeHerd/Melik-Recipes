-- Pilar 2: Indexación estratégica B-Tree para consultas críticas
-- Todos IF NOT EXISTS para idempotencia.

CREATE INDEX IF NOT EXISTS idx_recipes_user_created
  ON public.recipes (user_id, created_at DESC);

-- Índice parcial: solo recetas oficiales, óptimo para /melik-bakery
CREATE INDEX IF NOT EXISTS idx_recipes_official_created
  ON public.recipes (created_at DESC)
  WHERE is_official_melik = true;

CREATE INDEX IF NOT EXISTS idx_user_roles_user_role
  ON public.user_roles (user_id, role);

CREATE INDEX IF NOT EXISTS idx_discover_chats_user_updated
  ON public.discover_chats (user_id, updated_at DESC);