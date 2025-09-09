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
  selectedSlots: TimeSlot[];
}

export function SlotCalendar({ onSlotSelect, selectedSlots }: SlotCalendarProps) {
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
        <CardContent className="flex justify-center p-6">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              // If clicking the same date, deselect it
              if (selectedDate && date && selectedDate.toDateString() === date.toDateString()) {
                setSelectedDate(undefined);
              } else {
                setSelectedDate(date);
              }
            }}
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
            className="rounded-lg border-0 shadow-none w-full max-w-none"
            classNames={{
              months: "flex w-full flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
              month: "space-y-4 w-full flex flex-col",
              caption: "flex justify-center pt-1 relative items-center mb-4",
              caption_label: "text-lg font-medium",
              nav: "space-x-1 flex items-center",
              nav_button: "h-10 w-10 bg-transparent p-0 opacity-50 hover:opacity-100 hover:bg-primary/20 hover:text-primary rounded-lg transition-colors flex items-center justify-center",
              nav_button_previous: "absolute left-1",
              nav_button_next: "absolute right-1",
              table: "w-full border-collapse",
              head_row: "flex w-full mb-2",
              head_cell: "text-muted-foreground rounded-md flex-1 font-normal text-sm flex items-center justify-center h-12",
              row: "flex w-full mb-1",
              cell: "flex-1 text-center text-sm relative p-0 focus-within:relative focus-within:z-20",
              day: "w-full h-12 p-0 font-normal bg-transparent hover:bg-primary/20 hover:text-primary focus:bg-primary/20 focus:text-primary transition-colors rounded-lg",
              day_selected: "bg-primary/20 text-primary hover:bg-primary/20 hover:text-primary focus:bg-primary/20 focus:text-primary border border-primary/30 rounded-lg",
              day_today: "font-semibold rounded-lg",
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
          selectedSlots={selectedSlots}
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