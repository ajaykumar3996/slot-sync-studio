import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

interface TimeSlot {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  duration: number;
}

interface GoogleCalendarViewProps {
  selectedDate: Date;
  onSlotSelect: (slot: TimeSlot) => void;
}

export function GoogleCalendarView({ selectedDate, onSlotSelect }: GoogleCalendarViewProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchDayEvents = async () => {
    if (!selectedDate) return;
    
    setLoading(true);
    try {
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);

      const { data, error } = await supabase.functions.invoke('fetch-calendar-slots', {
        body: {
          startDate: startOfDay.toISOString(),
          endDate: endOfDay.toISOString(),
          fetchEvents: true
        }
      });

      if (error) {
        toast({ title: "Error", description: "Failed to fetch calendar events", variant: "destructive" });
        return;
      }

      setEvents(data.events || []);
    } catch (error) {
      toast({ title: "Error", description: "Failed to connect to calendar service", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDayEvents();
  }, [selectedDate]);

  const generateTimeSlots = () => {
    const slots = [];
    const workingHours = { start: 8, end: 18 }; // 8 AM to 6 PM
    
    for (let hour = workingHours.start; hour < workingHours.end; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const startTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const endHour = minute === 30 ? hour + 1 : hour;
        const endMinute = minute === 30 ? 0 : 30;
        const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
        
        // Check if this slot conflicts with any event
        const isBlocked = events.some(event => {
          const slotStart = hour * 60 + minute;
          const slotEnd = endHour * 60 + endMinute;
          const eventStart = event.startHour * 60 + event.startMinute;
          const eventEnd = event.endHour * 60 + event.endMinute;
          
          return slotStart < eventEnd && slotEnd > eventStart;
        });
        
        slots.push({
          hour,
          minute,
          startTime,
          endTime,
          isBlocked,
          eventTitle: isBlocked ? events.find(event => {
            const slotStart = hour * 60 + minute;
            const slotEnd = endHour * 60 + endMinute;
            const eventStart = event.startHour * 60 + event.startMinute;
            const eventEnd = event.endHour * 60 + event.endMinute;
            return slotStart < eventEnd && slotEnd > eventStart;
          })?.title : null
        });
      }
    }
    
    return slots;
  };

  const handleSlotBook = (slot: any, duration: 30 | 60) => {
    const endMinutes = slot.minute + duration;
    const endHour = slot.hour + Math.floor(endMinutes / 60);
    const finalEndMinute = endMinutes % 60;
    
    const endTime = `${endHour.toString().padStart(2, '0')}:${finalEndMinute.toString().padStart(2, '0')}`;
    
    const timeSlot: TimeSlot = {
      id: `${selectedDate.toISOString()}-${slot.startTime}`,
      date: selectedDate,
      startTime: slot.startTime,
      endTime,
      isAvailable: true,
      duration
    };
    
    onSlotSelect(timeSlot);
  };

  const timeSlots = generateTimeSlots();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          {selectedDate.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
        </CardTitle>
        {loading && (
          <p className="text-sm text-muted-foreground">Loading calendar...</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {timeSlots.map((slot, index) => (
            <div key={index} className="flex items-center justify-between p-2 border rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono w-20">
                  {slot.startTime}
                </span>
                {slot.isBlocked ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Busy</Badge>
                    <span className="text-sm text-muted-foreground truncate">
                      {slot.eventTitle}
                    </span>
                  </div>
                ) : (
                  <Badge variant="default" className="bg-green-600">Available</Badge>
                )}
              </div>
              
              {!slot.isBlocked && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSlotBook(slot, 30)}
                    className="text-xs"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    30min
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSlotBook(slot, 60)}
                    className="text-xs"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    1hr
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}