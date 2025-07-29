// ... existing imports and setup ...

const serve_handler = async (req: Request): Promise<Response> => {
  // ... CORS and request handling ...

  try {
    const { startDate, endDate } = await req.json();
    console.log('Fetching calendar slots for date range:', { startDate, endDate });

    // ... Google credentials validation ...

    const accessToken = await getGoogleAccessToken(googleClientEmail, googlePrivateKey);
    
    // Use FreeBusy API to get accurate busy intervals
    const freeBusyData = await fetchFreeBusyIntervals(startDate, endDate, accessToken);
    const availableSlots = generateAvailableSlotsFromFreeBusy(freeBusyData, startDate, endDate);
    
    console.log(`Generated ${availableSlots.length} available slots`);
    return new Response(JSON.stringify({ slots: availableSlots }), { headers });
    
  } catch (error) {
    // ... error handling ...
  }
};

async function fetchFreeBusyIntervals(startDate: string, endDate: string, accessToken: string) {
  const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
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

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`FreeBusy API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.calendars;
}

function generateAvailableSlotsFromFreeBusy(freeBusyData: any, startDate: string, endDate: string): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Business hours in CST
  const BUSINESS_START = 8; // 8 AM
  const BUSINESS_END = 18;  // 6 PM

  // Collect all busy intervals
  const busyIntervals: { start: string, end: string }[] = [];
  for (const calendarId in freeBusyData) {
    busyIntervals.push(...(freeBusyData[calendarId].busy || []));
  }

  // Convert to Date objects once
  const busyDates = busyIntervals.map(interval => ({
    start: new Date(interval.start),
    end: new Date(interval.end)
  }));

  // Generate time slots
  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    
    const dateStr = format(date, 'yyyy-MM-dd');
    
    // Generate 30-minute slots for business hours
    for (let hour = BUSINESS_START; hour < BUSINESS_END; hour++) {
      for (let minutes = 0; minutes < 60; minutes += 30) {
        const slotStart = new Date(`${dateStr}T${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00-06:00`);
        const slotEnd = new Date(slotStart.getTime() + 30 * 60000);
        
        // Check for conflicts with busy intervals
        const isAvailable = !busyDates.some(busy => 
          slotStart.getTime() < busy.end.getTime() && 
          slotEnd.getTime() > busy.start.getTime()
        );

        // Format times for display
        const startHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
        const startPeriod = hour >= 12 ? 'PM' : 'AM';
        const startTime = `${startHour}:${minutes.toString().padStart(2, '0')} ${startPeriod}`;
        
        const endHour = minutes + 30 >= 60 ? hour + 1 : hour;
        const endHour12 = endHour > 12 ? endHour - 12 : (endHour === 0 ? 12 : endHour);
        const endPeriod = endHour >= 12 ? 'PM' : 'AM';
        const endMinutes = (minutes + 30) % 60;
        const endTime = `${endHour12}:${endMinutes.toString().padStart(2, '0')} ${endPeriod}`;

        slots.push({
          id: `${dateStr}-${hour}-${minutes}`,
          date: new Date(date),
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

// ... existing helper functions (getGoogleAccessToken, createJWT, base64UrlEncode) ...