-- Allow authenticated users to upload, update, and delete images in the
-- app-images bucket. The /upload admin page uses this to manage splash and
-- menu card imagery.
CREATE POLICY "authd upload app-images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'app-images');

CREATE POLICY "authd update app-images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'app-images')
  WITH CHECK (bucket_id = 'app-images');

CREATE POLICY "authd delete app-images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'app-images');
