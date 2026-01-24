-- Create storage bucket for video reference images
INSERT INTO storage.buckets (id, name, public)
VALUES ('video-references', 'video-references', true)
ON CONFLICT (id) DO NOTHING;

-- Policy for authenticated users to upload
CREATE POLICY "Authenticated users can upload video references"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'video-references' 
    AND auth.role() = 'authenticated'
);

-- Policy for public read access
CREATE POLICY "Public can view video references"
ON storage.objects FOR SELECT
USING (bucket_id = 'video-references');

-- Policy for service role to manage all
CREATE POLICY "Service role can manage video references"
ON storage.objects FOR ALL
USING (bucket_id = 'video-references' AND auth.role() = 'service_role');
