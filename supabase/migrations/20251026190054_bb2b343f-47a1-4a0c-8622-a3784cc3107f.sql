-- Fix Storage Security: Remove redundant policies and add proper access controls
-- Drop the three existing redundant upload policies
DROP POLICY IF EXISTS "Allow uploads to resumes bucket" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload resumes" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload resumes" ON storage.objects;

-- Create a single, secure upload policy with authentication
-- Note: Since your app is public without authentication, we'll use service role for uploads
-- and validate through the edge function instead
CREATE POLICY "Service role can manage resume files"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'resumes');

-- Add SELECT policy to allow downloading of files only through edge functions
CREATE POLICY "Service role can read resume files"
ON storage.objects
FOR SELECT
TO service_role
USING (bucket_id = 'resumes');

-- Add DELETE policy for cleanup
CREATE POLICY "Service role can delete resume files"
ON storage.objects
FOR DELETE
TO service_role
USING (bucket_id = 'resumes');