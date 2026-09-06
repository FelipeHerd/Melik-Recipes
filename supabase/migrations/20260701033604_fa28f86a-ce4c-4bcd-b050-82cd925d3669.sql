
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS image_url text;

-- Storage policies for the recipe-images bucket.
-- Files are stored under {user_id}/{uuid}.{ext}; the first path segment must match auth.uid().

DROP POLICY IF EXISTS "Recipe images public read" ON storage.objects;
CREATE POLICY "Recipe images public read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'recipe-images');

DROP POLICY IF EXISTS "Users can upload their own recipe images" ON storage.objects;
CREATE POLICY "Users can upload their own recipe images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'recipe-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can update their own recipe images" ON storage.objects;
CREATE POLICY "Users can update their own recipe images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'recipe-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can delete their own recipe images" ON storage.objects;
CREATE POLICY "Users can delete their own recipe images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'recipe-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
