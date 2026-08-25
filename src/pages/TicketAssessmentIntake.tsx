import { FormEvent, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BriefcaseBusiness, Camera, Check, CreditCard, FileText, LockKeyhole, ShieldCheck, Upload, X, Zap } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import TicketCapture, { type TicketOcrData } from "@/components/TicketCapture";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TICKET_ASSESSMENT } from "@/config/ticketAssessment";
import type { FormData as RepresentationFormData } from "@/components/TicketForm";
import useSafeHead from "@/hooks/useSafeHead";
import { supabase } from "@/integrations/supabase/client";
import { assessmentAttribution, trackAssessmentEvent } from "@/lib/assessment/analytics";
import { validateTicketCaptureFile } from "@/lib/ticket/ticketCapture";

type PremiumFrequency = "monthly" | "annual" | "unknown";
type ServiceChoice = "priority_review" | "full_representation";

interface AssessmentDraft {
  province: string;
  ticketNumber: string;
  offence: string;
  ticketDate: string;
  responseDeadline: string;
  fineAmount: string;
  whatHappened: string;
  licensedInCanada: string;
  licenceClass: string;
  relevantConvictions: string;
  currentDemerits: string;
  drivingUse: string;
  premiumAmount: string;
  premiumFrequency: PremiumFrequency;
  renewalMonth: string;
  insurer: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  termsAccepted: boolean;
  reviewConsentAccepted: boolean;
  reviewSignature: string;
  company: string;
}

interface IntakeResponse {
  submissionId?: string;
  accessToken?: string;
  upload?: { path?: string; token?: string };
  policyUploads?: Array<{ index?: number; path?: string; token?: string; contentType?: string }>;
  error?: string;
}

interface CheckoutResponse { url?: string; error?: string }
interface IntakeLocationState { ticketImage?: File | null; prefillTicketData?: Record<string, unknown> | null; source?: string }

const DRAFT_KEY = "fabsy-ticket-assessment-draft-v2";
const ORDER_KEY = "fabsy-ticket-assessment-order-v1";
const MAX_POLICY_FILES = 5;
const POLICY_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif";
const initialDraft: AssessmentDraft = {
  province: "Alberta", ticketNumber: "", offence: "", ticketDate: "", responseDeadline: "", fineAmount: "", whatHappened: "",
  licensedInCanada: "unknown", licenceClass: "unknown", relevantConvictions: "unknown", currentDemerits: "unknown", drivingUse: "personal",
  premiumAmount: "", premiumFrequency: "unknown", renewalMonth: "unknown", insurer: "", firstName: "", lastName: "", email: "", phone: "",
  termsAccepted: false, reviewConsentAccepted: false, reviewSignature: "", company: "",
};
const provinces = ["Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador", "Northwest Territories", "Nova Scotia", "Nunavut", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan", "Yukon"] as const;
const renewalMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

function loadDraft(): AssessmentDraft {
  if (typeof window === "undefined") return initialDraft;
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(DRAFT_KEY) || "null") as Partial<AssessmentDraft> | null;
    return stored ? { ...initialDraft, ...stored, termsAccepted: false, reviewConsentAccepted: false, reviewSignature: "", company: "" } : initialDraft;
  } catch { return initialDraft; }
}

function assessmentOrderId() {
  if (typeof window === "undefined") return crypto.randomUUID();
  try {
    const existing = window.sessionStorage.getItem(ORDER_KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(ORDER_KEY, created);
    return created;
  } catch { return crypto.randomUUID(); }
}

function moneyValue(value: string) { const trimmed = value.trim(); return trimmed ? Number(trimmed) : null; }
function stringValue(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function dateValue(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value !== "string" || !value.trim()) return "";
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

async function functionErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: Response }).context;
    if (context instanceof Response) {
      try {
        const body = await context.clone().json() as { error?: unknown };
        if (typeof body.error === "string" && body.error.trim()) return body.error;
      } catch { /* use provider error */ }
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

async function createAssessmentPayment(payload: { submissionId: string; accessToken: string }, tries = 2) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const { data, error } = await supabase.functions.invoke<CheckoutResponse>("create-assessment-payment", { body: payload });
      if (!error && data?.url) return data.url;
      if (attempt === tries - 1) throw new Error(data?.error || await functionErrorMessage(error, "Secure checkout did not open."));
    } catch (caught) { if (attempt === tries - 1) throw caught; }
    await new Promise((resolve) => window.setTimeout(resolve, 800));
  }
  throw new Error("That didn't go through. Nothing was charged. Please try again.");
}

export default function TicketAssessmentIntake() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state || {}) as IntakeLocationState;
  const [searchParams] = useSearchParams();
  const checkoutCancelled = searchParams.get("checkout") === "cancelled";
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<AssessmentDraft>(loadDraft);
  const [orderId] = useState(assessmentOrderId);
  const [ticketFile, setTicketFile] = useState<File | null>(() => state.ticketImage || null);
  const [ticketPrefill, setTicketPrefill] = useState<Record<string, unknown>>(() => state.prefillTicketData || {});
  const [policyFiles, setPolicyFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const policyBrowseRef = useRef<HTMLInputElement>(null);
  const policyCameraRef = useRef<HTMLInputElement>(null);

  useSafeHead({
    title: "Free Ticket Review | Fabsy",
    description: "Upload or photograph an Alberta ticket, review the extracted details, and choose a $149 priority report or $488 full representation.",
    canonical: `https://fabsy.ca${TICKET_ASSESSMENT.intakePath}`,
    robots: "noindex, nofollow",
  });

  const applyPrefill = (data: Record<string, unknown> | null | undefined) => {
    if (!data) return;
    setDraft((current) => ({
      ...current,
      ticketNumber: stringValue(data.ticketNumber) || current.ticketNumber,
      offence: stringValue(data.offenceDescription) || stringValue(data.violation) || stringValue(data.offence) || current.offence,
      ticketDate: dateValue(data.ticketDate) || dateValue(data.issueDate) || current.ticketDate,
      responseDeadline: dateValue(data.responseDeadline) || dateValue(data.courtDate) || current.responseDeadline,
      fineAmount: stringValue(data.fineAmount) || current.fineAmount,
    }));
  };

  useEffect(() => {
    applyPrefill(state.prefillTicketData);
    if (state.source === "free_ticket_review") trackAssessmentEvent("free_ticket_review_completed", { location: "assessment_intake" }, orderId);
    // Navigation state is consumed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { trackAssessmentEvent("assessment_start", { location: "assessment_intake", value: TICKET_ASSESSMENT.priceCad }, orderId); }, [orderId]);
  useEffect(() => {
    if (checkoutCancelled) {
      setError("Checkout was cancelled. No payment was taken. Your information is still here.");
      setStep(4);
      trackAssessmentEvent("checkout_abandoned", { checkout_stage: "stripe" });
    }
  }, [checkoutCancelled]);
  useEffect(() => {
    try {
      const { termsAccepted: _terms, reviewConsentAccepted: _consent, reviewSignature: _signature, company: _company, ...safeDraft } = draft;
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(safeDraft));
    } catch { /* session storage may be unavailable */ }
  }, [draft]);

  const unsupportedProvince = draft.province !== "Alberta";
  const progress = (step / 4) * 100;
  const ticketStepValid = Boolean(ticketFile && draft.province && !unsupportedProvince && draft.whatHappened.trim().length >= 10);
  const drivingStepValid = Boolean(draft.licensedInCanada && draft.licenceClass && draft.relevantConvictions && draft.currentDemerits && draft.drivingUse && policyFiles.length >= 1);
  const contactStepValid = Boolean(draft.firstName.trim() && draft.lastName.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()) && draft.termsAccepted && draft.reviewConsentAccepted && draft.reviewSignature.trim());

  const update = <K extends keyof AssessmentDraft>(field: K, value: AssessmentDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setError(null);
  };
  const onTicketOcr = (data: TicketOcrData | null) => {
    if (data) setTicketPrefill(data);
    applyPrefill(data);
  };
  const addPolicyFiles = (selected: FileList | null, input: HTMLInputElement) => {
    const incoming = selected ? Array.from(selected) : [];
    input.value = "";
    if (!incoming.length) return;
    if (policyFiles.length + incoming.length > MAX_POLICY_FILES) { setError(`Upload no more than ${MAX_POLICY_FILES} policy documents.`); return; }
    for (const file of incoming) {
      const validation = validateTicketCaptureFile(file);
      if ("error" in validation) { setError(`Policy document “${file.name}”: ${validation.error}`); return; }
    }
    setPolicyFiles((current) => [...current, ...incoming]);
    setError(null);
  };

  const next = () => {
    if (step === 1 && !ticketStepValid) { setError(unsupportedProvince ? "This service currently accepts Alberta traffic tickets only." : "Attach the ticket and briefly tell us what happened before continuing."); return; }
    if (step === 2 && !drivingStepValid) { setError("Complete the driving context and attach at least one current policy document."); return; }
    if (step === 3 && !contactStepValid) { setError("Enter your contact information, sign the review consent and accept the terms."); return; }
    setError(null);
    setStep((current) => Math.min(4, current + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const back = () => { setError(null); setStep((current) => Math.max(1, current - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const saveIntake = async () => {
    if (!ticketFile || !ticketStepValid || !drivingStepValid || !contactStepValid) throw new Error("Review each step and complete the required fields before continuing.");
    const ticketDescriptor = validateTicketCaptureFile(ticketFile);
    if ("error" in ticketDescriptor) throw new Error(ticketDescriptor.error);
    const policyDescriptors = policyFiles.map((file) => {
      const descriptor = validateTicketCaptureFile(file);
      if ("error" in descriptor) throw new Error(`Policy document “${file.name}”: ${descriptor.error}`);
      return descriptor;
    });
    const { data: intake, error: intakeError } = await supabase.functions.invoke<IntakeResponse>("submit-assessment-intake", {
      body: {
        orderId,
        file: { contentType: ticketDescriptor.mimeType, size: ticketFile.size },
        policyFiles: policyFiles.map((file, index) => ({ contentType: policyDescriptors[index].mimeType, size: file.size })),
        reviewConsent: { schemaVersion: 1, consentVersion: "ticket-triage-review-v1", accepted: true, digitalSignature: draft.reviewSignature.trim(), signedAt: new Date().toISOString() },
        contact: { firstName: draft.firstName.trim(), lastName: draft.lastName.trim(), email: draft.email.trim().toLowerCase(), phone: draft.phone.trim() || null },
        ticket: { province: draft.province, ticketNumber: draft.ticketNumber.trim() || null, offence: draft.offence.trim() || null, ticketDate: draft.ticketDate || null, responseDeadline: draft.responseDeadline || null, fineAmountCad: moneyValue(draft.fineAmount), whatHappened: draft.whatHappened.trim() },
        driving: { licensedInCanada: draft.licensedInCanada, licenceClass: draft.licenceClass, relevantConvictions: draft.relevantConvictions, currentDemerits: draft.currentDemerits, drivingUse: draft.drivingUse },
        insurance: { premiumAmountCad: moneyValue(draft.premiumAmount), premiumFrequency: draft.premiumFrequency, renewalMonth: draft.renewalMonth, insurer: draft.insurer.trim() || null },
        termsAccepted: draft.termsAccepted,
        company: draft.company,
        attribution: assessmentAttribution(),
      },
    });
    if (intakeError || intake?.error || !intake?.submissionId || !intake.accessToken || !intake.upload?.path || !intake.upload.token || !Array.isArray(intake.policyUploads) || intake.policyUploads.length !== policyFiles.length) {
      throw new Error(intake?.error || await functionErrorMessage(intakeError, "The private intake could not be saved."));
    }
    const { error: ticketUploadError } = await supabase.storage.from("assessment-tickets").uploadToSignedUrl(intake.upload.path, intake.upload.token, ticketFile, { contentType: ticketDescriptor.mimeType, upsert: true });
    if (ticketUploadError) throw new Error("The ticket upload did not finish. Please try again.");
    await Promise.all(intake.policyUploads.map(async (upload) => {
      const index = Number(upload.index);
      const file = policyFiles[index];
      if (!file || !upload.path || !upload.token) throw new Error("A policy upload could not be prepared.");
      const { error: policyUploadError } = await supabase.storage.from("assessment-policy-documents").uploadToSignedUrl(upload.path, upload.token, file, { contentType: policyDescriptors[index].mimeType, upsert: true });
      if (policyUploadError) throw new Error(`The policy document “${file.name}” did not finish uploading.`);
    }));
    trackAssessmentEvent("ticket_upload_completed", { file_type: ticketDescriptor.mimeType }, orderId);
    trackAssessmentEvent("intake_completed", { value: TICKET_ASSESSMENT.priceCad }, orderId);
    return { submissionId: intake.submissionId, accessToken: intake.accessToken };
  };

  const chooseService = async (choice: ServiceChoice) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const saved = await saveIntake();
      if (choice === "full_representation") {
        const prefillTicketData: Partial<RepresentationFormData> = {
          ticketNumber: draft.ticketNumber, violation: draft.offence, offenceDescription: draft.offence, fineAmount: draft.fineAmount,
          issueDate: draft.ticketDate ? new Date(`${draft.ticketDate}T12:00:00`) : undefined,
          courtDate: draft.responseDeadline ? new Date(`${draft.responseDeadline}T12:00:00`) : undefined,
          explanation: draft.whatHappened, insuranceCompany: draft.insurer,
          firstName: draft.firstName, lastName: draft.lastName, email: draft.email, phone: draft.phone,
          location: stringValue(ticketPrefill.location),
          officer: stringValue(ticketPrefill.officer),
          officerBadge: stringValue(ticketPrefill.officerBadge),
          offenceSection: stringValue(ticketPrefill.offenceSection),
          offenceSubSection: stringValue(ticketPrefill.offenceSubSection),
          courtJurisdiction: stringValue(ticketPrefill.courtJurisdiction),
        };
        trackAssessmentEvent("representation_selected", { value: 488 }, orderId);
        navigate("/submit-ticket", { state: { ticketImage: ticketFile, prefillTicketData, startAtStep: 1, sourceAssessment: saved } });
        return;
      }
      const checkoutUrl = await createAssessmentPayment(saved);
      trackAssessmentEvent("begin_checkout", { value: TICKET_ASSESSMENT.priceCad, items: [{ item_id: "ticket_triage", item_name: "Priority Ticket Review", price: TICKET_ASSESSMENT.priceCad, quantity: 1 }] }, orderId);
      window.location.assign(checkoutUrl);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "We could not continue. Please try again."); setIsSubmitting(false); }
  };
  const submitPriorityReview = (event: FormEvent) => { event.preventDefault(); if (step === 4) void chooseService("priority_review"); };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="container mx-auto max-w-6xl px-4 py-8 sm:py-12">
        <Button asChild variant="ghost" className="mb-4"><Link to="/"><ArrowLeft className="mr-2 h-4 w-4" />Back to Fabsy</Link></Button>
        <div className="grid gap-7 lg:grid-cols-[1fr_340px] lg:items-start">
          <Card className="overflow-hidden shadow-elevated">
            <div className="border-b bg-white p-6 sm:p-8">
              <Badge className="mb-4">Free Ticket Review · upload or take a photo</Badge>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">One secure intake. Choose the help you need.</h1>
              <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">We scan your ticket, keep the source documents private, and carry the same information into a priority report or full representation—no re-uploading.</p>
              <div className="mt-6"><div className="mb-2 flex items-center justify-between text-sm font-medium"><span>Step {step} of 4</span><span>{Math.round(progress)}% complete</span></div><Progress value={progress} className="h-2" /></div>
            </div>
            <form onSubmit={submitPriorityReview} className="bg-white p-6 sm:p-8">
              {step === 1 && <TicketStep draft={draft} update={update} ticketFile={ticketFile} setTicketFile={setTicketFile} onTicketOcr={onTicketOcr} unsupportedProvince={unsupportedProvince} isSubmitting={isSubmitting} />}
              {step === 2 && <DrivingStep draft={draft} update={update} policyFiles={policyFiles} setPolicyFiles={setPolicyFiles} policyBrowseRef={policyBrowseRef} policyCameraRef={policyCameraRef} addPolicyFiles={addPolicyFiles} />}
              {step === 3 && <ContactStep draft={draft} update={update} />}
              {step === 4 && <ServiceStep isSubmitting={isSubmitting} chooseRepresentation={() => void chooseService("full_representation")} />}
              {error && <Alert className="mt-6 border-destructive/30" variant="destructive"><AlertTitle>Check this step</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
              <div className="mt-8 flex items-center justify-between border-t pt-6"><Button type="button" variant="outline" onClick={back} disabled={step === 1 || isSubmitting}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>{step < 4 && <Button type="button" onClick={next} disabled={isSubmitting}>Continue<ArrowRight className="ml-2 h-4 w-4" /></Button>}</div>
            </form>
          </Card>
          <aside className="space-y-5 lg:sticky lg:top-24">
            <Card className="p-6 shadow-fab"><p className="text-sm font-semibold text-primary">One connected intake</p><ol className="mt-5 space-y-4 text-sm">{["Free ticket photo/PDF scan", "Driving and policy context", "Signed limited review consent", "Choose $149 review or $488 representation"].map((item, index) => <li key={item} className="flex items-start gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>{item}</li>)}</ol></Card>
            <Card className="p-5"><div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="font-bold">Private source documents</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Ticket and policy files use signed uploads into non-public storage and remain linked to the matter Fabsy reviews.</p></div></div></Card>
            <Card className="p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p className="text-sm leading-relaxed text-muted-foreground">Insurance outcomes vary by insurer, history and renewal timing. Scenarios are estimates, not binding quotes or guarantees.</p></div></Card>
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}

type UpdateDraft = <K extends keyof AssessmentDraft>(field: K, value: AssessmentDraft[K]) => void;

function TicketStep({ draft, update, ticketFile, setTicketFile, onTicketOcr, unsupportedProvince, isSubmitting }: { draft: AssessmentDraft; update: UpdateDraft; ticketFile: File | null; setTicketFile: (file: File | null) => void; onTicketOcr: (data: TicketOcrData | null) => void; unsupportedProvince: boolean; isSubmitting: boolean }) {
  return <div className="space-y-6">
    <div><h2 className="text-2xl font-bold">1. Ticket capture and free review</h2><p className="mt-1 text-sm text-muted-foreground">Take a clear photo or choose the original PDF. OCR helps fill the fields; you can correct them.</p></div>
    <TicketCapture file={ticketFile} onFileChange={setTicketFile} onOcrData={onTicketOcr} required disabled={isSubmitting} />
    <div className="space-y-2"><Label htmlFor="assessment-province">Province or territory on the ticket *</Label><Select value={draft.province} onValueChange={(value) => update("province", value)}><SelectTrigger id="assessment-province"><SelectValue /></SelectTrigger><SelectContent>{provinces.map((province) => <SelectItem key={province} value={province}>{province}</SelectItem>)}</SelectContent></Select></div>
    {unsupportedProvince && <Alert className="border-amber-300 bg-amber-50"><AlertTitle>Fabsy currently serves Alberta tickets only</AlertTitle><AlertDescription>We cannot sell these services for a ticket issued elsewhere. <Link to="/contact" className="font-semibold underline">Contact us</Link> with questions.</AlertDescription></Alert>}
    <div className="grid gap-5 sm:grid-cols-2">
      <TextInput id="assessment-ticket-number" label="Ticket number, if readable" value={draft.ticketNumber} onChange={(value) => update("ticketNumber", value)} maxLength={50} />
      <TextInput id="assessment-offence" label="Offence, if known" value={draft.offence} onChange={(value) => update("offence", value)} maxLength={200} placeholder="e.g. speeding" />
      <div className="space-y-2"><Label htmlFor="assessment-fine">Fine amount, if shown</Label><Input id="assessment-fine" type="number" min="0" max="100000" step="0.01" value={draft.fineAmount} onChange={(event) => update("fineAmount", event.target.value)} placeholder="CAD" /></div>
      <div className="space-y-2"><Label htmlFor="assessment-ticket-date">Ticket date, if known</Label><Input id="assessment-ticket-date" type="date" value={draft.ticketDate} onChange={(event) => update("ticketDate", event.target.value)} /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="assessment-deadline">Response or court deadline, if shown</Label><Input id="assessment-deadline" type="date" value={draft.responseDeadline} onChange={(event) => update("responseDeadline", event.target.value)} /></div>
    </div>
    <div className="space-y-2"><Label htmlFor="assessment-happened">What happened? *</Label><Textarea id="assessment-happened" value={draft.whatHappened} onChange={(event) => update("whatHappened", event.target.value)} placeholder="A short description in your own words is enough." maxLength={2500} rows={5} /><p className="text-xs text-muted-foreground">This free scan is information only and does not retain Fabsy or pause a deadline.</p></div>
  </div>;
}

function DrivingStep({ draft, update, policyFiles, setPolicyFiles, policyBrowseRef, policyCameraRef, addPolicyFiles }: { draft: AssessmentDraft; update: UpdateDraft; policyFiles: File[]; setPolicyFiles: Dispatch<SetStateAction<File[]>>; policyBrowseRef: RefObject<HTMLInputElement | null>; policyCameraRef: RefObject<HTMLInputElement | null>; addPolicyFiles: (files: FileList | null, input: HTMLInputElement) => void }) {
  return <div className="space-y-6">
    <div><h2 className="text-2xl font-bold">2. Driving, insurance and policy documents</h2><p className="mt-1 text-sm text-muted-foreground">Policy documents are required for individualized insurance-impact and cost scenarios. Upload only relevant current policy pages.</p></div>
    <div className="grid gap-5 sm:grid-cols-2">
      <SelectField id="licensed-canada" label="How long licensed in Canada?" value={draft.licensedInCanada} onChange={(value) => update("licensedInCanada", value)} options={[["less_than_1_year", "Less than 1 year"], ["1_to_3_years", "1–3 years"], ["4_to_9_years", "4–9 years"], ["10_plus_years", "10+ years"], ["unknown", "I don't know"]]} />
      <SelectField id="licence-class" label="Alberta licence class" value={draft.licenceClass} onChange={(value) => update("licenceClass", value)} options={[["class_7", "Class 7 (learner)"], ["class_5_gdl", "Class 5-GDL"], ["class_5", "Class 5"], ["commercial", "Commercial class"], ["other", "Other"], ["unknown", "I don't know"]]} />
      <SelectField id="relevant-convictions" label="Relevant prior convictions" value={draft.relevantConvictions} onChange={(value) => update("relevantConvictions", value)} options={[["0", "None"], ["1", "One"], ["2_plus", "Two or more"], ["unknown", "I don't know"]]} />
      <SelectField id="current-demerits" label="Current demerit points" value={draft.currentDemerits} onChange={(value) => update("currentDemerits", value)} options={[["0", "None"], ["1_to_3", "1–3"], ["4_to_7", "4–7"], ["8_plus", "8 or more"], ["unknown", "I don't know"]]} />
      <SelectField id="driving-use" label="Main driving use" value={draft.drivingUse} onChange={(value) => update("drivingUse", value)} options={[["personal", "Personal"], ["commercial", "Commercial / for work"], ["both", "Both"], ["unknown", "I don't know"]]} />
      <SelectField id="renewal-month" label="Insurance renewal month" value={draft.renewalMonth} onChange={(value) => update("renewalMonth", value)} options={[["unknown", "I don't know"], ...renewalMonths.map((month) => [month.toLowerCase(), month] as [string, string])]} />
    </div>
    <div className="grid gap-5 sm:grid-cols-[1fr_180px]"><div className="space-y-2"><Label htmlFor="premium-amount">Current approximate premium, optional</Label><Input id="premium-amount" type="number" min="0" max="100000" step="0.01" value={draft.premiumAmount} onChange={(event) => update("premiumAmount", event.target.value)} placeholder="CAD" /></div><SelectField id="premium-frequency" label="Frequency" value={draft.premiumFrequency} onChange={(value) => update("premiumFrequency", value as PremiumFrequency)} options={[["monthly", "Monthly"], ["annual", "Annual"], ["unknown", "Not supplied"]]} /></div>
    <TextInput id="assessment-insurer" label="Current insurer, optional" value={draft.insurer} onChange={(value) => update("insurer", value)} maxLength={150} />
    <div className="space-y-3"><Label>Current insurance policy documents *</Label><div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-5"><div className="flex flex-col items-center gap-3 text-center"><FileText className="h-8 w-8 text-primary" /><p className="font-semibold">Add policy declarations or coverage pages</p><p className="text-xs text-muted-foreground">1–5 PDFs or clear photos · 10 MB each</p><div className="flex flex-col gap-2 sm:flex-row"><Button type="button" variant="outline" onClick={() => policyBrowseRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Browse files</Button><Button type="button" variant="outline" onClick={() => policyCameraRef.current?.click()}><Camera className="mr-2 h-4 w-4" />Take photo</Button></div></div></div>
      <input ref={policyBrowseRef} type="file" multiple accept={POLICY_ACCEPT} className="sr-only" onChange={(event) => addPolicyFiles(event.target.files, event.currentTarget)} /><input ref={policyCameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => addPolicyFiles(event.target.files, event.currentTarget)} />
      {policyFiles.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center gap-3 rounded-lg border p-3"><FileText className="h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate text-sm">{file.name}</span><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${file.name}`} onClick={() => setPolicyFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X className="h-4 w-4" /></Button></div>)}
    </div>
  </div>;
}

function ContactStep({ draft, update }: { draft: AssessmentDraft; update: UpdateDraft }) {
  return <div className="space-y-6">
    <div><h2 className="text-2xl font-bold">3. Contact and signed review consent</h2><p className="mt-1 text-sm text-muted-foreground">This consent covers document review and the report only. Full representation has a separate authorization step.</p></div>
    <div className="grid gap-5 sm:grid-cols-2"><TextInput id="assessment-first-name" label="First name *" value={draft.firstName} onChange={(value) => update("firstName", value)} maxLength={100} autoComplete="given-name" /><TextInput id="assessment-last-name" label="Last name *" value={draft.lastName} onChange={(value) => update("lastName", value)} maxLength={100} autoComplete="family-name" /><div className="space-y-2"><Label htmlFor="assessment-email">Email *</Label><Input id="assessment-email" type="email" autoComplete="email" value={draft.email} onChange={(event) => update("email", event.target.value)} maxLength={255} /></div><div className="space-y-2"><Label htmlFor="assessment-phone">Phone, optional</Label><Input id="assessment-phone" type="tel" autoComplete="tel" value={draft.phone} onChange={(event) => update("phone", event.target.value)} maxLength={30} /></div></div>
    <div className="sr-only" aria-hidden="true"><Label htmlFor="assessment-company">Company</Label><Input id="assessment-company" tabIndex={-1} autoComplete="off" value={draft.company} onChange={(event) => update("company", event.target.value)} /></div>
    <Card className="space-y-4 border-primary/20 bg-primary/5 p-5"><div><p className="font-bold">Consent to review supplied documents</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">I authorize Fabsy to securely receive and review the ticket, policy documents and information I supplied, contact me about this matter, and prepare the service I select. This does not authorize a plea, court appearance, negotiation or other representation. It does not pause any deadline.</p></div><div className="flex items-start gap-3"><Checkbox id="review-consent" checked={draft.reviewConsentAccepted} onCheckedChange={(value) => update("reviewConsentAccepted", value === true)} className="mt-0.5" /><Label htmlFor="review-consent" className="cursor-pointer text-sm leading-relaxed">I have read and agree to this limited review consent.</Label></div><TextInput id="review-signature" label="Type your full legal name to sign *" value={draft.reviewSignature} onChange={(value) => update("reviewSignature", value)} maxLength={200} placeholder="Digital signature" /></Card>
    <div className="flex items-start gap-3 rounded-xl border bg-slate-50 p-4"><Checkbox id="assessment-terms" checked={draft.termsAccepted} onCheckedChange={(value) => update("termsAccepted", value === true)} className="mt-0.5" /><Label htmlFor="assessment-terms" className="cursor-pointer text-sm leading-relaxed">I confirm the information is accurate to the best of my knowledge and agree to Fabsy's <Link to="/terms-of-service" className="font-semibold text-primary underline">Terms of Service</Link> and <Link to="/privacy-policy" className="font-semibold text-primary underline">Privacy Policy</Link>. I understand no court or insurance result is promised.</Label></div>
  </div>;
}

function ServiceStep({ isSubmitting, chooseRepresentation }: { isSubmitting: boolean; chooseRepresentation: () => void }) {
  return <div className="space-y-6"><div><h2 className="text-2xl font-bold">4. Choose your service</h2><p className="mt-1 text-sm text-muted-foreground">Your ticket, policy documents and consent will carry into either option.</p></div><div className="grid gap-5 md:grid-cols-2">
    <Card className="flex flex-col border-primary/30 p-5"><Zap className="h-7 w-7 text-primary" /><p className="mt-4 text-sm font-semibold text-primary">PRIORITY REVIEW</p><h3 className="mt-1 text-xl font-bold">Fast report and initial dispute plan</h3><p className="mt-3 text-3xl font-bold">$149 <span className="text-sm font-normal text-muted-foreground">CAD total</span></p><ServiceList items={["Priority human ticket review", "Insurance-impact and cost scenarios", "Policy-document context", "Initial dispute plan", "$149 credit on eligible same-matter representation"]} color="text-primary" /><Button type="submit" size="lg" disabled={isSubmitting}><CreditCard className="mr-2 h-5 w-5" />{isSubmitting ? "Saving securely..." : "Choose $149 review"}</Button><p className="mt-2 text-center text-xs text-muted-foreground">Applicable GST included.</p></Card>
    <Card className="flex flex-col border-secondary/40 bg-secondary/5 p-5"><BriefcaseBusiness className="h-7 w-7 text-secondary" /><p className="mt-4 text-sm font-semibold text-secondary">FULL REPRESENTATION</p><h3 className="mt-1 text-xl font-bold">Everything above, handled end-to-end</h3><p className="mt-3 text-3xl font-bold">$488 <span className="text-sm font-normal text-muted-foreground">base fee</span></p><ServiceList items={["Everything in the $149 review", "Separate representation consent", "Disclosure review and Crown discussions", "Agent representation through resolution or trial", "Private documents stay linked to one matter"]} color="text-secondary" /><Button type="button" size="lg" variant="secondary" disabled={isSubmitting} onClick={chooseRepresentation}><BriefcaseBusiness className="mr-2 h-5 w-5" />{isSubmitting ? "Saving securely..." : "Choose $488 representation"}</Button><p className="mt-2 text-center text-xs text-muted-foreground">Applicable tax added. A 30% fee applies only to a fine reduction achieved.</p></Card>
  </div></div>;
}

function ServiceList({ items, color }: { items: string[]; color: string }) { return <ul className="my-5 flex-1 space-y-2 text-sm">{items.map((item) => <li key={item} className="flex gap-2"><Check className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />{item}</li>)}</ul>; }
function TextInput({ id, label, value, onChange, maxLength, placeholder, autoComplete }: { id: string; label: string; value: string; onChange: (value: string) => void; maxLength: number; placeholder?: string; autoComplete?: string }) { return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} placeholder={placeholder} autoComplete={autoComplete} /></div>; }
function SelectField({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (value: string) => void; options: readonly (readonly [string, string])[] }) { return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger id={id}><SelectValue /></SelectTrigger><SelectContent>{options.map(([optionValue, optionLabel]) => <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>)}</SelectContent></Select></div>; }
