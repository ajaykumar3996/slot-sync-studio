import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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

    // Send email notification to itmate.ai@gmail.com using Gmail SMTP
    const gmailUser = Deno.env.get('GMAIL_USER');
    const gmailPassword = Deno.env.get('GMAIL_APP_PASSWORD');
    
    if (!gmailUser || !gmailPassword) {
      console.error('Gmail SMTP credentials not configured');
      throw new Error('Email service not configured');
    }

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 587,
        tls: true,
        auth: {
          username: gmailUser,
          password: gmailPassword,
        },
      },
    });
    
    const approvalUrl = `${supabaseUrl}/functions/v1/handle-booking-approval?token=${approvalToken}&action=approve`;
    const rejectionUrl = `${supabaseUrl}/functions/v1/handle-booking-approval?token=${approvalToken}&action=reject`;

    await client.send({
      from: gmailUser,
      to: "itmate.ai@gmail.com",
      subject: `New Booking Request - ${bookingData.slot_date} ${bookingData.slot_start_time}`,
      content: `
        <h2>New Booking Request</h2>
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Booking Details</h3>
          <p><strong>Name:</strong> ${bookingData.user_name}</p>
          <p><strong>Email:</strong> ${bookingData.user_email}</p>
          <p><strong>Date:</strong> ${bookingData.slot_date}</p>
          <p><strong>Time:</strong> ${bookingData.slot_start_time} - ${bookingData.slot_end_time} CST</p>
          <p><strong>Duration:</strong> ${bookingData.slot_duration_minutes} minutes</p>
          ${bookingData.message ? `<p><strong>Message:</strong> ${bookingData.message}</p>` : ''}
        </div>
        
        <div style="margin: 20px 0;">
          <a href="${approvalUrl}" 
             style="background: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-right: 10px;">
            ✅ APPROVE
          </a>
          <a href="${rejectionUrl}" 
             style="background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            ❌ REJECT
          </a>
        </div>
        
        <p style="color: #666; font-size: 14px;">
          Click the buttons above to approve or reject this booking request.
        </p>
      `,
    });

    console.log('Approval email sent successfully');

    // Send immediate confirmation email to the user
    await client.send({
      from: gmailUser,
      to: bookingData.user_email,
      subject: `Booking Request Received - ${bookingData.slot_date} ${bookingData.slot_start_time}`,
      content: `
        <h2>Booking Request Received</h2>
        <p>Dear ${bookingData.user_name},</p>
        <p>We have received your booking request and it is currently being reviewed.</p>
        
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Your Booking Details</h3>
          <p><strong>Date:</strong> ${bookingData.slot_date}</p>
          <p><strong>Time:</strong> ${bookingData.slot_start_time} - ${bookingData.slot_end_time} CST</p>
          <p><strong>Duration:</strong> ${bookingData.slot_duration_minutes} minutes</p>
          ${bookingData.message ? `<p><strong>Your Message:</strong> ${bookingData.message}</p>` : ''}
        </div>
        
        <div style="background: #e0f2fe; border: 1px solid #0284c7; padding: 15px; border-radius: 6px; color: #075985;">
          <p><strong>📋 What happens next?</strong></p>
          <p>Your request will be reviewed and you will receive a confirmation email within 24 hours letting you know if your booking has been approved or if we need to suggest an alternative time.</p>
        </div>
        
        <p style="margin-top: 20px;">
          Best regards,<br>
          ITmate.ai Team
        </p>
      `,
    });

    await client.close();
    console.log('User confirmation email sent successfully');

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