import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";

interface TimeSlot {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

interface SlotCalendarProps {
  onSlotSelect: (slot: TimeSlot) => void;
}

// Mock data for available slots
const generateMockSlots = (): TimeSlot[] => {
  const slots: TimeSlot[] = [];
  const today = new Date();
  
  for (let i = 0; i < 14; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    
    // Skip weekends for this example
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    
    const timeSlots = [
      { start: "09:00", end: "10:00" },
      { start: "10:00", end: "11:00" },
      { start: "11:00", end: "12:00" },
      { start: "14:00", end: "15:00" },
      { start: "15:00", end: "16:00" },
      { start: "16:00", end: "17:00" },
    ];
    
    timeSlots.forEach((time, index) => {
      slots.push({
        id: `${date.toISOString().split('T')[0]}-${index}`,
        date: new Date(date),
        startTime: time.start,
        endTime: time.end,
        isAvailable: Math.random() > 0.3, // Random availability
      });
    });
  }
  
  return slots;
};

export function SlotCalendar({ onSlotSelect }: SlotCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [slots] = useState<TimeSlot[]>(generateMockSlots());
  
  const selectedDateSlots = slots.filter(
    slot => selectedDate && 
    slot.date.toDateString() === selectedDate.toDateString()
  );
  
  const availableDates = slots
    .filter(slot => slot.isAvailable)
    .map(slot => slot.date);

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
            disabled={(date) => 
              date < new Date() || 
              !availableDates.some(availableDate => 
                availableDate.toDateString() === date.toDateString()
              )
            }
            className="rounded-md border"
          />
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Available Time Slots</CardTitle>
        </CardHeader>
        <CardContent>
          {selectedDate ? (
            <div className="space-y-2">
              {selectedDateSlots.length > 0 ? (
                selectedDateSlots.map((slot) => (
                  <div key={slot.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {slot.startTime} - {slot.endTime}
                      </span>
                      <Badge variant={slot.isAvailable ? "default" : "secondary"}>
                        {slot.isAvailable ? "Available" : "Booked"}
                      </Badge>
                    </div>
                    {slot.isAvailable && (
                      <Button 
                        size="sm" 
                        onClick={() => onSlotSelect(slot)}
                      >
                        Book Slot
                      </Button>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  No slots available for this date
                </p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">
              Please select a date to view available slots
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}