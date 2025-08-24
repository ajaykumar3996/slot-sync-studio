import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import DynamicFavicon from "./components/DynamicFavicon";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        <DynamicFavicon
  timeZone="America/Chicago"
  borderRadius={0}            // perfect square border
  borderColor="#2563EB"       // outline blue
  numberColor="#2563EB"       // blue “24”
  fill="#FFFFFF"              // white inside
/>

      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
