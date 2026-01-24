-- Create reference-images bucket for I2V (Image to Video) feature
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reference-images',
  'reference-images',
  true,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to reference-images bucket
CREATE POLICY "Allow authenticated users to upload reference images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'reference-images');

-- Allow public read access to reference images
CREATE POLICY "Allow public read access to reference images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'reference-images');

-- Allow users to delete their own reference images
CREATE POLICY "Allow users to delete their own reference images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'reference-images' AND (storage.foldername(name))[1] = auth.uid()::text);
