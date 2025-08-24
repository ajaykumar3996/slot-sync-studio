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
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const handleSlotSelect = (slot: TimeSlot) => {
    setSelectedSlot(slot);
    setIsModalOpen(true);
  };
  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedSlot(null);
  };
  return <div className="min-h-screen">
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-12 animate-fade-in">
          <div className="inline-flex items-center gap-3 mb-6">
            <div className="animate-float">
              <img 
                src={bookMySlotLogo} 
                alt="Book My Slot Logo" 
                className="h-16 w-16 object-contain"
              />
            </div>
          </div>
          <h1 className="text-5xl font-bold mb-6 text-gradient leading-tight">
            Book Your Perfect Time Slot
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Select an available time slot to schedule your meeting with ease and confidence
          </p>
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-sm font-medium text-destructive">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            All time slots are displayed in Central Standard Time (CST)
          </div>
        </div>
        
        <SlotCalendar onSlotSelect={handleSlotSelect} />
        <BookingModal slot={selectedSlot} isOpen={isModalOpen} onClose={handleModalClose} />
      </div>
    </div>;
};
export default Index;