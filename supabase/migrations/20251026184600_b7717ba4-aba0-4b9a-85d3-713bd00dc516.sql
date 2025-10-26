-- Drop the existing check constraint
ALTER TABLE public.booking_requests 
DROP CONSTRAINT IF EXISTS booking_requests_status_check;

-- Add new check constraint that includes 'cancelled' as a valid status
ALTER TABLE public.booking_requests 
ADD CONSTRAINT booking_requests_status_check 
CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));