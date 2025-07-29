import { SlotCalendar } from "@/components/SlotCalendar";

const Index = () => {

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">Calendar Events</h1>
          <p className="text-xl text-muted-foreground">
            View your Google Calendar events
          </p>
        </div>
        
        <SlotCalendar />
      </div>
    </div>
  );
};

export default Index;
