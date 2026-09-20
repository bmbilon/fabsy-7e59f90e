import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, FileCheck2, LockKeyhole, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ConsentStep from "@/components/form-steps/ConsentStep";
import PaymentStep from "@/components/form-steps/PaymentStep";
import type { FormData } from "@/components/TicketForm";
import useSafeHead from "@/hooks/useSafeHead";
import {
  createIntakeDraftAccessToken, intakeDraftSaveWasApplied, invokeIntakeDraft,
  serializeIntakeDraftData, type IntakeDraftRecord,
} from "@/lib/ticket/intakeDraft";
import { COMPLETION_STORAGE_KEY, completionAccess, completionErrors, completionFormData, type CompletionAccess } from "@/lib/ticket/completion";
import { calendarDateAsLocalDate } from "@/lib/ticket/ticketType";
import { PHOTO_RADAR_PRICE_LABEL, RAPID_RESOLUTION_PRICE_LABEL } from "@/config/offers";

const fields = [
  ["firstName", "First legal name", "given-name"], ["lastName", "Last legal name", "family-name"],
  ["email", "Email", "email"], ["phone", "Phone", "tel"],
  ["driversLicense", "Driver’s licence number", "off"], ["address", "Mailing address", "street-address"],
  ["city", "City", "address-level2"], ["province", "Province / state", "address-level1"],
  ["postalCode", "Postal / ZIP code", "postal-code"],
] as const;

function retain(access: CompletionAccess) {
  // Save only the capability, never identity details or a signature.
  try { sessionStorage.setItem(COMPLETION_STORAGE_KEY, JSON.stringify(access)); } catch { /* In-memory access still works. */ }
}

export default function CompleteTicket() {
  const [access, setAccess] = useState(() => completionAccess(window.location.hash, { getItem: key => sessionStorage.getItem(key) }));
  const [record, setRecord] = useState<IntakeDraftRecord | null>(null);
  const [form, setForm] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState(false);
  const [error, setError] = useState("");
  useSafeHead({ title: "Complete Consent and Payment | Fabsy", description: "Your ticket is received. Complete your private consent and payment.", robots: "noindex, nofollow, noarchive" });

  useEffect(() => {
    let active = true;
    const initial = access;
    if (window.location.hash) window.history.replaceState(window.history.state, "", window.location.pathname);
    void (async () => {
      try {
        if (!initial) throw new Error("Open the complete private link from your Fabsy email. Contact us if you need a new link.");
        retain(initial);
        let restored: IntakeDraftRecord | undefined;
        let token = initial.token;
        let failure: unknown;
        for (const candidate of [initial.token, initial.candidate].filter(Boolean) as string[]) {
          try { restored = await invokeIntakeDraft({ action: "read", accessToken: candidate }); token = candidate; break; }
          catch (caught) { failure = caught; }
        }
        if (!restored) throw failure;
        if (!restored.ticketUploadedAt || !restored.ticketDocumentPath) throw new Error("We could not confirm the saved ticket. Please contact Fabsy so we can locate it for you.");
        if (restored.preferredLocale !== "en") throw new Error("Please contact Fabsy for help completing consent in your preferred language.");
        if (!active) return;
        retain({ token }); setAccess({ token }); setRecord(restored); setForm(completionFormData(restored));
        setPayment(restored.completion?.consentSigned === true);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "This private link is unavailable. Contact Fabsy for help.");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
    // Capture the selected link once. A rotated token must not remount consent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (values: Partial<FormData>) => { setForm(current => current ? { ...current, ...values } : current); setError(""); };
  const continueToPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!record || !form || !access || busy) return;
    const missing = completionErrors(form);
    if (missing.length) { setError(`Please complete: ${missing.join(", ")}.`); return; }
    setBusy(true); setError("");
    try {
      if (record.hasPendingTicketUpload) throw new Error("Choose ‘Use the ticket already saved’ before continuing.");
      if (record.status !== "converted") {
        const candidate = access.candidate || createIntakeDraftAccessToken();
        retain({ token: access.token, candidate });
        setAccess({ token: access.token, candidate });
        const draftData = serializeIntakeDraftData(form as unknown as Record<string, unknown>);
        const expected = { revision: record.revision, currentStep: 4, completedStep: 3, draftData };
        let saved: IntakeDraftRecord;
        let token = access.token;
        try {
          saved = await invokeIntakeDraft({ action: "save", draftId: record.draftId, accessToken: access.token,
            replacementAccessToken: candidate, ...expected });
          if (saved.capabilityRotated) token = candidate;
        } catch (failure) {
          // A response can be lost after contact changes rotate the capability.
          const recovered = await invokeIntakeDraft({ action: "read", draftId: record.draftId, accessToken: candidate }).catch(() => null);
          if (!recovered || !intakeDraftSaveWasApplied(recovered, expected)) throw failure;
          saved = recovered; token = candidate;
        }
        retain({ token }); setAccess({ token }); setRecord(saved);
      }
      setPayment(true);
      window.scrollTo({ top: 0, behavior: "auto" });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Your consent details could not be saved. Please try again."); }
    finally { setBusy(false); }
  };

  const keepSavedTicket = async () => {
    if (!record || !access || busy) return;
    setBusy(true); setError("");
    try {
      setRecord(await invokeIntakeDraft({ action: "discard_pending_upload", draftId: record.draftId, accessToken: access.token, revision: record.revision }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "We could not confirm the ticket. Please contact Fabsy."); }
    finally { setBusy(false); }
  };

  const paid = record?.completion?.paid === true;
  const unavailable = record?.completion && !record.completion.paymentAvailable && !paid;
  return <div className="min-h-screen bg-slate-50 text-slate-950">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-5"><a href="/" className="text-2xl font-bold text-primary">fabsy</a><span className="flex items-center gap-2 text-sm text-slate-600"><LockKeyhole size={16} />Private client page</span></div></header>
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {loading ? <Card className="p-10 text-center" role="status"><Loader2 className="mx-auto mb-4 animate-spin" />Opening your saved ticket…</Card> : <>
        <div className="mb-8"><FileCheck2 className="mb-4 h-10 w-10 text-emerald-700" /><h1 className="text-3xl font-bold tracking-tight">{paid ? "Your payment is received" : record ? "Your ticket is received. Let’s get started." : "Open your private ticket link"}</h1><p className="mt-3 text-lg text-slate-600">{paid ? "Your consent and payment are on file. Fabsy will follow up with you about your ticket." : record ? "We can help with the next steps. Complete your consent and payment below. Your ticket is already saved—no need to upload it again." : "Use the link from your Fabsy email to securely continue with your saved ticket."}</p></div>
        {record && form && access && <>
          <Card className="mb-6 p-5"><div className="flex items-start gap-3"><CheckCircle2 className="mt-1 shrink-0 text-emerald-700" /><div className="min-w-0"><p className="font-semibold">Ticket {form.ticketNumber || "on file"}</p><p className="mt-1 break-words text-sm text-slate-600">{form.offenceDescription || form.violation || "Your uploaded ticket is saved securely."}</p><p className="mt-3 font-semibold">{form.ticketType === "photo_radar" ? PHOTO_RADAR_PRICE_LABEL : RAPID_RESOLUTION_PRICE_LABEL}</p></div></div></Card>
          {unavailable ? <Alert><AlertTitle>Please contact Fabsy</AlertTitle><AlertDescription>This case is already being handled. We’ll confirm whether any payment remains outstanding.</AlertDescription></Alert> : !paid && <>
            <ol className="mb-6 flex gap-5 text-sm font-semibold" aria-label="Your next steps"><li className={payment ? "text-slate-500" : "text-primary"}>1. Review and sign consent</li><li className={payment ? "text-primary" : "text-slate-500"}>2. Secure payment</li></ol>
            {record.hasPendingTicketUpload && <Alert className="mb-6"><AlertTitle>Your previous ticket is saved</AlertTitle><AlertDescription>A replacement upload was not completed. You can continue with the ticket we already have.<Button type="button" variant="outline" className="mt-3 block" disabled={busy} onClick={() => void keepSavedTicket()}>Use the ticket already saved</Button></AlertDescription></Alert>}
            {payment ? <Card className="p-5 sm:p-7"><p className="mb-5 text-sm text-slate-600">{record.completion?.consentSigned ? "Your signed consent is on file. Complete secure payment to continue." : "Your consent is ready. Continuing to checkout saves your signed authorization and opens secure payment."}</p><PaymentStep formData={form} updateFormData={update} intakeDraft={{ draftId: record.draftId, accessToken: access.token, expiresAt: record.expiresAt }} storedConsent={record.completion?.consentSigned === true} completionFlow />{!record.completion?.consentSigned && <Button variant="outline" className="mt-5" onClick={() => setPayment(false)}>Back to consent</Button>}</Card> : <form onSubmit={continueToPayment} className="space-y-6">
              <Card className="p-5 sm:p-7"><h2 className="text-xl font-semibold">Your consent details</h2><p className="mb-5 mt-2 text-sm text-slate-600">Review the details already provided and fill in anything missing so we can prepare your authorization.</p><div className="grid gap-4 sm:grid-cols-2">
                {fields.map(([key, label, autoComplete]) => <div key={key}><Label htmlFor={`completion-${key}`}>{label}</Label><Input id={`completion-${key}`} className="mt-1" autoComplete={autoComplete} value={form[key]} maxLength={key === "address" ? 500 : 100} type={key === "email" ? "email" : key === "phone" ? "tel" : "text"} required readOnly={record.status === "converted"} onChange={event => update({ [key]: event.target.value })} /></div>)}
                <div><Label htmlFor="completion-dob">Date of birth</Label><Input id="completion-dob" type="date" className="mt-1" autoComplete="bday" required readOnly={record.status === "converted"} value={form.dateOfBirth ? `${form.dateOfBirth.getFullYear()}-${String(form.dateOfBirth.getMonth() + 1).padStart(2, "0")}-${String(form.dateOfBirth.getDate()).padStart(2, "0")}` : ""} onChange={event => update({ dateOfBirth: calendarDateAsLocalDate(event.target.value) })} /></div>
              </div>
              {([ ["ticketNumber", "Ticket number"], ["fineAmount", "Ticket fine ($)"], ["violation", "Offence shown on ticket"] ] as const).filter(([key]) => !record.draftData[key] && !(key === "violation" && record.draftData.offenceDescription)).map(([key, label]) => <div className="mt-4" key={key}><Label htmlFor={`completion-${key}`}>{label}</Label><Input id={`completion-${key}`} className="mt-1" required value={form[key]} onChange={event => update({ [key]: event.target.value })} /></div>)}
              {form.ticketType === "photo_radar" && <label className="mt-5 flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={form.registeredOwnerOnOffenceDate === "yes"} disabled={record.status === "converted"} onChange={event => update({ registeredOwnerOnOffenceDate: event.target.checked ? "yes" : "" })} />I was the registered owner on the offence date.</label>}
              </Card>
              <Card className="p-5 sm:p-7"><ConsentStep formData={form} updateFormData={update} /></Card>
              <Button type="submit" size="lg" className="h-auto min-h-12 w-full whitespace-normal py-3" disabled={busy || record.hasPendingTicketUpload}>{busy && <Loader2 className="mr-2 animate-spin" />}Continue to secure payment</Button>
            </form>}
          </>}
        </>}
        {error && <Alert variant="destructive" className="mt-6" role="alert"><AlertTitle>We need your attention</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      </>}
      <p className="mt-8 text-center text-sm text-slate-600">Need help? Call <a className="font-medium text-primary underline" href="tel:+18257932279">(825) 793-2279</a> or email <a className="font-medium text-primary underline" href="mailto:hello@fabsy.ca">hello@fabsy.ca</a>.</p>
    </main>
  </div>;
}
