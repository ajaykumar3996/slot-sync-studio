import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { parseISO, format, addMinutes, isWithinInterval, startOfDay } from "https://esm.sh/date-fns@3.6.0";

// Security: Allowed origins for CORS
const allowedOrigins = [
  'https://517316ae-ebef-4cd9-90ed-2ae88547d989.sandbox.lovable.dev',
  'https://localhost:3000',
  'http://localhost:3000',
  process.env.SITE_URL,
].filter(Boolean);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Will be set dynamically
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

const DEFAULT_TIMEZONE = "America/Chicago";
const WORKING_HOURS = { start: 8, end: 18 }; // 8 AM - 6 PM in calendar owner's timezone

function logTime(label: string, date: Date, timezone: string) {
  console.log(`${label}: ${date.toISOString()} (UTC) / ${date.toLocaleString('en-US', { timeZone: timezone })} (${timezone})`);
}

const serve_handler = async (req: Request): Promise<Response> => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse and validate request
    const requestBody = await req.json();
    const { startDate, endDate, fetchEvents, timezone } = requestBody;
    
    // Input validation
    if (!startDate || !endDate) {
      return new Response(JSON.stringify({ error: 'Missing required fields: startDate, endDate' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userTimezone = timezone || DEFAULT_TIMEZONE;
    console.log('⏳ Fetching calendar data for date range:', { startDate, endDate, fetchEvents, timezone: userTimezone });

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
    const events = await fetchCalendarEvents(accessToken, calendarId, startDate, endDate, userTimezone);
    console.log(`📊 Fetched ${events.length} events`);
    
    // Log all events with detailed information
    events.forEach((event, index) => {
      console.log(`📅 Event #${index + 1}: "${event.summary || 'No title'}"`);
      const eventStart = new Date(event.start.dateTime || event.start.date);
      const eventEnd = new Date(event.end.dateTime || event.end.date);
      logTime('  Start', eventStart, userTimezone);
      logTime('  End  ', eventEnd, userTimezone);
      console.log(`  Duration: ${(eventEnd.getTime() - eventStart.getTime()) / 60000} minutes`);
      console.log(`  All-day: ${!event.start.dateTime ? 'Yes' : 'No'}`);
    });

    // If fetchEvents is true, return the events for calendar view
    if (fetchEvents) {
      console.log('📅 Preparing events for calendar view...');
      // Security: Sanitize event data to prevent sensitive information leakage
      const dayEvents = events.map(event => {
        const startTime = new Date(event.start.dateTime || event.start.date);
        const endTime = new Date(event.end.dateTime || event.end.date);
        
        // Convert to user's timezone for display
        const startTZ = new Date(startTime.toLocaleString("en-US", { timeZone: userTimezone }));
        const endTZ = new Date(endTime.toLocaleString("en-US", { timeZone: userTimezone }));
        
        return {
          id: event.id.split('_')[0] || event.id, // Sanitize IDs
          title: "Busy", // Hide actual event titles for privacy
          startTime: format(startTZ, 'HH:mm'),
          endTime: format(endTZ, 'HH:mm'),
          startHour: startTZ.getHours(),
          startMinute: startTZ.getMinutes(),
          endHour: endTZ.getHours(),
          endMinute: endTZ.getMinutes()
        };
      });

      console.log(`✅ Returning ${dayEvents.length} events for calendar view`);
      return new Response(
        JSON.stringify({ events: dayEvents }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate available slots
    console.log('🔄 Generating available slots...');
    const availableSlots = generateAvailableSlotsWithEvents(events, startDate, endDate, userTimezone);
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
  endDate: string,
  timezone: string
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
    timeZone: timezone
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
  endDate: string,
  timezone: string
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  
  console.log(`📅 Processing dates from ${start.toISOString()} to ${end.toISOString()}`);

  for (let currentDate = new Date(start); currentDate <= end; currentDate.setDate(currentDate.getDate() + 1)) {
    const tzDate = new Date(currentDate.toLocaleString("en-US", { timeZone: timezone }));
    
    // Skip weekends
    if (tzDate.getDay() === 0 || tzDate.getDay() === 6) {
      console.log(`🚫 Skipping weekend: ${format(tzDate, 'yyyy-MM-dd')} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][tzDate.getDay()]})`);
      continue;
    }

    const dateStr = format(tzDate, 'yyyy-MM-dd');
    console.log(`\n📆 Generating slots for ${dateStr} in ${timezone} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][tzDate.getDay()]})`);
    

    // Create base 30-minute slots
    for (let hour = WORKING_HOURS.start; hour < WORKING_HOURS.end; hour++) {
      for (let minutes = 0; minutes < 60; minutes += 30) {
        const slotStartTZ = new Date(
          tzDate.getFullYear(),
          tzDate.getMonth(),
          tzDate.getDate(),
          hour,
          minutes
        );
        
        const slotEndTZ = new Date(slotStartTZ.getTime() + 30 * 60000);
        const slotKey = `${hour}:${minutes.toString().padStart(2, '0')}`;
        
        console.log(`\n🔍 Checking slot: ${slotKey} on ${dateStr}`);
        console.log(`🕒 Slot times (${timezone}): ${format(slotStartTZ, 'h:mm a')} - ${format(slotEndTZ, 'h:mm a')}`);
        
        console.log(`📊 Total events to check: ${events.length}`);
        
        // Check for conflicts with Google Calendar events
        let isAvailable = true;
        for (const [eventIndex, event] of events.entries()) {
          const eventStart = new Date(event.start.dateTime || event.start.date);
          const eventEnd = new Date(event.end.dateTime || event.end.date);
          
          // Convert events to user's timezone for comparison
          const eventStartTZ = new Date(eventStart.toLocaleString("en-US", { timeZone: timezone }));
          const eventEndTZ = new Date(eventEnd.toLocaleString("en-US", { timeZone: timezone }));
          
          console.log(`\n📅 Event #${eventIndex + 1}: "${event.summary || 'No title'}"`);
          console.log(`   📍 Event start (${timezone}): ${eventStart.toLocaleString('en-US', { timeZone: timezone })}`);
          console.log(`   📍 Event end (${timezone}):   ${eventEnd.toLocaleString('en-US', { timeZone: timezone })}`);
          
          // Check if slot overlaps with event
          const overlap = slotStartTZ < eventEnd && slotEndTZ > eventStart;
          
          console.log(`\n🔄 OVERLAP CALCULATION:`);
          console.log(`   ❓ Is slotStart < eventEnd? ${slotStartTZ.toISOString()} < ${eventEnd.toISOString()} = ${slotStartTZ < eventEnd}`);
          console.log(`   ❓ Is slotEnd > eventStart? ${slotEndTZ.toISOString()} > ${eventStart.toISOString()} = ${slotEndTZ > eventStart}`);
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
        
        const startTimeStr = format(slotStartTZ, 'h:mm a');
        const endTimeStr = format(slotEndTZ, 'h:mm a');
        
        // Add 30-minute slot
        slots.push({
          id: `${dateStr}-${slotKey}-30`,
          date: new Date(slotStartTZ),
          startTime: startTimeStr,
          endTime: endTimeStr,
          isAvailable,
          duration: 30
        });
        
        console.log(`  ${isAvailable ? '✅ AVAILABLE' : '❌ BUSY'} - 30min slot`);
        
        // Create 60-minute slot if it doesn't go past 6PM
        if (minutes === 0 && hour < WORKING_HOURS.end - 1) {
          const slotEnd60TZ = new Date(slotStartTZ.getTime() + 60 * 60000);
          
          console.log(`  ➕ Checking 60min extension for ${slotKey}`);
          
          let isAvailable60 = isAvailable;
          
          // Check the second half of the 60min slot if first half is available
          if (isAvailable) {
            for (const [eventIndex, event] of events.entries()) {
              const eventStart = new Date(event.start.dateTime || event.start.date);
              const eventEnd = new Date(event.end.dateTime || event.end.date);
              
              // Check the full 60min slot against events
              const overlap = slotStartTZ < eventEnd && slotEnd60TZ > eventStart;
              
              if (overlap) {
                isAvailable60 = false;
                console.log(`    🚨 CONFLICT in 60min slot with event: "${event.summary || 'No title'}"`);
                break;
              }
            }
          }
          
          if (isAvailable60) {
            const endTime60Str = format(slotEnd60TZ, 'h:mm a');
            
            slots.push({
              id: `${dateStr}-${slotKey}-60`,
              date: new Date(slotStartTZ),
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