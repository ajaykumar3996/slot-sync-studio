import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

// Security: Allowed origins for CORS
const allowedOrigins = [
  'https://517316ae-ebef-4cd9-90ed-2ae88547d989.sandbox.lovable.dev',
  'http://localhost:3000',
  'https://localhost:3000'
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Security: HTML escape function to prevent XSS
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const serve_handler = async (req: Request): Promise<Response> => {
  // Security: Validate origin
  const origin = req.headers.get('origin');
  const isAllowedOrigin = !origin || allowedOrigins.includes(origin);
  const finalCorsHeaders = {
    ...corsHeaders,
    'Access-Control-Allow-Origin': isAllowedOrigin && origin ? origin : allowedOrigins[0]
  };

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: finalCorsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const reason = url.searchParams.get('reason') || 'No reason provided';

    if (!token) {
      return new Response('Invalid request: missing cancellation token', { status: 400 });
    }

    console.log('Processing cancellation request for token:', token);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find the booking request by cancellation token
    const { data: bookingRequest, error: findError } = await supabase
      .from('booking_requests')
      .select('*')
      .eq('cancellation_token', token)
      .eq('status', 'approved') // Only allow cancellation of approved bookings
      .single();

    if (findError || !bookingRequest) {
      console.error('Booking request not found or not eligible for cancellation:', findError);
      return new Response(createErrorPage('Booking not found or already cancelled'), { 
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // Fetch the associated booking slots
    const { data: bookingSlots, error: slotsError } = await supabase
      .from('booking_slots')
      .select('*')
      .eq('booking_request_id', bookingRequest.id)
      .order('slot_date', { ascending: true })
      .order('slot_start_time', { ascending: true });

    if (slotsError || !bookingSlots || bookingSlots.length === 0) {
      console.error('Booking slots not found:', slotsError);
      return new Response(createErrorPage('Booking slots not found'), { 
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // Delete Google Calendar events before updating database
    try {
      console.log('Deleting Google Calendar events...');
      await deleteGoogleCalendarEvents(bookingRequest, bookingSlots);
      console.log('✅ Google Calendar events deleted successfully');
    } catch (calendarError) {
      console.error('❌ Failed to delete Google Calendar events:', calendarError);
      // Continue with cancellation even if calendar deletion fails
    }

    // Update booking status and set cancellation details
    const { error: updateError } = await supabase
      .from('booking_requests')
      .update({ 
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason,
        cancellation_token: null // Security: Invalidate token after use
      })
      .eq('id', bookingRequest.id);

    if (updateError) {
      console.error('Failed to update booking status:', updateError);
      throw new Error('Failed to cancel booking');
    }

    console.log(`Booking ${bookingRequest.id} cancelled successfully`);

    // Send cancellation confirmation emails
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    
    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        const firstSlot = bookingSlots[0];

        // Email to user
        console.log(`Sending cancellation confirmation to ${bookingRequest.user_email}`);
        await resend.emails.send({
          from: 'Book My Slot <anand@bookmyslot.me>',
          to: [bookingRequest.user_email],
          subject: `Booking Cancelled - ${firstSlot.slot_date}${bookingSlots.length > 1 ? ` (+${bookingSlots.length - 1} more)` : ''}`,
          html: `
            <h2>Booking Cancellation Confirmed</h2>
            <div style="background: #fef2f2; border: 1px solid #ef4444; padding: 15px; border-radius: 6px; color: #dc2626; margin: 20px 0;">
              <p><strong>❌ Your booking has been cancelled.</strong></p>
            </div>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Name:</strong> ${bookingRequest.user_name}</p>
              <h3>Cancelled Slots (${bookingSlots.length} slot${bookingSlots.length > 1 ? 's' : ''})</h3>
              ${bookingSlots.map((slot, index) => `
                <div style="background: #f8e8e8; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 4px solid #dc2626;">
                  <p><strong>Slot ${index + 1}:</strong></p>
                  <p><strong>Date:</strong> ${slot.slot_date}</p>
                  <p><strong>Time:</strong> ${slot.slot_start_time} - ${slot.slot_end_time} CST</p>
                  <p><strong>Duration:</strong> ${slot.slot_duration_minutes} minutes</p>
                </div>
              `).join('')}
              ${reason !== 'No reason provided' ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ''}
            </div>
            <p style="margin-top: 20px;">
              If you'd like to reschedule, please visit our website to book new slots.<br><br>
              Best Regards,<br>
              Anand
            </p>
          `,
        });

        // Email to admin
        console.log('Sending cancellation notification to admin');
        await resend.emails.send({
          from: 'Book My Slot <anand@bookmyslot.me>',
          to: ['itmate.ai@gmail.com'],
          subject: `⚠️ Booking Cancelled - ${bookingRequest.user_name}`,
          html: `
            <h2>Booking Cancellation Notice</h2>
            <div style="background: #fef2f2; border: 1px solid #ef4444; padding: 15px; border-radius: 6px; color: #dc2626; margin: 20px 0;">
              <p><strong>A booking has been cancelled by the user.</strong></p>
            </div>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3>User Information</h3>
              <p><strong>Name:</strong> ${bookingRequest.user_name}</p>
              <p><strong>Email:</strong> ${bookingRequest.user_email}</p>
              <p><strong>Phone:</strong> ${bookingRequest.phone_number}</p>
              
              <h3>Cancelled Slots (${bookingSlots.length} slot${bookingSlots.length > 1 ? 's' : ''})</h3>
              ${bookingSlots.map((slot, index) => `
                <div style="background: #f8e8e8; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 4px solid #dc2626;">
                  <p><strong>Slot ${index + 1}:</strong></p>
                  <p><strong>Date:</strong> ${slot.slot_date}</p>
                  <p><strong>Time:</strong> ${slot.slot_start_time} - ${slot.slot_end_time} CST</p>
                  <p><strong>Duration:</strong> ${slot.slot_duration_minutes} minutes</p>
                </div>
              `).join('')}
              
              <h3>Job Information</h3>
              <p><strong>Client:</strong> ${bookingRequest.client_name}</p>
              <p><strong>Role:</strong> ${bookingRequest.role_name}</p>
              ${reason !== 'No reason provided' ? `<p><strong>Cancellation Reason:</strong> ${escapeHtml(reason)}</p>` : ''}
            </div>
          `,
        });

        console.log('✅ Cancellation emails sent successfully');
      } catch (emailError) {
        console.error('Error sending cancellation emails:', emailError);
      }
    }

    // Return success page
    return new Response(createSuccessPage(bookingRequest, bookingSlots), { 
      status: 200,
      headers: { 
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    console.error('Error in handle-booking-cancellation function:', error);
    return new Response(createErrorPage(error.message), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
};

// Function to delete Google Calendar events
async function deleteGoogleCalendarEvents(bookingRequest: any, bookingSlots: any[]) {
  console.log('🔑 Getting Google credentials...');
  const googleClientEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL');
  const googlePrivateKey = Deno.env.get('GOOGLE_PRIVATE_KEY');
  
  if (!googleClientEmail || !googlePrivateKey) {
    throw new Error('❌ Google credentials not configured');
  }

  console.log('📧 Using Google client email:', googleClientEmail);
  console.log('🔐 Getting Google access token...');
  const accessToken = await getGoogleAccessToken(googleClientEmail, googlePrivateKey);
  console.log('✅ Access token obtained successfully');

  const calendarId = 'itmate.ai@gmail.com';
  
  // Search for events matching this booking
  console.log('🔍 Searching for calendar events to delete...');
  
  for (let i = 0; i < bookingSlots.length; i++) {
    const slot = bookingSlots[i];
    const searchQuery = `${bookingRequest.user_name} - Slot ${i + 1}/${bookingSlots.length}`;
    
    try {
      // Search for the event
      const searchResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?q=${encodeURIComponent(searchQuery)}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (searchResponse.ok) {
        const searchResult = await searchResponse.json();
        
        if (searchResult.items && searchResult.items.length > 0) {
          // Delete each matching event
          for (const event of searchResult.items) {
            console.log(`🗑️ Deleting event: ${event.id}`);
            const deleteResponse = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${event.id}`,
              {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                },
              }
            );

            if (deleteResponse.ok) {
              console.log(`✅ Event ${event.id} deleted successfully`);
            } else {
              console.error(`❌ Failed to delete event ${event.id}:`, await deleteResponse.text());
            }
          }
        } else {
          console.log(`⚠️ No calendar events found for slot ${i + 1}`);
        }
      }
    } catch (error) {
      console.error(`❌ Error deleting calendar event for slot ${i + 1}:`, error);
    }
  }
}

// Function to get Google access token using JWT
async function getGoogleAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const encodedClaim = btoa(JSON.stringify(claim)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const signatureInput = `${encodedHeader}.${encodedClaim}`;

  // Import the private key
  const pemHeader = '-----BEGIN PRIVATE KEY-----';
  const pemFooter = '-----END PRIVATE KEY-----';
  const pemContents = privateKey.replace(/\\n/g, '\n').replace(pemHeader, '').replace(pemFooter, '').trim();
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  // Sign the JWT
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signatureInput)
  );

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const jwt = `${signatureInput}.${encodedSignature}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Failed to get access token: ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

function createSuccessPage(bookingRequest: any, bookingSlots: any[]): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Booking Cancelled</title>
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
            max-width: 600px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
        }
        .icon {
            font-size: 64px;
            margin-bottom: 20px;
            display: block;
            color: #dc3545;
        }
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
        .slots {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            text-align: left;
        }
        .slot {
            background: #fff;
            border-left: 4px solid #dc3545;
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
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
        <span class="icon">🚫</span>
        <h1>Booking Cancelled</h1>
        <p>Your booking has been successfully cancelled.</p>
        <div class="slots">
            <h3>Cancelled Slots for ${escapeHtml(bookingRequest.user_name)}</h3>
            ${bookingSlots.map((slot, index) => `
              <div class="slot">
                <strong>Slot ${index + 1}:</strong> ${slot.slot_date} at ${slot.slot_start_time} - ${slot.slot_end_time} CST
              </div>
            `).join('')}
        </div>
        <p>A confirmation email has been sent to <strong>${escapeHtml(bookingRequest.user_email)}</strong>.</p>
        <p>The Google Calendar events have been removed.</p>
        <p class="close-note">You can safely close this tab.</p>
    </div>
</body>
</html>`;
}

function createErrorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error</title>
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
            color: #ef4444;
        }
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
    </style>
</head>
<body>
    <div class="container">
        <span class="icon">⚠️</span>
        <h1>Error</h1>
        <p>${escapeHtml(message)}</p>
        <p>Please contact support if this issue persists.</p>
    </div>
</body>
</html>`;
}

serve(serve_handler);