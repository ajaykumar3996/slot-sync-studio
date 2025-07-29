import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseISO, format, addMinutes } from "https://esm.sh/date-fns@3.6.0";

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

function toCST(date: Date): Date {
  return new Date(date.toLocaleString("en-US", { timeZone: CST_TIMEZONE }));
}

function getCSTOffsetMs(date: Date): number {
  const utcDate = new Date(date.toISOString());
  const cstDate = new Date(date.toLocaleString("en-US", { timeZone: CST_TIMEZONE }));
  return utcDate.getTime() - cstDate.getTime();
}

const serve_handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { startDate, endDate } = await req.json();
    console.log('Fetching calendar slots for date range:', { startDate, endDate });

    const googleClientEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL');
    const googlePrivateKey = Deno.env.get('GOOGLE_PRIVATE_KEY');
    const googleCalendarId = Deno.env.get('GOOGLE_CALENDAR_ID') || 'itmate.ai@gmail.com';

    if (!googleClientEmail || !googlePrivateKey) {
      console.error('Missing Google Calendar credentials');
      return new Response(
        JSON.stringify({ error: 'Google Calendar API not configured' }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessToken = await getGoogleAccessToken(googleClientEmail, googlePrivateKey);
    const calendarAttempts = ['itmate.ai@gmail.com', 'primary', googleClientEmail];
    console.log('Using Google Calendar Events API for calendars:', calendarAttempts);
    
    let allEvents: any[] = [];
    let successfulCalendar = null;
    
    for (const calendarId of calendarAttempts) {
      try {
        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` +
          `timeMin=${startDate}&timeMax=${endDate}&singleEvents=true&orderBy=startTime`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          const events = data.items || [];
          console.log(`Fetched ${events.length} events from calendar ${calendarId}`);
          
          // Log event details for debugging
          events.forEach((event: any) => {
            console.log(`📅 Event: ${event.summary || 'No title'}`, {
              start: event.start?.dateTime || event.start?.date,
              end: event.end?.dateTime || event.end?.date
            });
          });
          
          if (events.length > 0) {
            allEvents = events;
            successfulCalendar = calendarId;
            break;
          }
        } else {
          const errorText = await response.text();
          console.error(`Error fetching events from ${calendarId}:`, response.status, errorText);
        }
      } catch (error) {
        console.error(`Exception with calendar ${calendarId}:`, error.message);
      }
    }
    
    if (successfulCalendar) {
      console.log(`Using calendar: ${successfulCalendar}, Total events: ${allEvents.length}`);
    } else {
      console.error('No events found in any calendar');
    }
    
    const availableSlots = generateAvailableSlots(allEvents, startDate, endDate);
    console.log(`Generated ${availableSlots.length} available slots`);

    return new Response(
      JSON.stringify({ slots: availableSlots }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

function generateAvailableSlots(calendarEvents: any[], startDate: string, endDate: string): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  
  for (let currentDate = new Date(start); currentDate <= end; currentDate.setDate(currentDate.getDate() + 1)) {
    const cstDate = toCST(currentDate);
    if (cstDate.getDay() === 0 || cstDate.getDay() === 6) continue;
    
    const cstOffsetMs = getCSTOffsetMs(currentDate);
    const dateStr = format(cstDate, 'yyyy-MM-dd');
    console.log(`\n📅 Generating slots for ${dateStr}`);
    
    // Create base 30-minute slots
    for (let hour = 8; hour < 18; hour++) {
      for (let minutes = 0; minutes < 60; minutes += 30) {
        const slotStartCST = new Date(
          cstDate.getFullYear(),
          cstDate.getMonth(),
          cstDate.getDate(),
          hour,
          minutes
        );
        
        const slotStartUTC = new Date(slotStartCST.getTime() + cstOffsetMs);
        const slotEndUTC = new Date(slotStartUTC.getTime() + 30 * 60000);
        
        const slotKey = `${hour}:${minutes.toString().padStart(2, '0')}`;
        const isAvailable30 = !hasConflict(calendarEvents, slotStartUTC, slotEndUTC, dateStr, slotKey);
        const startTimeStr = format(slotStartCST, 'h:mm a');
        const endTime30Str = format(new Date(slotStartCST.getTime() + 30 * 60000), 'h:mm a');
        
        // Add 30-minute slot
        slots.push({
          id: `${dateStr}-${slotKey}-30`,
          date: new Date(slotStartCST),
          startTime: startTimeStr,
          endTime: endTime30Str,
          isAvailable: isAvailable30,
          duration: 30
        });
        
        // Create 60-minute slot if it doesn't go past 6PM
        if (hour < 17 && minutes === 0) {
          const slotEnd60UTC = new Date(slotStartUTC.getTime() + 60 * 60000);
          const nextSlotKey = `${hour+1}:00`;
          const isAvailable60 = isAvailable30 && 
            !hasConflict(calendarEvents, new Date(slotStartUTC.getTime() + 30 * 60000), slotEnd60UTC, dateStr, nextSlotKey);
          
          if (isAvailable60) {
            const endTime60Str = format(new Date(slotStartCST.getTime() + 60 * 60000), 'h:mm a');
            slots.push({
              id: `${dateStr}-${slotKey}-60`,
              date: new Date(slotStartCST),
              startTime: startTimeStr,
              endTime: endTime60Str,
              isAvailable: true,
              duration: 60
            });
          }
        }
      }
    }
  }
  return slots;
}

function hasConflict(
  calendarEvents: any[], 
  slotStart: Date, 
  slotEnd: Date,
  dateStr: string,
  slotKey: string
): boolean {
  const slotStartTime = slotStart.getTime();
  const slotEndTime = slotEnd.getTime();
  
  // Format times for debugging
  const slotStartStr = format(slotStart, "yyyy-MM-dd HH:mm:ss");
  const slotEndStr = format(slotEnd, "yyyy-MM-dd HH:mm:ss");
  
  let conflictFound = false;
  
  const result = calendarEvents.some(event => {
    if (!event.start || !event.end) return false;
    
    const eventStart = parseISO(event.start.dateTime || event.start.date);
    const eventEnd = parseISO(event.end.dateTime || event.end.date);
    const eventStartTime = eventStart.getTime();
    const eventEndTime = eventEnd.getTime();
    
    // Format event times for debugging
    const eventStartStr = format(eventStart, "yyyy-MM-dd HH:mm:ss");
    const eventEndStr = format(eventEnd, "yyyy-MM-dd HH:mm:ss");
    
    // Log detailed information about the event
    console.log(`🔍 Checking event: ${event.summary || 'Untitled'}`);
    console.log(`   Event start: ${eventStartStr} (${eventStartTime})`);
    console.log(`   Event end:   ${eventEndStr} (${eventEndTime})`);
    console.log(`   Slot start:  ${slotStartStr} (${slotStartTime})`);
    console.log(`   Slot end:    ${slotEndStr} (${slotEndTime})`);
    
    // Check for overlap
    const hasOverlap = slotStartTime < eventEndTime && slotEndTime > eventStartTime;
    
    if (hasOverlap) {
      console.log(`🚨 CONFLICT DETECTED for ${slotKey} on ${dateStr}`);
      console.log(`   Slot: ${slotStartStr} to ${slotEndStr}`);
      console.log(`   Event: ${event.summary || 'Untitled'} (${eventStartStr} to ${eventEndStr})`);
      conflictFound = true;
      return true;
    }
    
    return false;
  });
  
  if (!conflictFound) {
    console.log(`✅ No conflict for ${slotKey} on ${dateStr} (${slotStartStr} to ${slotEndStr})`);
  }
  
  return result;
}

serve(serve_handler);