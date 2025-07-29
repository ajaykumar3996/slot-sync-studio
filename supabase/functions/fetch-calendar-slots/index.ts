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
      busyIntervals.push(...(freeBusyData[calendarId].busy || []));
    }

    // Generate slots from business hours
    for (let hour = BUSINESS_START; hour < BUSINESS_END; hour++) {
      for (let minutes = 0; minutes < 60; minutes += 30) {
        const slotStart = new Date(`${dateStr}T${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00-06:00`);
        const slotEnd = new Date(slotStart.getTime() + 30 * 60000);
        
        // Check if slot overlaps with any busy interval
        const isAvailable = !busyIntervals.some(interval => {
          const busyStart = new Date(interval.start).getTime();
          const busyEnd = new Date(interval.end).getTime();
          return slotStart.getTime() < busyEnd && slotEnd.getTime() > busyStart;
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

// In serve_handler:
const accessToken = await getGoogleAccessToken(googleClientEmail, googlePrivateKey);
const freeBusyData = await fetchFreeBusyIntervals(startDate, endDate, accessToken);
const availableSlots = generateAvailableSlotsFromFreeBusy(freeBusyData, startDate, endDate);