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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <Card className="card-enhanced animate-scale-in">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-3 text-xl">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <span className="text-gradient">Select a Date</span>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Choose from available weekdays to view time slots
          </p>
        </CardHeader>
        <CardContent>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            disabled={(date) => {
              // Disable past dates and weekends (Saturday = 6, Sunday = 0)
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const compareDate = new Date(date);
              compareDate.setHours(0, 0, 0, 0);
              const isPast = compareDate < today;
              return isPast || isWeekend;
            }}
            className="rounded-lg border-0 shadow-none w-full"
            classNames={{
              months: "flex w-full flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
              month: "space-y-4 w-full flex flex-col",
              caption: "flex justify-center pt-1 relative items-center",
              caption_label: "text-sm font-medium",
              nav: "space-x-1 flex items-center",
              nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 hover:bg-accent rounded-md transition-colors",
              nav_button_previous: "absolute left-1",
              nav_button_next: "absolute right-1",
              table: "w-full border-collapse space-y-1",
              head_row: "flex w-full",
              head_cell: "text-muted-foreground rounded-md w-8 font-normal text-[0.8rem] flex-1 text-center",
              row: "flex w-full mt-2",
              cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 flex-1",
              day: "h-8 w-full p-0 font-normal aria-selected:opacity-100 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors",
              day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
              day_today: "bg-accent text-accent-foreground font-semibold",
              day_outside: "text-muted-foreground opacity-50",
              day_disabled: "text-muted-foreground opacity-50 cursor-not-allowed",
              day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
              day_hidden: "invisible",
            }}
          />
        </CardContent>
      </Card>
      
      {selectedDate ? (
        <GoogleCalendarView 
          selectedDate={selectedDate} 
          onSlotSelect={onSlotSelect} 
        />
      ) : (
        <Card className="card-enhanced animate-scale-in">
          <CardContent className="flex flex-col items-center justify-center h-96 text-center">
            <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-6 animate-float">
              <svg className="h-8 w-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Select a Date</h3>
            <p className="text-muted-foreground max-w-sm">
              Choose a date from the calendar to view available time slots and book your appointment
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}