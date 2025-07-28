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
          
          // Log event details in both UTC and CST
          events.forEach((event: any) => {
            const startUTC = parseISO(event.start.dateTime || event.start.date);
            const endUTC = parseISO(event.end.dateTime || event.end.date);
            console.log(`📅 Event: ${event.summary || 'No title'}`, {
              startUTC: format(startUTC, "yyyy-MM-dd HH:mm:ss"),
              startCST: format(startUTC, "yyyy-MM-dd HH:mm:ssXXX"),
              endUTC: format(endUTC, "yyyy-MM-dd HH:mm:ss"),
              endCST: format(endUTC, "yyyy-MM-dd HH:mm:ssXXX")
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

// ... (getGoogleAccessToken, createJWT, and base64UrlEncode functions remain the same) ...

function generateAvailableSlots(calendarEvents: any[], startDate: string, endDate: string): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Convert all events to UTC milliseconds for comparison
  const eventsInUTC = calendarEvents.map(event => {
    const startUTC = new Date(event.start.dateTime || event.start.date).getTime();
    const endUTC = new Date(event.end.dateTime || event.end.date).getTime();
    return {
      summary: event.summary,
      startUTC,
      endUTC
    };
  });

  for (let currentDate = new Date(start); currentDate <= end; currentDate.setDate(currentDate.getDate() + 1)) {
    // Skip weekends
    if (currentDate.getDay() === 0 || currentDate.getDay() === 6) continue;
    
    const dateStr = format(currentDate, 'yyyy-MM-dd');
    console.log(`\n📅 Generating slots for ${dateStr}`);
    
    // Create base 30-minute slots in CST (8AM-6PM)
    for (let hour = 8; hour < 18; hour++) {
      for (let minutes = 0; minutes < 60; minutes += 30) {
        // Create slot in CST
        const slotStartCST = new Date(currentDate);
        slotStartCST.setHours(hour, minutes, 0, 0);
        
        const slotEndCST = new Date(slotStartCST);
        slotEndCST.setMinutes(slotStartCST.getMinutes() + 30);
        
        // Convert to UTC for comparison
        const slotStartUTC = slotStartCST.getTime();
        const slotEndUTC = slotEndCST.getTime();
        
        const slotKey = `${hour}:${minutes.toString().padStart(2, '0')}`;
        const isAvailable = !hasConflict(eventsInUTC, slotStartUTC, slotEndUTC);
        
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
        
        // Create 60-minute slot if possible
        if (minutes === 0 && hour < 17) {
          const slotEnd60CST = new Date(slotStartCST);
          slotEnd60CST.setMinutes(slotStartCST.getMinutes() + 60);
          
          const slotEnd60UTC = slotEnd60CST.getTime();
          const isAvailable60 = isAvailable && 
            !hasConflict(eventsInUTC, slotStartUTC + 30*60000, slotEnd60UTC);
          
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
          }
        }
      }
    }
  }
  return slots;
}

function hasConflict(eventsInUTC: any[], slotStartUTC: number, slotEndUTC: number): boolean {
  // Check for overlap with 1ms buffer at boundaries
  return eventsInUTC.some(event => {
    const hasOverlap = slotStartUTC < event.endUTC - 1 && slotEndUTC > event.startUTC + 1;
    
    if (hasOverlap) {
      console.log(`🚨 CONFLICT DETECTED: Slot (${new Date(slotStartUTC).toISOString()} - ${new Date(slotEndUTC).toISOString()})`);
      console.log(`   Event: ${event.summary} (${new Date(event.startUTC).toISOString()} - ${new Date(event.endUTC).toISOString()})`);
      return true;
    }
    return false;
  });
}

serve(serve_handler);