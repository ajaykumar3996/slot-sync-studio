-- Create a new table for individual booking slots
CREATE TABLE public.booking_slots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_request_id UUID NOT NULL REFERENCES public.booking_requests(id) ON DELETE CASCADE,
  slot_date DATE NOT NULL,
  slot_start_time TIME WITHOUT TIME ZONE NOT NULL,
  slot_end_time TIME WITHOUT TIME ZONE NOT NULL,
  slot_duration_minutes INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on booking_slots
ALTER TABLE public.booking_slots ENABLE ROW LEVEL SECURITY;

-- Create policies for booking_slots
CREATE POLICY "Users can view their own booking slots" 
ON public.booking_slots 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.booking_requests 
    WHERE booking_requests.id = booking_slots.booking_request_id 
    AND booking_requests.user_email = auth.email()
  )
);

CREATE POLICY "Service role can view all booking slots" 
ON public.booking_slots 
FOR ALL 
USING (true);

-- Remove slot-specific columns from booking_requests since they'll be in booking_slots
ALTER TABLE public.booking_requests 
DROP COLUMN slot_date,
DROP COLUMN slot_start_time,
DROP COLUMN slot_end_time,
DROP COLUMN slot_duration_minutes;

-- Add a total_slots column to track number of slots in the booking
ALTER TABLE public.booking_requests 
ADD COLUMN total_slots INTEGER NOT NULL DEFAULT 1;