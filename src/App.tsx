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
  outlineColor="#2563EB"
  numberColor="#2563EB"
  fillColor="#FFFFFF"
  radius={12} // or 18 if you want softer corners
/>

      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
