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

const fetchClientInfo = async (clientName: string): Promise<string> => {
  try {
    const searchTerm = clientName.toLowerCase().trim();
    const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(searchTerm + ' company')}&format=json&no_html=1&skip_disambig=1`);
    const data = await response.json();
    
    if (data.Abstract && data.Abstract.length > 0) {
      return data.Abstract.substring(0, 200) + '...';
    }
    
    return `${clientName} is a company.`;
  } catch (error) {
    console.error('Error fetching client info:', error);
    return `${clientName} is a company.`;
  }
};

const encodeToBase64 = (str: string): string => {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  let binary = '';
  const len = data.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
};

const serve_handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = performance.now();
  console.log('🚀 Starting booking request processing at:', new Date().toISOString());

  try {
    const bookingData: BookingRequest = await req.json();
    console.log('📥 Received booking request:', bookingData);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const approvalToken = crypto.randomUUID();
    const { data: bookingRequest, error } = await supabase
      .from('booking_requests')
      .insert({
        user_name: bookingData.user_name,
        user_email: bookingData.user_email,
        phone_number: bookingData.phone_number,
        client_name: bookingData.client_name,
        role_name: bookingData.role_name,
        job_description: bookingData.job_description,
        resume_file_path: bookingData.resume_file_path,
        team_details: bookingData.team_details,
        job_link: bookingData.job_link,
        message: bookingData.message,
        slot_date: bookingData.slot_date,
        slot_start_time: bookingData.slot_start_time,
        slot_end_time: bookingData.slot_end_time,
        slot_duration_minutes: bookingData.slot_duration_minutes,
        approval_token: approvalToken,
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      throw new Error(`Failed to save booking request: ${error.message}`);
    }

    const dbSaveTime = performance.now();
    console.log(`💾 Database save completed in ${(dbSaveTime - startTime).toFixed(2)}ms`);
    console.log('Booking request saved with ID:', bookingRequest.id);

    // Start lightweight background processing
    const backgroundProcessing = (async () => {
      try {
        console.log('📄 Starting lightweight background processing...');
        
        const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
        const approvalUrl = `https://rnkxaezxodhvrxameair.supabase.co/functions/v1/handle-booking-approval?token=${approvalToken}&action=approve`;
        const rejectionUrl = `https://rnkxaezxodhvrxameair.supabase.co/functions/v1/handle-booking-approval?token=${approvalToken}&action=reject`;

        let resumeAttachment: any = null;
        let resumeStatus = 'No resume provided';
        const resumeFilename = bookingData.resume_file_path;

        // Simplified resume processing - only attach file, skip text extraction
        if (resumeFilename) {
          try {
            console.log('📄 Processing resume attachment:', resumeFilename);
            
            const { data: resumeData } = await supabase.storage
              .from('resumes')
              .download(resumeFilename);

            if (resumeData && resumeData.size < 2 * 1024 * 1024) { // Only process files under 2MB
              const resumeArrayBuffer = await resumeData.arrayBuffer();
              const mimeType = resumeData.type;
              const fileExtension = resumeFilename.split('.').pop() || 'pdf';

              console.log('Resume data downloaded, size:', resumeArrayBuffer.byteLength, 'type:', mimeType);

              const resumeBase64 = encodeToBase64(new Uint8Array(resumeArrayBuffer));
              
              resumeAttachment = {
                filename: `${bookingData.user_name.replace(/\s+/g, '_')}_resume.${fileExtension}`,
                content: resumeBase64,
                type: mimeType,
                disposition: 'attachment'
              };

              resumeStatus = 'Resume attached successfully';
              console.log('✅ Resume processing completed');
            } else {
              resumeStatus = resumeData ? 'Resume too large (>2MB), skipped attachment' : 'Resume download failed';
              console.log('⚠️ Resume processing skipped:', resumeStatus);
            }
          } catch (error) {
            console.error('Error processing resume:', error);
            resumeStatus = `Resume processing failed: ${error.message}`;
          }
        }

        // Simplified client info fetch
        const clientInfo = await fetchClientInfo(bookingData.client_name);

        // Create simple email templates without heavy HTML processing
        const createSimpleTemplate = (type: string) => {
          const basicContent = `Interview Assistant Template - ${type}

Position: ${bookingData.role_name}
Company: ${bookingData.client_name}
Job Description: ${bookingData.job_description}

Client Info: ${clientInfo}

Instructions:
- Use STAR method for behavioral questions
- Provide specific, relevant examples
- Keep responses professional and concise
- Adapt to the job requirements and company culture

Template generated for: ${bookingData.user_name}
Date: ${new Date().toISOString()}`;

          return basicContent;
        };

        const starTemplate = createSimpleTemplate('STAR Technique');
        const standardTemplate = createSimpleTemplate('Standard Response');

        // Prepare lightweight attachments
        const attachments = [] as any[];
        
        if (resumeAttachment) {
          attachments.push(resumeAttachment);
        }

        // Add simple text templates instead of heavy HTML
        attachments.push({
          filename: 'STAR_Technique_Template.txt',
          content: encodeToBase64(starTemplate),
          type: 'text/plain',
          disposition: 'attachment'
        });

        attachments.push({
          filename: 'Standard_Template.txt',
          content: encodeToBase64(standardTemplate),
          type: 'text/plain',
          disposition: 'attachment'
        });

        console.log('📧 Sending simplified email...');

        const emailResponse = await resend.emails.send({
          from: 'booking@resend.dev',
          to: 'itmate.ai@gmail.com',
          subject: `🔔 New Booking Request - ${bookingData.user_name} for ${bookingData.role_name} at ${bookingData.client_name}`,
          html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>📋 New Booking Request</h2>
            
            <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 15px 0;">
              <h3>👤 Personal Information</h3>
              <p><strong>Name:</strong> ${bookingData.user_name}</p>
              <p><strong>Email:</strong> ${bookingData.user_email}</p>
              <p><strong>Phone:</strong> ${bookingData.phone_number}</p>
            </div>

            <div style="background: #e7f3ff; padding: 15px; border-radius: 6px; margin: 15px 0;">
              <h3>💼 Job Details</h3>
              <p><strong>Company:</strong> ${bookingData.client_name}</p>
              <p><strong>Role:</strong> ${bookingData.role_name}</p>
              <p><strong>Description:</strong> ${bookingData.job_description}</p>
              ${bookingData.team_details ? `<p><strong>Team:</strong> ${bookingData.team_details}</p>` : ''}
              ${bookingData.job_link ? `<p><strong>Job Link:</strong> <a href="${bookingData.job_link}">${bookingData.job_link}</a></p>` : ''}
            </div>

            <div style="background: #fff2e7; padding: 15px; border-radius: 6px; margin: 15px 0;">
              <h3>📅 Schedule</h3>
              <p><strong>Date:</strong> ${bookingData.slot_date}</p>
              <p><strong>Time:</strong> ${bookingData.slot_start_time} - ${bookingData.slot_end_time}</p>
              <p><strong>Duration:</strong> ${bookingData.slot_duration_minutes} minutes</p>
            </div>

            <div style="background: #f0fff4; padding: 15px; border-radius: 6px; margin: 15px 0;">
              <h3>📄 Resume Status</h3>
              <p>${resumeStatus}</p>
              ${bookingData.message ? `<p><strong>Message:</strong> ${bookingData.message}</p>` : ''}
            </div>
            
            <div style="text-align: center; margin: 20px 0;">
              <a href="${approvalUrl}" 
                 style="background: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-right: 10px;">
                ✅ APPROVE
              </a>
              <a href="${rejectionUrl}" 
                 style="background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                ❌ REJECT
              </a>
            </div>
          </div>
          `,
          attachments
        });

        console.log('📧 Email sent successfully:', emailResponse);
        console.log('✅ Background processing completed successfully');
      } catch (error) {
        console.error('❌ Background processing error:', error);
      }
    })();

    // Use EdgeRuntime.waitUntil for background processing
    EdgeRuntime.waitUntil(backgroundProcessing);

    // Return immediate response
    const quickResponseTime = performance.now() - startTime;
    console.log(`⚡ Quick response time: ${quickResponseTime.toFixed(2)}ms`);
    console.log('✅ Booking request submitted, email processing in background');

    return new Response(
      JSON.stringify({ 
        success: true, 
        bookingId: bookingRequest.id,
        message: 'Booking request submitted successfully. You will receive a confirmation email once approved.',
        processingTimeMs: quickResponseTime.toFixed(2)
      }), 
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    const errorTime = performance.now();
    const totalErrorTime = errorTime - startTime;
    console.error(`❌ Error in submit-booking-request function after ${totalErrorTime.toFixed(2)}ms:`, error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to process booking request', 
        details: error.message,
        processingTimeMs: totalErrorTime.toFixed(2)
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

serve(serve_handler);