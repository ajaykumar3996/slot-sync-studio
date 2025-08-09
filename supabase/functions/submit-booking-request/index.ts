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

// Fetch brief company information (4-5 sentences) using public APIs
const fetchClientInfo = async (clientName: string): Promise<string> => {
  // Try Wikipedia summary first
  try {
    const title = encodeURIComponent(clientName.trim());
    const wikiResp = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`);
    if (wikiResp.ok) {
      const wikiJson = await wikiResp.json();
      if (wikiJson?.extract) {
        const sentences = (wikiJson.extract as string)
          .split(/(?<=\.)\s+/)
          .slice(0, 5)
          .join(' ');
        return sentences;
      }
    }
  } catch (err) {
    console.log('Wikipedia lookup failed:', err);
  }

  // Fallback to DuckDuckGo Instant Answer
  try {
    const ddgResp = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(clientName)}&format=json&no_html=1&skip_disambig=1`
    );
    if (ddgResp.ok) {
      const ddgJson = await ddgResp.json();
      if (ddgJson?.AbstractText) {
        const sentences = (ddgJson.AbstractText as string)
          .split(/(?<=\.)\s+/)
          .slice(0, 5)
          .join(' ');
        return sentences;
      }
    }
  } catch (err) {
    console.log('DuckDuckGo lookup failed:', err);
  }

  return `No public summary found for "${clientName}". Please verify the company name or provide a short description.`;
};

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
    let resumeStatus = 'No resume uploaded';
    let resumeFilename: string | null = null;
    
    if (bookingData.resume_file_path) {
      console.log('Processing resume attachment for path:', bookingData.resume_file_path);
      try {
        // Download the resume file from storage
        const { data: resumeData, error: resumeError } = await supabase.storage
          .from('resumes')
          .download(bookingData.resume_file_path);
        
        if (resumeError) {
          console.error('Storage download error:', resumeError);
          resumeStatus = `Resume upload failed: ${resumeError.message}`;
        } else if (resumeData) {
          console.log('Resume data downloaded successfully, size:', resumeData.size, 'type:', resumeData.type);
          
          // Convert file to base64 for email attachment
          const resumeArrayBuffer = await resumeData.arrayBuffer();
          console.log('Resume array buffer size:', resumeArrayBuffer.byteLength);
          
          // Use a more efficient base64 conversion for large files
          const uint8Array = new Uint8Array(resumeArrayBuffer);
          let binaryString = '';
          const chunkSize = 1024 * 64; // 64KB chunks
          
          for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.slice(i, i + chunkSize);
            binaryString += String.fromCharCode(...chunk);
          }
          
          const resumeBase64 = btoa(binaryString);
          console.log('Base64 conversion completed, length:', resumeBase64.length);
          
          // Get original filename from path
          const originalFilename = bookingData.resume_file_path.split('/').pop() || 'resume.pdf';
          resumeFilename = originalFilename;
          const fileExtension = originalFilename.split('.').pop()?.toLowerCase();
          
          // Determine MIME type
          let mimeType = 'application/pdf';
          if (fileExtension === 'docx') {
            mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          } else if (fileExtension === 'doc') {
            mimeType = 'application/msword';
          }
          
          resumeAttachment = {
            filename: `${bookingData.user_name.replace(/\s+/g, '_')}_resume.${fileExtension}`,
            content: resumeBase64,
            type: mimeType,
            disposition: 'attachment'
          };
          
          resumeStatus = `Resume attached: ${originalFilename}`;
          console.log('Resume attachment prepared successfully');
        } else {
          console.error('No resume data returned from storage');
          resumeStatus = 'Resume download failed: No data returned';
        }
      } catch (error) {
        console.error('Error processing resume attachment:', error);
        resumeStatus = `Resume processing failed: ${error.message}`;
      }
    }

    // Enrich email with client research and AI templates
    const clientInfo = await fetchClientInfo(bookingData.client_name);
    const resumeLine = resumeFilename ? `Attached - ${resumeFilename}` : 'Not provided';

    const templatesHtml = `
      <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
      <h3 style="margin:0 0 12px 0;">AI Assistant Templates (auto-filled)</h3>

      <details style="margin-bottom:16px;">
        <summary style="cursor:pointer;font-weight:600;">Regular Template</summary>
        <div style="padding:12px 0;">
          <p style="margin:0 0 8px 0;">You are an AI assistant designed to simulate an interviewee for a job interview. Provide realistic, human-like responses based on the last question in a transcription.</p>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin:12px 0;">
            <p style="margin:0 0 6px 0;"><strong>Position:</strong> ${bookingData.role_name}</p>
            <p style="margin:0 0 6px 0;"><strong>Company:</strong> ${bookingData.client_name}</p>
            <p style="margin:0 0 6px 0;"><strong>Company overview (auto):</strong> ${clientInfo}</p>
            <p style="margin:0 0 6px 0;"><strong>Job Description:</strong> ${bookingData.job_description}</p>
            <p style="margin:0;"><strong>Resume:</strong> ${resumeLine}</p>
          </div>
          <p style="margin:8px 0 6px 0;">Instructions:</p>
          <ul style="margin:0 0 8px 18px; padding:0;">
            <li>Identify the last question/topic in the transcription and answer it concisely.</li>
            <li>Tailor to the role and JD; keep tone professional and human.</li>
            <li>Use simple language; avoid fluffy intros; go straight to the point.</li>
            <li>When STAR is asked, create a realistic scenario and track it across follow-ups.</li>
          </ul>
          <p style="margin:8px 0 4px 0;"><strong>Example output format</strong></p>
          <pre style="white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#f3f4f6;padding:10px;border-radius:6px;border:1px solid #e5e7eb;">**Question:** [Last question from the transcription]
**Answer:** [Your response as natural speech, in markdown]</pre>
        </div>
      </details>

      <details>
        <summary style="cursor:pointer;font-weight:600;">STAR Technique</summary>
        <div style="padding:12px 0;">
          <p style="margin:0 0 8px 0;">Answer behavioral/scenario questions strictly using the STAR method with a realistic project scenario.</p>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin:12px 0;">
            <p style="margin:0 0 6px 0;"><strong>Position:</strong> ${bookingData.role_name}</p>
            <p style="margin:0 0 6px 0;"><strong>Company:</strong> ${bookingData.client_name}</p>
            <p style="margin:0 0 6px 0;"><strong>Company overview (auto):</strong> ${clientInfo}</p>
            <p style="margin:0 0 6px 0;"><strong>Job Description:</strong> ${bookingData.job_description}</p>
            <p style="margin:0;"><strong>Resume:</strong> ${resumeLine}</p>
          </div>
          <p style="margin:8px 0 4px 0;"><strong>Example output format</strong></p>
          <pre style="white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#f3f4f6;padding:10px;border-radius:6px;border:1px solid #e5e7eb;">**Question:** [Last question]
**Situation:** [...]
**Task:** [...]
**Action:** [...]
**Result:** [...]
</pre>
        </div>
      </details>
    `;

    const emailResponse = await resend.emails.send({
      from: "Book My Slot <anand@bookmyslot.me>",
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
          
          <h3>Resume Status</h3>
          <p>${resumeAttachment ? '📄 Resume is attached to this email' : `⚠️ ${resumeStatus}`}</p>
          
          ${bookingData.message ? `<h3>Additional Message</h3><p>${bookingData.message}</p>` : ''}
        </div>

        ${templatesHtml}
        
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