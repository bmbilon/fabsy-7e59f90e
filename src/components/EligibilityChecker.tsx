import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, CheckCircle, Camera, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTicketCache } from "@/hooks/useTicketCache";

interface EligibilityCheckerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TicketData {
  violation?: string;
  fine?: string;
  fineAmount?: string;
  ticketNumber?: string;
  issueDate?: string;
  location?: string;
  officer?: string;
  officerBadge?: string;
  offenceSection?: string;
  offenceSubSection?: string;
  offenceDescription?: string;
  courtDate?: string;
  courtJurisdiction?: string;
}

interface EligibilityResult {
  reason: string;
  violationType: string;
}

export function EligibilityChecker({ open, onOpenChange }: EligibilityCheckerProps) {
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [ticketData, setTicketData] = useState<TicketData | null>(null);
  const [eligibilityResult, setEligibilityResult] = useState<EligibilityResult | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [cacheKey, setCacheKey] = useState<string | null>(null);
  const dialogScrollRef = useRef<HTMLDivElement | null>(null);
  
  // Use ticket cache hook
  const { cacheTicketData } = useTicketCache();

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

      toast.success("Ticket scanned successfully!");
      
      // Extract and structure the data
      const extractedData = ocrData?.data || ocrData;
      const structuredTicketData = {
        ticketNumber: extractedData.ticketNumber,
        issueDate: extractedData.issueDate,
        location: extractedData.location,
        officer: extractedData.officer,
        officerBadge: extractedData.officerBadge,
        offenceSection: extractedData.offenceSection,
        offenceSubSection: extractedData.offenceSubSection,
        offenceDescription: extractedData.offenceDescription,
        violation: extractedData.violation,
        fine: extractedData.fine, // Use the formatted fine for display
        fineAmount: extractedData.fineAmount, // Store raw amount for calculations and form
        courtDate: extractedData.courtDate,
        courtJurisdiction: '', // Default empty for form compatibility
      };
      
      console.log('[EligibilityChecker] Structured ticket data created:', JSON.stringify(structuredTicketData, null, 2));
      
      // Persist immediately to localStorage so downstream pages can prefill reliably
      try {
        localStorage.setItem('eligibility-ocr-data', JSON.stringify(structuredTicketData));
        console.log('[EligibilityChecker] Saved structured ticket data to localStorage (eligibility-ocr-data)');
      } catch (e) {
        console.warn('[EligibilityChecker] Failed to save OCR data to localStorage', e);
      }

      // IMMEDIATELY CACHE THE DATA TO SUPABASE (best effort, silent on failure)
      console.log('[EligibilityChecker] Attempting to cache ticket data to Supabase...');
      
      if (cacheTicketData) {
        try {
          const newCacheKey = await cacheTicketData(structuredTicketData);
          
          if (newCacheKey) {
            setCacheKey(newCacheKey);
            console.log(`[EligibilityChecker] Successfully cached ticket data with key: ${newCacheKey}`);
          } else {
            console.warn('[EligibilityChecker] Cache function returned null - no key generated');
          }
        } catch (cacheError) {
          console.error('[EligibilityChecker] Error during caching (non-blocking):', cacheError);
        }
      } else {
        console.warn('[EligibilityChecker] cacheTicketData function not available (non-blocking)');
      }
      
      // Set the local state for eligibility calculation
      setTicketData(structuredTicketData);
      setIsProcessing(false);
    } catch (error) {
      console.error('Error processing ticket:', error);
      toast.error("Failed to process ticket. Please try again.");
      setIsProcessing(false);
    }
  };

  const reviewEligibility = () => {
    if (!ticketData) return;
    
    setIsProcessing(true);
    try {
      toast.info("Preparing your ticket for review...");

      setEligibilityResult({
        reason: "Your captured ticket details are ready for an agent review. Service availability and possible options depend on the ticket, court location, and case circumstances.",
        violationType: ticketData.offenceDescription || ticketData.violation || "Traffic ticket",
      });

      toast.success("Ticket details ready for review!");
    } catch (error) {
      console.error('Error preparing ticket review:', error);
      toast.error("Failed to prepare the review. Please try again.");
    } finally {
    setIsProcessing(false);
    }
  };

  // When eligibility result is ready, scroll the dialog content to top so the result header is visible
  useEffect(() => {
    if (eligibilityResult && dialogScrollRef.current) {
      // scroll to very top of the dialog content
      dialogScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [eligibilityResult]);

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
      <DialogContent ref={dialogScrollRef} className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Ticket Eligibility Review</DialogTitle>
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
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="ticket-camera"
                  disabled={isProcessing}
                />
                <div className="flex flex-col items-center space-y-4">
                  <div className="flex flex-col items-center space-y-3">
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
                  </div>
                  
                  {!isProcessing && (
                    <div className="flex gap-3 w-full max-w-sm">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => document.getElementById('ticket-upload')?.click()}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Choose File
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => document.getElementById('ticket-camera')?.click()}
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        Take Photo
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {imagePreview && !ticketData && (
                <div className="rounded-lg overflow-hidden border">
                  <img src={imagePreview} alt="Ticket preview" className="w-full" />
                </div>
              )}

              {ticketData && !eligibilityResult && (
                <div className="space-y-6">
                  <div className="bg-muted/50 rounded-lg p-4 space-y-4">
                    <p className="font-semibold">Captured Ticket Details</p>

                    {/* Captured fields grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Helper rendering for each field */}
                      {([
                        { key: 'ticketNumber', label: 'Ticket #', placeholder: 'e.g., AB1234567' },
                        { key: 'issueDate', label: 'Issue Date', placeholder: 'YYYY-MM-DD' },
                        { key: 'location', label: 'Location', placeholder: 'Intersection or address' },
                        { key: 'officer', label: 'Officer Name', placeholder: 'e.g., J. Smith' },
                        { key: 'officerBadge', label: 'Badge #', placeholder: 'e.g., 12345' },
                        { key: 'offenceSection', label: 'Offence Section', placeholder: 'e.g., 115(2)(p)' },
                        { key: 'offenceSubSection', label: 'Offence Subsection', placeholder: 'e.g., (ii)' },
                        { key: 'offenceDescription', label: 'Offence Description', placeholder: 'e.g., Exceeded speed limit by 20 km/h' },
                        { key: 'violation', label: 'Violation Text', placeholder: 'Short violation text' },
                        { key: 'fineAmount', label: 'Fine Amount', placeholder: 'Amount shown on ticket' },
                        { key: 'courtDate', label: 'Court Date', placeholder: 'YYYY-MM-DD (if set)' },
                        { key: 'courtJurisdiction', label: 'Court Jurisdiction', placeholder: 'e.g., Calgary Provincial Court' },
                      ] as { key: keyof TicketData; label: string; placeholder: string }[]).map(({ key, label, placeholder }) => {
                        const k = key as keyof TicketData;
                        const value = ticketData?.[k] as string | undefined;
                        const present = Boolean(value && String(value).trim().length > 0);
                        return (
                          <div key={String(key)} className="space-y-1">
                            <div className="flex items-center gap-2">
                              {present ? (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              ) : (
                                <Circle className="h-4 w-4 text-red-500" />
                              )}
                              <Label className="text-xs font-medium">{label}</Label>
                            </div>
                            <Input
                              value={value || ''}
                              onChange={(e) => {
                                const v = e.target.value;
                                setTicketData((prev) => ({ ...(prev || {}), [k]: v } as TicketData));
                              }}
                              placeholder={present ? undefined : placeholder}
                              className={`bg-white dark:bg-gray-900 placeholder:italic placeholder:text-muted-foreground`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Continue to review the captured information. This tool does not estimate
                      insurance changes, savings, demerits, or a likely case outcome.
                    </p>
                    <Button
                      onClick={reviewEligibility}
                      className="w-full"
                      size="lg"
                      disabled={isProcessing}
                    >
                      {isProcessing ? "Reviewing..." : "Review Ticket Details"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Eligibility Status */}
              <div className="p-6 rounded-lg border-2 border-green-500 bg-green-50 dark:bg-green-950">
                <div className="flex items-start gap-4">
                  <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-xl font-bold mb-2">Ready for Agent Review</h3>
                    <p className="text-lg">{eligibilityResult.reason}</p>
                  </div>
                </div>
              </div>

              {/* Ticket Details */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h4 className="font-semibold mb-3">Ticket Information</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Violation Type:</span>
                    <p className="font-medium">{eligibilityResult.violationType}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Ticket #:</span>
                    <p className="font-medium">{ticketData?.ticketNumber || 'Not captured'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Fine Amount:</span>
                    <p className="font-medium">{ticketData?.fineAmount || ticketData?.fine || 'Not captured'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Court Jurisdiction:</span>
                    <p className="font-medium">{ticketData?.courtJurisdiction || 'Not captured'}</p>
                  </div>
                </div>
              </div>

              {/* Pricing explanation */}
              <div className="bg-gradient-to-br from-primary/5 to-secondary/5 border border-primary/20 rounded-lg p-4">
                <h4 className="font-semibold mb-2">How our pricing works</h4>
                <p className="text-sm text-muted-foreground">
                  Representation uses a $488 base representation fee plus 30% of any fine reduction achieved.
                  If the fine is not reduced, there is no success fee.
                </p>
              </div>

              <div className="flex gap-3">
                <Button onClick={resetChecker} variant="outline" className="flex-1">
                  Check Another Ticket
                </Button>
                <Button onClick={() => {
                  console.log(`[EligibilityChecker] Button clicked. Cache key: ${cacheKey}`);
                  console.log(`[EligibilityChecker] Ticket data:`, ticketData);
                  
                  // Ensure we have ticket data
                  if (!ticketData) {
                    toast.error("No ticket data available. Please scan your ticket again.");
                    return;
                  }
                  
                  // Create data for form - prioritize fineAmount field for TicketForm compatibility
                  const formData = {
                    ticketNumber: ticketData?.ticketNumber || '',
                    issueDate: ticketData?.issueDate || '',
                    location: ticketData?.location || '',
                    officer: ticketData?.officer || '',
                    officerBadge: ticketData?.officerBadge || '',
                    offenceSection: ticketData?.offenceSection || '',
                    offenceSubSection: ticketData?.offenceSubSection || '',
                    offenceDescription: ticketData?.offenceDescription || '',
                    violation: ticketData?.violation || '',
                    fineAmount: ticketData?.fineAmount || ticketData?.fine || '', // Prefer fineAmount, fallback to fine
                    courtDate: ticketData?.courtDate || '',
                    courtJurisdiction: ticketData?.courtJurisdiction || '',
                  };
                  
                  console.log(`[EligibilityChecker] Form data being stored for direct navigation:`, formData);
                  
                  // Store data in localStorage for resilience
                  localStorage.setItem('eligibility-ocr-data', JSON.stringify(formData));
                  if (cacheKey) localStorage.setItem('ticket-cache-key', cacheKey);
                  
                  // Close dialog and navigate directly to Ticket Form step 2 with prefill
                  onOpenChange(false);
                  navigate('/ticket-form', { state: { prefillTicketData: formData, startAtStep: 2 } });
                }} className="flex-1">
                  Continue to Ticket Form
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
