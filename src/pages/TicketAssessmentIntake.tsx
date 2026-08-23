import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, CreditCard, FileCheck2, FileUp, LockKeyhole, ShieldCheck } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
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
import {
  ASSESSMENT_ALLOWED_UPLOAD_TYPES,
  ASSESSMENT_MAX_UPLOAD_BYTES,
  TICKET_ASSESSMENT,
} from "@/config/ticketAssessment";
import useSafeHead from "@/hooks/useSafeHead";
import { supabase } from "@/integrations/supabase/client";
import { assessmentAttribution, trackAssessmentEvent } from "@/lib/assessment/analytics";

type PremiumFrequency = "monthly" | "annual" | "unknown";

interface AssessmentDraft {
  province: string;
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
  company: string;
}

interface IntakeResponse {
  submissionId?: string;
  accessToken?: string;
  upload?: { path?: string; token?: string };
  error?: string;
}

interface CheckoutResponse {
  url?: string;
  error?: string;
}

const DRAFT_KEY = "fabsy-ticket-assessment-draft-v1";
const ORDER_KEY = "fabsy-ticket-assessment-order-v1";

const initialDraft: AssessmentDraft = {
  province: "Alberta",
  offence: "",
  ticketDate: "",
  responseDeadline: "",
  fineAmount: "",
  whatHappened: "",
  licensedInCanada: "unknown",
  licenceClass: "unknown",
  relevantConvictions: "unknown",
  currentDemerits: "unknown",
  drivingUse: "personal",
  premiumAmount: "",
  premiumFrequency: "unknown",
  renewalMonth: "unknown",
  insurer: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  termsAccepted: false,
  company: "",
};

const provinces = [
  "Alberta",
  "British Columbia",
  "Manitoba",
  "New Brunswick",
  "Newfoundland and Labrador",
  "Northwest Territories",
  "Nova Scotia",
  "Nunavut",
  "Ontario",
  "Prince Edward Island",
  "Quebec",
  "Saskatchewan",
  "Yukon",
] as const;

const renewalMonths = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

function loadDraft(): AssessmentDraft {
  if (typeof window === "undefined") return initialDraft;
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(DRAFT_KEY) || "null") as Partial<AssessmentDraft> | null;
    return stored ? { ...initialDraft, ...stored, termsAccepted: false, company: "" } : initialDraft;
  } catch {
    return initialDraft;
  }
}

function assessmentOrderId() {
  if (typeof window === "undefined") return crypto.randomUUID();
  try {
    const existing = window.sessionStorage.getItem(ORDER_KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(ORDER_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

function moneyValue(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
}

async function createAssessmentPayment(
  payload: { submissionId: string; accessToken: string },
  tries = 2,
): Promise<{ url: string }> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const { data, error } = await supabase.functions.invoke<CheckoutResponse>(
        "create-assessment-payment",
        { body: payload },
      );
      if (!error && data?.url) return { url: data.url };
      if (attempt === tries - 1) break;
    } catch {
      if (attempt === tries - 1) break;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 800));
  }
  throw new Error("That didn't go through. Nothing was charged. Please try again.");
}

export default function TicketAssessmentIntake() {
  const [searchParams] = useSearchParams();
  const checkoutCancelled = searchParams.get("checkout") === "cancelled";
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<AssessmentDraft>(loadDraft);
  const [orderId] = useState(assessmentOrderId);
  const [ticketFile, setTicketFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useSafeHead({
    title: "Start Ticket Triage | $149 Alberta Ticket Assessment | Fabsy",
    description: "Securely submit an Alberta traffic ticket for Fabsy's $149 CAD total, human-reviewed Ticket Triage assessment.",
    canonical: `https://fabsy.ca${TICKET_ASSESSMENT.intakePath}`,
    robots: "noindex, nofollow",
  });

  useEffect(() => {
    trackAssessmentEvent(
      "assessment_start",
      { location: "assessment_intake", value: TICKET_ASSESSMENT.priceCad },
      orderId,
    );
  }, [orderId]);

  useEffect(() => {
    if (checkoutCancelled) {
      setError("Checkout was cancelled. No payment was taken. Review your information and continue when you're ready.");
      setStep(3);
      trackAssessmentEvent("checkout_abandoned", { checkout_stage: "stripe" });
    }
  }, [checkoutCancelled]);

  useEffect(() => {
    try {
      const { termsAccepted: _termsAccepted, company: _company, ...safeDraft } = draft;
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(safeDraft));
    } catch {
      // Storage may be unavailable in privacy-focused browser modes.
    }
  }, [draft]);

  const unsupportedProvince = draft.province !== "Alberta";
  const progress = (step / 3) * 100;

  const ticketStepValid = useMemo(() => Boolean(
    draft.province &&
    !unsupportedProvince &&
    draft.whatHappened.trim().length >= 10 &&
    ticketFile
  ), [draft.province, draft.whatHappened, ticketFile, unsupportedProvince]);

  const drivingStepValid = Boolean(
    draft.licensedInCanada &&
    draft.licenceClass &&
    draft.relevantConvictions &&
    draft.currentDemerits &&
    draft.drivingUse
  );

  const contactStepValid = Boolean(
    draft.firstName.trim() &&
    draft.lastName.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()) &&
    draft.termsAccepted
  );

  const update = <K extends keyof AssessmentDraft>(field: K, value: AssessmentDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setError(null);
  };

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setError(null);
    if (!file) {
      setTicketFile(null);
      return;
    }
    if (!(ASSESSMENT_ALLOWED_UPLOAD_TYPES as readonly string[]).includes(file.type)) {
      setTicketFile(null);
      setError("Upload a PDF, JPG, PNG or WebP ticket file.");
      event.target.value = "";
      return;
    }
    if (file.size > ASSESSMENT_MAX_UPLOAD_BYTES) {
      setTicketFile(null);
      setError("The ticket file must be 10 MB or smaller.");
      event.target.value = "";
      return;
    }
    setTicketFile(file);
  };

  const next = () => {
    if (step === 1 && !ticketStepValid) {
      setError(unsupportedProvince
        ? "This assessment currently accepts Alberta traffic tickets only."
        : "Upload the ticket and briefly tell us what happened before continuing.");
      return;
    }
    if (step === 2 && !drivingStepValid) {
      setError("Complete the driving context. Choose “I don't know” where needed.");
      return;
    }
    setError(null);
    setStep((current) => Math.min(3, current + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const back = () => {
    setError(null);
    setStep((current) => Math.max(1, current - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startCheckout = async (event: FormEvent) => {
    event.preventDefault();
    if (!contactStepValid || !ticketFile) {
      setError("Enter your name and email, accept the terms and confirm a ticket file is attached.");
      return;
    }
    setIsSubmitting(true);
    setError(null);

    try {
      const { data: intake, error: intakeError } = await supabase.functions.invoke<IntakeResponse>(
        "submit-assessment-intake",
        {
          body: {
            orderId,
            file: { contentType: ticketFile.type, size: ticketFile.size },
            contact: {
              firstName: draft.firstName.trim(),
              lastName: draft.lastName.trim(),
              email: draft.email.trim().toLowerCase(),
              phone: draft.phone.trim() || null,
            },
            ticket: {
              province: draft.province,
              offence: draft.offence.trim() || null,
              ticketDate: draft.ticketDate || null,
              responseDeadline: draft.responseDeadline || null,
              fineAmountCad: moneyValue(draft.fineAmount),
              whatHappened: draft.whatHappened.trim(),
            },
            driving: {
              licensedInCanada: draft.licensedInCanada,
              licenceClass: draft.licenceClass,
              relevantConvictions: draft.relevantConvictions,
              currentDemerits: draft.currentDemerits,
              drivingUse: draft.drivingUse,
            },
            insurance: {
              premiumAmountCad: moneyValue(draft.premiumAmount),
              premiumFrequency: draft.premiumFrequency,
              renewalMonth: draft.renewalMonth,
              insurer: draft.insurer.trim() || null,
            },
            termsAccepted: draft.termsAccepted,
            company: draft.company,
            attribution: assessmentAttribution(),
          },
        },
      );
      if (intakeError || intake?.error || !intake?.submissionId || !intake.accessToken || !intake.upload?.path || !intake.upload.token) {
        throw new Error(intake?.error || intakeError?.message || "The intake could not be saved.");
      }

      trackAssessmentEvent(
        "ticket_upload_started",
        { file_type: ticketFile.type, file_size_band: ticketFile.size < 2_000_000 ? "under_2mb" : "2mb_to_10mb" },
        orderId,
      );

      const { error: uploadError } = await supabase.storage
        .from("assessment-tickets")
        .uploadToSignedUrl(intake.upload.path, intake.upload.token, ticketFile, {
          contentType: ticketFile.type,
          upsert: true,
        });
      if (uploadError) throw new Error("The ticket upload did not finish. Please try again.");

      trackAssessmentEvent("ticket_upload_completed", { file_type: ticketFile.type }, orderId);
      trackAssessmentEvent("intake_completed", { value: TICKET_ASSESSMENT.priceCad }, orderId);

      const checkout = await createAssessmentPayment({
        submissionId: intake.submissionId,
        accessToken: intake.accessToken,
      });

      trackAssessmentEvent("checkout_started", {
        value: TICKET_ASSESSMENT.priceCad,
        item_id: "ticket_triage",
      }, orderId);
      trackAssessmentEvent("begin_checkout", {
        value: TICKET_ASSESSMENT.priceCad,
        items: [{
          item_id: "ticket_triage",
          item_name: TICKET_ASSESSMENT.name,
          price: TICKET_ASSESSMENT.priceCad,
          quantity: 1,
        }],
      }, orderId);
      window.location.assign(checkout.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not start checkout. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="container mx-auto max-w-6xl px-4 py-8 sm:py-12">
        <Button asChild variant="ghost" className="mb-4">
          <Link to={TICKET_ASSESSMENT.slug}><ArrowLeft className="mr-2 h-4 w-4" />Back to assessment details</Link>
        </Button>

        <div className="grid gap-7 lg:grid-cols-[1fr_340px] lg:items-start">
          <Card className="overflow-hidden shadow-elevated">
            <div className="border-b bg-white p-6 sm:p-8">
              <Badge className="mb-4">Secure Ticket Triage intake · $149 CAD total</Badge>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Tell us enough to assess the full picture</h1>
              <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
                This is for Alberta tickets. Choose “I don't know” where needed; the service exists because the answer is not always obvious.
              </p>
              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between text-sm font-medium">
                  <span>Step {step} of 3</span><span>{Math.round(progress)}% complete</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            </div>

            <form onSubmit={startCheckout} className="bg-white p-6 sm:p-8">
              {step === 1 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold">1. Your ticket</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Dates and offence details can be left blank if you cannot read them.</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="assessment-province">Province or territory on the ticket *</Label>
                    <Select value={draft.province} onValueChange={(value) => update("province", value)}>
                      <SelectTrigger id="assessment-province"><SelectValue /></SelectTrigger>
                      <SelectContent>{provinces.map((province) => <SelectItem key={province} value={province}>{province}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>

                  {unsupportedProvince && (
                    <Alert className="border-amber-300 bg-amber-50">
                      <AlertTitle>Fabsy currently serves Alberta tickets only</AlertTitle>
                      <AlertDescription>
                        We cannot sell this assessment for a ticket issued elsewhere. You can <Link to="/contact" className="font-semibold underline">leave contact information</Link> if you want to ask about future availability.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="assessment-offence">Offence, if known</Label>
                      <Input id="assessment-offence" value={draft.offence} onChange={(event) => update("offence", event.target.value)} placeholder="e.g. speeding, distracted driving, I don't know" maxLength={200} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="assessment-fine">Fine amount, if shown</Label>
                      <Input id="assessment-fine" type="number" min="0" max="100000" step="0.01" inputMode="decimal" value={draft.fineAmount} onChange={(event) => update("fineAmount", event.target.value)} placeholder="CAD" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="assessment-ticket-date">Ticket date, if known</Label>
                      <Input id="assessment-ticket-date" type="date" value={draft.ticketDate} onChange={(event) => update("ticketDate", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="assessment-deadline">Response or court deadline, if shown</Label>
                      <Input id="assessment-deadline" type="date" value={draft.responseDeadline} onChange={(event) => update("responseDeadline", event.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="assessment-happened">What happened? *</Label>
                    <Textarea id="assessment-happened" value={draft.whatHappened} onChange={(event) => update("whatHappened", event.target.value)} placeholder="A short description in your own words is enough." maxLength={2500} rows={5} required />
                    <p className="text-xs text-muted-foreground">Minimum 10 characters. Do not include unrelated sensitive information.</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="assessment-ticket-file">Ticket PDF or clear image *</Label>
                    <label htmlFor="assessment-ticket-file" className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-6 text-center transition hover:border-primary/60">
                      {ticketFile ? <FileCheck2 className="h-8 w-8 text-primary" /> : <FileUp className="h-8 w-8 text-primary" />}
                      <span className="mt-3 font-semibold">{ticketFile ? "Ticket ready to upload" : "Choose your ticket file"}</span>
                      <span className="mt-1 max-w-lg break-all text-xs text-muted-foreground">{ticketFile?.name || "PDF, JPG, PNG or WebP · maximum 10 MB"}</span>
                    </label>
                    <Input id="assessment-ticket-file" className="sr-only !w-px" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={chooseFile} />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold">2. Driving and insurance context</h2>
                    <p className="mt-1 text-sm text-muted-foreground">These answers help Fabsy judge financial significance without collecting your licence number or immigration information.</p>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <SelectField id="licensed-canada" label="How long licensed in Canada?" value={draft.licensedInCanada} onChange={(value) => update("licensedInCanada", value)} options={[["less_than_1_year", "Less than 1 year"], ["1_to_3_years", "1–3 years"], ["4_to_9_years", "4–9 years"], ["10_plus_years", "10+ years"], ["unknown", "I don't know"]]} />
                    <SelectField id="licence-class" label="Alberta licence class" value={draft.licenceClass} onChange={(value) => update("licenceClass", value)} options={[["class_7", "Class 7 (learner)"], ["class_5_gdl", "Class 5-GDL"], ["class_5", "Class 5"], ["commercial", "Commercial class"], ["other", "Other"], ["unknown", "I don't know"]]} />
                    <SelectField id="relevant-convictions" label="Relevant prior convictions" value={draft.relevantConvictions} onChange={(value) => update("relevantConvictions", value)} options={[["0", "None"], ["1", "One"], ["2_plus", "Two or more"], ["unknown", "I don't know"]]} />
                    <SelectField id="current-demerits" label="Current demerit points" value={draft.currentDemerits} onChange={(value) => update("currentDemerits", value)} options={[["0", "None"], ["1_to_3", "1–3"], ["4_to_7", "4–7"], ["8_plus", "8 or more"], ["unknown", "I don't know"]]} />
                    <SelectField id="driving-use" label="Main driving use" value={draft.drivingUse} onChange={(value) => update("drivingUse", value)} options={[["personal", "Personal"], ["commercial", "Commercial / for work"], ["both", "Both"], ["unknown", "I don't know"]]} />
                    <SelectField id="renewal-month" label="Insurance renewal month, if known" value={draft.renewalMonth} onChange={(value) => update("renewalMonth", value)} options={[["unknown", "I don't know"], ...renewalMonths.map((month) => [month.toLowerCase(), month] as [string, string])]} />
                  </div>
                  <div className="grid gap-5 sm:grid-cols-[1fr_180px]">
                    <div className="space-y-2">
                      <Label htmlFor="premium-amount">Current approximate premium, optional</Label>
                      <Input id="premium-amount" type="number" min="0" max="100000" step="0.01" inputMode="decimal" value={draft.premiumAmount} onChange={(event) => update("premiumAmount", event.target.value)} placeholder="CAD" />
                    </div>
                    <SelectField id="premium-frequency" label="Frequency" value={draft.premiumFrequency} onChange={(value) => update("premiumFrequency", value as PremiumFrequency)} options={[["monthly", "Monthly"], ["annual", "Annual"], ["unknown", "Not supplied"]]} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="assessment-insurer">Current insurer, optional</Label>
                    <Input id="assessment-insurer" value={draft.insurer} onChange={(event) => update("insurer", event.target.value)} maxLength={150} />
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold">3. Contact and review</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Fabsy will deliver the assessment to the email entered here.</p>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2"><Label htmlFor="assessment-first-name">First name *</Label><Input id="assessment-first-name" autoComplete="given-name" value={draft.firstName} onChange={(event) => update("firstName", event.target.value)} maxLength={100} required /></div>
                    <div className="space-y-2"><Label htmlFor="assessment-last-name">Last name *</Label><Input id="assessment-last-name" autoComplete="family-name" value={draft.lastName} onChange={(event) => update("lastName", event.target.value)} maxLength={100} required /></div>
                    <div className="space-y-2"><Label htmlFor="assessment-email">Email *</Label><Input id="assessment-email" type="email" autoComplete="email" value={draft.email} onChange={(event) => update("email", event.target.value)} maxLength={255} required /></div>
                    <div className="space-y-2"><Label htmlFor="assessment-phone">Phone, optional</Label><Input id="assessment-phone" type="tel" autoComplete="tel" value={draft.phone} onChange={(event) => update("phone", event.target.value)} maxLength={30} /></div>
                  </div>

                  <div className="sr-only" aria-hidden="true">
                    <Label htmlFor="assessment-company">Company</Label>
                    <Input id="assessment-company" tabIndex={-1} autoComplete="off" value={draft.company} onChange={(event) => update("company", event.target.value)} />
                  </div>

                  <Card className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div><p className="font-bold">{TICKET_ASSESSMENT.name}</p><p className="mt-1 text-sm text-muted-foreground">Alberta ticket · human reviewed</p></div>
                      <p className="shrink-0 text-xl font-bold">${TICKET_ASSESSMENT.priceCad} CAD</p>
                    </div>
                    <div className="my-4 border-t" />
                    <div className="flex justify-between font-semibold"><span>Total charged at checkout</span><span>${TICKET_ASSESSMENT.priceCad} CAD</span></div>
                    <p className="mt-2 text-xs text-muted-foreground">One-time total; applicable GST is included. If representation is worthwhile and the same matter is eligible, the $149 can be applied to Fabsy's $488 base representation fee, leaving a $339 base-fee balance plus applicable tax.</p>
                  </Card>

                  <div className="rounded-xl border bg-slate-50 p-4">
                    <div className="flex items-start gap-3">
                      <Checkbox id="assessment-terms" checked={draft.termsAccepted} onCheckedChange={(value) => update("termsAccepted", value === true)} className="mt-0.5" />
                      <Label htmlFor="assessment-terms" className="cursor-pointer text-sm leading-relaxed">
                        I confirm the information is accurate to the best of my knowledge and agree to Fabsy's <Link to="/terms-of-service" className="font-semibold text-primary underline">Terms of Service</Link> and <Link to="/privacy-policy" className="font-semibold text-primary underline">Privacy Policy</Link>. I understand this is an assessment, not a promise of a court or insurance result.
                      </Label>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <Alert className="mt-6 border-destructive/30" variant="destructive">
                  <AlertTitle>Check this step</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="mt-8 flex items-center justify-between border-t pt-6">
                <Button type="button" variant="outline" onClick={back} disabled={step === 1 || isSubmitting}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
                {step < 3 ? (
                  <Button type="button" onClick={next} disabled={isSubmitting}>Continue<ArrowRight className="ml-2 h-4 w-4" /></Button>
                ) : (
                  <Button type="submit" size="lg" disabled={!contactStepValid || isSubmitting} className="min-h-12">
                    <CreditCard className="mr-2 h-5 w-5" />
                    {isSubmitting ? "Saving and opening checkout..." : `Secure checkout: $${TICKET_ASSESSMENT.priceCad} CAD total`}
                  </Button>
                )}
              </div>
            </form>
          </Card>

          <aside className="space-y-5 lg:sticky lg:top-24">
            <Card className="p-6 shadow-fab">
              <p className="text-sm font-semibold text-primary">{TICKET_ASSESSMENT.name}</p>
              <p className="mt-1 text-4xl font-bold">${TICKET_ASSESSMENT.priceCad}</p>
              <p className="text-sm text-muted-foreground">CAD total · GST included</p>
              <ul className="mt-5 space-y-3 text-sm">
                {["Charge and deadline", "Demerit implications", "Likely insurance significance", "Representation break-even", "Recommended next step", "$149 can be applied to eligible representation when worthwhile", "Priority placement if you upgrade"].map((item) => <li key={item} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{item}</li>)}
              </ul>
            </Card>
            <Card className="p-5">
              <div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="font-bold">Private ticket upload</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Your ticket is stored in a private bucket using a non-public object path. Fabsy does not send ticket content or contact details to analytics.</p></div></div>
            </Card>
            <Card className="p-5">
              <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p className="text-sm leading-relaxed text-muted-foreground">{TICKET_ASSESSMENT.insuranceDisclaimer}</p></div>
            </Card>
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([optionValue, optionLabel]) => <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
