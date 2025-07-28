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

    // If approved, create Google Calendar event automatically
    if (action === 'approve') {
      try {
        console.log('Creating automatic Google Calendar event...');
        const calendarEvent = await createGoogleCalendarEvent(bookingRequest);
        console.log('✅ Google Calendar event created automatically:', calendarEvent.id, calendarEvent.htmlLink);
      } catch (calendarError) {
        console.error('❌ Failed to create automatic Google Calendar event:', calendarError);
        console.error('Error details:', calendarError.message);
        // Continue with email sending even if calendar creation fails
      }
    }

    // Send confirmation email to the user using Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const gmailUser = Deno.env.get('GMAIL_USER');
    
    if (resendApiKey && gmailUser) {
      try {
        const resend = new Resend(resendApiKey);
        
        const isApproved = action === 'approve';
        const subject = isApproved 
          ? `Booking Confirmed - ${bookingRequest.slot_date} ${bookingRequest.slot_start_time}`
          : `Booking Request Declined - ${bookingRequest.slot_date}`;

        console.log(`Sending ${isApproved ? 'approval' : 'rejection'} email to ${bookingRequest.user_email} using Resend`);
        
        // Create email content with calendar link for approved bookings
        const calendarSection = isApproved ? `
          <div style="background: #dcfce7; border: 1px solid #22c55e; padding: 15px; border-radius: 6px; color: #15803d; margin: 20px 0;">
            <p><strong>✅ Your booking has been confirmed!</strong></p>
            <p>Click the button below to add this appointment to your Google Calendar:</p>
            <div style="margin: 15px 0;">
              <a href="${createGoogleCalendarEventUrl(bookingRequest)}" 
                 style="background: #4285f4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;"
                 target="_blank">
                📅 Add to Google Calendar
              </a>
            </div>
            <p style="font-size: 14px; color: #666;">Please be available at the scheduled time.</p>
          </div>
        ` : `
          <div style="background: #fef2f2; border: 1px solid #ef4444; padding: 15px; border-radius: 6px; color: #dc2626;">
            <p><strong>❌ Your booking request has been declined.</strong></p>
            <p>Please try booking a different time slot that may work better.</p>
          </div>
        `;

        const emailResult = await resend.emails.send({
          from: gmailUser, // Use your Gmail address as the from address
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
            
            ${calendarSection}
            
            <p style="margin-top: 20px;">
              Best regards,<br>
              ITmate.ai Team
            </p>
          `,
        });

        if (emailResult.error) {
          console.error('Email send failed:', emailResult.error);
        } else {
          console.log('✅ Confirmation email sent successfully with calendar link:', emailResult.data);
        }
      } catch (emailError) {
        console.error('Error sending email:', emailError);
      }
    } else {
      console.error('Email credentials not found in environment variables');
    }

    // Return success page
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Booking ${action === 'approve' ? 'Approved' : 'Rejected'}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
            }
            .container {
              background: rgba(255, 255, 255, 0.95);
              backdrop-filter: blur(10px);
              border-radius: 20px;
              padding: 40px;
              max-width: 500px;
              width: 100%;
              text-align: center;
              box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            }
            .icon {
              font-size: 64px;
              margin-bottom: 20px;
              display: block;
            }
            .success-icon { color: #22c55e; }
            .error-icon { color: #ef4444; }
            h1 {
              color: #1f2937;
              margin-bottom: 16px;
              font-size: 28px;
              font-weight: 600;
            }
            p {
              color: #6b7280;
              line-height: 1.6;
              margin-bottom: 12px;
              font-size: 16px;
            }
            .close-note {
              margin-top: 30px;
              font-size: 14px;
              opacity: 0.7;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <span class="icon ${action === 'approve' ? 'success-icon' : 'error-icon'}">
              ${action === 'approve' ? '✅' : '❌'}
            </span>
            <h1>Booking ${action === 'approve' ? 'Approved' : 'Rejected'}</h1>
            <p>The booking request for <strong>${bookingRequest.user_name}</strong> on <strong>${bookingRequest.slot_date} ${bookingRequest.slot_start_time}</strong> has been ${newStatus}.</p>
            <p>A confirmation email has been sent to <strong>${bookingRequest.user_email}</strong>.</p>
            <p class="close-note">You can safely close this tab.</p>
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

// Function to create Google Calendar event automatically
async function createGoogleCalendarEvent(bookingRequest: any) {
  console.log('🔑 Getting Google credentials...');
  const googleClientEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL');
  const googlePrivateKey = Deno.env.get('GOOGLE_PRIVATE_KEY');
  
  if (!googleClientEmail || !googlePrivateKey) {
    throw new Error('❌ Google credentials not configured - GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY missing');
  }

  console.log('📧 Using Google client email:', googleClientEmail);

  // Get access token for Google Calendar API
  console.log('🔐 Getting Google access token...');
  const accessToken = await getGoogleAccessToken(googleClientEmail, googlePrivateKey);
  console.log('✅ Access token obtained successfully');
  
  // Parse the booking date and time
  const eventDate = bookingRequest.slot_date; // YYYY-MM-DD
  const startTime = bookingRequest.slot_start_time; // e.g., "08:00:00" (24-hour format from DB)
  const endTime = bookingRequest.slot_end_time; // e.g., "08:30:00" (24-hour format from DB)
  
  console.log('📅 Event details:', { eventDate, startTime, endTime });
  
  // Times are already in 24-hour format from database, use them directly
  // Create proper Central Time ISO strings
  const startDateTime = `${eventDate}T${startTime}-05:00`; // CDT is UTC-5
  const endDateTime = `${eventDate}T${endTime}-05:00`;
  
  console.log('🕐 Converted times:', { startDateTime, endDateTime });
  
  const calendarEvent = {
    summary: `Meeting with ${bookingRequest.user_name}`,
    description: `Booking confirmed for ${bookingRequest.user_name} (${bookingRequest.user_email})\n\nMessage: ${bookingRequest.message || 'No message provided'}`,
    start: {
      dateTime: startDateTime,
      timeZone: 'America/Chicago'
    },
    end: {
      dateTime: endDateTime,
      timeZone: 'America/Chicago'
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 60 },
        { method: 'popup', minutes: 15 }
      ]
    }
  };

  console.log('📋 Calendar event object created:', JSON.stringify(calendarEvent, null, 2));

  // Try different calendar approaches
  const calendarAttempts = [
    'itmate.ai@gmail.com',
    'primary', 
    googleClientEmail
  ];
  
  console.log('🎯 Attempting to create event on calendars:', calendarAttempts);
  
  for (const calendarId of calendarAttempts) {
    try {
      console.log(`📍 Trying calendar: ${calendarId}`);
      
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(calendarEvent),
      });

      console.log(`📡 API Response for ${calendarId}:`, response.status, response.statusText);

      if (response.ok) {
        const result = await response.json();
        console.log(`🎉 SUCCESS! Calendar event created on ${calendarId}:`, {
          id: result.id,
          htmlLink: result.htmlLink,
          status: result.status
        });
        return result;
      } else {
        const errorData = await response.text();
        console.error(`❌ Failed on ${calendarId} (${response.status}):`, errorData);
        
        // If this is the last calendar, throw the error
        if (calendarId === calendarAttempts[calendarAttempts.length - 1]) {
          throw new Error(`All calendar attempts failed. Final error: ${response.status} - ${errorData}`);
        }
      }
    } catch (fetchError) {
      console.error(`💥 Exception with calendar ${calendarId}:`, fetchError.message);
      
      // If this is the last calendar, throw the error
      if (calendarId === calendarAttempts[calendarAttempts.length - 1]) {
        throw new Error(`All calendar attempts failed. Final exception: ${fetchError.message}`);
      }
    }
  }
}

// Google authentication functions
async function getGoogleAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  console.log('🔧 Creating JWT...');
  const jwt = await createJWT(clientEmail, privateKey);
  console.log('📝 JWT created successfully');
  
  console.log('🌐 Requesting access token from Google...');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  console.log('📡 Token response status:', response.status);

  if (!response.ok) {
    const errorData = await response.text();
    console.error('❌ Token request failed:', errorData);
    throw new Error(`Failed to get access token: ${response.status} ${errorData}`);
  }

  const data = await response.json();
  console.log('✅ Access token received');
  return data.access_token;
}

async function createJWT(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // Clean the private key
  console.log('🔑 Processing private key...');
  const cleanedPrivateKey = privateKey
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  console.log('🔑 Private key length after cleaning:', cleanedPrivateKey.length);

  // Import the private key
  const keyData = Uint8Array.from(atob(cleanedPrivateKey), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  // Sign the JWT
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signingInput)
  );

  const encodedSignature = base64UrlEncode(new Uint8Array(signature));
  console.log('✅ JWT signed successfully');
  return `${signingInput}.${encodedSignature}`;
}

function base64UrlEncode(data: any): string {
  let base64;
  if (typeof data === 'string') {
    base64 = btoa(data);
  } else {
    // For Uint8Array
    base64 = btoa(String.fromCharCode(...data));
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Convert 12-hour format to 24-hour format
function convertTo24HourFormat(timeStr: string): string {
  const [time, ampm] = timeStr.split(' ');
  const [hours, minutes] = time.split(':');
  let hour = parseInt(hours);
  
  if (ampm === 'PM' && hour !== 12) {
    hour += 12;
  } else if (ampm === 'AM' && hour === 12) {
    hour = 0;
  }
  
  return `${hour.toString().padStart(2, '0')}:${minutes}`;
}

// Helper function to create Google Calendar URL for manual addition (fallback)
function createGoogleCalendarEventUrl(bookingRequest: any): string {
  const eventDate = bookingRequest.slot_date; // YYYY-MM-DD
  const startTime = bookingRequest.slot_start_time; // e.g., "08:00:00" (24-hour format from DB)
  const endTime = bookingRequest.slot_end_time; // e.g., "08:30:00" (24-hour format from DB)
  
  // Times are already in 24-hour format, just remove seconds
  const startTime24 = startTime.substring(0, 5); // "08:00:00" -> "08:00"
  const endTime24 = endTime.substring(0, 5); // "08:30:00" -> "08:30"
  
  // Convert to Google Calendar format (YYYYMMDDTHHMMSSZ)
  const startDateTime = `${eventDate.replace(/-/g, '')}T${startTime24.replace(/:/g, '')}00`;
  const endDateTime = `${eventDate.replace(/-/g, '')}T${endTime24.replace(/:/g, '')}00`;
  
  const eventTitle = encodeURIComponent(`Meeting with ${bookingRequest.user_name}`);
  const eventDescription = encodeURIComponent(
    `Booking confirmed for ${bookingRequest.user_name} (${bookingRequest.user_email})\n\nMessage: ${bookingRequest.message || 'No message provided'}`
  );
  
  // Create Google Calendar URL
  const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${eventTitle}&dates=${startDateTime}/${endDateTime}&details=${eventDescription}&ctz=America/Chicago`;
  
  return calendarUrl;
}

serve(serve_handler);