-- Adjust storage RLS to allow current client upload pattern (root-level objects)
DROP POLICY IF EXISTS "Allow anon users to upload to resumes bucket" ON storage.objects;

CREATE POLICY "Anon can upload to resumes bucket (root-level)"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'resumes'
);
