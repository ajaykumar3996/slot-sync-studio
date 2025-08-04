import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BookingRequest {
  user_name: string;
  user_email: string;
  phone_number: string;
  client_name: string;
  role_name: string;
  job_description: string;
  resume_file_path?: string;
  team_details?: string;
  job_link?: string;
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

    // Send email notification using Resend with your Gmail as from address
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const gmailUser = Deno.env.get('GMAIL_USER');
    
    if (!resendApiKey || !gmailUser) {
      console.error('Email credentials not configured');
      throw new Error('Email service not configured');
    }

    const resend = new Resend(resendApiKey);
    console.log('Sending approval email to itmate.ai@gmail.com using Resend');
    
    const approvalUrl = `${supabaseUrl}/functions/v1/handle-booking-approval?token=${approvalToken}&action=approve`;
    const rejectionUrl = `${supabaseUrl}/functions/v1/handle-booking-approval?token=${approvalToken}&action=reject`;

    // Prepare resume attachment if available
    let resumeAttachment = null;
    if (bookingData.resume_file_path) {
      try {
        // Download the resume file from storage
        const { data: resumeData, error: resumeError } = await supabase.storage
          .from('resumes')
          .download(bookingData.resume_file_path);
        
        if (!resumeError && resumeData) {
          // Convert file to base64 for email attachment
          const resumeArrayBuffer = await resumeData.arrayBuffer();
          const resumeBase64 = btoa(String.fromCharCode(...new Uint8Array(resumeArrayBuffer)));
          
          // Get original filename from path
          const originalFilename = bookingData.resume_file_path.split('/').pop() || 'resume.pdf';
          
          resumeAttachment = {
            filename: `${bookingData.user_name.replace(/\s+/g, '_')}_resume.${originalFilename.split('.').pop()}`,
            content: resumeBase64,
            type: resumeData.type || 'application/pdf',
            disposition: 'attachment'
          };
        } else {
          console.error('Failed to download resume:', resumeError);
        }
      } catch (error) {
        console.error('Error processing resume attachment:', error);
      }
    }

    const emailResponse = await resend.emails.send({
      from: "BookMySlot <anand@bookmyslot.me>",
      to: ["itmate.ai@gmail.com"],
      subject: `New Booking Request - ${bookingData.role_name} at ${bookingData.client_name}`,
      html: `
        <h2>New Booking Request</h2>
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Personal Information</h3>
          <p><strong>Name:</strong> ${bookingData.user_name}</p>
          <p><strong>Email:</strong> ${bookingData.user_email}</p>
          <p><strong>Phone:</strong> ${bookingData.phone_number}</p>
          
          <h3>Job Information</h3>
          <p><strong>Client/Company:</strong> ${bookingData.client_name}</p>
          <p><strong>Role:</strong> ${bookingData.role_name}</p>
          <p><strong>Job Description:</strong> ${bookingData.job_description}</p>
          ${bookingData.team_details ? `<p><strong>Team:</strong> ${bookingData.team_details}</p>` : ''}
          ${bookingData.job_link ? `<p><strong>Job Link:</strong> <a href="${bookingData.job_link}" target="_blank">${bookingData.job_link}</a></p>` : ''}
          
          <h3>Interview Details</h3>
          <p><strong>Date:</strong> ${bookingData.slot_date}</p>
          <p><strong>Time:</strong> ${bookingData.slot_start_time} - ${bookingData.slot_end_time} CST</p>
          <p><strong>Duration:</strong> ${bookingData.slot_duration_minutes} minutes</p>
          
          ${resumeAttachment ? `<h3>Resume</h3><p>📄 Resume is attached to this email</p>` : '<p><em>⚠️ No resume was uploaded</em></p>'}
          
          ${bookingData.message ? `<h3>Additional Message</h3><p>${bookingData.message}</p>` : ''}
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
      ...(resumeAttachment ? { attachments: [resumeAttachment] } : {}),
    });

    console.log('Approval email sent successfully:', emailResponse);

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