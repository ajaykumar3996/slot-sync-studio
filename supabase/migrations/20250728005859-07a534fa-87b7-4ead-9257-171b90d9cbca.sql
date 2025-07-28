-- Create booking_requests table
CREATE TABLE public.booking_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  message TEXT,
  slot_date DATE NOT NULL,
  slot_start_time TIME NOT NULL,
  slot_end_time TIME NOT NULL,
  slot_duration_minutes INTEGER NOT NULL CHECK (slot_duration_minutes IN (30, 60)),
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approval_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;

-- Create policies for booking requests
CREATE POLICY "Anyone can create booking requests" 
ON public.booking_requests 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can view booking requests" 
ON public.booking_requests 
FOR SELECT 
USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_booking_requests_updated_at
BEFORE UPDATE ON public.booking_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();