import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
    // Show hours from 8 AM to 6 PM, but 6 PM row will only show 6:00-6:30
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

  const formatTimeRange = (hour: number, minute: number, duration: number) => {
    const startTime12 = convertTo12Hour(hour);
    const startMinuteStr = minute === 0 ? "" : `.${minute.toString().padStart(2, '0')}`;
    
    const endMinutes = hour * 60 + minute + duration;
    const endHour = Math.floor(endMinutes / 60);
    const endMinute = endMinutes % 60;
    const endTime12 = convertTo12Hour(endHour);
    const endMinuteStr = endMinute === 0 ? "" : `.${endMinute.toString().padStart(2, '0')}`;
    
    return `${startTime12.replace(' ', startMinuteStr + ' ')} - ${endTime12.replace(' ', endMinuteStr + ' ')} CST`;
  };

  const getEventPosition = (event: CalendarEvent) => {
    const startMinutes = event.startHour * 60 + event.startMinute;
    const endMinutes = event.endHour * 60 + event.endMinute;
    const gridStartTime = 8 * 60; // 8 AM in minutes
    const gridEndTime = 18 * 60 + 30; // 6:30 PM in minutes (end of visible grid)
    
    // Clamp the event end time to not exceed the grid boundary at 6:30 PM
    const clampedEndMinutes = Math.min(endMinutes, gridEndTime);
    
    // Each hour is 64px (h-16), so each minute is 64/60 = 1.067px
    const pixelsPerMinute = 64 / 60;
    
    const topPixels = (startMinutes - gridStartTime) * pixelsPerMinute;
    const heightPixels = (clampedEndMinutes - startMinutes) * pixelsPerMinute;
    
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
    <TooltipProvider>
      <Card className="card-enhanced animate-scale-in w-full">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-3 text-xl">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div className="flex flex-col">
            <span className="text-gradient">
              {selectedDate.toLocaleDateString('en-US', { 
                weekday: 'long', 
                month: 'long', 
                day: 'numeric' 
              })}
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              {selectedDate.getFullYear()}
            </span>
          </div>
        </CardTitle>
        <div className="mt-3 p-3 bg-muted/30 rounded-lg border border-border/50">
          <p className="text-sm text-muted-foreground text-center">
            Click on the available slots below in the green to book a slot
          </p>
        </div>
        {loading && (
          <div className="flex items-center gap-2 mt-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
            <p className="text-sm text-muted-foreground">Loading available slots...</p>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isWeekend && (
          <div className="mb-6 p-4 bg-muted/50 border border-border rounded-xl text-center">
            <div className="h-12 w-12 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
              <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
              </svg>
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              Weekend - Office is closed on {selectedDate.toLocaleDateString('en-US', { weekday: 'long' })}s
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Please select a weekday to view available time slots
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
                  {/* 30-minute divider line - only show for hours before 6 PM */}
                  {hour < 18 && (
                    <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-border/50 z-5"></div>
                  )}
                  
                   {/* First 30-minute slot */}
                  <div className="absolute top-0 left-0 right-0 h-8 flex items-center justify-center z-10">
                    {!isWeekend && isSlotAvailable(hour, 0, 30) && canFit(hour, 0, 30) ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            size="sm" 
                            variant="secondary" 
                            className="text-xs h-6 px-3 bg-success/20 hover:bg-success/30 text-success border border-success/30 font-medium transition-all hover:scale-105 shadow-sm"
                            onClick={() => handleSlotClick(hour, 0, 30)}
                          >
                            30min
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="z-[100]">
                          <p>{formatTimeRange(hour, 0, 30)}</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : !isWeekend ? (
                      <div className="text-xs text-muted-foreground/30 font-medium"></div>
                    ) : null}
                  </div>
                  
                   {/* Second 30-minute slot - only show for hours before 6 PM, at 6 PM we only show 6:00-6:30 */}
                   {hour < 18 && (
                      <div className="absolute bottom-0 left-0 right-0 h-8 flex items-center justify-center z-10">
                        {!isWeekend && isSlotAvailable(hour, 30, 30) && canFit(hour, 30, 30) ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                size="sm" 
                                variant="secondary" 
                                className="text-xs h-6 px-3 bg-success/20 hover:bg-success/30 text-success border border-success/30 font-medium transition-all hover:scale-105 shadow-sm"
                                onClick={() => handleSlotClick(hour, 30, 30)}
                              >
                                30min
                              </Button>
                            </TooltipTrigger>
                             <TooltipContent className="z-[100]">
                               <p>{formatTimeRange(hour, 30, 30)}</p>
                             </TooltipContent>
                          </Tooltip>
                        ) : !isWeekend ? (
                          <div className="text-xs text-muted-foreground/30 font-medium"></div>
                        ) : null}
                      </div>
                   )}
                   
                    {/* 1-hour slot button from :00 (positioned on the right) - only for hours before 6 PM */}
                    {!isWeekend && hour < 18 && isSlotAvailable(hour, 0, 60) && canFit(hour, 0, 60) && (
                      <div className="absolute inset-0 flex items-center justify-end pr-3 z-40 pointer-events-none">
                        <div className="relative">
                          <div className="absolute inset-0 bg-background rounded-md"></div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                size="sm" 
                                className="text-xs h-10 px-4 bg-success/20 hover:bg-success/30 text-success border border-success/30 font-medium pointer-events-auto transition-all hover:scale-105 shadow-sm relative z-10"
                                onClick={() => handleSlotClick(hour, 0, 60)}
                              >
                                1 Hour
                              </Button>
                            </TooltipTrigger>
                             <TooltipContent className="z-[100]">
                               <p>{formatTimeRange(hour, 0, 60)}</p>
                             </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    )}
                   
                    {/* 1-hour slot button from :30 (positioned centered across hour boundary) - only for hours before 6 PM */}
                    {!isWeekend && hour < 18 && isSlotAvailable(hour, 30, 60) && canFit(hour, 30, 60) && (
                      <div className="absolute inset-0 z-40 pointer-events-none">
                        <div className="absolute top-8 left-3 h-16 flex items-center pointer-events-auto">
                          <div className="relative">
                            <div className="absolute inset-0 bg-background rounded-md"></div>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  size="sm" 
                                  className="text-xs h-10 px-4 bg-success/20 hover:bg-success/30 text-success border border-success/30 font-medium transition-all hover:scale-105 shadow-sm relative z-10"
                                  onClick={() => handleSlotClick(hour, 30, 60)}
                                >
                                  1 Hour
                                </Button>
                              </TooltipTrigger>
                               <TooltipContent className="z-[100]">
                                 <p>{formatTimeRange(hour, 30, 60)}</p>
                               </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    )}
                 </div>
               </div>
            ))}
          </div>
          
          {/* Events Overlay */}
          <div className="absolute top-0 left-16 right-0 pointer-events-none">
            {events
              .filter((event) => {
                // Show events that start before 6:30 PM (18:30)
                const eventStartMinutes = event.startHour * 60 + event.startMinute;
                return eventStartMinutes < 18 * 60 + 30; // Before 6:30 PM
              })
              .map((event) => {
                const position = getEventPosition(event);
                return (
                  <div key={event.id} className="absolute left-1 right-1 z-30" style={{ top: position.top, height: position.height }}>
                    <div className="absolute inset-0 bg-background rounded-md"></div>
                    <div className="absolute inset-0 bg-destructive/20 text-destructive rounded-md px-2 py-1 text-xs font-medium border border-destructive/30 pointer-events-auto z-10">
                      <div className="flex items-center justify-center h-full">
                        <span className="text-xs font-medium">Busy</span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
        
        <div className="mt-6 p-4 bg-muted/30 rounded-xl border border-border/50">
          <div className="flex items-center gap-6 text-sm text-muted-foreground mb-3">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-destructive/20 border border-destructive/30 rounded-md"></div>
              <span className="font-medium">Busy Time</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-3 bg-success/20 border border-success/30 rounded-md"></div>
              <span className="font-medium">Available Slots</span>
            </div>
          </div>
          <p className="text-xs leading-relaxed">
            <span className="text-muted-foreground">Click any available button to book your appointment. All times shown are in </span><span className="text-destructive font-semibold">Central Standard Time (CST)</span><span className="text-muted-foreground">.</span>
          </p>
        </div>
      </CardContent>
    </Card>
    </TooltipProvider>
  );
}