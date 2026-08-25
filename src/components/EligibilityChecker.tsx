import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, CheckCircle2, Circle, FileSearch, Loader2, ShieldCheck, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TICKET_ASSESSMENT } from "@/config/ticketAssessment";
import { supabase } from "@/integrations/supabase/client";
import { useTicketCache } from "@/hooks/useTicketCache";
import { toast } from "sonner";

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
  [key: string]: unknown;
}

interface OcrResponse {
  success?: boolean;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const ticketFields = [
  { key: "ticketNumber", label: "Ticket #", placeholder: "e.g. AB1234567" },
  { key: "issueDate", label: "Issue date", placeholder: "YYYY-MM-DD" },
  { key: "location", label: "Location", placeholder: "Intersection or address" },
  { key: "officer", label: "Officer name", placeholder: "e.g. J. Smith" },
  { key: "officerBadge", label: "Badge #", placeholder: "e.g. 12345" },
  { key: "offenceSection", label: "Offence section", placeholder: "e.g. 115(2)(p)" },
  { key: "offenceSubSection", label: "Offence subsection", placeholder: "e.g. (ii)" },
  { key: "offenceDescription", label: "Offence description", placeholder: "Description shown on the ticket" },
  { key: "violation", label: "Violation text", placeholder: "Short violation text" },
  { key: "fineAmount", label: "Fine amount", placeholder: "Amount shown on ticket" },
  { key: "courtDate", label: "Response or court date", placeholder: "YYYY-MM-DD, if shown" },
  { key: "courtJurisdiction", label: "Court jurisdiction", placeholder: "e.g. Red Deer Court of Justice" },
] as const satisfies ReadonlyArray<{ key: keyof TicketData; label: string; placeholder: string }>;

function textValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function normalizedTicketData(response: OcrResponse | null): TicketData {
  const extracted = response?.data && typeof response.data === "object" ? response.data : response;
  const source = extracted && typeof extracted === "object" ? extracted : {};

  return {
    ticketNumber: textValue(source.ticketNumber),
    issueDate: textValue(source.issueDate),
    location: textValue(source.location),
    officer: textValue(source.officer),
    officerBadge: textValue(source.officerBadge),
    offenceSection: textValue(source.offenceSection || source.section),
    offenceSubSection: textValue(source.offenceSubSection || source.subsection),
    offenceDescription: textValue(source.offenceDescription || source.offenseDescription),
    violation: textValue(source.violation),
    fine: textValue(source.fine),
    fineAmount: textValue(source.fineAmount || source.fine),
    courtDate: textValue(source.courtDate),
    courtJurisdiction: textValue(source.courtJurisdiction),
  };
}

function numericFine(value: string) {
  return value.replace(/[^0-9.]/g, "");
}

function priorityReviewPrefill(ticketData: TicketData) {
  const fineAmount = ticketData.fineAmount || ticketData.fine || "";
  const offence = ticketData.offenceDescription || ticketData.violation || "";

  return {
    ticketNumber: ticketData.ticketNumber || "",
    issueDate: ticketData.issueDate || "",
    ticketDate: ticketData.issueDate || "",
    location: ticketData.location || "",
    officer: ticketData.officer || "",
    officerBadge: ticketData.officerBadge || "",
    offenceSection: ticketData.offenceSection || "",
    offenceSubSection: ticketData.offenceSubSection || "",
    offenceDescription: ticketData.offenceDescription || "",
    violation: ticketData.violation || "",
    offence,
    fineAmount: numericFine(fineAmount),
    courtDate: ticketData.courtDate || "",
    responseDeadline: ticketData.courtDate || "",
    courtJurisdiction: ticketData.courtJurisdiction || "",
  };
}

function isSupportedImage(file: File) {
  return file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name);
}

export function EligibilityChecker({ open, onOpenChange }: EligibilityCheckerProps) {
  const navigate = useNavigate();
  const inputId = useId();
  const cameraInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const dialogScrollRef = useRef<HTMLDivElement | null>(null);
  const reviewRequestRef = useRef(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ticketData, setTicketData] = useState<TicketData | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [cacheKey, setCacheKey] = useState<string | null>(null);
  const { cacheTicketData } = useTicketCache();

  useEffect(() => {
    if (showSummary && dialogScrollRef.current) {
      dialogScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [showSummary]);

  const resetReview = () => {
    reviewRequestRef.current += 1;
    setTicketData(null);
    setSelectedFile(null);
    setImagePreview(null);
    setShowSummary(false);
    setCacheKey(null);
    setIsProcessing(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const handleDialogChange = (nextOpen: boolean) => {
    if (!nextOpen) resetReview();
    onOpenChange(nextOpen);
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!isSupportedImage(file)) {
      event.target.value = "";
      toast.error("Choose a JPG, PNG, WebP, HEIC or HEIF ticket image.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      event.target.value = "";
      toast.error("The ticket image must be between 1 byte and 10 MB.");
      return;
    }

    const requestId = reviewRequestRef.current + 1;
    reviewRequestRef.current = requestId;
    setIsProcessing(true);
    setTicketData(null);
    setShowSummary(false);
    setCacheKey(null);
    setSelectedFile(file);

    try {
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("The ticket image could not be read."));
        reader.readAsDataURL(file);
      });
      if (reviewRequestRef.current !== requestId) return;
      setImagePreview(imageBase64);

      toast.info("Scanning your ticket...");
      const { data, error } = await supabase.functions.invoke<OcrResponse>("ocr-ticket", {
        body: { imageBase64 },
      });
      if (reviewRequestRef.current !== requestId) return;
      if (error) throw error;

      const captured = normalizedTicketData(data);
      setTicketData(captured);
      toast.success("Ticket details captured. Please check them for accuracy.");

      try {
        window.localStorage.setItem("eligibility-ocr-data", JSON.stringify(captured));
      } catch {
        // Browser storage is optional; the current review remains available in memory.
      }

      try {
        const newCacheKey = await cacheTicketData(captured);
        if (reviewRequestRef.current === requestId && newCacheKey) setCacheKey(newCacheKey);
      } catch {
        // Remote field caching is best effort and must never block the free review.
      }
    } catch (error) {
      if (reviewRequestRef.current !== requestId) return;
      console.error("Free ticket review OCR failed", error);
      setSelectedFile(null);
      setImagePreview(null);
      toast.error("We could not read that ticket image. Try another image or continue from the Priority Review page.");
    } finally {
      if (reviewRequestRef.current === requestId) setIsProcessing(false);
    }
  };

  const continueToPriorityReview = () => {
    if (!ticketData || !selectedFile) {
      toast.error("Choose and review a ticket image first.");
      return;
    }

    const prefillTicketData = priorityReviewPrefill(ticketData);
    try {
      window.localStorage.setItem("eligibility-ocr-data", JSON.stringify(prefillTicketData));
      if (cacheKey) window.localStorage.setItem("ticket-cache-key", cacheKey);
    } catch {
      // React Router state still carries the file and captured fields.
    }

    const navigationState = {
      ticketImage: selectedFile,
      prefillTicketData,
      source: "free_ticket_review",
      ticketCacheKey: cacheKey,
    };

    resetReview();
    onOpenChange(false);
    navigate(TICKET_ASSESSMENT.intakePath, { state: navigationState });
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent ref={dialogScrollRef} className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Free Ticket Review</DialogTitle>
          <DialogDescription>
            Upload a clear image or take a photo. The tool captures ticket details for you to verify; no payment is required.
          </DialogDescription>
        </DialogHeader>

        {!showSummary ? (
          <div className="space-y-5">
            <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-6 text-center sm:p-8">
              <input
                ref={fileInputRef}
                id={inputId}
                type="file"
                accept="image/*,.heic,.heif"
                className="sr-only"
                disabled={isProcessing}
                onChange={handleFileUpload}
              />
              <input
                ref={cameraInputRef}
                id={cameraInputId}
                type="file"
                accept="image/*,.heic,.heif"
                capture="environment"
                className="sr-only"
                disabled={isProcessing}
                onChange={handleFileUpload}
              />

              <div className="flex flex-col items-center gap-4">
                {isProcessing ? (
                  <Loader2 className="h-12 w-12 animate-spin text-primary" aria-hidden="true" />
                ) : (
                  <Upload className="h-12 w-12 text-primary" aria-hidden="true" />
                )}
                <div>
                  <p className="text-lg font-semibold">
                    {isProcessing ? "Reading your ticket..." : "Add your ticket image"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">JPG, PNG, WebP, HEIC or HEIF · maximum 10 MB</p>
                </div>

                {!isProcessing ? (
                  <div className="grid w-full max-w-sm gap-3 sm:grid-cols-2">
                    <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                      Choose File
                    </Button>
                    <Button type="button" variant="outline" onClick={() => cameraInputRef.current?.click()}>
                      <Camera className="mr-2 h-4 w-4" aria-hidden="true" />
                      Take Photo
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>

            {imagePreview ? (
              <div className="overflow-hidden rounded-xl border bg-muted/30 p-3">
                <img src={imagePreview} alt="Uploaded traffic ticket preview" className="mx-auto max-h-64 rounded-lg object-contain" />
              </div>
            ) : null}

            {ticketData ? (
              <div className="space-y-5">
                <div className="rounded-xl border bg-muted/30 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <FileSearch className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                    <div>
                      <p className="font-semibold">Check the captured ticket details</p>
                      <p className="mt-1 text-sm text-muted-foreground">OCR can make mistakes. Correct anything that does not match the ticket.</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    {ticketFields.map(({ key, label, placeholder }) => {
                      const value = ticketData[key] || "";
                      const present = value.trim().length > 0;
                      return (
                        <div key={key} className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            {present ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                            ) : (
                              <Circle className="h-4 w-4 text-amber-500" aria-hidden="true" />
                            )}
                            <Label htmlFor={`${inputId}-${key}`} className="text-xs font-medium">{label}</Label>
                          </div>
                          <Input
                            id={`${inputId}-${key}`}
                            value={value}
                            placeholder={placeholder}
                            onChange={(event) => setTicketData((current) => ({
                              ...(current || {}),
                              [key]: event.target.value,
                            }))}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    This free tool captures the information you provide. It does not determine legal eligibility,
                    estimate insurance changes or savings, provide legal advice, or predict an outcome.
                  </p>
                  <Button type="button" size="lg" className="mt-4 w-full" onClick={() => setShowSummary(true)}>
                    Review Captured Details
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" aria-hidden="true" />
                <div>
                  <h3 className="text-lg font-bold text-slate-950">Your ticket details are ready</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-700">
                    You completed the free capture and review. No payment has been requested and no service has been retained.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-muted/30 p-4">
              <h4 className="font-semibold">Captured ticket</h4>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Ticket #</dt><dd className="font-medium">{ticketData?.ticketNumber || "Not captured"}</dd></div>
                <div><dt className="text-muted-foreground">Offence</dt><dd className="font-medium">{ticketData?.offenceDescription || ticketData?.violation || "Not captured"}</dd></div>
                <div><dt className="text-muted-foreground">Fine</dt><dd className="font-medium">{ticketData?.fineAmount || ticketData?.fine || "Not captured"}</dd></div>
                <div><dt className="text-muted-foreground">Date</dt><dd className="font-medium">{ticketData?.issueDate || "Not captured"}</dd></div>
              </dl>
            </div>

            <div className="rounded-xl border border-primary/25 bg-primary/5 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Optional next step</p>
              <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h4 className="text-lg font-bold">$149 Priority Review</h4>
                  <p className="text-sm text-muted-foreground">Human-reviewed ticket and insurance-impact assessment.</p>
                </div>
                <p className="text-sm font-semibold">CAD total · GST included</p>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />Charge, deadline, fine and demerit implications</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />Likely insurance significance and practical options</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />Representation economics and a recommended next step</li>
              </ul>
            </div>

            <div className="rounded-xl border bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-xs leading-relaxed text-slate-600">
                  Full Representation is a separate later choice for eligible matters. It uses a $488 base
                  representation fee plus applicable tax and 30% of any fine reduction achieved; there is no
                  success fee if the fine is not reduced. Priority Review has no success fee. Government fines
                  are separate. Fabsy is an Alberta traffic ticket agent service, not a law firm, and no result is promised.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[0.8fr_1.2fr]">
              <Button type="button" variant="outline" onClick={resetReview}>Review Another Ticket</Button>
              <Button type="button" size="lg" onClick={continueToPriorityReview}>
                Continue to $149 Priority Review
              </Button>
            </div>

            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              Continuing opens the secure Priority Review intake with your ticket image and captured details attached in this browser session.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
