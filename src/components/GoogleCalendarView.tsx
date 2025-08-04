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

  const generateHourlyGrid = () => {
    const hours = [];
    for (let i = 8; i <= 18; i++) {
      hours.push(i);
    }
    return hours;
  };

  const convertTo12Hour = (hour: number) => {
    if (hour === 0) return "12 AM";
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return "12 PM";
    return `${hour - 12} PM`;
  };

  const getEventPosition = (event: CalendarEvent) => {
    const startMinutes = event.startHour * 60 + event.startMinute;
    const endMinutes = event.endHour * 60 + event.endMinute;
    const startTime = 8 * 60; // 8 AM in minutes
    const pixelsPerHour = 64; // 64px per hour (h-16 = 64px)
    const totalHours = 11; // 8 AM to 7 PM (11 hours total)
    
    const topPixels = ((startMinutes - startTime) / 60) * pixelsPerHour;
    const heightPixels = ((endMinutes - startMinutes) / 60) * pixelsPerHour;
    
    return { 
      top: `${topPixels}px`, 
      height: `${heightPixels}px`,
      zIndex: 10
    };
  };

  const handleSlotClick = (hour: number, minute: number, duration: 30 | 60) => {
    // Check if the slot is available
    const slotStart = hour * 60 + minute;
    const slotEnd = slotStart + duration;
    
    const isBlocked = events.some(event => {
      const eventStart = event.startHour * 60 + event.startMinute;
      const eventEnd = event.endHour * 60 + event.endMinute;
      return slotStart < eventEnd && slotEnd > eventStart;
    });

    if (isBlocked) {
      toast({ title: "Slot Unavailable", description: "This time slot conflicts with an existing event", variant: "destructive" });
      return;
    }

    const startTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    const endHour = Math.floor((slotStart + duration) / 60);
    const endMinute = (slotStart + duration) % 60;
    const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
    
    const timeSlot: TimeSlot = {
      id: `${selectedDate.toISOString()}-${startTime}`,
      date: selectedDate,
      startTime,
      endTime,
      isAvailable: true,
      duration
    };
    
    onSlotSelect(timeSlot);
  };

  const hours = generateHourlyGrid();

  return (
    <Card className="w-full">
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
        <div className="relative">
          {/* Time Grid */}
          <div className="border border-border rounded-lg overflow-hidden bg-background">
            {hours.map((hour, index) => (
              <div key={hour} className="relative border-b border-border last:border-b-0">
                {/* Hour Label */}
                <div className="absolute left-0 top-0 w-16 h-16 flex items-start justify-center pt-1 text-xs text-muted-foreground bg-muted/50 border-r border-border z-20">
                  {convertTo12Hour(hour)}
                </div>
                
                {/* Time Slots */}
                <div className="ml-16 relative h-16">
                  {/* 30-minute slot indicators - always visible */}
                  <div className="absolute top-0 left-0 right-0 h-8 border-b border-dashed border-border/40"></div>
                  <div className="absolute bottom-0 left-0 right-0 h-8"></div>
                  
                  {/* Clickable 30-minute slots */}
                  <div 
                    className="absolute top-0 left-0 right-0 h-8 hover:bg-accent/20 cursor-pointer group transition-colors z-10"
                    onClick={() => handleSlotClick(hour, 0, 30)}
                  >
                    <div className="flex items-center justify-center h-full opacity-0 group-hover:opacity-100 transition-opacity">
                      <Badge variant="secondary" className="text-xs px-2 py-1">
                        <Plus className="w-3 h-3 mr-1" />
                        30min
                      </Badge>
                    </div>
                  </div>
                  <div 
                    className="absolute bottom-0 left-0 right-0 h-8 hover:bg-accent/20 cursor-pointer group transition-colors z-10"
                    onClick={() => handleSlotClick(hour, 30, 30)}
                  >
                    <div className="flex items-center justify-center h-full opacity-0 group-hover:opacity-100 transition-opacity">
                      <Badge variant="secondary" className="text-xs px-2 py-1">
                        <Plus className="w-3 h-3 mr-1" />
                        30min
                      </Badge>
                    </div>
                  </div>
                  
                  {/* 1-hour slot overlay */}
                  <div 
                    className="absolute inset-0 hover:bg-primary/10 cursor-pointer group transition-colors z-5"
                    onClick={() => handleSlotClick(hour, 0, 60)}
                  >
                    <div className="flex items-center justify-center h-full opacity-0 group-hover:opacity-100 transition-opacity">
                      <Badge variant="outline" className="text-xs px-3 py-1 bg-background">
                        <Plus className="w-3 h-3 mr-1" />
                        1 hour
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {/* Events Overlay */}
          <div className="absolute inset-0 ml-16 pointer-events-none">
            {events.map((event) => {
              const position = getEventPosition(event);
              return (
                <div
                  key={event.id}
                  className="absolute left-1 right-1 bg-destructive text-destructive-foreground rounded-md px-2 py-1 text-xs font-medium shadow-md border border-destructive/20 pointer-events-auto"
                  style={{
                    top: position.top,
                    height: position.height,
                    minHeight: '24px',
                    zIndex: position.zIndex
                  }}
                >
                  <div className="truncate font-semibold">{event.title}</div>
                  <div className="text-xs opacity-90 truncate">
                    {event.startTime} - {event.endTime}
                  </div>
                  <div className="absolute top-1 right-1">
                    <Badge variant="outline" className="text-xs px-1 py-0 h-4 bg-destructive-foreground text-destructive">
                      Busy
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-destructive rounded"></div>
              <span>Busy slots</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-dashed border-border rounded"></div>
              <span>30-min slots</span>
            </div>
            <div className="flex items-center gap-2">
              <Plus className="w-3 h-3" />
              <span>Hover to book</span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Hover over empty time slots to book appointments. Dashed lines show 30-minute boundaries.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}