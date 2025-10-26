import { Clock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";

interface TimezoneSelectorProps {
  selectedTimezone: string;
  onTimezoneChange: (timezone: string) => void;
}

export function TimezoneSelector({ selectedTimezone, onTimezoneChange }: TimezoneSelectorProps) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg bg-card border">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
        <Clock className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1">
        <label className="text-sm font-medium mb-1 block">Timezone</label>
        <Select value={selectedTimezone} onValueChange={onTimezoneChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select timezone" />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONE_OPTIONS.map((tz) => (
              <SelectItem key={tz.value} value={tz.value}>
                {tz.label} ({tz.abbreviation})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
