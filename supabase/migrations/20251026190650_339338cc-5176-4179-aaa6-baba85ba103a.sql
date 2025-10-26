-- Temporarily allow anon users to upload files to resumes bucket
-- This is needed because the client uploads directly to storage
-- TODO: Migrate to using create-upload-url edge function for better security

CREATE POLICY "Allow anon users to upload to resumes bucket"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'resumes' AND
  (storage.foldername(name))[1] IN ('resume', 'payment')
);