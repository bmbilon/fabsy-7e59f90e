import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, CreditCard, Loader2, LockKeyhole } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import useSafeHead from "@/hooks/useSafeHead";
import { captureManualRepresentationCredentials, functionInvokeMessage, type ManualRepresentationRecord } from "@/lib/manualRepresentation";
import {
  checkoutAuthorization, CHECKOUT_CONSENT_VERSION, CHECKOUT_PLEA_INSTRUCTION,
  INTAKE_CONSENT_CONFIRMATION, INTAKE_CONSENT_LABEL, NOT_GUILTY_PLEA_LABEL,
} from "../../supabase/functions/_shared/manual-representation";
import { CONSENT_PRIVACY_LINES } from "../../supabase/functions/_shared/intake-consent";

export default function ManualCheckout() {
  const [credentials] = useState(() => captureManualRepresentationCredentials(window.location.search, window.location.hash));
  const [record, setRecord] = useState<ManualRepresentationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [pleadNotGuilty, setPleadNotGuilty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  useSafeHead({ title: "Consent and Payment | Fabsy", robots: "noindex, nofollow, noarchive" });

  useEffect(() => {
    window.history.replaceState(window.history.state, "", window.location.pathname);
    const previous = document.querySelector('meta[name="referrer"]')?.getAttribute("content");
    const existing = document.querySelector('meta[name="referrer"]');
    const meta = existing || document.createElement("meta");
    meta.setAttribute("name", "referrer"); meta.setAttribute("content", "no-referrer");
    if (!existing) document.head.appendChild(meta);
    return () => { if (!existing) meta.remove(); else if (previous == null) meta.removeAttribute("content"); else meta.setAttribute("content", previous); };
  }, []);

  useEffect(() => {
    let active = true;
    if (!credentials) { setLoading(false); return; }
    void (async () => {
      try {
        const { data, error: failure } = await supabase.functions.invoke<ManualRepresentationRecord>("manual-representation-link", { body: { action: "read", ...credentials } });
        if (failure || !data?.submissionId) throw new Error(await functionInvokeMessage(failure, "This private link is invalid or expired."));
        if (active) setRecord(data);
      } catch (caught) { if (active) setError(caught instanceof Error ? caught.message : "This private link could not be opened."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [credentials]);

  const continueCheckout = async () => {
    if (!record || !credentials || submitting.current || ["paid", "unavailable"].includes(record.paymentState) || (!record.consentAccepted && !record.consentSigned && !accepted)) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      if (!record.consentAccepted && !record.consentSigned) {
        const { data, error: failure } = await supabase.functions.invoke("manual-representation-link", { body: {
          action: "consent", ...credentials,
          consent: { accepted, method: "checkbox", version: CHECKOUT_CONSENT_VERSION, pleadNotGuilty },
        } });
        if (failure || !data?.success) throw new Error(await functionInvokeMessage(failure, "Your consent could not be saved. Please try again."));
        setRecord(current => current ? { ...current, consentAccepted: true, pleadNotGuilty } : current);
      }
      if (!record.consentSigned) {
        const { data, error: failure } = await supabase.functions.invoke("generate-consent-form", { body: credentials });
        if (failure || !data?.success || !data.consentFormPath) throw new Error(await functionInvokeMessage(failure, "Your consent document could not be saved. Please try again before paying."));
        setRecord(current => current ? { ...current, consentSigned: true } : current);
      }
      const { data, error: failure } = await supabase.functions.invoke("create-payment", { body: {
        ...credentials, clientId: record.clientId, includeIdrAddon: false,
        formData: { email: record.email, firstName: record.firstName, lastName: record.lastName, ticketNumber: record.ticketNumber },
      } });
      if (failure || !data?.url) throw new Error(await functionInvokeMessage(failure, "Your consent is saved, but checkout could not open. Please try again."));
      window.location.assign(data.url);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Checkout could not open. Please try again."); }
    finally { submitting.current = false; setBusy(false); }
  };

  const consentRecorded = record?.consentAccepted || record?.consentSigned;
  const payable = record && !["paid", "unavailable"].includes(record.paymentState);
  return <div className="min-h-screen bg-slate-50">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-5"><Link to="/" className="text-xl font-bold text-primary">fabsy</Link><span className="flex items-center gap-2 text-xs text-muted-foreground"><LockKeyhole className="h-4 w-4" />Private checkout</span></div></header>
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:py-12">
      <div><h1 className="text-3xl font-bold">Consent and payment</h1><p className="mt-3 text-muted-foreground">We already have your ticket. Review your authorization, then continue to secure payment.</p></div>
      {loading ? <p role="status"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" />Opening your private checkout…</p> : !record ? <Alert variant="destructive"><AlertTitle>Private link unavailable</AlertTitle><AlertDescription>{error || "Open the complete private link Fabsy sent you."}</AlertDescription></Alert> : <>
        <Card><CardHeader><p className="text-sm font-semibold text-primary">Ticket {record.ticketNumber}</p><CardTitle>{record.firstName} {record.lastName}</CardTitle><p className="text-sm text-muted-foreground">{record.violation}</p></CardHeader><CardContent><p className="font-semibold">{record.ticketType === "photo_radar" ? "Rapid Resolution: Photo Radar" : "Rapid Resolution"}</p><p className="mt-1 text-xl font-bold">{record.priceLabel}</p><p className="mt-2 text-sm text-muted-foreground">Government fines and trial representation are separate.</p></CardContent></Card>
        {record.paymentState === "paid" ? <Alert><CheckCircle2 className="h-4 w-4" /><AlertTitle>Payment received</AlertTitle><AlertDescription>No additional payment is needed for this ticket.</AlertDescription></Alert> : record.paymentState === "unavailable" ? <Alert><AlertTitle>Checkout is closed</AlertTitle><AlertDescription>Contact Fabsy if you need help with this case.</AlertDescription></Alert> : <Card><CardContent className="space-y-5 pt-6">
          {consentRecorded ? <Alert><CheckCircle2 className="h-4 w-4" /><AlertTitle>Consent recorded</AlertTitle><AlertDescription>Your authorization is saved with ticket {record.ticketNumber}.{record.pleadNotGuilty === true ? " You instructed Fabsy to plead not guilty." : record.pleadNotGuilty === false ? " You have not authorized a plea." : ""}</AlertDescription></Alert> : <>
            <details className="rounded-lg border p-4"><summary className="cursor-pointer font-semibold">Review the representation authorization</summary><div className="mt-4 whitespace-pre-line text-sm leading-relaxed">{checkoutAuthorization(record.ticketType).join("\n")}<p className="mt-4">{CONSENT_PRIVACY_LINES.join(" ")}</p><p className="mt-4">A prescribed Government of Alberta consent form may still be required separately.</p></div></details>
            <div className="flex items-start gap-3 rounded-lg border p-4"><Checkbox id="checkout-consent" checked={accepted} disabled={busy} onCheckedChange={value => setAccepted(value === true)} /><div><Label htmlFor="checkout-consent" className="cursor-pointer font-semibold leading-relaxed">{INTAKE_CONSENT_LABEL}</Label><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{INTAKE_CONSENT_CONFIRMATION}</p><p className="mt-2 text-sm"><a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-primary underline">Terms of Service</a> · <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-primary underline">Privacy Policy</a></p></div></div>
            <div className="flex items-start gap-3 rounded-lg border p-4"><Checkbox id="checkout-plea" checked={pleadNotGuilty} disabled={busy} onCheckedChange={value => setPleadNotGuilty(value === true)} /><div><Label htmlFor="checkout-plea" className="cursor-pointer font-semibold">{NOT_GUILTY_PLEA_LABEL}</Label><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{CHECKOUT_PLEA_INSTRUCTION}</p><p className="mt-2 text-xs text-muted-foreground">If left unchecked, Fabsy must obtain your instructions before entering a plea.</p></div></div>
          </>}
          {error ? <Alert variant="destructive"><AlertTitle>Checkout could not continue</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
          <Button size="lg" className="w-full whitespace-normal" disabled={!payable || busy || (!consentRecorded && !accepted)} onClick={() => void continueCheckout()}>{busy ? <Loader2 className="mr-2 h-5 w-5 shrink-0 animate-spin" /> : <CreditCard className="mr-2 h-5 w-5 shrink-0" />}{busy ? "Saving and opening checkout…" : record.paymentState === "open" ? "Resume secure payment" : "Continue to secure payment"}</Button>
          <p className="text-center text-xs text-muted-foreground">You’ll enter your payment details and complete your purchase securely with Stripe.</p>
        </CardContent></Card>}
      </>}
      <p className="text-center text-sm text-muted-foreground">Need help? <a className="text-primary underline" href="mailto:hello@fabsy.ca">hello@fabsy.ca</a> · <a className="text-primary underline" href="tel:+18257932279">(825) 793-2279</a></p>
    </main>
  </div>;
}
