import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { format } from "https://deno.land/x/date_fns@v2.22.1/index.js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CST_TIMEZONE = 'America/Chicago';

interface TimeSlot {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  duration: number;
}

function base64UrlEncode(data: any): string {
  return btoa(data)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
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

  const keyData = new Uint8Array(binaryKey.length);
  for (let i = 0; i < binaryKey.length; i++) {
    keyData[i] = binaryKey.charCodeAt(i);
  }

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const signature = base64UrlEncode(String.fromCharCode(...new Uint8Array(signatureBuffer)));
  return `${signingInput}.${signature}`;
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

async function fetchFreeBusyIntervals(startDate: string, endDate: string, accessToken: string) {
  const freeBusyResponse = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      timeMin: startDate,
      timeMax: endDate,
      timeZone: CST_TIMEZONE,
      items: [{ id: 'itmate.ai@gmail.com' }, { id: 'primary' }]
    })
  });

  if (!freeBusyResponse.ok) {
    const errorText = await freeBusyResponse.text();
    throw new Error(`FreeBusy API error: ${freeBusyResponse.status} ${errorText}`);
  }

  const freeBusyData = await freeBusyResponse.json();
  console.log('🔍 FreeBusy API Response:', JSON.stringify(freeBusyData, null, 2));
  return freeBusyData.calendars;
}

function generateAvailableSlotsFromFreeBusy(freeBusyData: any, startDate: string, endDate: string): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Business hours in CST
  const BUSINESS_START = 8; // 8 AM
  const BUSINESS_END = 18;  // 6 PM

  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    if (date.getDay() === 0 || date.getDay() === 6) continue; // Skip weekends
    
    const dateStr = format(date, 'yyyy-MM-dd');
    console.log(`\n📅 Generating slots for ${dateStr}`);
    
    // Get busy intervals for this date
    const busyIntervals: { start: string, end: string }[] = [];
    for (const calendarId in freeBusyData) {
      console.log(`📋 Calendar ${calendarId} busy periods:`, freeBusyData[calendarId].busy);
      busyIntervals.push(...(freeBusyData[calendarId].busy || []));
    }

    console.log(`⏰ Total busy intervals for ${dateStr}:`, busyIntervals);

    // Generate slots from business hours
    for (let hour = BUSINESS_START; hour < BUSINESS_END; hour++) {
      for (let minutes = 0; minutes < 60; minutes += 30) {
        const slotStart = new Date(`${dateStr}T${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00-06:00`);
        const slotEnd = new Date(slotStart.getTime() + 30 * 60000);
        
        // Check if slot overlaps with any busy interval
        const isAvailable = !busyIntervals.some(interval => {
          const busyStart = new Date(interval.start).getTime();
          const busyEnd = new Date(interval.end).getTime();
          const overlap = slotStart.getTime() < busyEnd && slotEnd.getTime() > busyStart;
          if (overlap) {
            console.log(`❌ Slot ${hour}:${minutes.toString().padStart(2, '0')} conflicts with ${interval.start} - ${interval.end}`);
          }
          return overlap;
        });

        // Format times in 12-hour format
        const startHour = hour > 12 ? hour - 12 : hour;
        const startPeriod = hour >= 12 ? 'PM' : 'AM';
        const startTime = `${startHour === 0 ? 12 : startHour}:${minutes.toString().padStart(2, '0')} ${startPeriod}`;
        
        const endHour = minutes + 30 >= 60 ? hour + 1 : hour;
        const endMinutes = (minutes + 30) % 60;
        const endHour12 = endHour > 12 ? endHour - 12 : endHour;
        const endPeriod = endHour >= 12 ? 'PM' : 'AM';
        const endTime = `${endHour12 === 0 ? 12 : endHour12}:${endMinutes.toString().padStart(2, '0')} ${endPeriod}`;

        slots.push({
          id: `${dateStr}-${hour}-${minutes}-30`,
          date: new Date(dateStr),
          startTime,
          endTime,
          isAvailable,
          duration: 30
        });
      }
    }
  }
  return slots;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { startDate, endDate } = await req.json();
    
    const googleClientEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL');
    const googlePrivateKey = Deno.env.get('GOOGLE_PRIVATE_KEY');

    if (!googleClientEmail || !googlePrivateKey) {
      throw new Error('Google credentials not configured');
    }

    console.log('🔑 Getting Google access token...');
    const accessToken = await getGoogleAccessToken(googleClientEmail, googlePrivateKey);
    console.log('✅ Access token obtained');

    console.log('📅 Fetching FreeBusy data...');
    const freeBusyData = await fetchFreeBusyIntervals(startDate, endDate, accessToken);

    console.log('⚡ Generating available slots...');
    const availableSlots = generateAvailableSlotsFromFreeBusy(freeBusyData, startDate, endDate);

    console.log(`✨ Generated ${availableSlots.length} total slots`);
    console.log(`✅ Available slots: ${availableSlots.filter(s => s.isAvailable).length}`);

    return new Response(
      JSON.stringify({ slots: availableSlots }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in fetch-calendar-slots:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});