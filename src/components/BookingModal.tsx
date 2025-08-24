import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Clock, User, Mail, MessageSquare, Phone, Building, Briefcase, FileText, Users, Link, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface TimeSlot {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  duration: number; // 30 or 60 minutes
}

interface BookingModalProps {
  slot: TimeSlot | null;
  isOpen: boolean;
  onClose: () => void;
}

export function BookingModal({ slot, isOpen, onClose }: BookingModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phoneNumber: "",
    clientName: "",
    roleName: "",
    jobDescription: "",
    teamDetails: "",
    jobLink: "",
    message: ""
  });
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [paymentScreenshot, setPaymentScreenshot] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!slot || !formData.name.trim() || !formData.email.trim() || 
        !formData.phoneNumber.trim() || !formData.clientName.trim() || 
        !formData.roleName.trim() || !formData.jobDescription.trim() || !resumeFile || !paymentScreenshot) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields and upload both your resume and payment screenshot.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      let resumeFilePath = null;
      let paymentScreenshotPath = null;
      
      // Upload resume file if provided
      if (resumeFile) {
        const fileExt = resumeFile.name.split('.').pop();
        const fileName = `resume-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('resumes')
          .upload(fileName, resumeFile);

        if (uploadError) {
          console.error('Resume upload error:', uploadError);
          throw new Error('Failed to upload resume');
        }
        
        resumeFilePath = uploadData.path;
      }

      // Upload payment screenshot if provided
      if (paymentScreenshot) {
        const fileExt = paymentScreenshot.name.split('.').pop();
        const fileName = `payment-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('resumes')
          .upload(fileName, paymentScreenshot);

        if (uploadError) {
          console.error('Payment screenshot upload error:', uploadError);
          throw new Error('Failed to upload payment screenshot');
        }
        
        paymentScreenshotPath = uploadData.path;
      }

      // Submit booking request via Supabase edge function
      const { data, error } = await supabase.functions.invoke('submit-booking-request', {
        body: {
          user_name: formData.name.trim(),
          user_email: formData.email.trim(),
          phone_number: formData.phoneNumber.trim(),
          client_name: formData.clientName.trim(),
          role_name: formData.roleName.trim(),
          job_description: formData.jobDescription.trim(),
          resume_file_path: resumeFilePath,
          payment_screenshot_path: paymentScreenshotPath,
          team_details: formData.teamDetails.trim() || null,
          job_link: formData.jobLink.trim() || null,
          message: formData.message.trim() || null,
          slot_date: slot.date.getFullYear() + '-' + String(slot.date.getMonth() + 1).padStart(2, '0') + '-' + String(slot.date.getDate()).padStart(2, '0'),
          slot_start_time: slot.startTime,
          slot_end_time: slot.endTime,
          slot_duration_minutes: slot.duration,
        }
      });

      if (error) {
        console.error('Booking submission error:', error);
        throw new Error(error.message);
      }
      
      toast({
        title: "Booking Request Submitted",
        description: data.message || "Your booking request has been sent. You'll receive a confirmation email once approved.",
      });

      setFormData({ 
        name: "", 
        email: "", 
        phoneNumber: "",
        clientName: "",
        roleName: "",
        jobDescription: "",
        teamDetails: "",
        jobLink: "",
        message: "" 
      });
      setResumeFile(null);
      setPaymentScreenshot(null);
      onClose();
    } catch (error) {
      console.error('Error submitting booking:', error);
      toast({
        title: "Error",
        description: "Failed to submit booking request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!slot) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-w-[95vw] w-full">
        <DialogHeader className="pb-4">
          <DialogTitle className="flex items-center gap-3 text-xl">
            {/* <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-primary" />
            </div> */}
            <span className="text-gradient">Enter your details</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="card-enhanced p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Calendar className="h-4 w-4 text-primary" />
              </div>
              <span className="font-semibold text-foreground">
                {slot.date.toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
                <Clock className="h-4 w-4 text-accent" />
              </div>
              <span className="font-semibold text-foreground">
                {slot.startTime} - {slot.endTime} 
                <span className="text-sm font-bold text-destructive ml-2">
                  CST ({slot.duration} minutes)
                </span>
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 max-h-96 overflow-y-auto px-3">
            {/* Required Fields */}
            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Full Name *
              </Label>
              <Input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="Enter your full name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email Address *
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                placeholder="Enter your email address"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phoneNumber" className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Phone Number *
              </Label>
              <Input
                id="phoneNumber"
                type="tel"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                required
                placeholder="Enter your phone number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="clientName" className="flex items-center gap-2">
                <Building className="h-4 w-4" />
                Client Name *
              </Label>
              <Input
                id="clientName"
                type="text"
                value={formData.clientName}
                onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                required
                placeholder="Enter the client/company name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="roleName" className="flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Role Name *
              </Label>
              <Input
                id="roleName"
                type="text"
                value={formData.roleName}
                onChange={(e) => setFormData({ ...formData, roleName: e.target.value })}
                required
                placeholder="Enter the role/position name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="jobDescription" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Job Description *
              </Label>
              <Textarea
                id="jobDescription"
                value={formData.jobDescription}
                onChange={(e) => setFormData({ ...formData, jobDescription: e.target.value })}
                required
                placeholder="Provide a brief job description"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="resume" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Resume *
              </Label>
              <div className="relative w-full h-12 border border-input rounded-md bg-background flex items-center justify-start px-3">
                <Input
                  id="resume"
                  type="file"
                  accept=".pdf,.docx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const fileExt = file.name.split('.').pop()?.toLowerCase();
                      if (fileExt !== 'pdf' && fileExt !== 'docx') {
                        toast({
                          title: "Invalid File Type",
                          description: "Please upload only PDF or DOCX files.",
                          variant: "destructive",
                        });
                        e.target.value = '';
                        return;
                      }
                      if (file.size > 10 * 1024 * 1024) { // 10MB limit
                        toast({
                          title: "File Too Large",
                          description: "Please upload a file smaller than 10MB.",
                          variant: "destructive",
                        });
                        e.target.value = '';
                        return;
                      }
                    }
                    setResumeFile(file || null);
                  }}
                  required
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer file:cursor-pointer"
                />
                <div className="flex items-center pointer-events-none">
                  <div className="px-4 py-2 btn-gradient text-primary-foreground rounded-full text-sm font-semibold mr-3">
                    Choose File
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {resumeFile ? resumeFile.name : "No file chosen"}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Only PDF and DOCX files up to 10MB</p>
              {resumeFile && (
                <p className="text-sm text-muted-foreground">Selected: {resumeFile.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentScreenshot" className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Payment Screenshot *
              </Label>
              <div className="relative w-full h-12 border border-input rounded-md bg-background flex items-center justify-start px-3">
                <Input
                  id="paymentScreenshot"
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const fileExt = file.name.split('.').pop()?.toLowerCase();
                      if (!['png', 'jpg', 'jpeg', 'webp'].includes(fileExt || '')) {
                        toast({
                          title: "Invalid File Type",
                          description: "Please upload only PNG, JPG, JPEG, or WEBP image files.",
                          variant: "destructive",
                        });
                        e.target.value = '';
                        return;
                      }
                      if (file.size > 10 * 1024 * 1024) { // 10MB limit
                        toast({
                          title: "File Too Large",
                          description: "Please upload a file smaller than 10MB.",
                          variant: "destructive",
                        });
                        e.target.value = '';
                        return;
                      }
                    }
                    setPaymentScreenshot(file || null);
                  }}
                  required
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer file:cursor-pointer"
                />
                <div className="flex items-center pointer-events-none">
                  <div className="px-4 py-2 btn-gradient text-primary-foreground rounded-full text-sm font-semibold mr-3">
                    Choose File
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {paymentScreenshot ? paymentScreenshot.name : "No file chosen"}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Only PNG, JPG, JPEG, or WEBP files up to 10MB</p>
              {paymentScreenshot && (
                <p className="text-sm text-muted-foreground">Selected: {paymentScreenshot.name}</p>
              )}
            </div>

            {/* Optional Fields */}
            <div className="space-y-2">
              <Label htmlFor="teamDetails" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Team Details (Optional)
              </Label>
              <Input
                id="teamDetails"
                type="text"
                value={formData.teamDetails}
                onChange={(e) => setFormData({ ...formData, teamDetails: e.target.value })}
                placeholder="Which team are you interviewing for?"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="jobLink" className="flex items-center gap-2">
                <Link className="h-4 w-4" />
                Job Link (Optional)
              </Label>
              <Input
                id="jobLink"
                type="url"
                value={formData.jobLink}
                onChange={(e) => setFormData({ ...formData, jobLink: e.target.value })}
                placeholder="Link to the job posting you applied for"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Additional Message (Optional)
              </Label>
              <Textarea
                id="message"
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="Any additional information or special requests"
                rows={3}
              />
            </div>

            <div className="flex gap-3 pt-6">
              <Button 
                type="button" 
                variant="outline" 
                onClick={onClose} 
                className="flex-1 h-12 font-medium"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting} 
                className="flex-1 h-12 btn-gradient font-medium disabled:opacity-50"
              >
                {isSubmitting ? "Sending Request..." : "Request Booking"}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}