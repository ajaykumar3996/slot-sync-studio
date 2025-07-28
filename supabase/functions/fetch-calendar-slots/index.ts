import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseISO, format, isWithinInterval, addMinutes } from "https://esm.sh/date-fns@3.6.0";

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
    
    console.log('🎯 Using Google Calendar Freebusy API for calendars:', calendarAttempts);
    
    // Use Google Calendar Freebusy API instead of fetching individual events
    const freeBusyData = await getFreeBusyData(accessToken, calendarAttempts, startDate, endDate);
    console.log('📊 Freebusy API response:', JSON.stringify(freeBusyData, null, 2));
    
    const availableSlots = generateAvailableSlotsFromFreebusy(freeBusyData, startDate, endDate);
    
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

async function getFreeBusyData(
  token: string,
  calendarIds: string[],
  startDate: string,
  endDate: string
) {
  const freeBusyRequest = {
    timeMin: startDate,
    timeMax: endDate,
    items: calendarIds.map(id => ({ id }))
  };

  console.log('🚀 Freebusy API request:', JSON.stringify(freeBusyRequest, null, 2));

  const response = await fetch(
    'https://www.googleapis.com/calendar/v3/freeBusy',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(freeBusyRequest)
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Freebusy API error:', errorText);
    throw new Error(`Google Calendar Freebusy API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

function generateAvailableSlotsFromFreebusy(freeBusyData: any, startDate: string, endDate: string): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  
  // Collect all busy periods from all calendars
  const allBusyPeriods: Array<{ start: Date; end: Date }> = [];
  
  if (freeBusyData.calendars) {
    Object.keys(freeBusyData.calendars).forEach(calendarId => {
      const calendar = freeBusyData.calendars[calendarId];
      console.log(`📅 Calendar ${calendarId} busy periods:`, calendar.busy?.length || 0);
      
      if (calendar.busy) {
        calendar.busy.forEach((busyPeriod: any) => {
          const busyStart = parseISO(busyPeriod.start);
          const busyEnd = parseISO(busyPeriod.end);
          allBusyPeriods.push({ start: busyStart, end: busyEnd });
          
          console.log(`🚫 BUSY: ${format(busyStart, 'yyyy-MM-dd h:mm a')} - ${format(busyEnd, 'yyyy-MM-dd h:mm a')}`);
        });
      }
    });
  }
  
  console.log(`📊 Total busy periods: ${allBusyPeriods.length}`);
  
  // Generate slots for each day between start and end date
  for (let currentDate = new Date(start); currentDate <= end; currentDate.setDate(currentDate.getDate() + 1)) {
    // Skip weekends
    if (currentDate.getDay() === 0 || currentDate.getDay() === 6) continue;
    
    // Generate slots from 8 AM to 6 PM CST (treating as local time)
    for (let hour = 8; hour < 18; hour++) {
      for (let minutes = 0; minutes < 60; minutes += 30) {
        // Create slot start time in local timezone (CST)
        const slotStart = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          currentDate.getDate(),
          hour,
          minutes
        );
        
        // Check both 30-minute and 60-minute slots
        [30, 60].forEach(duration => {
          const slotEnd = addMinutes(slotStart, duration);
          
          // Don't create 60-minute slots that would go past 6 PM
          if (duration === 60 && slotEnd.getHours() >= 18) return;
          
          // Check if this slot conflicts with any busy period
          const isAvailable = !isSlotBusy(slotStart, slotEnd, allBusyPeriods);
          
          // Format display times in 12-hour format
          const startTimeStr = format(slotStart, 'h:mm a');
          const endTimeStr = format(slotEnd, 'h:mm a');
          
          // Enhanced debug logging
          const slotDateStr = format(slotStart, 'yyyy-MM-dd');
          console.log(`🎯 SLOT: ${slotDateStr} ${startTimeStr} - ${endTimeStr} (${duration}min) - ${isAvailable ? 'AVAILABLE' : 'BLOCKED'}`);
          
          slots.push({
            id: `${slotDateStr}-${hour}-${minutes}-${duration}`,
            date: new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()),
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

function isSlotBusy(slotStart: Date, slotEnd: Date, busyPeriods: Array<{ start: Date; end: Date }>): boolean {
  const slotStartStr = format(slotStart, 'yyyy-MM-dd h:mm a');
  const slotEndStr = format(slotEnd, 'yyyy-MM-dd h:mm a');
  
  console.log(`🔍 Checking if slot is busy: ${slotStartStr} - ${slotEndStr}`);
  
  const isBusy = busyPeriods.some(busy => {
    // Simple overlap detection: slot overlaps if slotStart < busyEnd AND slotEnd > busyStart
    const hasOverlap = slotStart < busy.end && slotEnd > busy.start;
    
    if (hasOverlap) {
      const busyStartStr = format(busy.start, 'yyyy-MM-dd h:mm a');
      const busyEndStr = format(busy.end, 'yyyy-MM-dd h:mm a');
      console.log(`❌ CONFLICT: Slot ${slotStartStr} - ${slotEndStr} overlaps with busy period ${busyStartStr} - ${busyEndStr}`);
      return true;
    }
    
    return false;
  });
  
  if (!isBusy) {
    console.log(`✅ AVAILABLE: ${slotStartStr} - ${slotEndStr}`);
  }
  
  return isBusy;
}

serve(serve_handler);