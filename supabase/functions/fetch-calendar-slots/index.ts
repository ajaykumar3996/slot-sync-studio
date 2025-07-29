import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { parseISO, format, addMinutes, isWithinInterval } from "https://esm.sh/date-fns@3.6.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TimeSlot {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  duration: number;
}

const CST_TIMEZONE = "America/Chicago";
const WORKING_HOURS = { start: 8, end: 18 }; // 8 AM - 6 PM CST

async function getGoogleAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  try {
    const jwt = await createJWT(clientEmail, privateKey);
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${tokenResponse.status} ${errorText}`);
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
  const header = { alg: 'RS256', typ: 'JWT' };
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

  let cleanKey = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\r?\n|\r/g, '')
    .replace(/\s+/g, '');

  if (!cleanKey || cleanKey.length === 0) {
    throw new Error('Private key is empty after cleaning');
  }

  let binaryKey: string;
  try {
    binaryKey = atob(cleanKey);
  } catch (e) {
    throw new Error('Invalid base64 format in private key');
  }

  const keyBytes = new Uint8Array(binaryKey.length);
  for (let i = 0; i < binaryKey.length; i++) {
    keyBytes[i] = binaryKey.charCodeAt(i);
  }

  const cryptoKey = await crypto.subtle.importKey('pkcs8', keyBytes.buffer, {
    name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);

  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
  const encodedSignature = base64UrlEncode(signature);
  return `${signingInput}.${encodedSignature}`;
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
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const serve_handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { startDate, endDate } = await req.json();
    console.log('Fetching calendar availability for date range:', { startDate, endDate });

    const googleClientEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL');
    const googlePrivateKey = Deno.env.get('GOOGLE_PRIVATE_KEY');
    const calendarId = Deno.env.get('GOOGLE_CALENDAR_ID') || 'itmate.ai@gmail.com';

    if (!googleClientEmail || !googlePrivateKey) {
      console.error('Missing Google Calendar credentials');
      return new Response(
        JSON.stringify({ error: 'Google Calendar API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessToken = await getGoogleAccessToken(googleClientEmail, googlePrivateKey);
    console.log('Obtained Google access token');

    // Step 1: Get true availability from Google Calendar
    const availability = await fetchCalendarAvailability(accessToken, calendarId, startDate, endDate);
    console.log(`Fetched availability for ${availability.length} days`);

    // Step 2: Generate slots directly from Google's availability data
    const timeSlots = generateTimeSlotsFromAvailability(availability);
    console.log(`Generated ${timeSlots.length} time slots`);

    return new Response(
      JSON.stringify({ slots: timeSlots }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fetch-calendar-slots function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

// Fetch true availability from Google Calendar API
async function fetchCalendarAvailability(
  accessToken: string,
  calendarId: string,
  startDate: string,
  endDate: string
): Promise<{ date: string; availableSlots: { start: string; end: string }[] }[]> {
  const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      timeMin: startDate,
      timeMax: endDate,
      items: [{ id: calendarId }],
      timeZone: CST_TIMEZONE
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`FreeBusy API failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const calendarData = data.calendars[calendarId];
  
  if (calendarData.errors) {
    console.error('Calendar errors:', calendarData.errors);
    throw new Error('Error fetching calendar data');
  }

  // Extract availability from busy intervals
  const availability: { date: string; availableSlots: { start: string; end: string }[] }[] = [];
  const busyIntervals = calendarData.busy || [];
  
  // Group by date
  for (const busy of busyIntervals) {
    const startDate = new Date(busy.start).toISOString().split('T')[0];
    const endDate = new Date(busy.end).toISOString().split('T')[0];
    
    // Add to existing date or create new entry
    let dateEntry = availability.find(entry => entry.date === startDate);
    if (!dateEntry) {
      dateEntry = { date: startDate, availableSlots: [] };
      availability.push(dateEntry);
    }
    
    dateEntry.availableSlots.push({
      start: new Date(busy.start).toISOString(),
      end: new Date(busy.end).toISOString()
    });
  }

  return availability;
}

// Generate time slots directly from Google's availability data
function generateTimeSlotsFromAvailability(
  availability: { date: string; availableSlots: { start: string; end: string }[] }[]
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  
  for (const day of availability) {
    const date = new Date(day.date);
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    
    // Generate 30-minute slots for the entire working day
    for (let hour = WORKING_HOURS.start; hour < WORKING_HOURS.end; hour++) {
      for (let minutes = 0; minutes < 60; minutes += 30) {
        const slotStart = new Date(date);
        slotStart.setHours(hour, minutes, 0, 0);
        
        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotStart.getMinutes() + 30);
        
        // Check if this slot is available
        const isAvailable = !day.availableSlots.some(busy => {
          const busyStart = new Date(busy.start);
          const busyEnd = new Date(busy.end);
          return slotStart < busyEnd && slotEnd > busyStart;
        });
        
        const startTimeStr = format(slotStart, 'h:mm a');
        const endTimeStr = format(slotEnd, 'h:mm a');
        
        slots.push({
          id: `${day.date}-${hour}:${minutes.toString().padStart(2, '0')}-30`,
          date: new Date(date),
          startTime: startTimeStr,
          endTime: endTimeStr,
          isAvailable,
          duration: 30
        });
      }
    }
  }
  
  return slots;
}

serve(serve_handler);