import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { parseISO, format, addMinutes, isWithinInterval, startOfDay } from "https://esm.sh/date-fns@3.6.0";

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

function toCST(date: Date): Date {
  return new Date(date.toLocaleString("en-US", { timeZone: CST_TIMEZONE }));
}

function getCSTOffsetMs(date: Date): number {
  const utcDate = new Date(date.toISOString());
  const cstDate = new Date(date.toLocaleString("en-US", { timeZone: CST_TIMEZONE }));
  return utcDate.getTime() - cstDate.getTime();
}

function logTime(label: string, date: Date) {
  console.log(`${label}: ${date.toISOString()} (UTC) / ${date.toLocaleString('en-US', { timeZone: CST_TIMEZONE })} (CST)`);
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
    
    // Log all busy intervals
    busyIntervals.forEach((busy, index) => {
      console.log(`📅 Busy Interval #${index + 1}:`);
      logTime('  Start', busy.start);
      logTime('  End  ', busy.end);
      console.log(`  Duration: ${(busy.end.getTime() - busy.start.getTime()) / 60000} minutes`);
    });

    // Generate available slots
    console.log('🔄 Generating available slots...');
    const availableSlots = generateAvailableSlotsWithLogging(busyIntervals, startDate, endDate);
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
  console.log('🌐 Calling FreeBusy API with:', {
    timeMin: startDate,
    timeMax: endDate,
    calendarId
  });

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

// Generate available slots with detailed logging
function generateAvailableSlotsWithLogging(
  busyIntervals: { start: Date; end: Date }[],
  startDate: string,
  endDate: string
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  
  console.log(`📅 Processing dates from ${start.toISOString()} to ${end.toISOString()}`);

  for (let currentDate = new Date(start); currentDate <= end; currentDate.setDate(currentDate.getDate() + 1)) {
    const cstDate = toCST(currentDate);
    
    // Skip weekends
    if (cstDate.getDay() === 0 || cstDate.getDay() === 6) {
      console.log(`🚫 Skipping weekend: ${format(cstDate, 'yyyy-MM-dd')} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][cstDate.getDay()]})`);
      continue;
    }

    const dateStr = format(cstDate, 'yyyy-MM-dd');
    console.log(`\n📆 Generating slots for ${dateStr} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][cstDate.getDay()]})`);
    
    // Get CST offset for this date (for UTC conversion)
    const cstOffsetMs = getCSTOffsetMs(currentDate);
    console.log(`⏱️ CST offset: ${cstOffsetMs / 60000} minutes`);

    // Create base 30-minute slots
    for (let hour = WORKING_HOURS.start; hour < WORKING_HOURS.end; hour++) {
      for (let minutes = 0; minutes < 60; minutes += 30) {
        const slotStartCST = new Date(
          cstDate.getFullYear(),
          cstDate.getMonth(),
          cstDate.getDate(),
          hour,
          minutes
        );
        
        const slotEndCST = new Date(slotStartCST.getTime() + 30 * 60000);
        const slotKey = `${hour}:${minutes.toString().padStart(2, '0')}`;
        
        // Convert to UTC for comparison
        const slotStartUTC = new Date(slotStartCST.getTime() + cstOffsetMs);
        const slotEndUTC = new Date(slotStartUTC.getTime() + 30 * 60000);
        
        console.log(`\n🕒 Slot: ${slotKey} (${format(slotStartCST, 'h:mm a')} - ${format(slotEndCST, 'h:mm a')} CST)`);
        logTime('  CST Start', slotStartCST);
        logTime('  CST End  ', slotEndCST);
        logTime('  UTC Start', slotStartUTC);
        logTime('  UTC End  ', slotEndUTC);
        
        // Check for conflicts
        let isAvailable = true;
        let conflictFound = false;
        
        for (const [index, busy] of busyIntervals.entries()) {
          const busyStart = busy.start;
          const busyEnd = busy.end;
          
          // Check if slot overlaps with busy interval
          const overlap = slotStartUTC < busyEnd && slotEndUTC > busyStart;
          
          console.log(`  🔍 Checking against busy interval #${index + 1}:`);
          logTime('    Busy Start', busyStart);
          logTime('    Busy End  ', busyEnd);
          console.log(`    Overlap? ${overlap ? 'YES 🚫' : 'No ✅'}`);
          
          if (overlap) {
            isAvailable = false;
            conflictFound = true;
            console.log(`  🚨 CONFLICT DETECTED with event #${index + 1}`);
            break; // No need to check other intervals
          }
        }
        
        if (!conflictFound) {
          console.log('  ✅ No conflicts found');
        }
        
        const startTimeStr = format(slotStartCST, 'h:mm a');
        const endTimeStr = format(slotEndCST, 'h:mm a');
        
        // Add 30-minute slot
        slots.push({
          id: `${dateStr}-${slotKey}-30`,
          date: new Date(slotStartCST),
          startTime: startTimeStr,
          endTime: endTimeStr,
          isAvailable,
          duration: 30
        });
        
        console.log(`  ${isAvailable ? '✅ AVAILABLE' : '❌ BUSY'} - 30min slot`);
        
        // Create 60-minute slot if it doesn't go past 6PM
        if (minutes === 0 && hour < WORKING_HOURS.end - 1) {
          const slotEnd60CST = new Date(slotStartCST.getTime() + 60 * 60000);
          const slotEnd60UTC = new Date(slotStartUTC.getTime() + 60 * 60000);
          
          console.log(`  ➕ Checking 60min extension for ${slotKey}`);
          logTime('    60min End UTC', slotEnd60UTC);
          
          let isAvailable60 = isAvailable;
          let conflict60Found = false;
          
          // Check the second half of the 60min slot
          if (isAvailable) {
            for (const [index, busy] of busyIntervals.entries()) {
              const busyStart = busy.start;
              const busyEnd = busy.end;
              
              // Check only the second half (30-60min) of the slot
              const secondHalfStart = new Date(slotStartUTC.getTime() + 30 * 60000);
              const overlap = secondHalfStart < busyEnd && slotEnd60UTC > busyStart;
              
              if (overlap) {
                isAvailable60 = false;
                conflict60Found = true;
                console.log(`    🚨 CONFLICT in second half with event #${index + 1}`);
                break;
              }
            }
          }
          
          if (!conflict60Found && isAvailable) {
            console.log('    ✅ No conflicts in second half');
          }
          
          if (isAvailable60) {
            const endTime60Str = format(slotEnd60CST, 'h:mm a');
            
            slots.push({
              id: `${dateStr}-${slotKey}-60`,
              date: new Date(slotStartCST),
              startTime: startTimeStr,
              endTime: endTime60Str,
              isAvailable: true,
              duration: 60
            });
            
            console.log(`  ✅ ADDED 60min slot`);
          } else {
            console.log(`  ❌ Skipping 60min slot due to conflict`);
          }
        }
      }
    }
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