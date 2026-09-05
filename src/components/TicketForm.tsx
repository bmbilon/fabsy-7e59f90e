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
import LeadCaptureFields from "./form-steps/LeadCaptureFields";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { PHOTO_RADAR, PHOTO_RADAR_PRICE_LABEL, RAPID_RESOLUTION } from "@/config/offers";
import { useLocale } from "@/i18n/locale-context";
import { validateLocalizedIntakeStep } from "@/i18n/intake-validation";
import LocalizedTicketJourney from "./LocalizedTicketJourney";
import { applyDetectedTicketType, applyTicketType, ticketDateAsLocalDate, ticketDateFromExtraction, type RegisteredOwnerAnswer, type TicketType, type TicketTypeSource } from "@/lib/ticket/ticketType";
import { isProLicenceClass, LICENCE_CLASS_OPTIONS, normalizeLicenceClass, type LicenceClass } from "@/lib/pro-drivers/intake";
import { latestReferralAttribution, normalizeReferralCode, ReferralCaptureError, type ReferralAttribution } from "@/lib/referrals/attribution";
import { captureReferralCode, captureReferralFromLocation, clearReferralAttribution, readActiveReferral, REFERRAL_ATTRIBUTION_EVENT } from "@/lib/referrals/capture";
import { useTicketIntakeDraft } from "@/hooks/useTicketIntakeDraft";
import type { IntakeDraftResumeDelivery } from "@/lib/ticket/intakeDraft";

export interface FormData {
  // Unified intake handoff
  sourceAssessmentId: string;
  sourceAssessmentAccessToken: string;

  // Personal Information
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  albertaConfirmed: boolean;
  contactPermission: boolean;
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
  albertaConfirmed: false,
  contactPermission: false,
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

function resumeDeliveryMessage(delivery?: IntakeDraftResumeDelivery, hasUploadedTicket = true) {
  if (!hasUploadedTicket) return "Your intake is saved, but the private ticket upload still needs to finish. Copy the secure link so you can return.";
  if (delivery?.status === "sent") {
    return delivery.channel === "sms"
      ? "We texted your secure resume link. You can also copy it below."
      : "We emailed your secure resume link. You can also copy it below.";
  }
  if (delivery?.mode === "manual") return "Your intake is saved. Copy the secure resume link below so you can return.";
  if (delivery?.status === "failed") return "Your intake is saved, but we could not send the secure resume link. Retry or copy it below.";
  if (delivery?.status === "sending") return "Your intake is saved, but we could not confirm whether the secure resume link was sent. Copy it below now.";
  return "Your intake is saved. Send the secure resume link or copy it below now.";
}

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
  const [leadSaved, setLeadSaved] = useState(Boolean(sourceAssessment));
  const [replacementTicketFile, setReplacementTicketFile] = useState<File | null>(null);
  const replacementTicketSnapshot = useRef<FormData | null>(null);
  const ticketDraftRevision = useRef(0);
  const formStartSent = useRef(false);
  const autosaveTimer = useRef<number | null>(null);
  const cacheLoadStarted = useRef(false);
  const intakeDraft = useTicketIntakeDraft({
    preferredLocale: locale,
    onRestore: (record, values) => {
      ticketDraftRevision.current += 1;
      setFormData(current => ({
        ...current,
        ...values,
        ticketImage: null,
        driversLicenseImage: null,
        referral: latestReferralAttribution([current.referral, readActiveReferral()]),
      } as FormData));
      // Conversion happens before consent storage and checkout creation. A
      // reload or Stripe cancellation therefore returns to fresh consent so a
      // prior signature never has to be persisted in the resumable draft.
      setCurrentStep(record.status === "converted"
        ? 4
        : Math.max(1, Math.min(record.currentStep || 1, steps.length)));
      if (record.ticketUploadedAt && record.ticketDocumentPath) {
        setLeadSaved(true);
        setCaptureState("complete");
        setCompletedTicketFile(null);
      }
    },
  });
  // Save responses refresh the capability object (and can rotate its token).
  // Only switching drafts should restart autosave; save() reads the latest
  // capability from its ref when queued work runs.
  const intakeDraftId = intakeDraft.capability?.draftId;
  const intakeDraftRecordStatus = intakeDraft.record?.status;
  const convertedIntake = intakeDraftRecordStatus === "converted";
  const saveIntakeDraft = intakeDraft.save;
  const replacementReviewReady = captureState === "complete" || captureState === "manual";
  const ticketReviewReady = replacementTicketFile
    ? replacementReviewReady
    : replacementReviewReady
      || intakeDraft.hasUploadedTicket
      || (!formData.ticketImage && (Boolean(formData.sourceAssessmentId) || hasTicketReviewData(formData)));
  const captureOnly = currentStep === 1 && !leadSaved;
  const handleCaptureStateChange = (state: TicketCaptureState) => {
    setCaptureState(state);
    if (state === "complete" || state === "manual") setCompletedTicketFile(formData.ticketImage);
    else setCompletedTicketFile(null);
  };
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

  // The eligibility checker hands OCR data to this route in the same browser.
  // Legacy remote-cache keys are discarded and are never sent over the wire.
  useEffect(() => {
    localStorage.removeItem('ticket-cache-key');
    if (locale !== "en" || initialPrefill || initialTicketType || intakeDraft.status === "loading" || intakeDraft.capability || cacheLoadStarted.current) return;
    cacheLoadStarted.current = true;
    const revision = ticketDraftRevision.current;
    const canHydrate = () => ticketDraftRevision.current === revision;
    const localHandoffs = [
      ['eligibility-ocr-data', 'Your ticket information has been automatically filled in.'],
      ['eligibility-ocr-data-backup', 'Your ticket information has been loaded from backup data.'],
    ] as const;
    for (const [key, description] of localHandoffs) {
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          const ocrData = JSON.parse(stored) as unknown;
          if (!ocrData || typeof ocrData !== 'object' || Array.isArray(ocrData)) throw new Error('Invalid local OCR handoff');
          if (!canHydrate()) return;
          setFormData(prev => canHydrate() ? mergeCachedTicketData(prev, ocrData as Record<string, unknown>) : prev);
          localStorage.removeItem(key);
          toast({
            title: "Ticket Details Pre-filled!",
            description,
          });
          return;
        } catch {
          localStorage.removeItem(key);
        }
      }
    }
  }, [toast, locale, initialPrefill, initialTicketType, intakeDraft.status, intakeDraft.capability]);

  const updateFormData = (updates: Partial<FormData> | ((current: FormData) => Partial<FormData>)) => {
    if (!formStartSent.current) {
      formStartSent.current = true;
      window.dispatchEvent(new CustomEvent("fabsy:intake-form-start"));
    }
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

  const leadEmail = formData.email.trim();
  const leadPhone = formData.phone.trim();
  const leadEmailValid = !leadEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadEmail);
  const leadPhoneValid = !leadPhone || leadPhone.replace(/\D/g, "").length >= 7;
  const localizedTicketReady = locale !== "en" && Object.keys(validateLocalizedIntakeStep(1, formData)).length === 0;
  const replacementSaveReady = locale !== "en"
    ? Boolean(replacementTicketFile) && localizedTicketReady
    : replacementReviewReady;
  const isLeadValid = Boolean(
    formData.ticketImage && (ticketReviewReady || localizedTicketReady) &&
    (leadEmail || leadPhone) && leadEmailValid && leadPhoneValid &&
    formData.albertaConfirmed && formData.contactPermission
  );

  const saveLead = async () => {
    if (!isLeadValid || !formData.ticketImage || intakeDraft.status === "saving") return false;
    try {
      const saved = await intakeDraft.createOrUpload(formData.ticketImage, formData as unknown as Record<string, unknown>);
      setLeadSaved(true);
      // The confirmed private object is now the source of truth. Dropping the
      // browser File prevents the review screen from presenting that same file
      // as an unsaved replacement.
      setFormData(current => ({ ...current, ticketImage: null }));
      setCompletedTicketFile(null);
      setCaptureState("complete");
      window.dispatchEvent(new CustomEvent("fabsy:intake-ticket-uploaded"));
      window.dispatchEvent(new CustomEvent("fabsy:intake-lead-saved"));
      toast({ title: "Your intake is saved", description: resumeDeliveryMessage(saved.resumeDelivery) });
      scrollToForm();
      return true;
    } catch (failure) {
      toast({
        title: "We could not finish saving",
        description: failure instanceof Error ? failure.message : "Try saving the intake again.",
        variant: "destructive",
      });
      return false;
    }
  };

  const scrollToForm = () => {
    const formElement = document.getElementById('ticket-form-container');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleTicketFileSelection = (file: File | null) => {
    if (file) {
      if (!replacementTicketSnapshot.current) {
        replacementTicketSnapshot.current = { ...formData, ticketImage: null };
      }
      setReplacementTicketFile(file);
      return;
    }

    setReplacementTicketFile(null);
    const previous = replacementTicketSnapshot.current;
    replacementTicketSnapshot.current = null;
    if (previous) {
      ticketDraftRevision.current += 1;
      setFormData({ ...previous, ticketImage: null });
      setCaptureState("complete");
      setCompletedTicketFile(null);
    }
  };

  const saveReplacementTicket = async () => {
    if (!replacementTicketFile || !replacementSaveReady || intakeDraft.status === "saving") return;
    const previous = replacementTicketSnapshot.current;
    try {
      await intakeDraft.createOrUpload(
        replacementTicketFile,
        formData as unknown as Record<string, unknown>,
      );
      replacementTicketSnapshot.current = null;
      setReplacementTicketFile(null);
      setFormData(current => ({ ...current, ticketImage: null }));
      setCompletedTicketFile(null);
      setCaptureState("complete");
      window.dispatchEvent(new CustomEvent("fabsy:intake-ticket-uploaded"));
      toast({
        title: "Replacement ticket saved",
        description: "The new private ticket file and the details you reviewed are now linked to this intake.",
      });
    } catch (failure) {
      replacementTicketSnapshot.current = null;
      setReplacementTicketFile(null);
      if (previous) {
        ticketDraftRevision.current += 1;
        setFormData({ ...previous, ticketImage: null });
        setCompletedTicketFile(null);
        setCaptureState("complete");
        try {
          await intakeDraft.save(previous as unknown as Record<string, unknown>, currentStep, Math.max(0, currentStep - 1));
        } catch {
          // The visible draft error and a reload from the last confirmed ticket
          // remain the recovery path when even the rollback save is unavailable.
        }
      }
      toast({
        title: "The replacement was not saved",
        description: failure instanceof Error
          ? failure.message
          : "Your previous ticket remains linked. Choose the replacement again to retry.",
        variant: "destructive",
      });
    }
  };

  const startNewIntake = () => {
    if (autosaveTimer.current !== null) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    intakeDraft.startNewIntake();
    replacementTicketSnapshot.current = null;
    ticketDraftRevision.current += 1;
    formStartSent.current = false;
    setReplacementTicketFile(null);
    setLeadSaved(false);
    setCaptureState("empty");
    setCompletedTicketFile(null);
    const fresh = {
      ...initialFormData,
      referral: readActiveReferral(),
    } as FormData;
    setFormData(initialTicketType
      ? applyTicketType(fresh, initialTicketType, "entry")
      : fresh);
    setCurrentStep(1);
    scrollToForm();
    toast({ title: "New intake ready", description: "Add the next ticket when you’re ready." });
  };

  const nextStep = async () => {
    if (currentStep < steps.length) {
      if (intakeDraft.record?.hasPendingTicketUpload) {
        toast({
          title: "Finish the ticket replacement first",
          description: "Retry the upload or keep your last confirmed ticket before continuing.",
          variant: "destructive",
        });
        return;
      }
      if (autosaveTimer.current !== null) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
      if (intakeDraft.capability && intakeDraft.record?.status !== "converted") {
        try {
          await intakeDraft.save(formData as unknown as Record<string, unknown>, currentStep + 1, currentStep);
        } catch (failure) {
          toast({
            title: "Your latest changes are not saved yet",
            description: failure instanceof Error ? failure.message : "Try continuing again.",
            variant: "destructive",
          });
          return;
        }
      }
      window.dispatchEvent(new CustomEvent("fabsy:intake-step-completed", { detail: { step: currentStep } }));
      setCurrentStep(currentStep + 1);
      scrollToForm();
    }
  };

  const prevStep = () => {
    if (currentStep > 1 && intakeDraft.record?.status !== "converted") {
      setCurrentStep(currentStep - 1);
      scrollToForm();
    }
  };

  useEffect(() => {
    if (!leadSaved || !intakeDraftId || intakeDraftRecordStatus === "converted" || replacementTicketFile) return;
    autosaveTimer.current = window.setTimeout(() => {
      autosaveTimer.current = null;
      void saveIntakeDraft(
        formData as unknown as Record<string, unknown>,
        currentStep,
        Math.max(0, currentStep - 1),
      ).catch(() => {
        // The visible save status and the next explicit Continue retry carry
        // this error; do not interrupt typing with repeated toast messages.
      });
    }, 700);
    return () => {
      if (autosaveTimer.current !== null) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
    };
  }, [formData, currentStep, leadSaved, intakeDraftId, intakeDraftRecordStatus, replacementTicketFile, saveIntakeDraft]);

  const copyResumeLink = async () => {
    const url = intakeDraft.getResumeUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Secure resume link copied" });
    } catch {
      toast({ title: "Could not copy the link", description: "Use this browser to continue the saved intake.", variant: "destructive" });
    }
  };

  const retryResumeDelivery = async () => {
    try {
      const updated = await intakeDraft.retryDelivery();
      const sent = updated.resumeDelivery?.status === "sent";
      toast({
        title: sent ? "Secure resume link sent" : "Resume link was not sent",
        description: sent
          ? resumeDeliveryMessage(updated.resumeDelivery)
          : "Your intake remains saved. Copy the secure link below and try delivery again later.",
        ...(sent ? {} : { variant: "destructive" as const }),
      });
    } catch (failure) {
      toast({
        title: "Resume link was not sent",
        description: failure instanceof Error ? failure.message : "Your intake remains saved. Copy the secure link below.",
        variant: "destructive",
      });
    }
  };

  const discardPendingUpload = async () => {
    try {
      await intakeDraft.discardPendingUpload();
      toast({
        title: "Previous ticket kept",
        description: "The unfinished replacement was discarded. You can continue with your last confirmed ticket.",
      });
    } catch (failure) {
      toast({
        title: "Could not restore the previous ticket",
        description: failure instanceof Error ? failure.message : "Try again before continuing.",
        variant: "destructive",
      });
    }
  };

  const delivery = intakeDraft.record?.resumeDelivery;
  const hasPendingTicketUpload = intakeDraft.record?.hasPendingTicketUpload === true;
  const resumeAccess = intakeDraft.capability ? <div lang="en" className="my-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
    <div className="min-w-0 flex-1">
      <p className="font-medium">Secure return access</p>
      <p className="text-muted-foreground" aria-live="polite">{convertedIntake
        ? "A checkout was already created for this saved intake. Continue only if payment is still outstanding, or start a new intake for another ticket."
        : hasPendingTicketUpload
        ? "A replacement upload did not finish. Keep your last confirmed ticket before continuing, or choose the replacement again."
        : resumeDeliveryMessage(delivery, intakeDraft.hasUploadedTicket)}</p>
      {intakeDraft.error ? <p className="mt-1 text-destructive" role="alert">{intakeDraft.error}</p> : null}
    </div>
    <div className="flex flex-wrap gap-2">
      {hasPendingTicketUpload ? <Button type="button" variant="outline" disabled={intakeDraft.discardingPendingUpload} onClick={() => void discardPendingUpload()}>
        {intakeDraft.discardingPendingUpload ? "Restoring…" : "Keep previous ticket"}
      </Button> : null}
      {!convertedIntake && !hasPendingTicketUpload && delivery?.mode === "automatic" &&
        ((delivery.status === "failed" && delivery.canRetry) || delivery.status === "pending") ? <Button type="button" variant="outline" disabled={intakeDraft.deliveryRetrying} onClick={() => void retryResumeDelivery()}>
        {intakeDraft.deliveryRetrying ? "Sending…" : delivery.status === "pending" ? "Send resume link" : "Retry sending"}
      </Button> : null}
      <Button type="button" variant="outline" onClick={() => void copyResumeLink()}>Copy resume link</Button>
      {convertedIntake ? <Button type="button" onClick={startNewIntake}>Start a new intake</Button> : null}
    </div>
  </div> : null;

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
            mode={captureOnly ? "capture" : "details"}
            hasStoredTicket={intakeDraft.hasUploadedTicket}
            allowReplacement={!captureOnly && !convertedIntake && intakeDraft.hasUploadedTicket}
            onTicketFileSelection={!captureOnly && !convertedIntake ? handleTicketFileSelection : undefined}
            replacementReady={replacementReviewReady}
            replacementSaving={intakeDraft.status === "saving"}
            onSaveReplacement={() => void saveReplacementTicket()}
          />
          {captureOnly ? <LeadCaptureFields formData={formData} updateFormData={updateFormData} error={intakeDraft.error} /> : null}
          {!captureOnly && ticketReviewReady && !isPhotoRadar && <div className="mt-8 space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-5">
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
        return <ReviewStep formData={formData} onSubmit={nextStep} hasStoredTicket={intakeDraft.hasUploadedTicket} />;
      case 6:
        return hasPendingTicketUpload
          ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">Keep your last confirmed ticket or finish its replacement before checkout.</p>
          : <PaymentStep formData={formData} updateFormData={updateFormData} intakeDraft={intakeDraft.capability && intakeDraft.hasUploadedTicket ? intakeDraft.capability : null} />;
      default:
        return null;
    }
  };

  // Validation function for each step
  const isStepValid = () => {
    switch (currentStep) {
      case 1: // Ticket Details
        return !!(
          leadSaved &&
          ticketReviewReady &&
          !replacementTicketFile &&
          !hasPendingTicketUpload &&
          (formData.ticketImage || formData.sourceAssessmentId || intakeDraft.hasUploadedTicket) &&
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
        if (hasPendingTicketUpload) m.push("Finish or discard the replacement ticket upload");
        if (replacementTicketFile) m.push("Save or remove the replacement ticket");
        if (!formData.ticketImage && !formData.sourceAssessmentId && !intakeDraft.hasUploadedTicket) m.push("Ticket PDF or photo");
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
  if (locale !== "en") return <LocalizedTicketJourney formData={formData} updateFormData={updateFormData} currentStep={currentStep} nextStep={nextStep} prevStep={prevStep}
    intakeDraft={intakeDraft.capability && intakeDraft.hasUploadedTicket && !hasPendingTicketUpload ? intakeDraft.capability : null}
    hasStoredTicket={intakeDraft.hasUploadedTicket} hasPendingTicketUpload={hasPendingTicketUpload}
    allowReplacement={!convertedIntake && intakeDraft.hasUploadedTicket}
    onTicketFileSelection={!convertedIntake ? handleTicketFileSelection : undefined}
    replacementReady={replacementSaveReady} replacementSaving={intakeDraft.status === "saving"}
    onSaveReplacement={() => void saveReplacementTicket()} resumeAccess={resumeAccess}
    leadSaved={leadSaved} leadReady={isLeadValid} leadSaving={intakeDraft.status === "saving"} leadError={intakeDraft.error}
    onSaveLead={saveLead} />;

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

        {convertedIntake ? <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/30 bg-white p-5 shadow-fab" role="status" data-converted-intake-recovery>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">This saved intake already has a checkout.</p>
            <p className="mt-1 text-sm text-muted-foreground">Continue if payment is still outstanding. If you already paid or this is a different ticket, start a new intake.</p>
          </div>
          <Button type="button" onClick={startNewIntake}>Start a new intake</Button>
        </div> : null}

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
                disabled={currentStep === 1 || intakeDraft.record?.status === "converted"}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Previous
              </Button>
              {currentStep !== 5 && currentStep < 6 && (
                <Button 
                  onClick={nextStep}
                disabled={!isStepValid() || intakeDraft.status === "saving"}
                  className="bg-gradient-primary hover:opacity-90 transition-smooth flex items-center gap-2"
                >
                  Continue
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
          </div>}

          {renderStep()}

          {resumeAccess}

          {/* Navigation - Bottom */}
          {captureOnly && <div className="mt-8 border-t pt-6">
            <Button type="button" className="h-auto min-h-12 w-full whitespace-normal bg-gradient-primary py-3 hover:opacity-90"
              onClick={() => void saveLead()} disabled={!isLeadValid || intakeDraft.status === "saving" || intakeDraft.status === "loading"}>
              {intakeDraft.status === "saving" ? "Saving your ticket securely…" : "Save ticket and review details"}
              {intakeDraft.status !== "saving" ? <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /> : null}
            </Button>
            {!isLeadValid ? <p className="mt-3 text-right text-sm text-muted-foreground">
              Still needed: {[
                !formData.ticketImage || !ticketReviewReady ? "ticket PDF or photo" : "",
                !(leadEmail || leadPhone) ? "email or phone" : "",
                !leadEmailValid ? "valid email" : "",
                !leadPhoneValid ? "valid phone" : "",
                !formData.albertaConfirmed ? "Alberta ticket confirmation" : "",
                !formData.contactPermission ? "contact permission" : "",
              ].filter(Boolean).join(", ")}
            </p> : null}
          </div>}
          {!captureOnly && <div className="flex justify-between mt-8 pt-6 border-t">
              <Button 
                variant="outline" 
                onClick={prevStep} 
                disabled={currentStep === 1 || intakeDraft.record?.status === "converted"}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Previous
              </Button>
              {currentStep !== 5 && currentStep < 6 && (
                <Button 
                  onClick={nextStep}
                  disabled={!isStepValid() || intakeDraft.status === "saving"}
                  className="bg-gradient-primary hover:opacity-90 transition-smooth flex items-center gap-2"
                >
                  Continue
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
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
