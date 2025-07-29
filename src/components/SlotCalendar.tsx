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
  duration: number;
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
  
  const fetchTimeSlots = async () => {
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
        toast({ title: "Error", description: "Failed to fetch time slots", variant: "destructive" });
        return;
      }

      const timeSlots: TimeSlot[] = data.slots || [];
      setSlots(timeSlots);
      setLastUpdated(new Date());
      toast({ title: "Slots Updated", description: `Loaded ${timeSlots.length} time slots` });

    } catch (error) {
      toast({ title: "Error", description: "Failed to connect to calendar service", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTimeSlots(); }, []);

  const selectedDateSlots = slots.filter(slot => {
    if (!selectedDate) return false;
    const slotDate = new Date(slot.date);
    slotDate.setHours(0,0,0,0);
    
    const compareDate = new Date(selectedDate);
    compareDate.setHours(0,0,0,0);
    
    return slotDate.getTime() === compareDate.getTime();
  });

  // Get unique dates that have available slots
  const availableDates = slots.filter(slot => slot.isAvailable).map(slot => new Date(slot.date));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Select a Date
            </div>
            <Button variant="outline" size="sm" onClick={fetchTimeSlots} disabled={loading}>
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
          <CardTitle>Available Time Slots</CardTitle>
          {loading && (
            <p className="text-sm text-muted-foreground">
              Loading time slots...
            </p>
          )}
        </CardHeader>
        <CardContent>
          {selectedDate ? (
            <div className="space-y-3">
              {selectedDateSlots.length > 0 ? (
                selectedDateSlots.map((slot) => (
                  <div key={slot.id} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Clock className="h-4 w-4" />
                          {slot.startTime} - {slot.endTime} CST
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {slot.duration} minutes
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {slot.isAvailable ? (
                          <>
                            <Badge variant="default" className="bg-green-600">Available</Badge>
                            <Button 
                              size="sm" 
                              onClick={() => onSlotSelect(slot)}
                              className="ml-2"
                            >
                              Book Slot
                            </Button>
                          </>
                        ) : (
                          <Badge variant="secondary">Busy</Badge>
                        )}
                      </div>
                    </div>
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