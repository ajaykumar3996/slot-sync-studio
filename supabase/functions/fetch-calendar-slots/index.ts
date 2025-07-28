import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TimeSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  duration: number; // 30 or 60 minutes
}

const serve_handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { startDate, endDate } = await req.json();
    
    console.log('Fetching calendar slots for date range:', { startDate, endDate });

    // Get Google Calendar API credentials from environment
    const googleClientEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL');
    const googlePrivateKey = Deno.env.get('GOOGLE_PRIVATE_KEY');
    const googleCalendarId = Deno.env.get('GOOGLE_CALENDAR_ID') || 'itmate.ai@gmail.com';

    if (!googleClientEmail || !googlePrivateKey) {
      console.error('Missing Google Calendar credentials');
      return new Response(
        JSON.stringify({ error: 'Google Calendar API not configured' }), 
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get access token for Google Calendar API
    const accessToken = await getGoogleAccessToken(googleClientEmail, googlePrivateKey);
    
    // Fetch events from Google Calendar
    const calendarEvents = await fetchGoogleCalendarEvents(
      accessToken, 
      googleCalendarId, 
      startDate, 
      endDate
    );
    
    // Fetch booking requests from database
    const { data: bookingRequests, error: bookingError } = await supabase
      .from('booking_requests')
      .select('slot_date, slot_start_time, slot_end_time, status')
      .in('status', ['pending', 'approved'])
      .gte('slot_date', startDate.split('T')[0])
      .lte('slot_date', endDate.split('T')[0]);

    if (bookingError) {
      console.error('Error fetching booking requests:', bookingError);
    }

    console.log(`Found ${bookingRequests?.length || 0} pending/approved booking requests`);
    
    // Generate available slots based on calendar events and booking requests
    const availableSlots = generateAvailableSlots(calendarEvents, bookingRequests || [], startDate, endDate);
    
    console.log(`Generated ${availableSlots.length} available slots`);

    return new Response(
      JSON.stringify({ slots: availableSlots }), 
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in fetch-calendar-slots function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

async function getGoogleAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  try {
    // Create JWT
    const jwt = await createJWT(clientEmail, privateKey);
    
    // Exchange JWT for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    return tokenData.access_token;
  } catch (error) {
    console.error('Failed to get access token:', error);
    throw new Error(`Authentication failed: ${error.message}`);
  }
}

async function createJWT(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  try {
    // Clean private key - handle all possible formats including escaped newlines
    let cleanKey = privateKey
      .replace(/-----BEGIN PRIVATE KEY-----/g, '')
      .replace(/-----END PRIVATE KEY-----/g, '')
      .replace(/\\n/g, '') // Handle escaped newlines like \n in strings
      .replace(/\r?\n|\r/g, '') // Handle actual newlines
      .replace(/\s+/g, ''); // Remove all whitespace

    console.log('Private key cleaned, length:', cleanKey.length);
    
    if (!cleanKey || cleanKey.length === 0) {
      throw new Error('Private key is empty after cleaning');
    }

    // Decode base64 private key with better error handling
    let binaryKey: string;
    try {
      binaryKey = atob(cleanKey);
    } catch (e) {
      console.error('Base64 decode error:', e);
      throw new Error('Invalid base64 format in private key');
    }

    const keyBytes = new Uint8Array(binaryKey.length);
    for (let i = 0; i < binaryKey.length; i++) {
      keyBytes[i] = binaryKey.charCodeAt(i);
    }

    // Import key
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      keyBytes.buffer,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
      },
      false,
      ['sign']
    );

    // Sign
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      new TextEncoder().encode(signingInput)
    );

    const encodedSignature = base64UrlEncode(signature);
    return `${signingInput}.${encodedSignature}`;
    
  } catch (error) {
    console.error('JWT creation error:', error);
    throw new Error(`Failed to create JWT: ${error.message}`);
  }
}

function base64UrlEncode(data: any): string {
  let base64: string;
  
  if (typeof data === 'string') {
    base64 = btoa(data);
  } else if (data instanceof ArrayBuffer) {
    base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
  } else {
    base64 = btoa(JSON.stringify(data));
  }
  
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function fetchGoogleCalendarEvents(
  token: string, 
  calendarId: string, 
  startDate: string, 
  endDate: string
) {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` +
    `timeMin=${startDate}&timeMax=${endDate}&singleEvents=true&orderBy=startTime`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Google Calendar API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.items || [];
}

function generateAvailableSlots(calendarEvents: any[], bookingRequests: any[], startDate: string, endDate: string): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Generate slots for each day between start and end date
  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    
    // Generate slots from 8 AM to 6 PM CST
    for (let hour = 8; hour < 18; hour++) {
      // Generate 30-minute slots
      for (let minutes = 0; minutes < 60; minutes += 30) {
        // Create date in CST timezone properly
        const year = date.getFullYear();
        const month = date.getMonth();
        const day = date.getDate();
        
        // Create the slot start time in CST (UTC-6/UTC-5)
        // We need to create the time in CST timezone, not local browser timezone
        const slotStart = new Date();
        slotStart.setFullYear(year, month, day);
        slotStart.setHours(hour, minutes, 0, 0);
        
        // Convert to CST by adjusting for timezone offset
        // CST is UTC-6 (standard) or UTC-5 (daylight saving)
        const cstOffset = 6 * 60; // CST is UTC-6
        const localOffset = slotStart.getTimezoneOffset();
        const cstTime = new Date(slotStart.getTime() + (localOffset - cstOffset) * 60000);
        
        // Check both 30-minute and 60-minute slots
        [30, 60].forEach(duration => {
          const slotEnd = new Date(cstTime);
          slotEnd.setMinutes(slotEnd.getMinutes() + duration);
          
          // Don't create 60-minute slots that would go past 6 PM CST
          if (duration === 60 && hour >= 17) return;
          
          const isAvailable = !hasConflict(calendarEvents, bookingRequests, date.toISOString().split('T')[0], hour, minutes, duration);
          
          // Format times in CST manually to ensure correct display
          const startHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
          const endHour = hour + Math.floor((minutes + duration) / 60);
          const endMinute = (minutes + duration) % 60;
          const displayEndHour = endHour === 0 ? 12 : endHour > 12 ? endHour - 12 : endHour;
          
          const startAmPm = hour < 12 ? 'AM' : 'PM';
          const endAmPm = endHour < 12 ? 'AM' : 'PM';
          
          const startTimeStr = `${startHour}:${minutes.toString().padStart(2, '0')} ${startAmPm}`;
          const endTimeStr = `${displayEndHour}:${endMinute.toString().padStart(2, '0')} ${endAmPm}`;
          
          slots.push({
            id: `${date.toISOString().split('T')[0]}-${hour}-${minutes}-${duration}`,
            date: date.toISOString().split('T')[0],
            startTime: startTimeStr,
            endTime: endTimeStr,
            isAvailable,
            duration
          });
        });
      }
    }
  }
  
  return slots;
}

function hasConflict(calendarEvents: any[], bookingRequests: any[], slotDate: string, slotHour: number, slotMinutes: number, duration: number): boolean {
  // Check calendar events
  const calendarConflict = calendarEvents.some(event => {
    if (!event.start || !event.end) return false;
    
    const eventStart = new Date(event.start.dateTime || event.start.date);
    const eventEnd = new Date(event.end.dateTime || event.end.date);
    
    // Create slot times for comparison
    const slotStart = new Date(`${slotDate}T${slotHour.toString().padStart(2, '0')}:${slotMinutes.toString().padStart(2, '0')}:00-06:00`);
    const slotEnd = new Date(slotStart);
    slotEnd.setMinutes(slotEnd.getMinutes() + duration);
    
    // Check if slot overlaps with any existing event
    return slotStart < eventEnd && slotEnd > eventStart;
  });

  // Check booking requests
  const bookingConflict = bookingRequests.some(booking => {
    if (booking.slot_date !== slotDate) return false;
    
    // Convert booking times to comparable format
    const bookingStartTime = convertTo24Hour(booking.slot_start_time);
    const bookingEndTime = convertTo24Hour(booking.slot_end_time);
    
    const slotStartTime = `${slotHour.toString().padStart(2, '0')}:${slotMinutes.toString().padStart(2, '0')}`;
    const slotEndHour = slotHour + Math.floor((slotMinutes + duration) / 60);
    const slotEndMinute = (slotMinutes + duration) % 60;
    const slotEndTime = `${slotEndHour.toString().padStart(2, '0')}:${slotEndMinute.toString().padStart(2, '0')}`;
    
    // Check if times overlap
    return slotStartTime < bookingEndTime && slotEndTime > bookingStartTime;
  });

  return calendarConflict || bookingConflict;
}

function convertTo24Hour(timeStr: string): string {
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

serve(serve_handler);