import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';

export interface TimezoneOption {
  value: string;
  label: string;
  abbreviation: string;
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: 'America/New_York', label: 'Eastern Time', abbreviation: 'EST' },
  { value: 'America/Chicago', label: 'Central Time', abbreviation: 'CST' },
  { value: 'America/Denver', label: 'Mountain Time', abbreviation: 'MST' },
  { value: 'America/Los_Angeles', label: 'Pacific Time', abbreviation: 'PST' },
];

export function getTimezoneAbbreviation(timezone: string): string {
  const option = TIMEZONE_OPTIONS.find(tz => tz.value === timezone);
  return option?.abbreviation || 'CST';
}

export function formatTimeInTimezone(date: Date, timezone: string, format: string = 'h:mm a'): string {
  return formatInTimeZone(date, timezone, format);
}

// Convert CST working hours (8:00 AM - 6:30 PM) to any timezone
export function convertCSTWorkingHoursToTimezone(timezone: string): {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
} {
  // Create dates in CST for working hours
  const today = new Date();
  const cstStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 0, 0); // 8:00 AM CST
  const cstEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 18, 30, 0); // 6:30 PM CST
  
  // Convert from CST to target timezone
  const startInTargetTZ = toZonedTime(fromZonedTime(cstStart, 'America/Chicago'), timezone);
  const endInTargetTZ = toZonedTime(fromZonedTime(cstEnd, 'America/Chicago'), timezone);
  
  return {
    startHour: startInTargetTZ.getHours(),
    startMinute: startInTargetTZ.getMinutes(),
    endHour: endInTargetTZ.getHours(),
    endMinute: endInTargetTZ.getMinutes(),
  };
}
