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

    // Fetch events from Google Calendar
    console.log('📡 Fetching events from Google Calendar...');
    const events = await fetchCalendarEvents(accessToken, calendarId, startDate, endDate);
    console.log(`📊 Fetched ${events.length} events`);
    
    // Log all events with detailed information
    events.forEach((event, index) => {
      console.log(`📅 Event #${index + 1}: "${event.summary || 'No title'}"`);
      const eventStart = new Date(event.start.dateTime || event.start.date);
      const eventEnd = new Date(event.end.dateTime || event.end.date);
      logTime('  Start', eventStart);
      logTime('  End  ', eventEnd);
      console.log(`  Duration: ${(eventEnd.getTime() - eventStart.getTime()) / 60000} minutes`);
      console.log(`  All-day: ${!event.start.dateTime ? 'Yes' : 'No'}`);
    });

    // Generate available slots
    console.log('🔄 Generating available slots...');
    const availableSlots = generateAvailableSlotsWithEvents(events, startDate, endDate);
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

// Fetch events from Google Calendar Events API
async function fetchCalendarEvents(
  accessToken: string,
  calendarId: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  console.log('🌐 Calling Events API with:', {
    timeMin: startDate,
    timeMax: endDate,
    calendarId
  });

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const params = new URLSearchParams({
    timeMin: startDate,
    timeMax: endDate,
    singleEvents: 'true',
    orderBy: 'startTime',
    timeZone: CST_TIMEZONE
  });

  const response = await fetch(`${url}?${params}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ Events API failed: ${response.status} ${response.statusText}`, errorText);
    throw new Error(`Events API failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  console.log(`✅ Events API response: Found ${data.items?.length || 0} events`);
  
  return data.items || [];
}

// Generate available slots with detailed logging using events
function generateAvailableSlotsWithEvents(
  events: any[],
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
        
        console.log(`\n🔍 DEBUGGING SLOT CONFLICT DETECTION:`);
        console.log(`📅 Checking slot: ${slotKey} on ${dateStr}`);
        console.log(`🕒 Slot times (CST): ${format(slotStartCST, 'h:mm a')} - ${format(slotEndCST, 'h:mm a')}`);
        console.log(`🌍 Slot times (UTC): ${slotStartUTC.toISOString()} - ${slotEndUTC.toISOString()}`);
        console.log(`📊 Total events to check: ${events.length}`);
        
        // Check for conflicts with Google Calendar events
        let isAvailable = true;
        for (const [eventIndex, event] of events.entries()) {
          const eventStart = new Date(event.start.dateTime || event.start.date);
          const eventEnd = new Date(event.end.dateTime || event.end.date);
          
          console.log(`\n📅 Event #${eventIndex + 1}: "${event.summary || 'No title'}"`);
          console.log(`   📍 Event start (UTC): ${eventStart.toISOString()}`);
          console.log(`   📍 Event end (UTC):   ${eventEnd.toISOString()}`);
          console.log(`   📍 Event start (CST): ${eventStart.toLocaleString('en-US', { timeZone: CST_TIMEZONE })}`);
          console.log(`   📍 Event end (CST):   ${eventEnd.toLocaleString('en-US', { timeZone: CST_TIMEZONE })}`);
          
          // Check if slot overlaps with event
          const overlap = slotStartUTC < eventEnd && slotEndUTC > eventStart;
          
          console.log(`\n🔄 OVERLAP CALCULATION:`);
          console.log(`   ❓ Is slotStart < eventEnd? ${slotStartUTC.toISOString()} < ${eventEnd.toISOString()} = ${slotStartUTC < eventEnd}`);
          console.log(`   ❓ Is slotEnd > eventStart? ${slotEndUTC.toISOString()} > ${eventStart.toISOString()} = ${slotEndUTC > eventStart}`);
          console.log(`   ❓ Both conditions true (overlap)? ${overlap}`);
          
          if (overlap) {
            isAvailable = false;
            console.log(`   🚨 CONFLICT DETECTED! Slot marked as UNAVAILABLE due to event: "${event.summary || 'No title'}"`);
            console.log(`   💡 Conflict reason: Slot overlaps with this event`);
            break;
          } else {
            console.log(`   ✅ No conflict with this event`);
          }
        }
        
        console.log(`\n📊 FINAL RESULT for slot ${slotKey}: ${isAvailable ? '✅ AVAILABLE' : '❌ BLOCKED'}`);
        if (!isAvailable) {
          console.log(`❌ This slot will appear as BLOCKED in the interface`);
        } else {
          console.log(`✅ This slot will appear as AVAILABLE with Book button`);
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
          
          let isAvailable60 = isAvailable;
          
          // Check the second half of the 60min slot if first half is available
          if (isAvailable) {
            for (const [eventIndex, event] of events.entries()) {
              const eventStart = new Date(event.start.dateTime || event.start.date);
              const eventEnd = new Date(event.end.dateTime || event.end.date);
              
              // Check only the second half (30-60min) of the slot
              const secondHalfStart = new Date(slotStartUTC.getTime() + 30 * 60000);
              const overlap = secondHalfStart < eventEnd && slotEnd60UTC > eventStart;
              
              if (overlap) {
                isAvailable60 = false;
                console.log(`    🚨 CONFLICT in second half with event: "${event.summary || 'No title'}"`);
                break;
              }
            }
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