import { formatInTimeZone } from 'date-fns-tz';

export interface TimezoneOption {
  value: string;
  label: string;
  abbreviation: string;
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: 'America/New_York', label: 'Eastern Time', abbreviation: 'ET' },
  { value: 'America/Chicago', label: 'Central Time', abbreviation: 'CT' },
  { value: 'America/Denver', label: 'Mountain Time', abbreviation: 'MT' },
  { value: 'America/Los_Angeles', label: 'Pacific Time', abbreviation: 'PT' },
  { value: 'America/Anchorage', label: 'Alaska Time', abbreviation: 'AKT' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time', abbreviation: 'HT' },
];

export function getTimezoneAbbreviation(timezone: string): string {
  const option = TIMEZONE_OPTIONS.find(tz => tz.value === timezone);
  return option?.abbreviation || 'CT';
}

export function formatTimeInTimezone(date: Date, timezone: string, format: string = 'h:mm a'): string {
  return formatInTimeZone(date, timezone, format);
}
