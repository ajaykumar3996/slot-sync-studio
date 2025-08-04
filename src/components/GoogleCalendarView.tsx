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
    const gridStartTime = 8 * 60; // 8 AM in minutes
    
    // Each hour is 64px (h-16), so each minute is 64/60 = 1.067px
    const pixelsPerMinute = 64 / 60;
    
    const topPixels = (startMinutes - gridStartTime) * pixelsPerMinute;
    const heightPixels = (endMinutes - startMinutes) * pixelsPerMinute;
    
    return { 
      top: `${topPixels}px`, 
      height: `${Math.max(heightPixels, 24)}px`, // Minimum 24px height
      zIndex: 20
    };
  };

  const isSlotAvailable = (hour: number, minute: number, duration: 30 | 60) => {
    const slotStart = hour * 60 + minute;
    const slotEnd = slotStart + duration;
    
    return !events.some(event => {
      const eventStart = event.startHour * 60 + event.startMinute;
      const eventEnd = event.endHour * 60 + event.endMinute;
      return slotStart < eventEnd && slotEnd > eventStart;
    });
  };

  const handleSlotClick = (hour: number, minute: number, duration: 30 | 60) => {
    if (!isSlotAvailable(hour, minute, duration)) {
      toast({ title: "Slot Unavailable", description: "This time slot conflicts with an existing event", variant: "destructive" });
      return;
    }

    const startTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    const slotStart = hour * 60 + minute;
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
              <div key={hour} className="relative border-b border-border last:border-b-0 h-16">
                {/* Hour Label */}
                <div className="absolute left-0 top-0 w-16 h-full flex items-start justify-center pt-2 text-xs text-muted-foreground bg-muted/50 border-r border-border z-30">
                  {convertTo12Hour(hour)}
                </div>
                
                {/* Time Slots with permanent booking buttons */}
                <div className="ml-16 relative h-full">
                  {/* 30-minute divider line */}
                  <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-border/50 z-5"></div>
                  
                  {/* First 30-minute slot */}
                  <div className="absolute top-0 left-0 right-0 h-8 flex items-center justify-center z-10">
                    {isSlotAvailable(hour, 0, 30) ? (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="text-xs h-6 px-2 bg-accent/50 hover:bg-accent border border-border/50"
                        onClick={() => handleSlotClick(hour, 0, 30)}
                      >
                        Book 30m
                      </Button>
                    ) : (
                      <div className="text-xs text-muted-foreground/50">Busy</div>
                    )}
                  </div>
                  
                  {/* Second 30-minute slot */}
                  <div className="absolute bottom-0 left-0 right-0 h-8 flex items-center justify-center z-10">
                    {isSlotAvailable(hour, 30, 30) ? (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="text-xs h-6 px-2 bg-accent/50 hover:bg-accent border border-border/50"
                        onClick={() => handleSlotClick(hour, 30, 30)}
                      >
                        Book 30m
                      </Button>
                    ) : (
                      <div className="text-xs text-muted-foreground/50">Busy</div>
                    )}
                  </div>
                  
                  {/* 1-hour slot button (centered) */}
                  {isSlotAvailable(hour, 0, 60) && (
                    <div className="absolute inset-0 flex items-center justify-end pr-2 z-15">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="text-xs h-8 px-3 bg-primary/10 hover:bg-primary/20 border-primary/30"
                        onClick={() => handleSlotClick(hour, 0, 60)}
                      >
                        Book 1hr
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* Events Overlay */}
          <div className="absolute top-0 left-16 right-0 pointer-events-none">
            {events.map((event) => {
              const position = getEventPosition(event);
              return (
                <div
                  key={event.id}
                  className="absolute left-1 right-1 bg-destructive text-destructive-foreground rounded-md px-2 py-1 text-xs font-medium shadow-lg border border-destructive/20 pointer-events-auto"
                  style={{
                    top: position.top,
                    height: position.height,
                    zIndex: position.zIndex
                  }}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-semibold">{event.title}</div>
                      <div className="text-xs opacity-90 truncate">
                        {event.startTime} - {event.endTime}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs px-1 py-0 h-4 bg-destructive-foreground text-destructive ml-1 flex-shrink-0">
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
              <span>Busy events</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-2 bg-accent/50 border border-border/50 rounded"></div>
              <span>30-min slots</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-2 bg-primary/10 border border-primary/30 rounded"></div>
              <span>1-hour slots</span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Click on the available time slot buttons to book appointments. 30-minute slots are always visible, 1-hour slots appear on the right when the full hour is available.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}