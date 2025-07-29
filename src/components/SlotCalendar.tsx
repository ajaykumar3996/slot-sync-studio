import { useState, useEffect } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  description: string;
  location: string;
}

interface SlotCalendarProps {
  onEventSelect?: (event: CalendarEvent) => void;
}

export function SlotCalendar({ onEventSelect }: SlotCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { toast } = useToast();
  
  const fetchCalendarEvents = async () => {
    setLoading(true);
    try {
      const today = new Date();
      const endDate = new Date();
      endDate.setDate(today.getDate() + 14);

      const { data, error } = await supabase.functions.invoke('fetch-calendar-slots', {
        body: {
          startDate: today.toISOString(),
          endDate: endDate.toISOString()
        }
      });

      if (error) {
        toast({ title: "Error", description: "Failed to fetch calendar events", variant: "destructive" });
        return;
      }

      const calendarEvents: CalendarEvent[] = data.events || [];
      setEvents(calendarEvents);
      setLastUpdated(new Date());
      toast({ title: "Calendar Updated", description: `Loaded ${calendarEvents.length} events` });

    } catch (error) {
      toast({ title: "Error", description: "Failed to connect to calendar service", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCalendarEvents(); }, []);

  const selectedDateEvents = events.filter(event => {
    if (!selectedDate) return false;
    const eventDate = new Date(event.start);
    eventDate.setHours(0,0,0,0);
    
    const compareDate = new Date(selectedDate);
    compareDate.setHours(0,0,0,0);
    
    return eventDate.getTime() === compareDate.getTime();
  });

  // Get unique dates that have events
  const eventDates = events.map(event => new Date(event.start));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Select a Date
            </div>
            <Button variant="outline" size="sm" onClick={fetchCalendarEvents} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </CardTitle>
          {lastUpdated && (
            <p className="text-sm text-muted-foreground">
              Last updated: {lastUpdated.toLocaleTimeString()} CST
            </p>
          )}
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
      
      <Card>
        <CardHeader>
          <CardTitle>Calendar Events</CardTitle>
          {loading && (
            <p className="text-sm text-muted-foreground">
              Loading calendar events...
            </p>
          )}
        </CardHeader>
        <CardContent>
          {selectedDate ? (
            <div className="space-y-4">
              {selectedDateEvents.length > 0 ? (
                selectedDateEvents.map((event) => {
                  const startTime = new Date(event.start).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                    timeZone: 'America/Chicago'
                  });
                  const endTime = new Date(event.end).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                    timeZone: 'America/Chicago'
                  });
                  
                  return (
                    <div key={event.id} className="p-4 border rounded-lg bg-muted/50">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium">{event.title}</h3>
                        <Badge variant="secondary">Busy</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <p className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          {startTime} - {endTime} CST
                        </p>
                        {event.location && (
                          <p className="mt-1">📍 {event.location}</p>
                        )}
                        {event.description && (
                          <p className="mt-2 text-sm">{event.description}</p>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  {loading ? "Loading events..." : "No events for this date"}
                </p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">
              Please select a date to view events
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}