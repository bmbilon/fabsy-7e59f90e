import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, CreditCard, FileCheck2, Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { functionInvokeMessage } from "@/lib/manualRepresentation";
import useSafeHead from "@/hooks/useSafeHead";
import { SERVICE_PRODUCTS, SERVICE_CONSENT_VERSION, SERVICE_CONFIRMATION, SERVICE_PLEA, SERVICE_PURCHASE_TERMS,
  serviceProduct, serviceAuthorization, type ServiceMode, type ServiceProductKey } from "../../supabase/functions/_shared/service-checkout";

const storageKey = "fabsy-service-checkout-v1";
type Credentials = { orderId: string; accessToken: string };
interface Order { id: string; product: ServiceProductKey; productName: string; mode: ServiceMode; name: string; email: string; representedName: string;
  ticketNumber: string | null; subtotalCents: number; gstCents: number; totalCents: number; consentSaved: boolean; paymentStatus: string; ticketUploaded: boolean; report: boolean; }
const money = (cents: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
function capture(): Credentials | null {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  if (window.location.pathname !== "/checkout" && !hash.has("order") && !hash.has("token")) return null;
  const candidate = hash.has("order") || hash.has("token") ? { orderId: hash.get("order"), accessToken: hash.get("token") } : (() => {
    try { return JSON.parse(sessionStorage.getItem(storageKey) || "null"); } catch { return null; }
  })();
  if (candidate && /^[a-f0-9-]{36}$/.test(candidate.orderId) && /^[a-f0-9]{64}$/.test(candidate.accessToken)) return candidate;
  return null;
}
function saveCredentials(value: Credentials) { try { sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* Current page still works. */ } }
function newCredentials(): Credentials { return { orderId: crypto.randomUUID(), accessToken: Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, "0")).join("") }; }

export default function ServiceCheckout() {
  const [credentials, setCredentials] = useState<Credentials | null>(capture);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(Boolean(credentials));
  const [productKey, setProduct] = useState<ServiceProductKey | "">(() => {
    const key = new URLSearchParams(window.location.search).get("service");
    return SERVICE_PRODUCTS.some(p => p.key === key) ? key as ServiceProductKey : "";
  });
  const [mode, setMode] = useState<ServiceMode>(() => window.location.pathname === "/consent" ? "consent" : window.location.pathname === "/payment" ? "payment" : "both");
  const [form, setForm] = useState({ name: "", email: "", representedName: "", ticketNumber: "" });
  const [accepted, setAccepted] = useState(false);
  const [terms, setTerms] = useState(false);
  const [plea, setPlea] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const product = serviceProduct(productKey || "photo_radar");
  useSafeHead({ title: "Consent and Payment | Fabsy", robots: "noindex, nofollow, noarchive" });

  async function call(body: Record<string, unknown>) {
    const { data, error: failure } = await supabase.functions.invoke("service-checkout", { body });
    if (failure || data?.error) throw new Error(data?.error || await functionInvokeMessage(failure, "Please try again. Your saved request will be reused."));
    return data;
  }
  useEffect(() => {
    let active = true;
    if (credentials) saveCredentials(credentials);
    window.history.replaceState(window.history.state, "", window.location.pathname);
    if (!credentials) { setLoading(false); return; }
    void call({ action: "status", ...credentials }).then(data => { if (active) setOrder(data.order); }).catch(caught => { if (active) setError(caught.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Capture the return capability once; subsequent mutations update order directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reset() {
    try { sessionStorage.removeItem(storageKey); } catch { /* No stored request. */ }
    setCredentials(null); setOrder(null); setForm({ name: "", email: "", representedName: "", ticketNumber: "" });
    setAccepted(false); setTerms(false); setPlea(false); setFile(null); setError(""); setLoading(false);
  }
  async function upload(creds: Credentials) {
    if (!file) return;
    const { upload, alreadyUploaded } = await call({ action: "upload-prepare", ...creds, file: { contentType: file.type, size: file.size } });
    if (!alreadyUploaded) {
      const { error: failure } = await supabase.storage.from("assessment-tickets").uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
      if (failure) throw new Error("Your document did not upload. Please retry or email it to hello@fabsy.ca using your purchase email.");
    }
    const data = await call({ action: "upload-complete", ...creds });
    setOrder(data.order); setFile(null);
  }
  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      const creds = credentials || newCredentials();
      setCredentials(creds); saveCredentials(creds);
      let current = order;
      if (!current) {
        const data = await call({ action: "prepare", ...creds, ...form, product: productKey, mode, consentAccepted: accepted,
          consentVersion: SERVICE_CONSENT_VERSION, termsAccepted: mode === "payment" ? terms : accepted, pleadNotGuilty: plea, registeredOwner: productKey === "photo_radar" && accepted });
        current = data.order; setOrder(current);
      }
      if (file && !current?.ticketUploaded) await upload(creds);
      if (current?.mode !== "consent" && !["paid", "refunded", "disputed"].includes(current?.paymentStatus || "")) {
        const data = await call({ action: "checkout", ...creds });
        if (data.order) setOrder(data.order);
        if (typeof data.url === "string" && new URL(data.url).hostname === "checkout.stripe.com") window.location.assign(data.url);
        else if (data.order?.paymentStatus !== "paid") throw new Error("Secure payment could not open. Please try again.");
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Your request could not be completed."); }
    finally { submitting.current = false; setBusy(false); }
  }
  async function uploadLater() {
    if (!credentials || !file || submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    try { await upload(credentials); } catch (caught) { setError((caught as Error).message); }
    finally { submitting.current = false; setBusy(false); }
  }
  async function consentCopy() {
    if (!credentials) return;
    try { const data = await call({ action: "consent-copy", ...credentials }); window.open(data.url, "_blank", "noopener,noreferrer"); }
    catch (caught) { setError((caught as Error).message); }
  }
  const chooseFile = (value: File | undefined) => {
    setError("");
    if (value && value.size > 10 * 1024 * 1024) { setError("Choose a photo or PDF, 10 MB or smaller."); setFile(null); return; }
    setFile(value || null);
  };
  const fileInput = <div className="space-y-2"><Label htmlFor="service-file">Ticket or supporting document (optional)</Label><Input id="service-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={busy} onChange={event => chooseFile(event.target.files?.[0])} /><p className="text-xs text-muted-foreground">Photo or PDF, up to 10 MB. Already emailed it? You can leave this blank.</p></div>;
  const needsConsent = mode !== "payment";
  const ready = Boolean(productKey) && (needsConsent ? accepted : terms);

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-5"><Link to="/" className="text-2xl font-bold tracking-tight text-primary">fabsy</Link><span className="flex items-center gap-2 text-xs text-slate-500"><LockKeyhole className="h-4 w-4" />Secure checkout</span></div></header>
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:py-12">
      <div><h1 className="text-3xl font-bold tracking-tight">{order ? "Your Fabsy request" : "Consent and payment"}</h1><p className="mt-3 leading-relaxed text-slate-600">Choose your service and use the same email when you send us your ticket. You can upload it now or email it later.</p></div>
      {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
      {loading ? <p role="status"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" />Opening your request…</p> : order ? <>
        <Card><CardContent className="space-y-4 pt-6">
          <div className="flex items-start gap-3"><CheckCircle2 className="mt-1 h-6 w-6 shrink-0 text-emerald-600" /><div><h2 className="text-xl font-bold">{order.paymentStatus === "paid" ? "Payment received" : order.mode === "consent" ? "Consent saved" : "Your request is saved"}</h2><p className="mt-1 text-sm text-muted-foreground">{order.productName}</p></div></div>
          <p className="text-sm"><strong>{order.name}</strong><br /><span className="break-all">{order.email}</span>{order.ticketNumber && <><br />Ticket {order.ticketNumber}</>}</p>
          <p>{order.consentSaved ? "Your service authorization is saved." : "This was a payment-only request. Service authorization is still required if it has not already been provided."}</p>
          {order.consentSaved && <Button type="button" variant="outline" onClick={() => void consentCopy()}>Download my authorization</Button>}
          {order.mode !== "consent" && <p className="text-lg font-semibold">{money(order.totalCents)} CAD including GST</p>}
          {!["paid", "refunded", "disputed"].includes(order.paymentStatus) && order.mode !== "consent" && <Button className="w-full min-h-12" disabled={busy} onClick={() => void submit()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}Continue to secure payment</Button>}
          {["refunded", "disputed"].includes(order.paymentStatus) && <p>Payment status: {order.paymentStatus}. Contact Fabsy for help with this order.</p>}
        </CardContent></Card>
        <Card><CardContent className="space-y-4 pt-6"><h2 className="text-lg font-semibold">Your documents</h2>{order.ticketUploaded ? <p className="text-sm text-emerald-700">Your document is saved with this request.</p> : <>{fileInput}<Button variant="outline" disabled={!file || busy} onClick={() => void uploadLater()}>Upload document</Button></>}
          <p className="text-sm leading-relaxed">You can also email your ticket to <a className="text-primary underline" href="mailto:hello@fabsy.ca">hello@fabsy.ca</a> from <strong className="break-all">{order.email}</strong>. If you have more than one ticket, tell us which one this order covers.</p>
          {order.report && order.paymentStatus === "paid" && <p className="text-sm"><Link className="text-primary underline" to="/insurance-damage-report/intake">Open your report intake</Link> and sign in using the same email to supply your driver abstract.</p>}
        </CardContent></Card>
        <Button variant="ghost" disabled={busy} onClick={reset}>Start a new request</Button>
      </> : <form className="space-y-6" onSubmit={event => void submit(event)}><fieldset disabled={busy} className="space-y-6">
        <Card><CardContent className="space-y-5 pt-6"><div className="space-y-2"><Label htmlFor="service-mode">What would you like to complete?</Label><select id="service-mode" className="h-11 w-full rounded-md border bg-white px-3 text-sm" value={mode} onChange={event => { setMode(event.target.value as ServiceMode); setAccepted(false); setPlea(false); setTerms(false); }}><option value="both">Consent and payment</option><option value="consent">Consent only</option><option value="payment">Payment only</option></select></div>
          <div className="space-y-2"><Label htmlFor="service-product">Service</Label><select id="service-product" className="h-11 w-full rounded-md border bg-white px-3 text-sm" required value={productKey} onChange={event => { setProduct(event.target.value as ServiceProductKey); setAccepted(false); setPlea(false); setTerms(false); }}><option value="" disabled>Choose your service</option>{SERVICE_PRODUCTS.map(p => <option key={p.key} value={p.key}>{p.name} — {money(p.cents)} + GST</option>)}</select><p className="text-sm text-muted-foreground">{productKey ? product.description : "Select the service you need."}</p></div>
          {productKey && mode !== "consent" ? <div className="rounded-lg bg-slate-50 p-4 text-sm"><div className="flex justify-between"><span>Service fee</span><span>{money(product.cents)}</span></div><div className="mt-2 flex justify-between"><span>GST (5%)</span><span>{money(product.gstCents)}</span></div><div className="mt-3 flex justify-between border-t pt-3 text-lg font-bold"><span>Total CAD</span><span>{money(product.totalCents)}</span></div></div> : mode === "consent" ? <p className="rounded-lg bg-slate-50 p-4 text-sm">No payment will be collected for this request.</p> : null}
        </CardContent></Card>
        <Card><CardContent className="space-y-4 pt-6"><h2 className="text-lg font-semibold">Your details</h2>
          <div className="space-y-2"><Label htmlFor="service-name">Your full legal name</Label><Input id="service-name" autoComplete="name" required maxLength={200} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="service-email">Email</Label><Input id="service-email" type="email" autoComplete="email" required maxLength={255} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /><p className="text-xs text-muted-foreground">Use the address you used, or will use, to email your ticket.</p></div>
          <details><summary className="cursor-pointer text-sm font-medium">For a company or another person? Add their name.</summary><div className="mt-3 space-y-2"><Label htmlFor="service-represented">Name of person or organization receiving the service</Label><Input id="service-represented" maxLength={200} value={form.representedName} onChange={e => setForm({ ...form, representedName: e.target.value })} /></div></details>
          <div className="space-y-2"><Label htmlFor="service-ticket">Ticket number (optional)</Label><Input id="service-ticket" maxLength={50} value={form.ticketNumber} onChange={e => setForm({ ...form, ticketNumber: e.target.value })} /></div>
          {fileInput}
        </CardContent></Card>
        <Card><CardContent className="space-y-5 pt-6">
          {needsConsent && productKey && <><details className="rounded-lg border p-4"><summary className="cursor-pointer font-semibold">Review the authorization</summary><div className="mt-4 whitespace-pre-line text-sm leading-relaxed">{serviceAuthorization(productKey).join("\n")}</div></details>
            <div className="flex items-start gap-3"><Checkbox id="service-consent" checked={accepted} onCheckedChange={v => setAccepted(v === true)} /><div><Label htmlFor="service-consent" className="cursor-pointer font-semibold">{product.representation ? "I consent for Fabsy to fight my ticket" : "I authorize Fabsy to prepare my report"}</Label><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{SERVICE_CONFIRMATION}{productKey === "photo_radar" ? " I confirm that I, or the person or organization I represent, was the registered owner on the offence date." : ""}</p></div></div>
            {product.representation && <div className="flex items-start gap-3"><Checkbox id="service-plea" checked={plea} onCheckedChange={v => setPlea(v === true)} /><div><Label htmlFor="service-plea" className="cursor-pointer font-semibold">I plead not guilty</Label><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{SERVICE_PLEA} If unchecked, Fabsy will ask for your plea instructions.</p></div></div>}
          </>}
          {!needsConsent && <div className="flex items-start gap-3"><Checkbox id="service-terms" checked={terms} onCheckedChange={v => setTerms(v === true)} /><Label htmlFor="service-terms" className="cursor-pointer text-sm font-normal leading-relaxed">{SERVICE_PURCHASE_TERMS}</Label></div>}
          <p className="text-xs"><Link to="/terms-of-purchase" className="text-primary underline">Terms of Purchase</Link> · <Link to="/terms-of-service" className="text-primary underline">Terms of Service</Link> · <Link to="/privacy-policy" className="text-primary underline">Privacy Policy</Link></p>
          <Button type="submit" className="min-h-12 w-full" disabled={busy || !ready}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : mode === "consent" ? <FileCheck2 className="mr-2 h-4 w-4" /> : <CreditCard className="mr-2 h-4 w-4" />}{busy ? "Saving your request…" : mode === "consent" ? "Save my consent" : "Continue to secure payment"}</Button>
          <p className="text-center text-xs text-muted-foreground">{mode === "consent" ? "Your consent is saved for the selected service." : "Complete your payment securely with Stripe."}</p>
        </CardContent></Card>
      </fieldset>{credentials && <Button type="button" variant="ghost" disabled={busy} onClick={reset}>Start a new request</Button>}</form>}
      <p className="text-center text-sm text-slate-500">Need help? <a className="text-primary underline" href="mailto:hello@fabsy.ca">hello@fabsy.ca</a> · <a href="tel:+18257932279" className="whitespace-nowrap text-primary underline">(825) 793-2279</a></p>
    </main>
  </div>;
}
