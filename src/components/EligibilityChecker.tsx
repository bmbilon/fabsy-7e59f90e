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
import { PHOTO_RADAR, PHOTO_RADAR_PRICE_LABEL, RAPID_RESOLUTION } from "@/config/offers";
import TicketTypeFields from "./TicketTypeFields";
import { applyTicketType, detectTicketType, ticketDateFromExtraction, type TicketTypeState } from "@/lib/ticket/ticketType";
import { TICKET_CAPTURE_BROWSE_ACCEPT, TICKET_CAPTURE_PHOTO_ACCEPT, validateTicketCaptureFile } from "@/lib/ticket/ticketCapture";
import { supabase } from "@/integrations/supabase/client";
import { useTicketCache } from "@/hooks/useTicketCache";
import { toast } from "sonner";

interface EligibilityCheckerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TicketData extends TicketTypeState {
  violation?: string;
  fine?: string;
  fineAmount?: string;
  ticketNumber?: string;
  issueDate?: string;
  offenceDate?: string;
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
  const detected = detectTicketType(source);

  return {
    ticketType: detected ?? "officer_issued",
    ticketTypeSource: detected ? "upload" : "default",
    registeredOwnerOnOffenceDate: "",
    ticketNumber: textValue(source.ticketNumber),
    issueDate: ticketDateFromExtraction(source, "officer_issued"),
    offenceDate: ticketDateFromExtraction(source, "photo_radar"),
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

function rapidResolutionPrefill(ticketData: TicketData) {
  const fineAmount = ticketData.fineAmount || ticketData.fine || "";
  const offence = ticketData.offenceDescription || ticketData.violation || "";
  const ticketDate = ticketDateFromExtraction(ticketData, ticketData.ticketType);

  return {
    ticketType: ticketData.ticketType,
    ticketTypeSource: ticketData.ticketTypeSource,
    registeredOwnerOnOffenceDate: ticketData.registeredOwnerOnOffenceDate,
    ticketNumber: ticketData.ticketNumber || "",
    // issueDate is the representation form's legacy name for its displayed date.
    issueDate: ticketDate,
    offenceDate: ticketData.offenceDate || "",
    ticketDate,
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
  const isPhotoRadar = ticketData?.ticketType === "photo_radar";
  const offer = isPhotoRadar ? PHOTO_RADAR : RAPID_RESOLUTION;

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

    const fileValidation = validateTicketCaptureFile(file);
    if ("error" in fileValidation) {
      event.target.value = "";
      toast.error(fileValidation.error);
      return;
    }

    const requestId = reviewRequestRef.current + 1;
    reviewRequestRef.current = requestId;
    setIsProcessing(true);
    setTicketData(null);
    setShowSummary(false);
    setCacheKey(null);
    setSelectedFile(file);

    if (fileValidation.kind === "pdf") {
      setImagePreview(null);
      setTicketData(normalizedTicketData(null));
      setIsProcessing(false);
      toast.info("PDF attached for manual review. Enter the readable details and select the ticket type below.");
      return;
    }

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
      toast.error("We could not read that ticket image. Try another image or continue from the Rapid Resolution intake.");
    } finally {
      if (reviewRequestRef.current === requestId) setIsProcessing(false);
    }
  };

  const continueToRapidResolution = () => {
    if (!ticketData || !selectedFile) {
      toast.error("Choose and review a ticket image first.");
      return;
    }

    const prefillTicketData = rapidResolutionPrefill(ticketData);
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
    navigate(offer.intakePath, { state: navigationState });
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent ref={dialogScrollRef} className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Free Ticket Review</DialogTitle>
          <DialogDescription>
            Upload a PDF, clear image or take a photo. Images are scanned; PDFs are attached for manual review. No payment is required.
          </DialogDescription>
        </DialogHeader>

        {!showSummary ? (
          <div className="space-y-5">
            <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-6 text-center sm:p-8">
              <input
                ref={fileInputRef}
                id={inputId}
                type="file"
                accept={TICKET_CAPTURE_BROWSE_ACCEPT}
                className="sr-only"
                disabled={isProcessing}
                onChange={handleFileUpload}
              />
              <input
                ref={cameraInputRef}
                id={cameraInputId}
                type="file"
                accept={TICKET_CAPTURE_PHOTO_ACCEPT}
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
                  <p className="mt-1 text-sm text-muted-foreground">PDF, JPG, PNG, WebP, HEIC or HEIF · maximum 10 MB</p>
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
                <TicketTypeFields ticketType={ticketData.ticketType} ticketTypeSource={ticketData.ticketTypeSource} registeredOwnerOnOffenceDate={ticketData.registeredOwnerOnOffenceDate} onTicketTypeChange={value => setTicketData(current => current ? applyTicketType(current, value, "manual") : current)} onOwnerChange={registeredOwnerOnOffenceDate => setTicketData(current => current ? { ...current, registeredOwnerOnOffenceDate } : current)} />
                <div className="rounded-xl border bg-muted/30 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <FileSearch className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                    <div>
                      <p className="font-semibold">Check the captured ticket details</p>
                      <p className="mt-1 text-sm text-muted-foreground">OCR can make mistakes. Correct anything that does not match the ticket.</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    {ticketFields.map((field) => {
                      const { placeholder } = field;
                      const key = isPhotoRadar && field.key === "issueDate" ? "offenceDate" : field.key;
                      const label = key === "offenceDate" ? "Offence date" : field.label;
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
                              ...(current || normalizedTicketData(null)),
                              [key]: event.target.value,
                            }))}
                          />
                          {key === "offenceDate" && <p className="text-xs text-muted-foreground">Use the offence date on the notice, not its issue or mailing date. Enter it if the scan left this blank.</p>}
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
                <div><dt className="text-muted-foreground">{isPhotoRadar ? "Offence date" : "Issue date"}</dt><dd className="font-medium">{ticketData ? ticketDateFromExtraction(ticketData, ticketData.ticketType) || "Not captured — enter it on the intake" : "Not captured"}</dd></div>
              </dl>
            </div>

            <div className="rounded-xl border border-primary/25 bg-primary/5 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Handle the ticket online</p>
              <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h4 className="text-lg font-bold">{offer.name} · ${offer.priceCad}</h4>
                  <p className="text-sm text-muted-foreground">{isPhotoRadar ? PHOTO_RADAR.insuranceDisclaimer : "Eligible pre-trial service from intake through your decision on any Crown response."}</p>
                </div>
                <p className="text-sm font-semibold">CAD · plus GST</p>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                {isPhotoRadar && <li className="font-semibold">{PHOTO_RADAR_PRICE_LABEL}. No trial. No success fee.</li>}
                <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />Digital authorization, disclosure request and tracking</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />Disclosure analysis and fact-specific prosecutor review</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />Immediate updates and your final instruction on any Crown response</li>
              </ul>
            </div>

            <div className="rounded-xl border bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-xs leading-relaxed text-slate-600">
                  {offer.actionCommitment} Government fines are separate.
                  {" "}{offer.outcomeDisclaimer}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[0.8fr_1.2fr]">
              <Button type="button" variant="outline" onClick={resetReview}>Review Another Ticket</Button>
              <Button type="button" size="lg" onClick={continueToRapidResolution}>
                {isPhotoRadar ? "Continue to Photo Radar intake" : "Continue to Rapid Resolution"}
              </Button>
            </div>

            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              Continuing opens the secure Rapid Resolution intake with your ticket image and captured details attached in this browser session.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
