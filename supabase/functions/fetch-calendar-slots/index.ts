import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { format, addMinutes, isWithinInterval } from "https://esm.sh/date-fns@3.6.0";

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

// New proper timezone conversion functions
function toUTC(cstDate: Date): Date {
  const isoString = cstDate.toLocaleString("en-US", {
    timeZone: CST_TIMEZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  
  const [month, day, year] = isoString.split(",")[0].split("/");
  const [hour, minute, second] = isoString.split(",")[1].trim().split(":");
  
  // Create ISO string in UTC
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
}

const serve_handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { startDate, endDate } = await req.json();
    console.log('⏳ Fetching calendar slots for date range:', { 
      startDate, 
      endDate,
      startCST: new Date(startDate).toLocaleString('en-US', { timeZone: CST_TIMEZONE }),
      endCST: new Date(endDate).toLocaleString('en-US', { timeZone: CST_TIMEZONE })
    });

    const googleClientEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL');
    const googlePrivateKey = Deno.env.get('GOOGLE_PRIVATE_KEY');
    const calendarId = Deno.env.get('GOOGLE_CALENDAR_ID') || 'itmate.ai@gmail.com';

    if (!googleClientEmail || !googlePrivateKey) {
      console.error('❌ Missing Google Calendar credentials');
      return new Response(
        JSON.stringify({ error: 'Google Calendar API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessToken = await getGoogleAccessToken(googleClientEmail, googlePrivateKey);
    console.log('🔑 Obtained Google access token');

    // Fetch busy intervals from Google Calendar
    console.log('📡 Fetching busy intervals from Google Calendar...');
    const busyIntervals = await fetchBusyIntervals(accessToken, calendarId, startDate, endDate);
    console.log(`📊 Fetched ${busyIntervals.length} busy intervals`);
    
    // Generate available slots
    console.log('🔄 Generating available slots...');
    const availableSlots = generateAvailableSlots(busyIntervals, startDate, endDate);
    console.log(`✅ Generated ${availableSlots.length} time slots`);

    return new Response(
      JSON.stringify({ slots: availableSlots }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('🔥 Error in fetch-calendar-slots function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

// Fetch busy intervals using Google Calendar FreeBusy API
async function fetchBusyIntervals(
  accessToken: string,
  calendarId: string,
  startDate: string,
  endDate: string
): Promise<{ start: Date; end: Date }[]> {
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
    console.error(`❌ FreeBusy API failed: ${response.status} ${response.statusText}`, errorText);
    throw new Error(`FreeBusy API failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const calendarData = data.calendars[calendarId];
  
  if (calendarData.errors) {
    console.error('❌ Calendar errors:', calendarData.errors);
    throw new Error('Error fetching calendar data');
  }

  return (calendarData.busy || []).map((busy: any) => ({
    start: new Date(busy.start),
    end: new Date(busy.end)
  }));
}

// Generate available slots with proper timezone handling
function generateAvailableSlots(
  busyIntervals: { start: Date; end: Date }[],
  startDate: string,
  endDate: string
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  console.log(`📅 Processing dates from ${start.toISOString()} to ${end.toISOString()}`);

  // Create a date without time components for comparison
  const current = new Date(start);
  current.setHours(0, 0, 0, 0);
  
  while (current <= end) {
    const dayOfWeek = current.getDay();
    
    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log(`🚫 Skipping weekend: ${format(current, 'yyyy-MM-dd')} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayOfWeek]})`);
      current.setDate(current.getDate() + 1);
      continue;
    }

    const dateStr = format(current, 'yyyy-MM-dd');
    console.log(`\n📆 Generating slots for ${dateStr} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayOfWeek]})`);
    
    // Create base 30-minute slots
    for (let hour = WORKING_HOURS.start; hour < WORKING_HOURS.end; hour++) {
      for (let minutes = 0; minutes < 60; minutes += 30) {
        // Create CST time
        const slotStartCST = new Date(current);
        slotStartCST.setHours(hour, minutes, 0, 0);
        
        // Properly convert to UTC
        const slotStartUTC = toUTC(slotStartCST);
        const slotEndUTC = new Date(slotStartUTC.getTime() + 30 * 60000);
        
        const slotKey = `${hour}:${minutes.toString().padStart(2, '0')}`;
        const startTimeStr = format(slotStartCST, 'h:mm a');
        const endTimeStr = format(new Date(slotStartCST.getTime() + 30 * 60000), 'h:mm a');
        
        // Check for conflicts
        let isAvailable = true;
        for (const busy of busyIntervals) {
          if (slotStartUTC < busy.end && slotEndUTC > busy.start) {
            isAvailable = false;
            console.log(`🚨 CONFLICT: Slot ${slotKey} (${startTimeStr}-${endTimeStr} CST) overlaps with busy interval`);
            console.log(`   Busy: ${busy.start.toISOString()} to ${busy.end.toISOString()}`);
            break;
          }
        }
        
        // Add 30-minute slot
        slots.push({
          id: `${dateStr}-${slotKey}-30`,
          date: new Date(slotStartCST),
          startTime: startTimeStr,
          endTime: endTimeStr,
          isAvailable,
          duration: 30
        });
        
        // Create 60-minute slot if within working hours
        if (minutes === 0 && hour < WORKING_HOURS.end - 1) {
          const slotEnd60CST = new Date(slotStartCST.getTime() + 60 * 60000);
          const slotEnd60UTC = new Date(slotStartUTC.getTime() + 60 * 60000);
          
          let isAvailable60 = isAvailable;
          if (isAvailable) {
            for (const busy of busyIntervals) {
              if (slotEndUTC < busy.end && slotEnd60UTC > busy.start) {
                isAvailable60 = false;
                console.log(`🚨 CONFLICT in 60min slot: ${slotKey} (${startTimeStr}-${format(slotEnd60CST, 'h:mm a')} CST)`);
                console.log(`   Busy: ${busy.start.toISOString()} to ${busy.end.toISOString()}`);
                break;
              }
            }
          }
          
          if (isAvailable60) {
            slots.push({
              id: `${dateStr}-${slotKey}-60`,
              date: new Date(slotStartCST),
              startTime: startTimeStr,
              endTime: format(slotEnd60CST, 'h:mm a'),
              isAvailable: true,
              duration: 60
            });
          }
        }
      }
    }
    
    current.setDate(current.getDate() + 1);
  }

  return slots;
}

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

serve(serve_handler);