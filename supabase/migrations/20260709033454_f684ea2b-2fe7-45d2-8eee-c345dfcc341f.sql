DROP POLICY IF EXISTS "Auth users can view avatars" ON storage.objects;
CREATE POLICY "Users can view own avatar"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'avatars' AND name = 'avatar_' || auth.uid()::text || '.jpg');