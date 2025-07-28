import { useState } from "react";
import { SlotCalendar } from "@/components/SlotCalendar";
import { BookingModal } from "@/components/BookingModal";

interface TimeSlot {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  duration: number; // 30 or 60 minutes
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

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">Book Your Time Slot</h1>
          <p className="text-xl text-muted-foreground">
            Select an available date and time to request a booking
          </p>
        </div>
        
        <SlotCalendar onSlotSelect={handleSlotSelect} />
        
        <BookingModal 
          slot={selectedSlot}
          isOpen={isModalOpen}
          onClose={handleModalClose}
        />
      </div>
    </div>
  );
};

export default Index;
