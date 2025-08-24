-- Drop public INSERT policy for resumes bucket
DROP POLICY IF EXISTS "Allow public uploads to resumes bucket" ON storage.objects;

-- Create a more restrictive policy that requires authentication
CREATE POLICY "Authenticated users can upload resumes" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'resumes' 
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);