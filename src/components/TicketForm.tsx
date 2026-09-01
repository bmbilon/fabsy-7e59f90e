import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import PersonalInfoStep from "./form-steps/PersonalInfoStep";
import TicketDetailsStep from "./form-steps/TicketDetailsStep";
import type { TicketCaptureState } from "@/lib/ticket/ticketCapture";
import { hasTicketReviewData, missingRequiredTicketFields } from "@/lib/ticket/ticketReview";
import DefenseStep from "./form-steps/DefenseStep";
import ConsentStep from "./form-steps/ConsentStep";
import PaymentStep from "./form-steps/PaymentStep";
import ReviewStep from "./form-steps/ReviewStep";
import { useToast } from "@/hooks/use-toast";
import { useTicketCache } from "@/hooks/useTicketCache";
import { Link } from "react-router-dom";
import { PHOTO_RADAR, PHOTO_RADAR_PRICE_LABEL, RAPID_RESOLUTION } from "@/config/offers";
import { useLocale } from "@/i18n/locale-context";
import LocalizedTicketJourney from "./LocalizedTicketJourney";
import { applyDetectedTicketType, applyTicketType, ticketDateAsLocalDate, ticketDateFromExtraction, type RegisteredOwnerAnswer, type TicketType, type TicketTypeSource } from "@/lib/ticket/ticketType";
import { isProLicenceClass, LICENCE_CLASS_OPTIONS, normalizeLicenceClass, type LicenceClass } from "@/lib/pro-drivers/intake";
import { latestReferralAttribution, normalizeReferralCode, ReferralCaptureError, type ReferralAttribution } from "@/lib/referrals/attribution";
import { captureReferralCode, captureReferralFromLocation, clearReferralAttribution, readActiveReferral, REFERRAL_ATTRIBUTION_EVENT } from "@/lib/referrals/capture";

export interface FormData {
  // Unified intake handoff
  sourceAssessmentId: string;
  sourceAssessmentAccessToken: string;

  // Personal Information
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  smsOptIn: boolean;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  dateOfBirth: Date | undefined;
  driversLicense: string;
  driversLicenseImage: File | null;
  licenceClass: LicenceClass;
  addressDifferentFromLicense: boolean;
  referral: ReferralAttribution | null;
  
  // Ticket Details
  ticketType: TicketType;
  ticketTypeSource: TicketTypeSource;
  registeredOwnerOnOffenceDate: RegisteredOwnerAnswer;
  ticketNumber: string;
  plateNumber: string;
  issueDate: Date | undefined;
  ticketDateManuallyEdited?: boolean;
  location: string;
  officer: string;
  officerBadge: string;
  offenceSection: string;
  offenceSubSection: string;
  offenceDescription: string;
  violation: string;
  fineAmount: string;
  courtDate: Date | undefined;
  courtJurisdiction: string;
  agentRepresentationPermitted: boolean | null;
  ticketImage: File | null;
  vehicleSeized: boolean;
  
  // Defense Information
  pleaType: string;
  explanation: string;
  circumstances: string;
  witnesses: boolean;
  witnessDetails: string;
  evidence: boolean;
  evidenceDetails: string;
  priorTickets: string;
  
  // Consent Information
  consentGiven: boolean;
  digitalSignature: string;
  
  // Additional Info
  insuranceCompany: string;
  vehicleDetails: string;
  additionalNotes: string;
}

const initialFormData: FormData = {
  // Unified intake handoff
  sourceAssessmentId: "",
  sourceAssessmentAccessToken: "",

  // Personal Information
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  smsOptIn: false,
  address: "",
  city: "",
  province: "",
  postalCode: "",
  dateOfBirth: undefined,
  driversLicense: "",
  driversLicenseImage: null,
  licenceClass: "unknown",
  addressDifferentFromLicense: false,
  referral: null,
  
  // Ticket Details
  ticketType: "officer_issued",
  ticketTypeSource: "default",
  registeredOwnerOnOffenceDate: "",
  ticketNumber: "",
  plateNumber: "",
  issueDate: undefined,
  ticketDateManuallyEdited: false,
  location: "",
  officer: "",
  officerBadge: "",
  offenceSection: "",
  offenceSubSection: "",
  offenceDescription: "",
  violation: "",
  fineAmount: "",
  courtDate: undefined,
  courtJurisdiction: "",
  agentRepresentationPermitted: null,
  ticketImage: null,
  vehicleSeized: false,
  
  // Defense Information
  pleaType: "",
  explanation: "",
  circumstances: "",
  witnesses: false,
  witnessDetails: "",
  evidence: false,
  evidenceDetails: "",
  priorTickets: "none",
  
  // Consent Information
  consentGiven: false,
  digitalSignature: "",
  
  // Additional Info
  insuranceCompany: "",
  vehicleDetails: "",
  additionalNotes: ""
};

const steps = [
  { id: 1, title: "Ticket Details", description: "Information about your ticket" },
  { id: 2, title: "Personal Info", description: "Your basic information" },
  { id: 3, title: "Your Account", description: "Your account of what happened" },
  { id: 4, title: "Consent Form", description: "Authorization for the Rapid Resolution service" },
  { id: 5, title: "Review", description: "Review your information" },
  { id: 6, title: "Payment", description: "Secure payment processing" }
];

function mergeCachedTicketData(current: FormData, raw: Record<string, unknown>): FormData {
  const merged = applyDetectedTicketType({
    ...current,
    ...raw,
    ticketType: current.ticketType,
    ticketTypeSource: current.ticketTypeSource,
    referral: current.referral,
    licenceClass: current.licenceClass,
    driversLicenseImage: current.driversLicenseImage,
    courtDate: ticketDateAsLocalDate(raw.courtDate),
  }, raw);
  const preserveManualDate = current.ticketDateManuallyEdited && merged.ticketType === current.ticketType;
  return {
    ...merged,
    issueDate: ticketDateAsLocalDate(ticketDateFromExtraction(raw, merged.ticketType,
      preserveManualDate ? current.issueDate ?? "" : undefined)),
    ticketDateManuallyEdited: Boolean(preserveManualDate),
  };
}

function ReferralCodeField({ referral, onChange }: {
  referral: ReferralAttribution | null;
  onChange: (referral: ReferralAttribution | null) => void;
}) {
  const [code, setCode] = useState(referral?.code ?? "");
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setCode(referral?.code ?? ""); }, [referral?.code]);

  const applyCode = async () => {
    if (isApplying || !code.trim()) return;
    if (!normalizeReferralCode(code)) {
      setError("Enter a code with 3–32 letters, numbers, hyphens or underscores.");
      return;
    }
    setIsApplying(true);
    setError("");
    try {
      const applied = await captureReferralCode(code, true);
      onChange(applied);
      setCode(applied?.code ?? "");
    } catch (failure) {
      setError(failure instanceof ReferralCaptureError && failure.reason === "invalid"
        ? "That referral code could not be verified. Check it or continue without changing your referral."
        : "We could not verify the code right now. Try again; your ticket checkout is still available.");
    } finally {
      setIsApplying(false);
    }
  };

  return <div className="mt-8 space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-5">
    <Label htmlFor="referral-code" className="text-base font-semibold">Referral code, optional</Label>
    <p id="referral-code-help" className="text-sm text-muted-foreground">Did someone refer you? Apply their code here. They may earn a referral payment; your price stays the same.</p>
    <div className="flex flex-wrap gap-3">
      <Input id="referral-code" value={code} maxLength={32} autoComplete="off" autoCapitalize="characters" spellCheck={false}
        placeholder="Enter code" className="min-w-0 flex-1 uppercase" aria-invalid={Boolean(error)} aria-describedby={`referral-code-help${error ? " referral-code-error" : ""}`}
        disabled={isApplying} onChange={event => { setCode(event.target.value); setError(""); }}
        onBlur={() => { if (code.trim() && normalizeReferralCode(code) !== referral?.code) void applyCode(); }} />
      <Button type="button" variant="outline" disabled={isApplying || !code.trim()} onClick={() => void applyCode()}>{isApplying ? "Checking…" : "Apply code"}</Button>
    </div>
    {error && <p id="referral-code-error" role="alert" className="text-sm text-destructive">{error}</p>}
    {referral && <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <p role="status">Referral code <strong>{referral.code}</strong> applied. <Link to="/refer" className="text-primary underline">Referral terms</Link></p>
      <Button type="button" variant="ghost" size="sm" disabled={isApplying} onClick={() => { clearReferralAttribution(); onChange(null); setCode(""); setError(""); }}>Remove code</Button>
    </div>}
  </div>;
}

const TicketForm = ({
  initialTicketImage = null,
  initialPrefill = null,
  initialStep,
  initialTicketType,
  sourceAssessment = null,
}: {
  initialTicketImage?: File | null;
  initialPrefill?: Partial<FormData> | null;
  initialStep?: number;
  initialTicketType?: TicketType | null;
  sourceAssessment?: { submissionId: string; accessToken: string } | null;
}) => {
  const { locale, setIntakeHandoff } = useLocale();
  const [currentStep, setCurrentStep] = useState<number>(() => {
    const s = typeof initialStep === 'number' ? initialStep : 1;
    const clamped = Math.max(1, Math.min(s, steps.length));
    return clamped;
  });
  const [formData, setFormData] = useState<FormData>(() => {
    const coerceDate = (v: unknown) => {
      if (!v) return undefined as Date | undefined;
      if (v instanceof Date) return v as Date;
      if (typeof v === 'string') {
        const d = new Date(v);
        return isNaN(d.getTime()) ? undefined : (d as Date);
      }
      return undefined as Date | undefined;
    };

    const pre = initialPrefill ?? null;
    const preCourt = pre?.courtDate as unknown;

    const draft = {
      ...initialFormData,
      ticketImage: initialTicketImage ?? null,
      sourceAssessmentId: sourceAssessment?.submissionId ?? "",
      sourceAssessmentAccessToken: sourceAssessment?.accessToken ?? "",
      ...(pre ? {
        ...pre,
        courtDate: coerceDate(preCourt),
      } : {}),
      licenceClass: normalizeLicenceClass(pre?.licenceClass),
      driversLicenseImage: typeof File !== "undefined" && pre?.driversLicenseImage instanceof File ? pre.driversLicenseImage : null,
      referral: latestReferralAttribution([pre?.referral, readActiveReferral()]),
    } as FormData;
    const typed = initialTicketType && draft.ticketTypeSource !== "manual"
      ? applyTicketType(draft, initialTicketType, "entry")
      : applyDetectedTicketType(draft, pre);
    const preserveManualDate = pre?.ticketDateManuallyEdited === true && pre?.ticketType === typed.ticketType;
    return {
      ...typed,
      issueDate: ticketDateAsLocalDate(ticketDateFromExtraction(pre, typed.ticketType,
        preserveManualDate ? pre?.issueDate ?? "" : undefined)),
      ticketDateManuallyEdited: preserveManualDate,
    };
  });
  const isPhotoRadar = formData.ticketType === "photo_radar";
  const offer = isPhotoRadar ? PHOTO_RADAR : RAPID_RESOLUTION;
  const [captureState, setCaptureState] = useState<TicketCaptureState>(() => hasTicketReviewData(formData) ? "complete" : "empty");
  const [completedTicketFile, setCompletedTicketFile] = useState<File | null>(() => hasTicketReviewData(formData) ? formData.ticketImage : null);
  const ticketDraftRevision = useRef(0);
  const cacheLoadStarted = useRef(false);
  const ticketReviewReady = captureState === "complete" || captureState === "manual"
    || (!formData.ticketImage && (Boolean(formData.sourceAssessmentId) || hasTicketReviewData(formData)));
  const captureOnly = currentStep === 1 && !ticketReviewReady;
  const handleCaptureStateChange = (state: TicketCaptureState) => {
    setCaptureState(state);
    if (state === "complete" || state === "manual") setCompletedTicketFile(formData.ticketImage);
    else setCompletedTicketFile(null);
  };
  const [isLoadingTicketData, setIsLoadingTicketData] = useState(false);
  useEffect(() => {
    const syncReferral = () => setFormData(current => ({ ...current, referral: readActiveReferral() }));
    window.addEventListener(REFERRAL_ATTRIBUTION_EVENT, syncReferral);
    void captureReferralFromLocation(window.location);
    return () => window.removeEventListener(REFERRAL_ATTRIBUTION_EVENT, syncReferral);
  }, []);
  // Preserve an active draft when the route changes between English and a
  // locale. Keep identity documents in memory, never a new browser cache.
  // A language handoff always requires fresh consent in the destination.
  useEffect(() => {
    setIntakeHandoff({
      prefillTicketData: {
        ...formData,
        ...(formData.ticketType === "photo_radar"
          ? { offenceDate: ticketDateFromExtraction(null, "photo_radar", formData.issueDate ?? "") }
          : {}),
        consentGiven: false,
        digitalSignature: '',
      },
      startAtStep: Math.min(currentStep, 4),
      ticketImage: formData.ticketImage,
    });
  }, [formData, currentStep, setIntakeHandoff]);
  const { toast } = useToast();
  const { getCachedTicketData, isCacheKeyValid } = useTicketCache();

  // Check for ticket data from eligibility checker on mount
  useEffect(() => {
    if (locale !== "en" || initialPrefill || initialTicketType || cacheLoadStarted.current) return;
    cacheLoadStarted.current = true;
    const revision = ticketDraftRevision.current;
    const canHydrate = () => ticketDraftRevision.current === revision;
    const loadTicketData = async () => {
      console.log('[TicketForm] Starting ticket data loading process...');
      
      // Prioritize direct localStorage first for immediate reliability
      await tryLocalStorageData();
      
      // Then try Supabase cache as enhancement (non-blocking)
      const cacheKey = localStorage.getItem('ticket-cache-key');
      if (cacheKey && isCacheKeyValid && getCachedTicketData) {
        console.log(`[TicketForm] Also attempting Supabase cache with key: ${cacheKey}`);
        setIsLoadingTicketData(true);
        
        try {
          const cachedData = await getCachedTicketData(cacheKey);
          if (canHydrate() && cachedData?.ticketData && Object.keys(cachedData.ticketData).length > 0) {
            console.log('[TicketForm] Supabase cache data available, updating form...');
            
            // Update form with cached data (may override localStorage)
            setFormData(prev => canHydrate() ? mergeCachedTicketData(prev, cachedData.ticketData) : prev);
            localStorage.removeItem('ticket-cache-key');
            
            console.log('[TicketForm] Form updated with Supabase cache data');
          }
        } catch (error) {
          console.error('[TicketForm] Supabase cache failed (non-blocking):', error);
        } finally {
          setIsLoadingTicketData(false);
        }
      }
    };
    
    const tryLocalStorageData = async () => {
      console.log('[TicketForm] Checking localStorage for ticket data...');
      
      // Check primary localStorage key first
      const primaryData = localStorage.getItem('eligibility-ocr-data');
      const backupData = localStorage.getItem('eligibility-ocr-data-backup');
      
      console.log('[TicketForm] Primary data available:', !!primaryData);
      console.log('[TicketForm] Backup data available:', !!backupData);
      
      // Try primary data first (most recent format)
      if (primaryData) {
        try {
          const ocrData = JSON.parse(primaryData);
          
          // Update form with primary data
          if (!canHydrate()) return false;
          setFormData(prev => canHydrate() ? mergeCachedTicketData(prev, ocrData) : prev);
          
          // Clean up primary localStorage
          localStorage.removeItem('eligibility-ocr-data');
          
          toast({
            title: "Ticket Details Pre-filled!",
            description: "Your ticket information has been automatically filled in.",
          });
          return true; // Success
        } catch (error) {
          console.error('[TicketForm] Error parsing primary OCR data:', error);
          localStorage.removeItem('eligibility-ocr-data');
        }
      }
      
      // Try backup data if primary failed
      if (backupData) {
        try {
          const ocrData = JSON.parse(backupData);
          
          // Update form with backup data
          if (!canHydrate()) return false;
          setFormData(prev => canHydrate() ? mergeCachedTicketData(prev, ocrData) : prev);
          
          // Clean up backup localStorage
          localStorage.removeItem('eligibility-ocr-data-backup');
          
          toast({
            title: "Ticket Details Pre-filled!",
            description: "Your ticket information has been loaded from backup data.",
          });
          return true; // Success
        } catch (error) {
          console.error('[TicketForm] Error parsing backup OCR data:', error);
          localStorage.removeItem('eligibility-ocr-data-backup');
        }
      }
      
      console.log('[TicketForm] No valid localStorage data found - form will remain empty');
      return false; // No data found
    };
    
    loadTicketData();
  }, [getCachedTicketData, isCacheKeyValid, toast, locale, initialPrefill, initialTicketType]);

  const updateFormData = (updates: Partial<FormData> | ((current: FormData) => Partial<FormData>)) => {
    ticketDraftRevision.current += 1;
    setFormData(prev => {
      const update = typeof updates === 'function' ? updates(prev) : updates;
      const next = { ...prev, ...update };
      const typed = update.ticketType
        ? applyTicketType({ ...next, ticketType: prev.ticketType, ticketTypeSource: prev.ticketTypeSource }, update.ticketType, update.ticketTypeSource ?? "manual")
        : next;
      const isNewTicket = typed.ticketType !== prev.ticketType || typed.ticketImage !== prev.ticketImage;
      if (typeof updates !== 'function' && Object.prototype.hasOwnProperty.call(update, "issueDate")) {
        return { ...typed, ticketDateManuallyEdited: true };
      }
      if (!isNewTicket && prev.ticketDateManuallyEdited) {
        // Parent hydration and child OCR can both finish after a manual edit,
        // including an explicit clear or an edit before leaving this step.
        return { ...typed, issueDate: prev.issueDate, ticketDateManuallyEdited: true };
      }
      return { ...typed, ticketDateManuallyEdited: isNewTicket ? false : typed.ticketDateManuallyEdited };
    });
  };

  const scrollToForm = () => {
    const formElement = document.getElementById('ticket-form-container');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const nextStep = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
      scrollToForm();
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      scrollToForm();
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <>
          <TicketDetailsStep
            formData={formData}
            updateFormData={updateFormData}
            reviewReady={ticketReviewReady}
            skipInitialScan={ticketReviewReady && completedTicketFile === formData.ticketImage}
            onCaptureStateChange={handleCaptureStateChange}
          />
          {ticketReviewReady && !isPhotoRadar && <div className="mt-8 space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-5">
            <Label htmlFor="pro-licence-class" className="text-base font-semibold">Alberta licence class</Label>
            <Select value={formData.licenceClass} onValueChange={value => updateFormData({ licenceClass: normalizeLicenceClass(value) })}>
              <SelectTrigger id="pro-licence-class" aria-describedby="pro-licence-class-help"><SelectValue /></SelectTrigger>
              <SelectContent>{LICENCE_CLASS_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
            <p id="pro-licence-class-help" className="text-sm text-muted-foreground">Class 1, 2 or 4 licence? Get 20% off Rapid Resolution and the bundle after we verify that your Alberta licence photo matches this class. Upload the photo in the next step.</p>
            <p className="text-xs text-muted-foreground">Officer tickets only. Class 5, including gig couriers, and photo radar are excluded. <Link to="/pro-drivers" className="text-primary underline">See pro driver eligibility.</Link></p>
          </div>}
        </>;
      case 2:
        return <PersonalInfoStep formData={formData} updateFormData={updateFormData} />;
      case 3:
        return <>
          <DefenseStep formData={formData} updateFormData={updateFormData} />
          <ReferralCodeField referral={formData.referral} onChange={referral => updateFormData({ referral })} />
        </>;
      case 4:
        return <ConsentStep formData={formData} updateFormData={updateFormData} />;
      case 5:
        return <ReviewStep formData={formData} onSubmit={nextStep} />;
      case 6:
        return <PaymentStep formData={formData} updateFormData={updateFormData} />;
      default:
        return null;
    }
  };

  // Validation function for each step
  const isStepValid = () => {
    switch (currentStep) {
      case 1: // Ticket Details
        return !!(
          ticketReviewReady &&
          (formData.ticketImage || formData.sourceAssessmentId) &&
          missingRequiredTicketFields(formData).length === 0 &&
          (!isPhotoRadar || formData.registeredOwnerOnOffenceDate) &&
          !formData.vehicleSeized
        );
      case 2: // Personal Info
        return !!(
          formData.firstName &&
          formData.lastName &&
          formData.email &&
          formData.phone &&
          formData.dateOfBirth &&
          formData.driversLicense &&
          formData.address &&
          formData.city &&
          formData.province &&
          formData.postalCode
        );
      case 3: // Defense
        if (isPhotoRadar) return true;
        return !!(
          formData.pleaType &&
          formData.explanation
        );
      case 4: // Consent
        return !!(
          formData.consentGiven &&
          formData.digitalSignature
        );
      case 5: // Review
        return true;
      case 6: // Payment
        return true;
      default:
        return false;
    }
  };

  // Human-readable list of what is still blocking the Continue button
  const missingFields = (): string[] => {
    const m: string[] = [];
    switch (currentStep) {
      case 1:
        if (!formData.ticketImage && !formData.sourceAssessmentId) m.push("Ticket PDF or photo");
        m.push(...missingRequiredTicketFields(formData).map(field => ({
          ticketNumber: "Ticket number", issueDate: isPhotoRadar ? "Offence date" : "Issue date",
          location: "Location", fineAmount: "Fine amount",
        })[field]));
        if (isPhotoRadar && !formData.registeredOwnerOnOffenceDate) m.push("Registered owner on the offence date");
        if (formData.vehicleSeized) m.push("A separate review is required for a vehicle-seizure matter");
        break;
      case 2:
        if (!formData.firstName) m.push("First name");
        if (!formData.lastName) m.push("Last name");
        if (!formData.dateOfBirth) m.push("Date of birth");
        if (!formData.driversLicense) m.push("Driver's licence number");
        if (!formData.address) m.push("Street address");
        if (!formData.city) m.push("City");
        if (!formData.province) m.push("Province");
        if (!formData.postalCode) m.push("Postal code");
        if (!formData.email) m.push("Email");
        if (!formData.phone) m.push("Phone number");
        break;
      case 3:
        if (isPhotoRadar) break;
        if (!formData.pleaType) m.push("Plea selection");
        if (!formData.explanation) m.push("Case explanation");
        break;
      case 4:
        if (!formData.consentGiven) m.push("Consent confirmation");
        if (!formData.digitalSignature) m.push("Digital signature");
        break;
    }
    return m;
  };

  const progress = (currentStep / steps.length) * 100;
  // Ensure page starts at top when this component mounts
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  if (locale !== "en" && (isPhotoRadar || isProLicenceClass(formData.licenceClass))) return (
    <section lang="en" className="mx-auto max-w-2xl space-y-5 rounded-xl border bg-white p-8">
      <h1 className="text-2xl font-bold">{isPhotoRadar ? "Photo Radar" : "Pro Driver Discount"} intake is available in English</h1>
      <p>The pricing and authorization for this new {isPhotoRadar ? "service" : "discount"} have not been released in this language. Your ticket and completed fields will stay with you when you continue in English.</p>
      <Button asChild><Link to={isPhotoRadar ? PHOTO_RADAR.intakePath : "/submit-ticket?ticket_type=officer_issued"} state={{ prefillTicketData: { ...formData, ...(isPhotoRadar ? { offenceDate: ticketDateFromExtraction(null, "photo_radar", formData.issueDate ?? "") } : {}), consentGiven: false, digitalSignature: "" }, startAtStep: Math.min(currentStep, 4), ticketImage: formData.ticketImage }}>Continue in English</Link></Button>
    </section>
  );
  if (locale !== "en") return <LocalizedTicketJourney formData={formData} updateFormData={updateFormData} currentStep={currentStep} nextStep={nextStep} prevStep={prevStep} />;

  return (
    <section className={`${captureOnly ? "py-4 sm:py-8" : "py-10 sm:py-16"} bg-gradient-soft min-h-screen`}>
      <div id="ticket-form-container" className="container mx-auto px-4 max-w-4xl">
        {/* Header */}
        <div className={`text-center ${captureOnly ? "mb-6 sm:mb-8" : "mb-10"}`}>
          {currentStep > 1 && <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
            {offer.name}
          </Badge>}
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-foreground">
            {currentStep === 1 ? (captureOnly ? "Let’s start with your ticket." : "Check your ticket details.") : <>Start your <span className="text-gradient-primary">{isPhotoRadar ? "photo radar resolution" : "pre-trial resolution"}</span></>}
          </h1>
          <p className={`${captureOnly ? "text-base sm:text-lg" : "text-lg"} text-muted-foreground max-w-3xl mx-auto`}>
            {currentStep === 1 ? (captureOnly ? "Take a clear photo or upload your ticket. We’ll fill in what we can for you to review." : "Review what we captured, fill in any missing details, then continue.") : isPhotoRadar ? <>Upload your Alberta registered-owner notice, confirm ownership and sign the authorization. {PHOTO_RADAR_PRICE_LABEL}. {PHOTO_RADAR.insuranceDisclaimer} Fabsy enters a not-guilty plea, requests disclosure and pursues a Crown reduction or withdrawal. You approve any deal. No trial. No success fee.</> : <>Upload the ticket, provide the details needed for disclosure, sign the digital authorization,
            and continue to the transparent ${RAPID_RESOLUTION.priceCad} CAD plus GST checkout. Want the insurance report by itself?{" "}
            <Link to="/insurance-damage-report" className="font-semibold text-primary underline underline-offset-4">
              See the Insurance Impact &amp; Renewal Planning Report.
            </Link></>}
          </p>
        </div>

        {/* Loading indicator for ticket data */}
        {isLoadingTicketData && (
          <Card className="p-6 mb-8 bg-gradient-card shadow-fab border-primary/10">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
              <p className="text-lg font-medium">Loading your ticket details...</p>
              <p className="text-muted-foreground">We're retrieving the information from your eligibility check.</p>
            </div>
          </Card>
        )}

        {/* Progress */}
        {currentStep > 1 && <Card className="p-6 mb-8 bg-gradient-card shadow-fab border-primary/10">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-muted-foreground">
                Step {currentStep} of {steps.length}
              </span>
              <span className="text-sm font-medium text-primary">
                {Math.round(progress)}% Complete
              </span>
            </div>
            
            <Progress value={progress} className="h-2" />
            
            <div className="grid grid-cols-6 gap-2">
              {steps.map((step) => (
                <div key={step.id} className="text-center">
                  <div className={`w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center text-sm font-medium transition-smooth ${
                    currentStep > step.id 
                      ? 'bg-primary text-white' 
                      : currentStep === step.id 
                        ? 'bg-primary/20 text-primary border-2 border-primary' 
                        : 'bg-muted text-muted-foreground'
                  }`}>
                    {currentStep > step.id ? <Check className="h-4 w-4" /> : step.id}
                  </div>
                  <div className="text-xs font-medium">{step.title}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>}

        {/* Form Content */}
        <Card className="p-4 sm:p-8 bg-gradient-card shadow-elevated border-primary/10">
          {currentStep > 1 && <div className="mb-8">
            <h2 className="text-2xl font-bold mb-2">{steps[currentStep - 1].title}</h2>
            <p className="text-muted-foreground">{steps[currentStep - 1].description}</p>
          </div>}

          {/* Navigation - Top */}
          {currentStep > 1 && <div className="flex justify-between mb-8 pb-6 border-b">
              <Button 
                variant="outline" 
                onClick={prevStep} 
                disabled={currentStep === 1}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Previous
              </Button>
              {currentStep !== 5 && currentStep < 6 && (
                <Button 
                  onClick={nextStep}
                  disabled={!isStepValid()}
                  className="bg-gradient-primary hover:opacity-90 transition-smooth flex items-center gap-2"
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
          </div>}

          {renderStep()}

          {/* Navigation - Bottom */}
          {!captureOnly && <div className="flex justify-between mt-8 pt-6 border-t">
              <Button 
                variant="outline" 
                onClick={prevStep} 
                disabled={currentStep === 1}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Previous
              </Button>
              {currentStep !== 5 && currentStep < 6 && (
                <Button 
                  onClick={nextStep}
                  disabled={!isStepValid()}
                  className="bg-gradient-primary hover:opacity-90 transition-smooth flex items-center gap-2"
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
          </div>}

          {/* Why Continue is disabled */}
          {!captureOnly && currentStep < 5 && !isStepValid() && missingFields().length > 0 && (
            <p className="text-sm text-muted-foreground text-right mt-3">
              Still needed: {missingFields().join(", ")}
            </p>
          )}
        </Card>

        {/* Security Note */}
        <div className="text-center mt-6 text-xs text-muted-foreground">
          <p>Your information is handled according to our Privacy Policy and processed by the service providers used to manage submissions.</p>
        </div>
      </div>
    </section>
  );
};

export default TicketForm;
