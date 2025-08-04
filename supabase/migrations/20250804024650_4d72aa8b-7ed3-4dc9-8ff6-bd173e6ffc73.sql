-- Add new columns to booking_requests table for expanded form data
ALTER TABLE public.booking_requests 
ADD COLUMN phone_number TEXT NOT NULL DEFAULT '',
ADD COLUMN client_name TEXT NOT NULL DEFAULT '',
ADD COLUMN role_name TEXT NOT NULL DEFAULT '',
ADD COLUMN job_description TEXT NOT NULL DEFAULT '',
ADD COLUMN resume_file_path TEXT,
ADD COLUMN team_details TEXT,
ADD COLUMN job_link TEXT;

-- Create storage bucket for resume uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('resumes', 'resumes', false);

-- Create storage policies for resume uploads
CREATE POLICY "Anyone can upload resumes" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'resumes');

CREATE POLICY "Anyone can view resumes" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'resumes');

CREATE POLICY "Anyone can update resumes" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'resumes');

CREATE POLICY "Anyone can delete resumes" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'resumes');