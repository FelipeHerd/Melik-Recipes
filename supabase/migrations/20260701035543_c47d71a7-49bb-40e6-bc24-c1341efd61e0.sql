-- Restrict SELECT on recipe-images bucket to owner (folder = auth.uid())
DROP POLICY IF EXISTS "Recipe images are viewable by everyone" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Public read recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Recipe images public read" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Recipe images select" ON storage.objects;

CREATE POLICY "Users can view their own recipe images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'recipe-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);