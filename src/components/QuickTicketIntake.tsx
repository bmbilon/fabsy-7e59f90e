import { useRef, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { FormData } from "./TicketForm";
import TicketCapture from "./TicketCapture";
import { TicketPhotoGuide } from "./TicketPhotoGuide";
import PhotoUploadConfirmation from "./PhotoUploadConfirmation";
import { Button } from "./ui/button";
import { validateTicketCaptureFile } from "@/lib/ticket/ticketCapture";
import { newPhotoIntakeAttempt, savePhotoTicket, type PhotoIntakeAttempt } from "@/lib/ticket/photoIntake";
import type { PreparedTicketSubmission, SavedTicketSubmission } from "@/lib/ticket/submitIntake";
import { PHOTO_UPLOAD_AUTHORIZATION_LINES, CONSENT_PRIVACY_LINES, INTAKE_CONSENT_LABEL, PHOTO_UPLOAD_CONSENT_CONFIRMATION } from "../../supabase/functions/_shared/intake-consent";

type Update = (updates: Partial<FormData> | ((current: FormData) => Partial<FormData>)) => void;

export default function QuickTicketIntake({ formData, updateFormData, embedded = false }: { formData: FormData; updateFormData: Update; embedded?: boolean }) {
  const Heading = embedded ? "h2" : "h1";
  const [busy, setBusy] = useState(false);
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
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current || !formData.consentGiven || !hasTicket || !fileValid) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      attempt.current ??= newPhotoIntakeAttempt();
      const result = await savePhotoTicket(formData, attempt.current, { prepared: prepared.current, onPrepared: value => { prepared.current = value; } });
      setSaved(result);
      window.dispatchEvent(new CustomEvent("fabsy:live-stage", { detail: "review" }));
      document.getElementById("ticket-form-container")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Your ticket and consent could not be saved. Please try again."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  if (saved) return <PhotoUploadConfirmation saved={saved} formData={formData} updateFormData={updateFormData} embedded={embedded} />;
  return <section id="ticket-form-container" className="mx-auto max-w-3xl scroll-mt-28 space-y-5 rounded-2xl bg-background p-[16px] text-foreground sm:p-[28px]">
    <Heading className="text-center text-2xl font-bold sm:text-4xl">Upload your ticket.</Heading>
    <TicketPhotoGuide />
    <form onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        <legend className="sr-only">Ticket and consent</legend>
        <TicketCapture file={formData.ticketImage} onFileChange={changeFile} onOcrData={() => {}} scanOnSelect={false}
          disabled={busy} compact={hasTicket} required={!formData.sourceAssessmentId} />
        {hasTicket && <>
          <label htmlFor="quick-consent" className="flex cursor-pointer items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-[12px]">
            <input id="quick-consent" name="consent" type="checkbox" required checked={formData.consentGiven}
              onChange={event => updateFormData({ consentGiven: event.target.checked, digitalSignature: "" })}
              aria-describedby="quick-consent-help" className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-700" />
            <span className="font-semibold leading-6">{INTAKE_CONSENT_LABEL}</span>
          </label>
          <p id="quick-consent-help" className="text-xs leading-5 text-muted-foreground">{PHOTO_UPLOAD_CONSENT_CONFIRMATION}</p>
          <details className="text-xs leading-5 text-muted-foreground">
            <summary className="cursor-pointer underline underline-offset-4">Authorization and service fees</summary>
            <div className="mt-3 space-y-2">{[...PHOTO_UPLOAD_AUTHORIZATION_LINES, ...CONSENT_PRIVACY_LINES].filter(Boolean).map((line, index) => <p key={index}>{line}</p>)}
              <p><Link to="/terms-of-purchase" target="_blank" rel="noopener noreferrer" className="underline">Terms of Purchase</Link> · <Link to="/terms-of-service" target="_blank" rel="noopener noreferrer" className="underline">Terms of Service</Link> · <Link to="/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline">Privacy Policy</Link></p>
            </div>
          </details>
        </>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" data-funnel-action="primary_cta" data-funnel-position={embedded ? "hero" : "intake"} size="lg" className="min-h-14 w-full whitespace-normal text-base font-bold" disabled={busy || !hasTicket || !fileValid || !formData.consentGiven}>
          {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}{busy ? "Submitting…" : "Submit ticket and consent"}
        </Button>
      </fieldset>
    </form>
  </section>;
}
