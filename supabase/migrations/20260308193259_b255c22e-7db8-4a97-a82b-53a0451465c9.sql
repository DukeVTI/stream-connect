
-- RLS policies for avatars bucket
CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Users can update their own avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- RLS policies for banners bucket
CREATE POLICY "Anyone can view banners"
ON storage.objects FOR SELECT
USING (bucket_id = 'banners');

CREATE POLICY "Authenticated users can upload banners"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'banners');

CREATE POLICY "Users can update their own banners"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own banners"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);
