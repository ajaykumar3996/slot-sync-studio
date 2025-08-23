-- Add payment_screenshot_path column to booking_requests table
ALTER TABLE public.booking_requests 
ADD COLUMN IF NOT EXISTS payment_screenshot_path TEXT;