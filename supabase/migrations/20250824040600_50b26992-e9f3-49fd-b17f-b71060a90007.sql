-- Security fixes: Lock down storage policies for resumes bucket

-- Drop overly permissive policies that allow public access to resumes and payment screenshots
DROP POLICY IF EXISTS "Anyone can view resumes" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update resumes" ON storage.objects;  
DROP POLICY IF EXISTS "Anyone can delete resumes" ON storage.objects;

-- Keep only minimal INSERT policy for uploads (edge functions use service role)
CREATE POLICY "Allow uploads to resumes bucket"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'resumes');

-- Fix search_path for the update function as recommended by linter
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;