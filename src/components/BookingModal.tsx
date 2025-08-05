import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Clock, User, Mail, MessageSquare, Phone, Building, Briefcase, FileText, Users, Link } from "lucide-react";
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!slot || !formData.name.trim() || !formData.email.trim() || 
        !formData.phoneNumber.trim() || !formData.clientName.trim() || 
        !formData.roleName.trim() || !formData.jobDescription.trim() || !resumeFile) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields and upload your resume.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      let resumeFilePath = null;
      
      // Upload resume file if provided
      if (resumeFile) {
        const fileExt = resumeFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('resumes')
          .upload(fileName, resumeFile);

        if (uploadError) {
          console.error('Resume upload error:', uploadError);
          throw new Error('Failed to upload resume');
        }
        
        resumeFilePath = uploadData.path;
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
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Book Time Slot
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4" />
              <span>{slot.date.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4" />
              <span>{slot.startTime} - {slot.endTime} CST ({slot.duration} minutes)</span>
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
                className="h-12 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/80"
              />
              <p className="text-xs text-muted-foreground">Only PDF and DOCX files up to 10MB</p>
              {resumeFile && (
                <p className="text-sm text-muted-foreground">Selected: {resumeFile.name}</p>
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

            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? "Sending Request..." : "Request Booking"}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}