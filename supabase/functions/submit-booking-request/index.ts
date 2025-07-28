import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Using fetch with Gmail SMTP API approach

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BookingRequest {
  user_name: string;
  user_email: string;
  message?: string;
  slot_date: string;
  slot_start_time: string;
  slot_end_time: string;
  slot_duration_minutes: number;
}

const serve_handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const bookingData: BookingRequest = await req.json();
    
    console.log('Received booking request:', bookingData);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate approval token
    const approvalToken = crypto.randomUUID();

    // Insert booking request into database
    const { data: bookingRequest, error: dbError } = await supabase
      .from('booking_requests')
      .insert({
        ...bookingData,
        approval_token: approvalToken,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      throw new Error(`Failed to save booking request: ${dbError.message}`);
    }

    console.log('Booking request saved with ID:', bookingRequest.id);

    // Email sending temporarily disabled - booking requests are saved to database
    // You can view and manage them through the Supabase dashboard
    console.log('Booking request saved successfully. Email notifications are temporarily disabled.');
    console.log('Approval URLs for manual processing:');
    
    const approvalUrl = `${supabaseUrl}/functions/v1/handle-booking-approval?token=${approvalToken}&action=approve`;
    const rejectionUrl = `${supabaseUrl}/functions/v1/handle-booking-approval?token=${approvalToken}&action=reject`;
    
    console.log('Approve:', approvalUrl);
    console.log('Reject:', rejectionUrl);

    // Note: User confirmation emails will be sent after approval (limitation of Resend free tier)

    return new Response(
      JSON.stringify({ 
        success: true, 
        bookingId: bookingRequest.id,
        message: 'Booking request submitted successfully. You will receive a confirmation email once approved.' 
      }), 
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in submit-booking-request function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

serve(serve_handler);