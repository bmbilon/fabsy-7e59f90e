import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, CheckCircle, XCircle, DollarSign, Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AILeadCapture from "./AILeadCapture";
import { useTicketCache, type TicketData as CachedTicketData } from "@/hooks/useTicketCache";

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
}

interface EligibilityResult {
  isEligible: boolean;
  reason: string;
  financials: {
    fine: number;
    estimatedInsuranceIncrease: number;
    threeYearImpact: number;
    totalCostIfConvicted: number;
    serviceFee: number;
    potentialSavings: number;
    roi: number;
  };
  violationType: string;
  demeritPoints: number;
}

// Same violation impacts as calculator
const violationImpacts: Record<string, { increase: number; points: number; description: string }> = {
  'speeding-minor': { increase: 0.15, points: 2, description: 'Minor Speeding (1-15 km/h over)' },
  'speeding-major': { increase: 0.25, points: 3, description: 'Major Speeding (16-30 km/h over)' },
  'speeding-excessive': { increase: 0.35, points: 4, description: 'Excessive Speeding (31+ km/h over)' },
  'careless-driving': { increase: 0.40, points: 6, description: 'Careless/Reckless Driving' },
  'distracted-driving': { increase: 0.30, points: 3, description: 'Distracted Driving' },
  'running-light': { increase: 0.20, points: 3, description: 'Running Red Light/Stop Sign' },
  'following-too-close': { increase: 0.15, points: 2, description: 'Following Too Closely' },
  'improper-lane-change': { increase: 0.10, points: 2, description: 'Improper Lane Change' },
  'other': { increase: 0.15, points: 2, description: 'Other Traffic Violation' }
};

const SERVICE_FEE = 488;
const AVERAGE_PREMIUM = 1800; // Alberta average

// Map violation text to violation type
function detectViolationType(violationText: string): string {
  const text = violationText.toLowerCase();
  
  if (text.includes('speed')) {
    if (text.includes('excessive') || text.match(/\d{2,}\s*km/)) {
      const match = text.match(/(\d+)\s*km/);
      if (match) {
        const speed = parseInt(match[1]);
        if (speed > 30) return 'speeding-excessive';
        if (speed > 15) return 'speeding-major';
      }
      return 'speeding-major';
    }
    return 'speeding-minor';
  }
  
  if (text.includes('careless') || text.includes('reckless') || text.includes('dangerous')) {
    return 'careless-driving';
  }
  
  if (text.includes('distract') || text.includes('phone') || text.includes('cell')) {
    return 'distracted-driving';
  }
  
  if (text.includes('red light') || text.includes('stop sign') || text.includes('traffic control')) {
    return 'running-light';
  }
  
  if (text.includes('follow') && text.includes('close')) {
    return 'following-too-close';
  }
  
  if (text.includes('lane') && text.includes('change')) {
    return 'improper-lane-change';
  }
  
  return 'other';
}

export function EligibilityChecker({ open, onOpenChange }: EligibilityCheckerProps) {
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [ticketData, setTicketData] = useState<TicketData | null>(null);
  const [eligibilityResult, setEligibilityResult] = useState<EligibilityResult | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [monthlyPremium, setMonthlyPremium] = useState<string>("");
  const [cacheKey, setCacheKey] = useState<string | null>(null);
  
  // Use ticket cache hook
  const { cacheTicketData, generateCacheKey } = useTicketCache();

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
      
      // IMMEDIATELY CACHE THE DATA TO SUPABASE
      console.log('[EligibilityChecker] Attempting to cache ticket data to Supabase...');
      
      if (cacheTicketData) {
        try {
          const newCacheKey = await cacheTicketData(structuredTicketData);
          
          if (newCacheKey) {
            setCacheKey(newCacheKey);
            console.log(`[EligibilityChecker] Successfully cached ticket data with key: ${newCacheKey}`);
            toast.success("Ticket scanned and cached successfully!");
          } else {
            console.warn('[EligibilityChecker] Cache function returned null - no key generated');
            toast.success("Ticket scanned! (cache failed, using backup)");
          }
        } catch (cacheError) {
          console.error('[EligibilityChecker] Error during caching:', cacheError);
          toast.success("Ticket scanned! (cache error, using backup)");
        }
      } else {
        console.warn('[EligibilityChecker] cacheTicketData function not available');
        toast.success("Ticket scanned! (cache not available, using backup)");
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

  const calculateEligibility = () => {
    if (!ticketData) return;
    
    setIsProcessing(true);
    try {
      // Calculate eligibility based on financial logic (same as calculator)
      toast.info("Calculating savings...");
      
      const fineAmount = parseFloat(ticketData.fineAmount?.replace(/[^0-9.]/g, '') || ticketData.fine?.replace(/[^0-9.]/g, '') || '0');
      const violationType = detectViolationType(ticketData.violation || '');
      const violation = violationImpacts[violationType];
      
      // Use custom premium if provided, otherwise use average
      const userPremium = monthlyPremium ? parseFloat(monthlyPremium) * 12 : AVERAGE_PREMIUM;
      
      // Calculate insurance impact
      const annualIncrease = userPremium * violation.increase;
      const threeYearImpact = annualIncrease * 3;
      const totalCostIfConvicted = fineAmount + threeYearImpact;
      const potentialSavings = totalCostIfConvicted - SERVICE_FEE;
      const roi = ((potentialSavings - SERVICE_FEE) / SERVICE_FEE) * 100;
      
      // Ticket is eligible if fighting it saves money
      const isEligible = potentialSavings > 0;
      
      setEligibilityResult({
        isEligible,
        reason: isEligible 
          ? `This ticket is worth disputing! You could save $${potentialSavings.toFixed(0)} over 3 years.`
          : `This ticket may not justify representation costs, but our zero-risk guarantee means you have nothing to lose.`,
        financials: {
          fine: fineAmount,
          estimatedInsuranceIncrease: annualIncrease,
          threeYearImpact,
          totalCostIfConvicted,
          serviceFee: SERVICE_FEE,
          potentialSavings,
          roi
        },
        violationType: violation.description,
        demeritPoints: violation.points
      });

      toast.success("Analysis complete!");
    } catch (error) {
      console.error('Error calculating eligibility:', error);
      toast.error("Failed to calculate. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const resetChecker = () => {
    setTicketData(null);
    setEligibilityResult(null);
    setImagePreview(null);
    setMonthlyPremium("");
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

              {imagePreview && (
                <div className="rounded-lg overflow-hidden border">
                  <img src={imagePreview} alt="Ticket preview" className="w-full" />
                </div>
              )}

              {ticketData && !eligibilityResult && (
                <div className="space-y-4">
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <p className="font-semibold">Ticket Details Extracted:</p>
                    {ticketData.violation && <p>Violation: {ticketData.violation}</p>}
                    {ticketData.fine && <p>Fine: {ticketData.fine}</p>}
                    {ticketData.ticketNumber && <p>Ticket #: {ticketData.ticketNumber}</p>}
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="monthly-premium" className="text-sm font-medium">
                        Monthly Insurance Premium (Optional)
                      </Label>
                      <Input
                        id="monthly-premium"
                        type="number"
                        placeholder="e.g., 150"
                        value={monthlyPremium}
                        onChange={(e) => setMonthlyPremium(e.target.value)}
                        className="bg-white dark:bg-gray-900"
                      />
                      <p className="text-xs text-muted-foreground">
                        {monthlyPremium 
                          ? `Annual: $${(parseFloat(monthlyPremium) * 12).toFixed(0)}` 
                          : `Leave blank to use average ($${AVERAGE_PREMIUM}/year)`}
                      </p>
                    </div>

                    <Button 
                      onClick={calculateEligibility} 
                      className="w-full" 
                      size="lg"
                      disabled={isProcessing}
                    >
                      {isProcessing ? "Calculating..." : "Calculate Eligibility"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Eligibility Status */}
              <div className={`p-6 rounded-lg border-2 ${eligibilityResult.isEligible ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950'}`}>
                <div className="flex items-start gap-4">
                  {eligibilityResult.isEligible ? (
                    <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400 flex-shrink-0 mt-1" />
                  ) : (
                    <XCircle className="h-8 w-8 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-1" />
                  )}
                  <div>
                    <h3 className="text-xl font-bold mb-2">
                      {eligibilityResult.isEligible ? "✅ Worth Fighting!" : "⚠️ Consider Carefully"}
                    </h3>
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
                    <span className="text-muted-foreground">Demerit Points:</span>
                    <p className="font-medium">{eligibilityResult.demeritPoints} points</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Fine Amount:</span>
                    <p className="font-medium">${eligibilityResult.financials.fine}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Ticket #:</span>
                    <p className="font-medium">{ticketData?.ticketNumber || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="h-5 w-5 text-primary" />
                  <h4 className="font-semibold">Financial Impact</h4>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Ticket Fine:</span>
                    <span className="font-medium">${eligibilityResult.financials.fine}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Annual Insurance Increase:</span>
                    <span className="font-medium">${eligibilityResult.financials.estimatedInsuranceIncrease.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>3-Year Insurance Impact:</span>
                    <span className="font-medium">${eligibilityResult.financials.threeYearImpact.toFixed(0)}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between font-semibold">
                    <span>Total Cost if Convicted:</span>
                    <span className="text-destructive">${eligibilityResult.financials.totalCostIfConvicted.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Our Service Fee:</span>
                    <span>${eligibilityResult.financials.serviceFee}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between font-bold text-lg">
                    <span>Your Savings:</span>
                    <span className="text-primary">${eligibilityResult.financials.potentialSavings.toFixed(0)}</span>
                  </div>
                  {eligibilityResult.financials.roi > 0 && (
                    <div className="bg-primary/10 rounded p-2 text-center">
                      <span className="text-primary font-bold">
                        {eligibilityResult.financials.roi.toFixed(0)}% more than you invest!
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Risk-Free Guarantee */}
              <div className="bg-gradient-to-br from-primary/5 to-secondary/5 border border-primary/20 rounded-lg p-4">
                <h4 className="font-semibold mb-2">🛡️ Zero-Risk Guarantee</h4>
                <p className="text-sm text-muted-foreground">
                  {eligibilityResult.isEligible 
                    ? "With our no-win, no-fee guarantee, you only pay if we save you money. This ticket is worth fighting!"
                    : "Even if savings are limited, our zero-risk guarantee means you pay nothing if we don't reduce your costs."}
                </p>
              </div>

              <AILeadCapture ticketType={eligibilityResult.violationType} />

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
                  
                  console.log(`[EligibilityChecker] Form data being stored:`, formData);
                  
                  // Store data in localStorage for immediate reliability
                  localStorage.setItem('eligibility-ocr-data', JSON.stringify(formData));
                  
                  // Also try to cache in Supabase if available (non-blocking)
                  if (cacheKey) {
                    localStorage.setItem('ticket-cache-key', cacheKey);
                    console.log(`[EligibilityChecker] Cache key also stored: ${cacheKey}`);
                  }
                  
                  console.log(`[EligibilityChecker] Data stored in localStorage, navigating to form`);
                  toast.success("Navigating to ticket form with your data!");
                  
                  // Close dialog and navigate
                  onOpenChange(false);
                  navigate('/ticket-form');
                }} className="flex-1">
                  Get My Ticket Dismissed
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
