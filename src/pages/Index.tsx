import { useState } from "react";
import { SlotCalendar } from "@/components/SlotCalendar";
import { BookingModal } from "@/components/BookingModal";
import bookMySlotLogo from "@/assets/book-my-slot-logo.png";
interface TimeSlot {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  duration: number;
}

const Index = () => {
  const [selectedSlots, setSelectedSlots] = useState<TimeSlot[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleSlotSelect = (slot: TimeSlot) => {
    setSelectedSlots(prev => {
      // Check if slot is already selected
      const existingIndex = prev.findIndex(s => s.id === slot.id);
      if (existingIndex >= 0) {
        // Remove if already selected
        return prev.filter(s => s.id !== slot.id);
      } else {
        // Add new slot
        return [...prev, slot];
      }
    });
  };

  const handleBookSelectedSlots = () => {
    if (selectedSlots.length > 0) {
      setIsModalOpen(true);
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    // Don't clear selected slots on modal close so user can re-open if needed
  };

  const clearSelectedSlots = () => {
    setSelectedSlots([]);
  };
  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-12 animate-fade-in">
          <div className="inline-flex items-center gap-3 mb-6">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center animate-float">
              <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <h1 className="text-5xl font-bold mb-6 text-gradient leading-tight">
            Book Your Perfect Time Slots
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Select one or multiple available time slots to schedule your meetings with ease and confidence
          </p>
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-sm font-medium text-destructive">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            All time slots are displayed in Central Standard Time (CST)
          </div>
        </div>
        
        <SlotCalendar onSlotSelect={handleSlotSelect} selectedSlots={selectedSlots} />
        
        {/* Selected Slots Summary */}
        {selectedSlots.length > 0 && (
          <div className="fixed bottom-6 right-6 z-50">
            <div className="bg-card border border-border rounded-lg shadow-lg p-4 space-y-3 min-w-80">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Selected Slots ({selectedSlots.length})</h3>
                <button 
                  onClick={clearSelectedSlots}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  Clear All
                </button>
              </div>
              <div className="space-y-2">
                {selectedSlots.map((slot) => (
                  <div key={slot.id} className="text-xs p-2 bg-primary/10 rounded border">
                    <div className="font-medium">
                      {slot.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                    <div className="text-muted-foreground">
                      {slot.startTime} - {slot.endTime} ({slot.duration}min)
                    </div>
                  </div>
                ))}
              </div>
              <button 
                onClick={handleBookSelectedSlots}
                className="w-full btn-gradient text-primary-foreground py-2 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Book {selectedSlots.length} Slot{selectedSlots.length > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        <BookingModal slots={selectedSlots} isOpen={isModalOpen} onClose={handleModalClose} onSuccess={clearSelectedSlots} />
      </div>
      
      <footer className="text-center py-6 border-t border-border/10">
        <p className="text-sm text-muted-foreground">
          This page is developed by <span className="font-semibold text-primary">Anand</span>, Please reach out to him for any feedback or suggestions.
        </p>
      </footer>
    </div>
  );
};
export default Index;