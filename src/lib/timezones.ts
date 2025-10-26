import { formatInTimeZone } from 'date-fns-tz';

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
