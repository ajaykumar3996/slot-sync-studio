import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Get access token for Google Calendar API
    const accessToken = await getGoogleAccessToken(googleClientEmail, googlePrivateKey);
    
    // Use the calendar that actually has events (based on logs: itmate.ai@gmail.com)
    const calendarAttempts = [
      'itmate.ai@gmail.com',
      'primary', 
      googleClientEmail
    ];
    
    console.log('🎯 Fetching events from calendars:', calendarAttempts);
    
    let allEvents: any[] = [];
    let successfulCalendar = null;
    
    // Try each calendar until we find one that works
    for (const calendarId of calendarAttempts) {
      try {
        console.log(`📍 Trying calendar: ${calendarId}`);
        
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
          console.log(`✅ Found ${events.length} events in calendar: ${calendarId}`);
          
          if (events.length > 0) {
            allEvents = events;
            successfulCalendar = calendarId;
            console.log('📅 Events found:', events.map(event => ({
              summary: event.summary,
              start: event.start,
              end: event.end
            })));
            break; // Use the first calendar that has events
          }
        }
      } catch (error) {
        console.error(`💥 Exception with calendar ${calendarId}:`, error.message);
      }
    }
    
    console.log(`📊 Using calendar: ${successfulCalendar}, Total events: ${allEvents.length}`);
    const availableSlots = generateAvailableSlots(allEvents, startDate, endDate);
    
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
    scope: 'https://www.googleapis.com/auth/calendar', // Full calendar access, not just readonly
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

function generateAvailableSlots(calendarEvents: any[], startDate: string, endDate: string): TimeSlot[] {
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
        // Create slot times in CST timezone
        // Format: YYYY-MM-DDTHH:MM:SS-06:00 (CST is UTC-6)
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hourStr = String(hour).padStart(2, '0');
        const minuteStr = String(minutes).padStart(2, '0');
        
        // Create CST datetime strings (UTC-6)
        const slotStartCST = `${year}-${month}-${day}T${hourStr}:${minuteStr}:00-06:00`;
        
        // Check both 30-minute and 60-minute slots
        [30, 60].forEach(duration => {
          const endMinutes = minutes + duration;
          const endHour = hour + Math.floor(endMinutes / 60);
          const finalMinutes = endMinutes % 60;
          
          // Don't create 60-minute slots that would go past 6 PM CST
          if (duration === 60 && endHour > 18) return;
          
          const endHourStr = String(endHour).padStart(2, '0');
          const endMinuteStr = String(finalMinutes).padStart(2, '0');
          const slotEndCST = `${year}-${month}-${day}T${endHourStr}:${endMinuteStr}:00-06:00`;
          
          // Convert to Date objects for conflict checking
          const slotStart = new Date(slotStartCST);
          const slotEnd = new Date(slotEndCST);
          
          const isAvailable = !hasConflict(calendarEvents, slotStart, slotEnd);
          
          // Format display times in 12-hour format
          const displayStartHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
          const displayEndHour = endHour === 0 ? 12 : endHour > 12 ? endHour - 12 : endHour;
          
          const startAmPm = hour < 12 ? 'AM' : 'PM';
          const endAmPm = endHour < 12 ? 'AM' : 'PM';
          
          const startTimeStr = `${displayStartHour}:${minutes.toString().padStart(2, '0')} ${startAmPm}`;
          const endTimeStr = `${displayEndHour}:${finalMinutes.toString().padStart(2, '0')} ${endAmPm}`;
          
          // Debug logging for conflict detection
          if (!isAvailable) {
            console.log(`❌ SLOT BLOCKED: ${year}-${month}-${day} ${startTimeStr} - ${endTimeStr} (${duration}min)`);
          }
          
          slots.push({
            id: `${year}-${month}-${day}-${hour}-${minutes}-${duration}`,
            date: new Date(year, date.getMonth(), date.getDate()),
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

function hasConflict(calendarEvents: any[], slotStart: Date, slotEnd: Date): boolean {
  console.log(`🔍 Checking conflict for slot: ${slotStart.toISOString()} - ${slotEnd.toISOString()}`);
  
  const conflict = calendarEvents.some(event => {
    if (!event.start || !event.end) return false;
    
    const eventStart = new Date(event.start.dateTime || event.start.date);
    const eventEnd = new Date(event.end.dateTime || event.end.date);
    
    console.log(`📅 Comparing with event "${event.summary}": ${eventStart.toISOString()} - ${eventEnd.toISOString()}`);
    
    // Check if slot overlaps with any existing event
    const hasOverlap = slotStart < eventEnd && slotEnd > eventStart;
    
    if (hasOverlap) {
      console.log(`❌ CONFLICT DETECTED: Slot ${slotStart.toISOString()} - ${slotEnd.toISOString()} overlaps with "${event.summary}" ${eventStart.toISOString()} - ${eventEnd.toISOString()}`);
      return true;
    }
    
    return false;
  });
  
  if (!conflict) {
    console.log(`✅ No conflict found for slot: ${slotStart.toISOString()} - ${slotEnd.toISOString()}`);
  }
  
  return conflict;
}

serve(serve_handler);