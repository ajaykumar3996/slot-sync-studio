-- Security Fix: Restrict access to booking_requests table
-- Remove the overly permissive public read policy
DROP POLICY IF EXISTS "Anyone can view booking requests" ON public.booking_requests;

-- Add a secure policy that only allows users to view their own booking requests
-- Users can only see booking requests where their email matches their authenticated email
CREATE POLICY "Users can view their own booking requests" 
ON public.booking_requests 
FOR SELECT 
TO authenticated
USING (auth.email() = user_email);

-- Add policy for admin access (using service role key) - this ensures edge functions continue to work
-- Note: Edge functions use service role key which bypasses RLS, so this is just for completeness
CREATE POLICY "Service role can view all booking requests" 
ON public.booking_requests 
FOR ALL 
TO service_role 
USING (true);

-- Also ensure users can still create booking requests
-- (This policy already exists but let's make sure it's properly scoped)
DROP POLICY IF EXISTS "Anyone can create booking requests" ON public.booking_requests;
CREATE POLICY "Authenticated users can create booking requests" 
ON public.booking_requests 
FOR INSERT 
TO authenticated
WITH CHECK (auth.email() = user_email);