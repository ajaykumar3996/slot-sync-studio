import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const serve_handler = async (req: Request): Promise<Response> => {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const action = url.searchParams.get('action'); // 'approve' or 'reject'

    if (!token || !action) {
      return new Response('Invalid request parameters', { status: 400 });
    }

    console.log(`Processing ${action} action for token:`, token);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find the booking request by token
    const { data: bookingRequest, error: findError } = await supabase
      .from('booking_requests')
      .select('*')
      .eq('approval_token', token)
      .eq('status', 'pending')
      .single();

    if (findError || !bookingRequest) {
      console.error('Booking request not found:', findError);
      return new Response('Booking request not found or already processed', { status: 404 });
    }

    // Update booking status
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const { error: updateError } = await supabase
      .from('booking_requests')
      .update({ status: newStatus })
      .eq('id', bookingRequest.id);

    if (updateError) {
      console.error('Failed to update booking status:', updateError);
      throw new Error('Failed to update booking status');
    }

    console.log(`Booking ${bookingRequest.id} ${newStatus}`);

    // Send confirmation email to the user
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (resendApiKey) {
      const resend = new Resend(resendApiKey);
      
      const isApproved = action === 'approve';
      const subject = isApproved 
        ? `Booking Confirmed - ${bookingRequest.slot_date} ${bookingRequest.slot_start_time}`
        : `Booking Request Declined - ${bookingRequest.slot_date}`;

      await resend.emails.send({
        from: "Booking System <bookings@resend.dev>",
        to: [bookingRequest.user_email],
        subject,
        html: `
          <h2>Booking ${isApproved ? 'Confirmed' : 'Declined'}</h2>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Name:</strong> ${bookingRequest.user_name}</p>
            <p><strong>Date:</strong> ${bookingRequest.slot_date}</p>
            <p><strong>Time:</strong> ${bookingRequest.slot_start_time} - ${bookingRequest.slot_end_time} CST</p>
            <p><strong>Duration:</strong> ${bookingRequest.slot_duration_minutes} minutes</p>
          </div>
          
          ${isApproved ? `
            <div style="background: #dcfce7; border: 1px solid #22c55e; padding: 15px; border-radius: 6px; color: #15803d;">
              <p><strong>✅ Your booking has been confirmed!</strong></p>
              <p>Please add this appointment to your calendar and be available at the scheduled time.</p>
            </div>
          ` : `
            <div style="background: #fef2f2; border: 1px solid #ef4444; padding: 15px; border-radius: 6px; color: #dc2626;">
              <p><strong>❌ Your booking request has been declined.</strong></p>
              <p>Please try booking a different time slot that may work better.</p>
            </div>
          `}
          
          <p style="margin-top: 20px;">
            Best regards,<br>
            ITmate.ai Team
          </p>
        `,
      });

      console.log('Confirmation email sent to user');
    }

    // Return success page
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Booking ${action === 'approve' ? 'Approved' : 'Rejected'}</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .success { background: #dcfce7; border: 1px solid #22c55e; padding: 20px; border-radius: 8px; }
            .error { background: #fef2f2; border: 1px solid #ef4444; padding: 20px; border-radius: 8px; }
          </style>
        </head>
        <body>
          <div class="${action === 'approve' ? 'success' : 'error'}">
            <h2>Booking ${action === 'approve' ? 'Approved' : 'Rejected'}</h2>
            <p>The booking request for ${bookingRequest.user_name} on ${bookingRequest.slot_date} ${bookingRequest.slot_start_time} has been ${newStatus}.</p>
            <p>A confirmation email has been sent to ${bookingRequest.user_email}.</p>
          </div>
        </body>
      </html>
      `,
      { 
        headers: { 'Content-Type': 'text/html' } 
      }
    );

  } catch (error) {
    console.error('Error in handle-booking-approval function:', error);
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Error</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .error { background: #fef2f2; border: 1px solid #ef4444; padding: 20px; border-radius: 8px; }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>Error</h2>
            <p>An error occurred while processing the booking approval: ${error.message}</p>
          </div>
        </body>
      </html>
      `,
      {
        status: 500,
        headers: { 'Content-Type': 'text/html' },
      }
    );
  }
};

serve(serve_handler);