-- Create storage bucket for reference images
INSERT INTO storage.buckets (id, name, public)
VALUES ('reference-images', 'reference-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to reference-images bucket
CREATE POLICY "Authenticated users can upload reference images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'reference-images');

-- Allow public read access to reference images
CREATE POLICY "Public read access for reference images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'reference-images');

-- Allow users to delete their own reference images
CREATE POLICY "Users can delete their own reference images"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'reference-images' AND auth.uid()::text = (storage.foldername(name))[1]);