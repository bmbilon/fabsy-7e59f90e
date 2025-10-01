import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { trackMicroLead } from "@/hooks/useAEOAnalytics";

interface AILeadCaptureProps {
  variant?: "open" | "gated";
  ticketType?: string;
  aiAnswer?: string;
  onSubmitSuccess?: () => void;
}

export default function AILeadCapture({ 
  variant = "open", 
  ticketType = "", 
  aiAnswer = "",
  onSubmitSuccess 
}: AILeadCaptureProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    ticketType: ticketType,
  });
  const [ticketFile, setTicketFile] = useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Basic validation
      if (!formData.name || !formData.email) {
        toast.error("Please fill in all required fields");
        setIsSubmitting(false);
        return;
      }

      // Track micro-conversion
      await trackMicroLead({
        name: formData.name,
        email: formData.email,
        ticketType: formData.ticketType || "Not specified",
        source: "ai_helper"
      });

      // Send lead capture email
      const { error: emailError } = await supabase.functions.invoke('send-lead-capture', {
        body: {
          name: formData.name,
          email: formData.email,
          ticketType: formData.ticketType || "Not specified",
          aiAnswer: aiAnswer,
          hasTicketUpload: !!ticketFile
        }
      });

      if (emailError) {
        throw emailError;
      }

      setIsSuccess(true);
      toast.success("Request submitted!", {
        description: "We'll review your ticket and reply within 24 hours."
      });

      if (onSubmitSuccess) {
        onSubmitSuccess();
      }

    } catch (error) {
      console.error("Lead capture error:", error);
      toast.error("Submission failed", {
        description: "Please try again or call us at 403-669-5353"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/20 dark:to-green-900/20 border-green-200 dark:border-green-800">
        <CardContent className="p-6 text-center space-y-3">
          <CheckCircle className="h-12 w-12 text-green-600 mx-auto" />
          <h3 className="text-xl font-bold text-green-900 dark:text-green-100">
            Request Received!
          </h3>
          <p className="text-sm text-green-800 dark:text-green-200">
            We'll review your eligibility and email you within 24 hours.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-primary/5 to-secondary/5 border-primary/20">
      <CardContent className="p-6 space-y-4">
        <div className="text-center space-y-2">
          <h3 className="text-xl font-bold">Get a free eligibility check</h3>
          <p className="text-sm text-muted-foreground">
            No-cost review • 24-hr reply • Not legal advice
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              type="text"
              placeholder="Your full name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ticketType">Ticket Type</Label>
            <Input
              id="ticketType"
              type="text"
              placeholder="e.g., Speeding, Red light"
              value={formData.ticketType}
              onChange={(e) => setFormData({ ...formData, ticketType: e.target.value })}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ticketUpload">Upload Ticket (Optional)</Label>
            <label 
              htmlFor="ticketUpload"
              className="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary transition-colors cursor-pointer"
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {ticketFile ? ticketFile.name : "Click to upload or drag & drop"}
              </span>
              <input
                id="ticketUpload"
                type="file"
                accept="image/*,.pdf,.heic,.heif"
                className="sr-only"
                onChange={(e) => setTicketFile(e.target.files?.[0] || null)}
                disabled={isSubmitting}
              />
            </label>
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            size="lg"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Submitting..." : "Get Free Review"}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            By submitting, you agree to receive follow-up communication from Fabsy.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
