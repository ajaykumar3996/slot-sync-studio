-- Add cancellation-related columns to booking_requests table
ALTER TABLE public.booking_requests 
ADD COLUMN cancellation_token text,
ADD COLUMN cancelled_at timestamp with time zone,
ADD COLUMN cancellation_reason text;

-- Create index on cancellation_token for faster lookups
CREATE INDEX idx_booking_requests_cancellation_token ON public.booking_requests(cancellation_token) WHERE cancellation_token IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.booking_requests.cancellation_token IS 'Unique token for cancelling approved bookings via email link';
COMMENT ON COLUMN public.booking_requests.cancelled_at IS 'Timestamp when the booking was cancelled';
COMMENT ON COLUMN public.booking_requests.cancellation_reason IS 'Optional reason provided by user for cancellation';