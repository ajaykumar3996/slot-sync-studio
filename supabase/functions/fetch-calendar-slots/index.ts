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

    // Create JWT token for Google Calendar API authentication
    const googleToken = await createGoogleJWT(googleClientEmail, googlePrivateKey);
    
    // Fetch events from Google Calendar
    const calendarEvents = await fetchGoogleCalendarEvents(
      googleToken, 
      googleCalendarId, 
      startDate, 
      endDate
    );
    
    // Generate available slots based on calendar events
    const availableSlots = generateAvailableSlots(calendarEvents, startDate, endDate);
    
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

async function createGoogleJWT(clientEmail: string, privateKey: string): Promise<string> {
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  // Create JWT token (simplified version - in production, use a proper JWT library)
  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(payload));
  
  // For now, return a placeholder - this needs proper JWT signing
  // This would need to be implemented with crypto signing
  throw new Error('JWT creation not fully implemented - need proper crypto signing');
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
        const slotStart = new Date(date);
        slotStart.setHours(hour, minutes, 0, 0);
        
        // Check both 30-minute and 60-minute slots
        [30, 60].forEach(duration => {
          const slotEnd = new Date(slotStart);
          slotEnd.setMinutes(slotEnd.getMinutes() + duration);
          
          // Don't create 60-minute slots that would go past 6 PM
          if (duration === 60 && slotEnd.getHours() >= 18) return;
          
          const isAvailable = !hasConflict(calendarEvents, slotStart, slotEnd);
          
          slots.push({
            id: `${date.toISOString().split('T')[0]}-${hour}-${minutes}-${duration}`,
            date: date.toISOString().split('T')[0],
            startTime: slotStart.toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit',
              timeZone: 'America/Chicago'
            }),
            endTime: slotEnd.toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit',
              timeZone: 'America/Chicago'
            }),
            isAvailable,
            duration
          });
        });
      }
    }
  }
  
  return slots;
}

function hasConflict(events: any[], slotStart: Date, slotEnd: Date): boolean {
  return events.some(event => {
    if (!event.start || !event.end) return false;
    
    const eventStart = new Date(event.start.dateTime || event.start.date);
    const eventEnd = new Date(event.end.dateTime || event.end.date);
    
    // Check if slot overlaps with any existing event
    return slotStart < eventEnd && slotEnd > eventStart;
  });
}

serve(serve_handler);