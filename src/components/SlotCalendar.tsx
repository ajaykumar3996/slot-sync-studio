import { useState, useEffect } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TimeSlot {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  duration: number; // 30 or 60 minutes
}

interface SlotCalendarProps {
  onSlotSelect: (slot: TimeSlot) => void;
}

export function SlotCalendar({ onSlotSelect }: SlotCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { toast } = useToast();
  
  // Fetch slots from Google Calendar via Supabase edge function
  const fetchCalendarSlots = async () => {
    setLoading(true);
    try {
      const today = new Date();
      const endDate = new Date();
      endDate.setDate(today.getDate() + 14); // Fetch 2 weeks ahead

      const { data, error } = await supabase.functions.invoke('fetch-calendar-slots', {
        body: {
          startDate: today.toISOString(),
          endDate: endDate.toISOString()
        }
      });

      if (error) {
        console.error('Error fetching calendar slots:', error);
        toast({
          title: "Error",
          description: "Failed to fetch available time slots. Please try again.",
          variant: "destructive",
        });
        return;
      }

      // Convert API response to TimeSlot format
      const calendarSlots: TimeSlot[] = data.slots.map((slot: any) => ({
        ...slot,
        date: new Date(slot.date)
      }));

      setSlots(calendarSlots);
      setLastUpdated(new Date());
      
      toast({
        title: "Calendar Updated",
        description: "Latest availability loaded from Google Calendar",
      });

    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Failed to connect to calendar service",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Load slots on component mount
  useEffect(() => {
    fetchCalendarSlots();
  }, []);

  const selectedDateSlots = slots.filter(
    slot => selectedDate && 
    slot.date.toDateString() === selectedDate.toDateString()
  );

  // Group slots by duration for better display
  const slotsByDuration = selectedDateSlots.reduce((acc, slot) => {
    if (!acc[slot.duration]) acc[slot.duration] = [];
    acc[slot.duration].push(slot);
    return acc;
  }, {} as Record<number, TimeSlot[]>);
  
  const availableDates = slots
    .filter(slot => slot.isAvailable)
    .map(slot => slot.date);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Select a Date
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchCalendarSlots}
              disabled={loading}
            >
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
          <CardTitle>Available Time Slots (CST)</CardTitle>
          {loading && (
            <p className="text-sm text-muted-foreground">
              Loading latest availability from Google Calendar...
            </p>
          )}
        </CardHeader>
        <CardContent>
          {selectedDate ? (
            <div className="space-y-4">
              {Object.keys(slotsByDuration).length > 0 ? (
                Object.entries(slotsByDuration).map(([duration, durationSlots]) => (
                  <div key={duration} className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground">
                      {duration}-minute slots
                    </h4>
                    {durationSlots.map((slot) => (
                      <div key={slot.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {slot.startTime} - {slot.endTime}
                          </span>
                          <Badge variant={slot.isAvailable ? "default" : "secondary"}>
                            {slot.isAvailable ? "Available" : "Booked"}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {slot.duration}min
                          </Badge>
                        </div>
                        {slot.isAvailable && (
                          <Button 
                            size="sm" 
                            onClick={() => onSlotSelect(slot)}
                            disabled={loading}
                          >
                            Book Slot
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  {loading ? "Loading slots..." : "No slots available for this date"}
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