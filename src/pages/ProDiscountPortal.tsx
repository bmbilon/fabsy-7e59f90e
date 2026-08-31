import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { ArrowLeft, BadgeCheck, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import IdrAccessGate from "@/components/idr/IdrAccessGate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRO_DRIVER_BUNDLE_CENTS, PRO_DRIVER_RAPID_CENTS } from "@/config/pro-drivers";
import { supabase } from "@/integrations/supabase/client";
import { idrDb } from "@/lib/idr/supabase";
import useSafeHead from "@/hooks/useSafeHead";

type RefundStatus = "not_needed" | "awaiting_payment" | "pending" | "reserved" | "processing" | "succeeded" | "needs_review";
interface ProStatus {
  verified: boolean;
  status: "verified" | "unverified";
  declaredLicenceClass?: string | null;
  discountApplied?: boolean;
  refundStatus?: RefundStatus | null;
  refundAmountCents?: number | null;
  reason?: string;
}
interface ProOrder {
  id: string;
  ticket_number: string;
  created_at: string;
  pro_verified: boolean;
  discount_applied: string | null;
}

const MAX_LICENCE_BYTES = 10 * 1024 * 1024;
const LICENCE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function requestProStatus(body: Record<string, unknown>): Promise<ProStatus> {
  const { data, error } = await supabase.functions.invoke<ProStatus & { error?: string }>("verify-pro-licence", { body });
  if (error) {
    let message = "Licence verification is unavailable. Please try again later.";
    if (error instanceof FunctionsHttpError) {
      try {
        const response: unknown = await error.context.json();
        if (response && typeof response === "object" && "error" in response && typeof response.error === "string") message = response.error;
      } catch { /* Preserve the safe error if the service did not return JSON. */ }
    }
    throw new Error(message);
  }
  if (!data || data.error) throw new Error(data?.error || "No verification status was returned. Please try again.");
  return data;
}

function readPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("The licence photo could not be read."));
    reader.onerror = () => reject(new Error("The licence photo could not be read. Try selecting it again."));
    reader.readAsDataURL(file);
  });
}

function verificationNote(reason: string | undefined) {
  switch (reason) {
    case "not_alberta": return "We could not confirm an Alberta licence. Only Alberta Class 1, 2 or 4 licences qualify.";
    case "class_mismatch": return "The licence class read from the photo did not match the class you selected. Check the declaration and upload a clear photo.";
    case "identity_mismatch": return "The licence details did not match the ticket intake. Contact Fabsy if your intake details need correction.";
    case "expiry_unverified": return "We could not confirm a current licence. Upload a readable photo showing the expiry date.";
    case "reader_unavailable": return "The licence reader is temporarily unavailable. Your price is unchanged; try again later or contact Fabsy.";
    case "upload_failed": return "The photo could not be saved for verification. Try uploading it again.";
    default: return "We could not verify eligibility from this photo. Your price is unchanged. Use a clear image with the class, name, licence number and expiry visible.";
  }
}

function ProOrderList() {
  const [orders, setOrders] = useState<ProOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const { data: userData, error: authError } = await supabase.auth.getUser();
        if (authError || !userData.user) throw new Error("Sign in to view your ticket orders.");
        const { data, error: queryError } = await idrDb.from("ticket_submissions")
          .select("id,ticket_number,created_at,pro_verified,discount_applied,clients!inner(auth_user_id)")
          .eq("clients.auth_user_id", userData.user.id)
          .eq("service_type", "representation")
          .or("ticket_type.eq.officer_issued,ticket_type.is.null")
          .neq("status", "awaiting_payment")
          .order("created_at", { ascending: false });
        if (queryError) throw queryError;
        if (active) setOrders((data || []) as ProOrder[]);
      } catch {
        if (active) setError("Your eligible ticket orders could not be loaded. Try again or contact Fabsy.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [reload]);

  return (
    <main className="container mx-auto max-w-4xl px-4 py-12">
      <Button asChild variant="ghost" className="mb-4 -ml-4"><Link to="/portal/cases"><ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />My cases</Link></Button>
      <Badge className="block w-fit">Private portal</Badge>
      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Verify your pro driver discount</h1>
      <p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground">Paid full price for an officer ticket? Verify your Alberta Class 1, 2 or 4 licence to request the 20% service-fee adjustment and corresponding GST refund.</p>
      <p className="mt-3 text-sm text-muted-foreground">Photo radar and red-light camera owner notices are excluded. <Link to="/pro-drivers" className="font-medium text-primary underline underline-offset-4">Offer details</Link></p>
      {loading ? <p role="status" className="mt-8 text-muted-foreground">Loading your ticket orders…</p> : error ? <Alert variant="destructive" className="mt-8"><AlertTitle>Orders unavailable</AlertTitle><AlertDescription>{error}<Button variant="outline" className="mt-3 block" onClick={() => setReload((value) => value + 1)}>Try again</Button></AlertDescription></Alert> : orders.length === 0 ? <Card className="mt-8"><CardHeader><CardTitle>No paid officer-ticket orders found</CardTitle><CardDescription>Use the same email you used at checkout. A recent payment may take a moment to appear.</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => setReload((value) => value + 1)}>Refresh orders</Button></CardContent></Card> : <div className="mt-8 space-y-4">{orders.map((order) => <Card key={order.id}><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><CardTitle className="text-xl">Ticket {order.ticket_number || order.id.slice(0, 8)}</CardTitle><Badge variant={order.pro_verified ? "default" : "outline"}>{order.pro_verified ? "Licence verified" : "Not verified"}</Badge></div><CardDescription>{new Date(order.created_at).toLocaleDateString("en-CA")}{order.discount_applied ? " · Discount recorded" : ""}</CardDescription></CardHeader><CardContent><Button asChild><Link to={`/portal/pro-discount/${order.id}`}>{order.pro_verified ? "View adjustment status" : "Verify licence"}</Link></Button></CardContent></Card>)}</div>}
    </main>
  );
}

function ProOrderVerification({ submissionId }: { submissionId: string }) {
  const [status, setStatus] = useState<ProStatus | null>(null);
  const [licenceClass, setLicenceClass] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    requestProStatus({ action: "status", submissionId })
      .then((data) => {
        if (!active) return;
        setStatus((current) => ({
          ...data,
          refundStatus: data.refundStatus ?? (current?.verified === data.verified ? current?.refundStatus : null),
        }));
        if (["1", "2", "4"].includes(data.declaredLicenceClass || "")) setLicenceClass(data.declaredLicenceClass as string);
      })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "Your verification status could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [submissionId, reload]);

  const choosePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null;
    setError(null);
    setPhoto(null);
    if (!selected) return;
    if (!LICENCE_MIME_TYPES.has(selected.type) || selected.size > MAX_LICENCE_BYTES || selected.size === 0) {
      setError("Choose a JPG, PNG or WebP licence photo, no larger than 10 MB.");
      event.target.value = "";
      return;
    }
    setPhoto(selected);
  };

  const updateStatus = async (action: "verify" | "refund") => {
    if (action === "verify" && (!photo || !consent || !["1", "2", "4"].includes(licenceClass))) return;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const body: Record<string, unknown> = { action, submissionId };
      if (action === "verify" && photo) {
        body.licenceClass = licenceClass;
        body.imageBase64 = await readPhoto(photo);
        body.mimeType = photo.type;
      }
      const result = await requestProStatus(body);
      setStatus((current) => ({ ...current, ...result }));
      setNotice(result.verified ? "Licence verification confirmed. Check the separate refund status below." : verificationNote(result.reason));
      // Reading status must never create or retry a refund.
      const latest = await requestProStatus({ action: "status", submissionId });
      setStatus({ ...result, ...latest, refundStatus: latest.refundStatus ?? result.refundStatus });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The verification request could not be completed.");
    } finally {
      setBusy(false);
      setPhoto(null);
      setConsent(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const verify = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void updateStatus("verify");
  };
  const refund = status?.refundStatus;
  const refundInProgress = refund === "pending" || refund === "reserved" || refund === "processing";
  const canRequestAdjustment = status?.verified && !status.discountApplied && refund !== "succeeded" && refund !== "needs_review" && refund !== "not_needed";

  return (
    <main className="container mx-auto max-w-4xl px-4 py-12">
      <Button asChild variant="ghost" className="mb-4 -ml-4"><Link to="/portal/pro-discount"><ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />My officer-ticket orders</Link></Button>
      <Badge className="block w-fit">Private licence verification</Badge>
      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Get your verified 20% discount.</h1>
      <p className="mt-4 text-muted-foreground">Alberta Class 1, 2 or 4. Officer tickets only. Rapid Resolution ${(PRO_DRIVER_RAPID_CENTS / 100).toFixed(2)}, or ${(PRO_DRIVER_BUNDLE_CENTS / 100).toFixed(2)} for the bundle, plus GST.</p>
      <p role="status" aria-live="polite" className="my-5 text-sm font-medium">{notice}</p>
      {error ? <Alert variant="destructive" className="mb-6"><AlertTitle>Verification needs attention</AlertTitle><AlertDescription>{error}<Button variant="outline" size="sm" className="mt-3 block" disabled={busy} onClick={() => setReload((value) => value + 1)}>Refresh status</Button></AlertDescription></Alert> : null}
      {loading ? <p role="status" className="py-8 text-muted-foreground">Checking this order…</p> : status ? (
        <div className="space-y-6">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><BadgeCheck className="h-5 w-5 text-primary" aria-hidden="true" />Licence verification</CardTitle></CardHeader><CardContent><Badge variant={status.verified ? "default" : "outline"}>{status.verified ? "Verified" : "Not yet verified"}</Badge><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{status.verified ? "Your Alberta licence class has been verified for this order. Verification and payment adjustment are separate checks." : "The licence class, identity and current expiry must be readable and match your ticket intake. Full price applies until verification succeeds."}</p></CardContent></Card>

          {status.verified ? <Card><CardHeader><CardTitle>Payment adjustment</CardTitle></CardHeader><CardContent className="space-y-4">
            {refund === "succeeded" ? <Alert><AlertTitle>Refund issued</AlertTitle><AlertDescription>{status.refundAmountCents ? `$${(status.refundAmountCents / 100).toFixed(2)} CAD has been refunded to the original payment method, including the corresponding GST adjustment. ` : "Stripe has confirmed the refund to the original payment method. "}Your bank may take additional time to show it.</AlertDescription></Alert> : status.discountApplied ? <Alert><AlertTitle>Discount already recorded</AlertTitle><AlertDescription>This order already has the pro driver discount. No second adjustment is available.</AlertDescription></Alert> : refund === "needs_review" ? <Alert><AlertTitle>Refund needs staff review</AlertTitle><AlertDescription>Your licence is verified, but a refund has not been confirmed. <Link to="/contact" className="font-medium underline underline-offset-4">Contact Fabsy</Link> and reference this ticket; you do not need to upload the licence again.</AlertDescription></Alert> : refundInProgress ? <Alert><AlertTitle>Refund in progress</AlertTitle><AlertDescription>The adjustment is being processed. This is not confirmation that the refund has completed. Refresh the status, or safely retry the adjustment check.</AlertDescription></Alert> : refund === "awaiting_payment" ? <Alert><AlertTitle>Waiting for the payment record</AlertTitle><AlertDescription>The paid checkout has not yet been confirmed for this order. No refund is confirmed. If you have paid, refresh or retry after the payment is recorded.</AlertDescription></Alert> : refund === "not_needed" ? <Alert><AlertTitle>No automatic adjustment available</AlertTitle><AlertDescription>The service did not identify an adjustment to make. If you paid full price and expected a refund, contact Fabsy for a review.</AlertDescription></Alert> : <p className="text-sm text-muted-foreground">Your licence is verified. Request the 20% service-fee adjustment and corresponding GST for this full-price order.</p>}
            <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy} onClick={() => setReload((value) => value + 1)}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Refresh status</Button>{canRequestAdjustment ? <Button disabled={busy} onClick={() => void updateStatus("refund")}>{busy ? "Checking adjustment…" : refundInProgress ? "Retry adjustment check" : "Request payment adjustment"}</Button> : null}</div>
          </CardContent></Card> : <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />Upload your licence securely</CardTitle><CardDescription>Use the current Alberta licence for the person named in this ticket intake.</CardDescription></CardHeader><CardContent>
            <form onSubmit={verify} className="space-y-5">
              <div className="space-y-2"><Label htmlFor="pro-portal-class">Class printed on your licence</Label><select id="pro-portal-class" required value={licenceClass} onChange={(event) => setLicenceClass(event.target.value)} disabled={busy} className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Select your class</option><option value="1">Class 1</option><option value="2">Class 2</option><option value="4">Class 4</option></select><p className="text-xs text-muted-foreground">Class 3 and Class 5 do not qualify, including Class 5 gig couriers.</p></div>
              <div className="space-y-2"><Label htmlFor="pro-portal-photo">Licence photo</Label><Input ref={inputRef} id="pro-portal-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required disabled={busy} onChange={choosePhoto} aria-describedby="pro-photo-help" /><p id="pro-photo-help" className="text-xs leading-relaxed text-muted-foreground">JPG, PNG or WebP, maximum 10 MB. Keep the class, full name, licence number and expiry date visible. The photo is not saved in this browser's draft or local storage; it is sent to private storage for verification.</p></div>
              <div className="flex items-start gap-3"><Checkbox id="pro-portal-consent" checked={consent} onCheckedChange={(checked) => setConsent(checked === true)} disabled={busy} /><Label htmlFor="pro-portal-consent" className="text-sm font-normal leading-relaxed">Use this photo to verify my eligibility and, if verified, request the applicable discount refund to my original payment method. I have read the <Link to="/terms-of-service#pro-driver-terms" className="underline underline-offset-4">pro driver terms</Link> and <Link to="/privacy-policy" className="underline underline-offset-4">Privacy Policy</Link>.</Label></div>
              <Button type="submit" disabled={busy || !photo || !consent || !licenceClass}><Upload className="mr-2 h-4 w-4" aria-hidden="true" />{busy ? "Verifying licence…" : "Verify licence & request adjustment"}</Button>
            </form>
          </CardContent></Card>}
        </div>
      ) : null}
    </main>
  );
}

export default function ProDiscountPortal() {
  const { submissionId } = useParams();
  const path = submissionId ? `/portal/pro-discount/${submissionId}` : "/portal/pro-discount";
  useSafeHead({ title: "Verify Your Pro Driver Discount | Fabsy Portal", robots: "noindex, nofollow" });
  return <div className="min-h-screen bg-background"><Header /><IdrAccessGate redirectPath={path} title="Access your pro driver discount" description="Sign in using the email from your ticket checkout. We will send a secure link to your private verification page.">{submissionId ? <ProOrderVerification key={submissionId} submissionId={submissionId} /> : <ProOrderList />}</IdrAccessGate><Footer /></div>;
}
