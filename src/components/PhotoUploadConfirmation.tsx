import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import type { FormData } from "./TicketForm";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import PaymentStep from "./form-steps/PaymentStep";
import { photoIntakeAction, type PhotoIntakeStatus } from "@/lib/ticket/photoIntake";
import type { SavedTicketSubmission } from "@/lib/ticket/submitIntake";

export default function PhotoUploadConfirmation({ saved, formData, updateFormData, embedded = false }: {
  saved: SavedTicketSubmission;
  formData: FormData;
  updateFormData: (values: Partial<FormData>) => void;
  embedded?: boolean;
}) {
  const Heading = embedded ? "h2" : "h1";
  const [email, setEmail] = useState(formData.email);
  const [phone, setPhone] = useState(formData.phone);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<PhotoIntakeStatus | null>(null);
  const [owner, setOwner] = useState("");
  const inFlight = useRef(false);
  const onFields = useRef(updateFormData);
  onFields.current = updateFormData;

  useEffect(() => {
    if (!accepted) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let remaining = 15;
    const read = async () => {
      try {
        const result = await photoIntakeAction<PhotoIntakeStatus>(saved, "status");
        if (cancelled) return;
        setStatus(result); onFields.current(result.fields);
        if (["pending_scan", "scanning"].includes(result.reviewStatus) && --remaining > 0) timer = setTimeout(read, 2000);
      } catch { /* The receipt and contact details remain saved if scanning is unavailable. */ }
    };
    void read();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [accepted, saved]);

  const accept = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    if (!email.trim() && !phone.trim()) { setError("Enter an email address or phone number for updates."); return; }
    if (phone.trim() && !/^[+\d().\s-]{7,30}$/.test(phone.trim())) { setError("Enter a valid phone number."); return; }
    inFlight.current = true; setBusy(true); setError("");
    try {
      const result = await photoIntakeAction<PhotoIntakeStatus>(saved, "contact", { email, phone });
      setStatus(result); updateFormData(result.fields); setAccepted(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Your ticket is saved. Please try saving your contact details again."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const saveOwner = async () => {
    if (inFlight.current || !owner) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const result = await photoIntakeAction<PhotoIntakeStatus>(saved, "owner", { answer: owner });
      setStatus(result); updateFormData(result.fields);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Please try again."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const ready = accepted && status?.reviewStatus === "ready" && Boolean(status.fields.email);
  const needsOwner = ready && status.fields.ticketType === "photo_radar" && !status.fields.registeredOwnerOnOffenceDate;

  return <section id="ticket-form-container" className="mx-auto max-w-3xl scroll-mt-28 space-y-6 rounded-2xl bg-background p-[16px] text-foreground sm:p-[28px]">
    <div role="status" className="space-y-3 text-center">
      <CheckCircle2 className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
      <Heading className="text-2xl font-bold">Success, Your ticket has been received</Heading>
      <p className="text-sm text-muted-foreground">Your ticket and consent are saved.</p>
    </div>
    {!accepted ? <form onSubmit={accept} className="space-y-5">
      <fieldset disabled={busy} className="space-y-5">
        <legend className="mb-4 text-lg font-semibold">Provide me with updates</legend>
        <div className="space-y-2"><Label htmlFor="updates-email">By email</Label><Input id="updates-email" type="email" autoComplete="email" maxLength={255} value={email} onChange={event => setEmail(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="updates-phone">And/or phone</Label><Input id="updates-phone" type="tel" autoComplete="tel" maxLength={30} value={phone} onChange={event => setPhone(event.target.value)} /></div>
        <Button className="min-h-12 w-full" type="submit" disabled={busy}>{busy ? "Saving…" : "Accept"}</Button>
      </fieldset>
    </form> : <p role="status" className="text-center">Updates enabled. We’ll contact you if we need any more information.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {needsOwner && <div className="space-y-3 rounded-xl border p-[16px]">
      <Label htmlFor="checkout-owner">Before paying for this camera notice, was the vehicle registered to you on the offence date?</Label>
      <select id="checkout-owner" className="h-12 w-full rounded-md border bg-background px-3" value={owner} onChange={event => setOwner(event.target.value)} disabled={busy}>
        <option value="">Select an answer</option><option value="yes">Yes</option><option value="sold_before">I sold it before that date</option><option value="stolen">It was stolen</option>
      </select>
      <Button onClick={saveOwner} disabled={busy || !owner}>Continue to payment</Button>
    </div>}
    {ready && !needsOwner && <PaymentStep formData={{ ...formData, ...status.fields }} updateFormData={updateFormData} savedSubmission={saved} />}
  </section>;
}
