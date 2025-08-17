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

  const canFit = (hour: number, minute: number, duration: number) => {
    const slotEnd = hour * 60 + minute + duration;
    return slotEnd <= 18 * 60 + 30; // Must end by 6:30 PM
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
  
  // Check if selected date is weekend
  const isWeekend = selectedDate.getDay() === 0 || selectedDate.getDay() === 6; // Sunday = 0, Saturday = 6

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
        {isWeekend && (
          <div className="mb-4 p-3 bg-muted/50 border border-border rounded-lg">
            <p className="text-sm text-muted-foreground text-center">
              🏖️ Weekend - Office is closed on {selectedDate.toLocaleDateString('en-US', { weekday: 'long' })}s
            </p>
          </div>
        )}
        <div className={`relative ${isWeekend ? 'opacity-50' : ''}`}>
          {/* Time Grid */}
          <div className="border border-border rounded-lg overflow-hidden bg-background">
            {hours.map((hour, index) => (
              <div key={hour} className={`relative border-b border-border last:border-b-0 ${hour === 18 ? 'h-8' : 'h-16'}`}>
                {/* Hour Label */}
                <div className={`absolute left-0 top-0 w-16 ${hour === 18 ? 'h-8' : 'h-full'} flex items-start justify-center pt-2 text-xs text-muted-foreground bg-muted/50 border-r border-border z-30`}>
                  {convertTo12Hour(hour)}
                </div>
                
                {/* Time Slots with permanent booking buttons */}
                <div className={`ml-16 relative ${hour === 18 ? 'h-8' : 'h-full'}`}>
                  {/* 30-minute divider line - only show for non-6PM hours */}
                  {hour < 18 && (
                    <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-border/50 z-5"></div>
                  )}
                  
                  {/* First 30-minute slot */}
                  <div className="absolute top-0 left-0 right-0 h-8 flex items-center justify-center z-10">
                    {!isWeekend && isSlotAvailable(hour, 0, 30) && canFit(hour, 0, 30) ? (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="text-xs h-6 px-2 bg-green-100 hover:bg-green-200 border border-green-300 text-green-800"
                        onClick={() => handleSlotClick(hour, 0, 30)}
                      >
                        Book 30m
                      </Button>
                    ) : !isWeekend ? (
                      <div className="text-xs text-muted-foreground/50">Busy</div>
                    ) : null}
                  </div>
                  
                  {/* Second 30-minute slot - only show if not past 6:30 PM */}
                  {hour < 18 && (
                    <div className="absolute bottom-0 left-0 right-0 h-8 flex items-center justify-center z-10">
                      {!isWeekend && isSlotAvailable(hour, 30, 30) && canFit(hour, 30, 30) ? (
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="text-xs h-6 px-2 bg-green-100 hover:bg-green-200 border border-green-300 text-green-800"
                          onClick={() => handleSlotClick(hour, 30, 30)}
                        >
                          Book 30m
                        </Button>
                      ) : !isWeekend ? (
                        <div className="text-xs text-muted-foreground/50">Busy</div>
                      ) : null}
                    </div>
                  )}
                  
                  {/* 1-hour slot button from :00 (positioned on the right) */}
                  {!isWeekend && isSlotAvailable(hour, 0, 60) && canFit(hour, 0, 60) && (
                    <div className="absolute inset-0 flex items-center justify-end pr-2 z-20 pointer-events-none">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="text-xs h-10 px-4 bg-green-50 hover:bg-green-100 border-green-400 text-green-800 pointer-events-auto"
                        onClick={() => handleSlotClick(hour, 0, 60)}
                      >
                        Book 1hr
                      </Button>
                    </div>
                  )}
                  
                  {/* 1-hour slot button from :30 (positioned centered across hour boundary) */}
                  {!isWeekend && isSlotAvailable(hour, 30, 60) && canFit(hour, 30, 60) && (
                    <div className="absolute inset-0 z-30 pointer-events-none">
                      <div className="absolute top-8 left-2 h-16 flex items-center pointer-events-auto">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="text-xs h-10 px-4 bg-green-50 hover:bg-green-100 border-green-400 text-green-800"
                          onClick={() => handleSlotClick(hour, 30, 60)}
                        >
                          Book 1hr
                        </Button>
                      </div>
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
                  <div className="flex items-center justify-center h-full">
                    <span className="text-xs font-medium">Busy</span>
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
              <div className="w-3 h-2 bg-green-100 border border-green-300 rounded"></div>
              <span>Available slots</span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Click on the available time slot buttons to book appointments. 30-minute slots are always visible, 1-hour slots appear on the right (:00 start) or at the bottom left of the 30-minute mark (:30 start) when available.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}