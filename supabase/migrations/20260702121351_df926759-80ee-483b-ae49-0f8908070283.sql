-- Fase 3 hardening: allow anonymous public read of official Melik recipes only.
-- Defense-in-depth: listOfficialRecipes uses supabaseAdmin (bypasses RLS) but if
-- someone hits the Data API directly with the anon key, they still cannot read
-- non-official rows.
GRANT SELECT ON public.recipes TO anon;

DROP POLICY IF EXISTS "Anyone can view official Melik recipes" ON public.recipes;
CREATE POLICY "Anyone can view official Melik recipes"
ON public.recipes
FOR SELECT
TO anon, authenticated
USING (is_official_melik = true);