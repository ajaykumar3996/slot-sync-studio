import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";
import { GoogleCalendarView } from "./GoogleCalendarView";

interface TimeSlot {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  duration: number;
}

interface SlotCalendarProps {
  onSlotSelect: (slot: TimeSlot) => void;
}

export function SlotCalendar({ onSlotSelect }: SlotCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<Date>();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Select a Date
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            disabled={(date) => date < new Date()}
            className="rounded-md border"
          />
        </CardContent>
      </Card>
      
      {selectedDate ? (
        <GoogleCalendarView 
          selectedDate={selectedDate} 
          onSlotSelect={onSlotSelect} 
        />
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center h-96">
            <p className="text-muted-foreground text-center">
              Please select a date to view the calendar
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}