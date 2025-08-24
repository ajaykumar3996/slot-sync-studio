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
        <div className={`space-y-6 ${isWeekend ? 'opacity-50' : ''}`}>
          {/* Modern Time Slot Cards */}
          <div className="space-y-3">
            {hours.map((hour) => {
              if (hour === 18) return null; // Skip 6 PM
              
              const hourEvents = events.filter(event => 
                event.startHour <= hour && event.endHour > hour
              );
              
              return (
                <div key={hour} className="bg-background border border-border rounded-xl p-4 hover:border-primary/20 transition-all duration-200">
                  {/* Hour Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Clock className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg text-foreground">
                          {convertTo12Hour(hour)}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {hour < 12 ? 'Morning' : 'Afternoon'} session
                        </p>
                      </div>
                    </div>
                    
                    {/* Availability Badge */}
                    <div className="flex items-center gap-2">
                      {hourEvents.length > 0 ? (
                        <Badge variant="destructive" className="text-xs">
                          Partially Busy
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs bg-success/10 text-success">
                          Available
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  {/* Time Slots Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* 30min slot at :00 */}
                    {!isWeekend && (
                      <div className={`group relative ${
                        isSlotAvailable(hour, 0, 30) && canFit(hour, 0, 30)
                          ? 'cursor-pointer'
                          : 'cursor-not-allowed'
                      }`}>
                        <div 
                          onClick={() => isSlotAvailable(hour, 0, 30) && canFit(hour, 0, 30) && handleSlotClick(hour, 0, 30)}
                          className={`
                            p-4 rounded-lg border-2 transition-all duration-200 
                            ${isSlotAvailable(hour, 0, 30) && canFit(hour, 0, 30)
                              ? 'border-success/30 bg-success/5 hover:bg-success/10 hover:border-success/50 hover:shadow-lg hover:-translate-y-1'
                              : 'border-border/30 bg-muted/30 opacity-50'
                            }
                          `}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm text-foreground">
                                {convertTo12Hour(hour)} - {convertTo12Hour(hour)}.30
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                30 minutes
                              </p>
                            </div>
                            {isSlotAvailable(hour, 0, 30) && canFit(hour, 0, 30) ? (
                              <div className="w-8 h-8 rounded-full bg-success flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Plus className="w-4 h-4 text-white" />
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                <Clock className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* 30min slot at :30 */}
                    {!isWeekend && (
                      <div className={`group relative ${
                        isSlotAvailable(hour, 30, 30) && canFit(hour, 30, 30)
                          ? 'cursor-pointer'
                          : 'cursor-not-allowed'
                      }`}>
                        <div 
                          onClick={() => isSlotAvailable(hour, 30, 30) && canFit(hour, 30, 30) && handleSlotClick(hour, 30, 30)}
                          className={`
                            p-4 rounded-lg border-2 transition-all duration-200 
                            ${isSlotAvailable(hour, 30, 30) && canFit(hour, 30, 30)
                              ? 'border-success/30 bg-success/5 hover:bg-success/10 hover:border-success/50 hover:shadow-lg hover:-translate-y-1'
                              : 'border-border/30 bg-muted/30 opacity-50'
                            }
                          `}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm text-foreground">
                                {convertTo12Hour(hour)}.30 - {convertTo12Hour(hour + 1)}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                30 minutes
                              </p>
                            </div>
                            {isSlotAvailable(hour, 30, 30) && canFit(hour, 30, 30) ? (
                              <div className="w-8 h-8 rounded-full bg-success flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Plus className="w-4 h-4 text-white" />
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                <Clock className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* 1 hour slot from :00 */}
                    {!isWeekend && (
                      <div className={`group relative ${
                        isSlotAvailable(hour, 0, 60) && canFit(hour, 0, 60)
                          ? 'cursor-pointer'
                          : 'cursor-not-allowed'
                      }`}>
                        <div 
                          onClick={() => isSlotAvailable(hour, 0, 60) && canFit(hour, 0, 60) && handleSlotClick(hour, 0, 60)}
                          className={`
                            p-4 rounded-lg border-2 transition-all duration-200 
                            ${isSlotAvailable(hour, 0, 60) && canFit(hour, 0, 60)
                              ? 'border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 hover:shadow-lg hover:-translate-y-1'
                              : 'border-border/30 bg-muted/30 opacity-50'
                            }
                          `}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm text-foreground">
                                {convertTo12Hour(hour)} - {convertTo12Hour(hour + 1)}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                1 hour session
                              </p>
                            </div>
                            {isSlotAvailable(hour, 0, 60) && canFit(hour, 0, 60) ? (
                              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Plus className="w-4 h-4 text-white" />
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                <Clock className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* 1 hour slot from :30 */}
                    {!isWeekend && (
                      <div className={`group relative ${
                        isSlotAvailable(hour, 30, 60) && canFit(hour, 30, 60)
                          ? 'cursor-pointer'
                          : 'cursor-not-allowed'
                      }`}>
                        <div 
                          onClick={() => isSlotAvailable(hour, 30, 60) && canFit(hour, 30, 60) && handleSlotClick(hour, 30, 60)}
                          className={`
                            p-4 rounded-lg border-2 transition-all duration-200 
                            ${isSlotAvailable(hour, 30, 60) && canFit(hour, 30, 60)
                              ? 'border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 hover:shadow-lg hover:-translate-y-1'
                              : 'border-border/30 bg-muted/30 opacity-50'
                            }
                          `}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm text-foreground">
                                {convertTo12Hour(hour)}.30 - {convertTo12Hour(hour + 1)}.30
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                1 hour session
                              </p>
                            </div>
                            {isSlotAvailable(hour, 30, 60) && canFit(hour, 30, 60) ? (
                              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Plus className="w-4 h-4 text-white" />
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                <Clock className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Busy Events for this hour */}
                  {hourEvents.length > 0 && (
                    <div className="mt-4 p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-4 h-4 bg-destructive/20 rounded-full"></div>
                        <p className="text-sm font-medium text-destructive">Busy periods</p>
                      </div>
                      {hourEvents.map((event, index) => (
                        <p key={index} className="text-xs text-muted-foreground ml-6">
                          {convertTo12Hour(event.startHour)}:{event.startMinute.toString().padStart(2, '0')} - {convertTo12Hour(event.endHour)}:{event.endMinute.toString().padStart(2, '0')}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Legend */}
        <div className="mt-8 p-6 bg-gradient-to-r from-primary/5 to-accent/5 rounded-xl border border-primary/10">
          <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
              <Clock className="w-3 h-3 text-primary" />
            </div>
            Booking Guide
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-success flex items-center justify-center">
                <Plus className="w-3 h-3 text-white" />
              </div>
              <span className="text-muted-foreground">30-minute sessions</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                <Plus className="w-3 h-3 text-white" />
              </div>
              <span className="text-muted-foreground">1-hour sessions</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-destructive/20"></div>
              <span className="text-muted-foreground">Unavailable times</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
            All times are displayed in <strong>Central Standard Time (CST)</strong>. Click any available slot to book your appointment.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}