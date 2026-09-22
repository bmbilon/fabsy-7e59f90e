import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Copy, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { getIdrStaffRole } from "@/hooks/useIdrAuth";
import useSafeHead from "@/hooks/useSafeHead";
import { functionInvokeMessage } from "@/lib/manualRepresentation";

interface CheckoutLink { submissionId: string; checkoutUrl: string; emailSubject: string; emailBody: string }
const emptyForm = { firstName: "", lastName: "", email: "", ticketNumber: "", ticketType: "photo_radar", violation: "", violationDate: "" };

export default function AdminCheckoutLinks() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [received, setReceived] = useState(false);
  const [owner, setOwner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CheckoutLink | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const submitting = useRef(false);
  useSafeHead({ title: "Consent and Payment Links | Fabsy Admin", robots: "noindex, nofollow" });
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session || !await getIdrStaffRole()) { if (active) navigate("/admin", { replace: true }); return; }
        if (active) setChecking(false);
      } catch { if (active) navigate("/admin", { replace: true }); }
    })();
    return () => { active = false; };
  }, [navigate]);
  const update = (field: keyof typeof form, value: string) => { setForm(current => ({ ...current, [field]: value })); setCreated(null); setCopied(false); setError(""); };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current || !received || (form.ticketType === "photo_radar" && !owner)) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      const { data, error: failure } = await supabase.functions.invoke<CheckoutLink>("manual-representation-link", { body: {
        action: "create", ...form, ticketReceived: received, registeredOwnerOnOffenceDate: form.ticketType === "photo_radar" && owner ? "yes" : null,
      } });
      if (failure || !data?.checkoutUrl) throw new Error(await functionInvokeMessage(failure, "The checkout link could not be created."));
      setCreated(data);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The checkout link could not be created."); }
    finally { submitting.current = false; setBusy(false); }
  };
  if (checking) return <p className="p-8" role="status">Checking staff access…</p>;
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
    <Link to="/admin/consent-links" className="text-sm text-primary underline">Consent-only invitations</Link>
    <div><h1 className="text-3xl font-bold">Consent and payment links</h1><p className="mt-2 text-muted-foreground">For unpaid clients whose tickets you already received by email. One link collects consent and opens secure payment.</p></div>
    <div className="grid gap-6 md:grid-cols-2">
      <Card><CardHeader><CardTitle>Client and ticket</CardTitle></CardHeader><CardContent><form onSubmit={event => void create(event)}><fieldset className="space-y-4" disabled={busy || Boolean(created)}>
        {([
          ["firstName", "Legal first name", "text", true], ["lastName", "Legal last name", "text", true],
          ["email", "Client email", "email", true], ["ticketNumber", "Ticket number", "text", true],
          ["violation", "Charge description (optional)", "text", false], ["violationDate", "Offence date (optional)", "date", false],
        ] as const).map(([field, label, type, required]) => <div className="space-y-2" key={field}><Label htmlFor={`checkout-link-${field}`}>{label}</Label><Input id={`checkout-link-${field}`} type={type} required={required} maxLength={field === "violation" ? 500 : field === "email" ? 255 : 100} value={form[field]} onChange={event => update(field, event.target.value)} /></div>)}
        <div className="space-y-2"><Label htmlFor="checkout-link-service">Service</Label><select id="checkout-link-service" className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.ticketType} onChange={event => { update("ticketType", event.target.value); setOwner(false); }}><option value="photo_radar">Photo Radar — $79 + GST</option><option value="officer_issued">Rapid Resolution — $198 + GST</option></select></div>
        {form.ticketType === "photo_radar" ? <div className="flex items-start gap-3"><Checkbox id="checkout-link-owner" checked={owner} onCheckedChange={value => setOwner(value === true)} /><Label htmlFor="checkout-link-owner" className="font-normal leading-relaxed">Confirmed: the client was the registered owner on the offence date.</Label></div> : null}
        <div className="flex items-start gap-3"><Checkbox id="checkout-link-received" checked={received} onCheckedChange={value => setReceived(value === true)} /><Label htmlFor="checkout-link-received" className="font-normal leading-relaxed">Fabsy has received this ticket by email. This client has not already paid for this ticket.</Label></div>
        <Button className="w-full" disabled={busy || Boolean(created) || !received || (form.ticketType === "photo_radar" && !owner)}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Create consent and payment link</Button>
      </fieldset></form><p className="mt-3 text-xs text-muted-foreground">Creating a link sends no email or text. For a client who already paid, use a consent-only invitation.</p></CardContent></Card>
      <Card><CardHeader><CardTitle>Ready to send</CardTitle></CardHeader><CardContent className="space-y-5">
        {error ? <Alert variant="destructive"><AlertTitle>Link unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {created ? <>
          <Alert><AlertTitle>Private checkout link created</AlertTitle><AlertDescription>Ticket {form.ticketNumber.toUpperCase()}. Nothing has been sent.</AlertDescription></Alert>
          <div className="space-y-2"><Label htmlFor="created-checkout-link">Private link</Label><Textarea id="created-checkout-link" readOnly value={created.checkoutUrl} onFocus={event => event.currentTarget.select()} /><Button type="button" variant="outline" onClick={() => { void navigator.clipboard.writeText(created.checkoutUrl).then(() => setCopied(true)).catch(() => setError("Select and copy the link above.")); }}><Copy className="mr-2 h-4 w-4" />{copied ? "Copied" : "Copy link"}</Button></div>
          <div className="space-y-2"><Label htmlFor="checkout-email-subject">Email subject</Label><Input id="checkout-email-subject" readOnly value={created.emailSubject} /></div>
          <div className="space-y-2"><Label htmlFor="checkout-email-body">Email body</Label><Textarea id="checkout-email-body" className="min-h-64" readOnly value={created.emailBody} /></div>
          <Link to={`/admin/submissions/${created.submissionId}`} className="block text-sm text-primary underline">Open the case</Link>
          <Button type="button" variant="outline" onClick={() => { setForm(emptyForm); setCreated(null); setReceived(false); setOwner(false); setCopied(false); setError(""); }}>Create another link</Button>
        </> : <p className="text-sm text-muted-foreground">Create a link to prepare the checkout and email text.</p>}
      </CardContent></Card>
    </div>
  </main>;
}
