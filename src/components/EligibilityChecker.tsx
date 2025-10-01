import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, CheckCircle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AILeadCapture from "./AILeadCapture";

interface EligibilityCheckerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TicketData {
  violation?: string;
  fine?: string;
  ticketNumber?: string;
  issueDate?: string;
  location?: string;
}

interface EligibilityResult {
  isEligible: boolean;
  reason: string;
  analysis: string;
  recommendations: string[];
}

export function EligibilityChecker({ open, onOpenChange }: EligibilityCheckerProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [ticketData, setTicketData] = useState<TicketData | null>(null);
  const [eligibilityResult, setEligibilityResult] = useState<EligibilityResult | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setTicketData(null);
    setEligibilityResult(null);

    try {
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target?.result as string);
      reader.readAsDataURL(file);

      // Convert to base64 for OCR
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = reader.result as string;
          resolve(base64String.split(',')[1]);
        };
        reader.readAsDataURL(file);
      });

      // Step 1: Run OCR
      toast.info("Scanning your ticket...");
      const { data: ocrData, error: ocrError } = await supabase.functions.invoke('ocr-ticket', {
        body: { imageBase64: base64 }
      });

      if (ocrError) throw ocrError;

      setTicketData(ocrData);

      // Step 2: Analyze eligibility
      toast.info("Analyzing eligibility...");
      const question = `Is this ticket eligible for dispute? ${ocrData.violation ? `Violation: ${ocrData.violation}.` : ''} ${ocrData.fine ? `Fine: ${ocrData.fine}.` : ''}`;
      
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke('analyze-ticket-ai', {
        body: { 
          question,
          ticketData: ocrData
        }
      });

      if (analysisError) throw analysisError;

      // Parse the AI response to determine eligibility
      const aiAnswer = analysisData.ai_answer;
      const isEligible = aiAnswer.hook?.toLowerCase().includes('eligible') || 
                        aiAnswer.hook?.toLowerCase().includes('dispute') ||
                        aiAnswer.hook?.toLowerCase().includes('fight');

      setEligibilityResult({
        isEligible,
        reason: aiAnswer.hook || "Analysis complete",
        analysis: aiAnswer.explain || "",
        recommendations: aiAnswer.faqs?.map((faq: any) => faq.answer) || []
      });

      toast.success("Analysis complete!");
    } catch (error) {
      console.error('Error processing ticket:', error);
      toast.error("Failed to process ticket. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const resetChecker = () => {
    setTicketData(null);
    setEligibilityResult(null);
    setImagePreview(null);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      onOpenChange(open);
      if (!open) resetChecker();
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Free Eligibility Check</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {!eligibilityResult ? (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="ticket-upload"
                  disabled={isProcessing}
                />
                <label 
                  htmlFor="ticket-upload" 
                  className="cursor-pointer flex flex-col items-center space-y-3"
                >
                  {isProcessing ? (
                    <Loader2 className="h-12 w-12 text-primary animate-spin" />
                  ) : (
                    <Upload className="h-12 w-12 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-lg font-semibold">
                      {isProcessing ? "Processing your ticket..." : "Upload Your Traffic Ticket"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Click to select or drag and drop
                    </p>
                  </div>
                </label>
              </div>

              {imagePreview && (
                <div className="rounded-lg overflow-hidden border">
                  <img src={imagePreview} alt="Ticket preview" className="w-full" />
                </div>
              )}

              {ticketData && !eligibilityResult && (
                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <p className="font-semibold">Ticket Details Extracted:</p>
                  {ticketData.violation && <p>Violation: {ticketData.violation}</p>}
                  {ticketData.fine && <p>Fine: {ticketData.fine}</p>}
                  {ticketData.ticketNumber && <p>Ticket #: {ticketData.ticketNumber}</p>}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className={`p-6 rounded-lg border-2 ${eligibilityResult.isEligible ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-red-500 bg-red-50 dark:bg-red-950'}`}>
                <div className="flex items-start gap-4">
                  {eligibilityResult.isEligible ? (
                    <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400 flex-shrink-0 mt-1" />
                  ) : (
                    <XCircle className="h-8 w-8 text-red-600 dark:text-red-400 flex-shrink-0 mt-1" />
                  )}
                  <div>
                    <h3 className="text-xl font-bold mb-2">
                      {eligibilityResult.isEligible ? "Your Ticket May Be Eligible!" : "Limited Eligibility"}
                    </h3>
                    <p className="text-lg">{eligibilityResult.reason}</p>
                  </div>
                </div>
              </div>

              {eligibilityResult.analysis && (
                <div className="prose dark:prose-invert max-w-none">
                  <h4 className="font-semibold text-lg mb-2">Analysis:</h4>
                  <p className="text-muted-foreground">{eligibilityResult.analysis}</p>
                </div>
              )}

              <AILeadCapture />

              <div className="flex gap-3">
                <Button onClick={resetChecker} variant="outline" className="flex-1">
                  Check Another Ticket
                </Button>
                <Button onClick={() => onOpenChange(false)} className="flex-1">
                  Get Started
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
