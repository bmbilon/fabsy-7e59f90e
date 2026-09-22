import { useRef, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import type { FormData } from "./TicketForm";
import TicketCapture from "./TicketCapture";
import { TicketPhotoGuide } from "./TicketPhotoGuide";
import PhotoUploadConfirmation from "./PhotoUploadConfirmation";
import { Button } from "./ui/button";
import { validateTicketCaptureFile } from "@/lib/ticket/ticketCapture";
import { newPhotoIntakeAttempt, savePhotoTicket, type PhotoIntakeAttempt } from "@/lib/ticket/photoIntake";
import type { PreparedTicketSubmission, SavedTicketSubmission } from "@/lib/ticket/submitIntake";
import { PHOTO_UPLOAD_AUTHORIZATION_LINES, CONSENT_PRIVACY_LINES, INTAKE_CONSENT_LABEL, PHOTO_UPLOAD_CONSENT_CONFIRMATION, NOT_GUILTY_PLEA_LABEL, NOT_GUILTY_PLEA_INSTRUCTION, NO_PLEA_INSTRUCTION } from "../../supabase/functions/_shared/intake-consent";

import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { PHOTO_RADAR, RAPID_RESOLUTION, RAPID_RESOLUTION_BUNDLE } from "@/config/offers";
import { applyTicketType, type TicketType } from "@/lib/ticket/ticketType";
import IntakeProgress from "./IntakeProgress";

type Update = (updates: Partial<FormData> | ((current: FormData) => Partial<FormData>)) => void;

export default function QuickTicketIntake({ formData, updateFormData, embedded = false, allowFileSelection = true }: { formData: FormData; updateFormData: Update; embedded?: boolean; allowFileSelection?: boolean }) {
  const { search } = useLocation();
  const bundleRequested = new URLSearchParams(search).get("bundle") === "1";
  const selected = formData.ticketTypeSource !== "default";
  const camera = selected && formData.ticketType === "photo_radar";
  const offer = camera ? PHOTO_RADAR : bundleRequested ? RAPID_RESOLUTION_BUNDLE : RAPID_RESOLUTION;
  const changeType = (type: TicketType) => {
    attempt.current = null; prepared.current = null; setError("");
    updateFormData(current => ({ ...applyTicketType(current, type, "manual"), consentGiven: false }));
  };
  const Heading = embedded ? "h2" : "h1";
  const [busy, setBusy] = useState(false);
  const [pleadNotGuilty, setPleadNotGuilty] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SavedTicketSubmission | null>(null);
  const inFlight = useRef(false);
  const attempt = useRef<PhotoIntakeAttempt | null>(null);
  const prepared = useRef<PreparedTicketSubmission | null>(null);
  const hasTicket = Boolean(formData.ticketImage || (formData.sourceAssessmentId && formData.sourceAssessmentAccessToken));
  const fileValid = !formData.ticketImage || validateTicketCaptureFile(formData.ticketImage).valid;
  const changeFile = (ticketImage: File | null) => {
    attempt.current = null; prepared.current = null; setError("");
    updateFormData({ ticketImage, consentGiven: false, digitalSignature: "", sourceAssessmentId: "", sourceAssessmentAccessToken: "" });
  };
  const changePlea = (checked: boolean) => {
    // A failed request may already have stored immutable consent. A changed
    // instruction must be submitted as a fresh acceptance, never a stale retry.
    attempt.current = null; prepared.current = null; setError("");
    setPleadNotGuilty(checked);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current || !formData.consentGiven || !hasTicket || !fileValid || !selected || !formData.email.trim()) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      attempt.current ??= newPhotoIntakeAttempt();
      const result = await savePhotoTicket(formData, attempt.current, { pleadNotGuilty, prepared: prepared.current, onPrepared: value => { prepared.current = value; }, bundleRequested: !camera && bundleRequested, landingPage: new URLSearchParams(search).get("lp") });
      setSaved(result);
      window.dispatchEvent(new CustomEvent("fabsy:live-stage", { detail: "review" }));
      document.getElementById("ticket-form-container")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Your ticket and consent could not be saved. Please try again."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  if (saved) return <PhotoUploadConfirmation saved={saved} formData={formData} updateFormData={updateFormData} embedded={embedded} />;
  return <section id="ticket-form-container" className="mx-auto max-w-3xl scroll-mt-28 space-y-5 rounded-2xl bg-background p-[16px] text-foreground sm:p-[28px]">
    <IntakeProgress current={1} />
    <div className="text-center"><Heading className="text-2xl font-bold sm:text-3xl">{hasTicket ? "Your ticket is attached. Let’s get started." : "Upload your ticket"}</Heading>
      <p className="mt-[12px] font-semibold">{offer.name} · ${offer.priceCad} CAD + GST (${(offer.priceCad * 1.05).toFixed(2)} total)</p>
      <p className="mt-[4px] text-sm text-muted-foreground">No charge now. Pay after we confirm your ticket.</p>
    </div>
    <form onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        <legend className="sr-only">Ticket and consent</legend>
        <fieldset className="grid grid-cols-2 gap-2"><legend className="mb-2 text-sm font-semibold">Which ticket do you have?</legend>
          {([['officer_issued', 'Officer-issued ticket', 'Handed to the driver', bundleRequested ? RAPID_RESOLUTION_BUNDLE.priceCad : RAPID_RESOLUTION.priceCad], ['photo_radar', 'Photo radar / red-light camera', 'Mailed to the registered owner', PHOTO_RADAR.priceCad]] as const).map(([type, label, hint, price]) => <label key={type} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-[10px] text-xs sm:text-sm ${selected && formData.ticketType === type ? 'border-blue-700 bg-blue-50' : ''}`}><input type="radio" name="quick-ticket-type" value={type} required checked={selected && formData.ticketType === type} onChange={() => changeType(type)} className="mt-[4px] accent-blue-700" /><span><strong>{label}<span className="block">${price} + GST</span></strong><span className="mt-[4px] block text-xs text-muted-foreground">{hint}</span></span></label>)}
        </fieldset>
        {bundleRequested && <p className="text-sm">{camera ? "The insurance report bundle does not apply to camera notices. Photo Radar is $79 + GST." : "Your bundle includes Rapid Resolution and the Insurance Impact Report. You can change the add-on at checkout."}</p>}
        <TicketCapture file={formData.ticketImage} onFileChange={changeFile} onOcrData={() => {}} scanOnSelect={false} allowFileSelection={allowFileSelection}
          disabled={busy} compact required={!formData.sourceAssessmentId} />
        {!hasTicket && <TicketPhotoGuide />}
        {hasTicket && <>
          <div className="space-y-2"><Label htmlFor="quick-email">Your email</Label><Input id="quick-email" type="email" autoComplete="email" required maxLength={255} value={formData.email} aria-describedby="quick-email-help" onChange={event => {
            attempt.current = null; prepared.current = null;
            updateFormData({ email: event.target.value });
          }} /><p id="quick-email-help" className="text-xs text-muted-foreground">We’ll email your authorization copy and next steps here.</p></div>
          <label htmlFor="quick-not-guilty" className="flex cursor-pointer items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-[12px]">
            <input id="quick-not-guilty" name="pleadNotGuilty" type="checkbox" checked={pleadNotGuilty}
              onChange={event => changePlea(event.target.checked)} aria-describedby="quick-not-guilty-help"
              className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-700" />
            <span className="font-semibold leading-6">{NOT_GUILTY_PLEA_LABEL}</span>
          </label>
          <p id="quick-not-guilty-help" className="text-xs leading-5 text-muted-foreground">{pleadNotGuilty ? NOT_GUILTY_PLEA_INSTRUCTION : NO_PLEA_INSTRUCTION}</p>
          <label htmlFor="quick-consent" className="flex cursor-pointer items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-[12px]">
            <input id="quick-consent" name="consent" type="checkbox" required checked={formData.consentGiven}
              onChange={event => updateFormData({ consentGiven: event.target.checked, digitalSignature: "" })}
              aria-describedby="quick-consent-help" className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-700" />
            <span className="font-semibold leading-6">{INTAKE_CONSENT_LABEL}</span>
          </label>
          <p id="quick-consent-help" className="text-xs leading-5 text-muted-foreground">{PHOTO_UPLOAD_CONSENT_CONFIRMATION}</p>
          <details className="text-xs leading-5 text-muted-foreground">
            <summary className="cursor-pointer underline underline-offset-4">Authorization and service fees</summary>
            <div className="mt-[12px] space-y-2">{[...PHOTO_UPLOAD_AUTHORIZATION_LINES, ...CONSENT_PRIVACY_LINES].filter(Boolean).map((line, index) => <p key={index}>{line}</p>)}
              <p><Link to="/terms-of-purchase" target="_blank" rel="noopener noreferrer" className="underline">Terms of Purchase</Link> · <Link to="/terms-of-service" target="_blank" rel="noopener noreferrer" className="underline">Terms of Service</Link> · <Link to="/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline">Privacy Policy</Link></p>
            </div>
          </details>
        </>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" data-funnel-action="primary_cta" data-funnel-position={embedded ? "hero" : "intake"} size="lg" className="min-h-14 w-full whitespace-normal bg-blue-700 text-base font-bold text-white hover:bg-blue-800" disabled={busy || !hasTicket || !fileValid || !formData.consentGiven || !selected || !formData.email.trim()}>
          {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}{busy ? "Submitting…" : "Save my ticket and continue"}
        </Button>
      </fieldset>
    </form>
  </section>;
}
