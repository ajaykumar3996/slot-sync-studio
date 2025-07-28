import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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

    // If approved, create Google Calendar event
    if (action === 'approve') {
      try {
        await createGoogleCalendarEvent(bookingRequest);
        console.log('Google Calendar event created successfully');
      } catch (calendarError) {
        console.error('Failed to create Google Calendar event:', calendarError);
        // Continue with email sending even if calendar creation fails
      }
    }

    // Send confirmation email to the user using Gmail SMTP
    const gmailUser = Deno.env.get('GMAIL_USER');
    const gmailPassword = Deno.env.get('GMAIL_APP_PASSWORD');
    
    if (gmailUser && gmailPassword) {
      try {
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
        
        const isApproved = action === 'approve';
        const subject = isApproved 
          ? `Booking Confirmed - ${bookingRequest.slot_date} ${bookingRequest.slot_start_time}`
          : `Booking Request Declined - ${bookingRequest.slot_date}`;

        await client.send({
          from: gmailUser,
          to: bookingRequest.user_email,
          subject,
          content: `
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

        await client.close();
        console.log('Confirmation email sent successfully');
      } catch (emailError) {
        console.error('Error sending email:', emailError);
      }
    } else {
      console.error('Gmail SMTP credentials not found in environment variables');
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

// Function to create Google Calendar event
async function createGoogleCalendarEvent(bookingRequest: any) {
  const googleClientEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL');
  const googlePrivateKey = Deno.env.get('GOOGLE_PRIVATE_KEY');
  
  if (!googleClientEmail || !googlePrivateKey) {
    throw new Error('Google credentials not configured');
  }

  // Get access token for Google Calendar API
  const accessToken = await getGoogleAccessToken(googleClientEmail, googlePrivateKey);
  
  // Parse the booking date and time
  const eventDate = bookingRequest.slot_date; // YYYY-MM-DD
  const startTime = bookingRequest.slot_start_time; // e.g., "2:00 PM"
  const endTime = bookingRequest.slot_end_time; // e.g., "3:00 PM"
  
  // Convert to ISO format with CST timezone
  const startDateTime = `${eventDate}T${convertToISO(startTime)}-06:00`;
  const endDateTime = `${eventDate}T${convertToISO(endTime)}-06:00`;
  
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
    attendees: [
      {
        email: bookingRequest.user_email,
        displayName: bookingRequest.user_name
      }
    ],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 60 },
        { method: 'popup', minutes: 15 }
      ]
    }
  };

  // Try primary calendar first, then fallback to service account calendar
  const calendars = ['primary', googleClientEmail];
  let calendarResponse;
  
  for (const calendarId of calendars) {
    try {
      calendarResponse = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(calendarEvent),
      });

      if (calendarResponse.ok) {
        const result = await calendarResponse.json();
        console.log(`Calendar event created successfully on ${calendarId}:`, result);
        return result;
      } else {
        const errorData = await calendarResponse.text();
        console.error(`Failed to create event on ${calendarId}:`, errorData);
        if (calendarId === calendars[calendars.length - 1]) {
          // Last attempt failed, throw error
          throw new Error(`Failed to create calendar event on all calendars: ${calendarResponse.status} ${errorData}`);
        }
        // Continue to next calendar
      }
    } catch (error) {
      console.error(`Error with calendar ${calendarId}:`, error);
      if (calendarId === calendars[calendars.length - 1]) {
        throw error;
      }
    }
  }
}

// Helper function to convert time string to ISO format
function convertToISO(timeStr: string): string {
  // Convert "2:00 PM" to "14:00:00"
  const [time, period] = timeStr.split(' ');
  const [hours, minutes] = time.split(':');
  let hour24 = parseInt(hours);
  
  if (period === 'PM' && hour24 !== 12) {
    hour24 += 12;
  } else if (period === 'AM' && hour24 === 12) {
    hour24 = 0;
  }
  
  return `${hour24.toString().padStart(2, '0')}:${minutes}:00`;
}

// Google authentication functions
async function getGoogleAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const jwt = await createJWT(clientEmail, privateKey);
  
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

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to get access token: ${response.status} ${errorData}`);
  }

  const data = await response.json();
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
  const cleanedPrivateKey = privateKey
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

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

serve(serve_handler);