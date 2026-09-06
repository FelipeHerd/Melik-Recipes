CREATE POLICY "Auth users can view avatars"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND name = 'avatar_' || auth.uid()::text || '.jpg');

CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars' AND name = 'avatar_' || auth.uid()::text || '.jpg')
WITH CHECK (bucket_id = 'avatars' AND name = 'avatar_' || auth.uid()::text || '.jpg');

CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars' AND name = 'avatar_' || auth.uid()::text || '.jpg');