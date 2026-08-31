import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { getIdrStaffRole } from "@/hooks/useIdrAuth";
import useSafeHead from "@/hooks/useSafeHead";
import { referralDate, referralMoney, referralStatusLabel, requestReferralProgram } from "@/lib/referral-program";
import type { AdminReferralDashboard, StaffReferralRecord } from "@/lib/referral-program";

interface ReferralReviewProps {
  referral: StaffReferralRecord;
  canRecordPayout: boolean;
  busy: boolean;
  onAction: (body: Record<string, unknown>, success: string) => Promise<void>;
}

function ReferralReview({ referral, canRecordPayout, busy, onAction }: ReferralReviewProps) {
  const [decision, setDecision] = useState("");
  const [inScope, setInScope] = useState(false);
  const [fleetAccount, setFleetAccount] = useState("");
  const [identityReviewed, setIdentityReviewed] = useState(false);
  const [plate, setPlate] = useState("");
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");
  const [alreadySent, setAlreadySent] = useState(false);
  const payoutEmail = referral.payee?.payout_email || referral.payout_email;

  const review = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onAction({
      action: "admin_review",
      order_id: referral.order_id,
      decision,
      alberta_in_scope: inScope,
      fleet_account: fleetAccount === "fleet",
      identity_reviewed: identityReviewed,
      ...(plate.trim() ? { plate: plate.trim() } : {}),
      notes: notes.trim(),
    }, "File eligibility review saved. Refresh payment checks before any payout.");
  };

  const recordPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!alreadySent || !reference.trim() || !referral.payout_ready || !canRecordPayout) return;
    await onAction({ action: "admin_mark_paid", referral_id: referral.id, payout_reference: reference.trim() }, "Completed Interac transfer recorded. Fabsy did not send money from this screen.");
  };

  return (
    <section aria-labelledby="referral-review-heading" className="mt-8 space-y-6">
      <Card>
        <CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle id="referral-review-heading">Review referral {referral.id.slice(0, 8)}</CardTitle><CardDescription className="mt-2">Code {referral.code} · {referral.ticket_type === "camera" ? "Camera" : "Officer"} · {referralMoney(referral.amount)} CAD</CardDescription></div><Button variant="outline" disabled={busy} onClick={() => void onAction({ action: "admin_refresh", order_id: referral.order_id }, "Stripe settlement, refund and eligibility checks refreshed.")}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Refresh payment checks</Button></div></CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-muted-foreground">Order</dt><dd className="mt-1 break-all font-mono text-xs">{referral.order_id}</dd></div>
            <div><dt className="text-muted-foreground">Payment settled</dt><dd className="mt-1">{referralDate(referral.payment_settled_at)}</dd></div>
            <div><dt className="text-muted-foreground">File accepted</dt><dd className="mt-1">{referralDate(referral.accepted_at)}</dd></div>
            <div><dt className="text-muted-foreground">Earliest payout</dt><dd className="mt-1">{referralDate(referral.eligible_at)}</dd></div>
          </dl>
          {referral.hold_reason ? <p className="mt-5 rounded-md border bg-muted/40 p-3 text-sm"><strong>Current hold:</strong> {referral.hold_reason.replace(/_/g, " ")}</p> : null}
          {referral.refund_review_required ? <Alert variant="destructive" className="mt-5"><AlertTitle>Refund review required</AlertTitle><AlertDescription>The referred payment changed after a reward was recorded. Review the payment and prior transfer before taking further action.</AlertDescription></Alert> : null}
          <p className="mt-4 text-sm text-muted-foreground">Inspect the order and source documents in <Link to="/admin/cases" className="font-medium text-primary underline underline-offset-4">case management</Link>. A referral code does not establish eligibility on its own.</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>File and identity review</CardTitle><CardDescription>Record acceptance only after confirming an Alberta matter is in scope. The server still enforces all matching-identity and payment rules.</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={review} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="referral-review-decision">File decision</Label>
                <select id="referral-review-decision" required value={decision} onChange={(event) => setDecision(event.target.value)} className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Select a decision</option>
                  <option value="accepted">Accepted into the service pipeline</option>
                  <option value="rejected">Rejected / outside the service scope</option>
                </select>
              </div>
              <div className="flex items-start gap-3"><Checkbox id="referral-review-scope" checked={inScope} onCheckedChange={(checked) => setInScope(checked === true)} /><Label htmlFor="referral-review-scope" className="text-sm font-normal leading-relaxed">I confirmed this is an Alberta matter that Fabsy can accept within its service scope.</Label></div>
              <div className="space-y-2">
                <Label htmlFor="referral-review-fleet">Referred account type</Label>
                <select id="referral-review-fleet" required value={fleetAccount} onChange={(event) => setFleetAccount(event.target.value)} className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Confirm account type</option>
                  <option value="individual">Individual account</option>
                  <option value="fleet">Fleet account — referral payout excluded</option>
                </select>
              </div>
              <div className="flex items-start gap-3"><Checkbox id="referral-review-identity" checked={identityReviewed} onCheckedChange={(checked) => setIdentityReviewed(checked === true)} /><Label htmlFor="referral-review-identity" className="text-sm font-normal leading-relaxed">I reviewed the referrer's and driver's identity details, including available address and plate evidence. Matching email, phone, address, plate or Stripe customer blocks a payout.</Label></div>
              <div className="space-y-2"><Label htmlFor="referral-review-plate">Verified plate from the order (if needed)</Label><Input id="referral-review-plate" value={plate} maxLength={20} onChange={(event) => setPlate(event.target.value)} autoComplete="off" /><p className="text-xs text-muted-foreground">Use only source evidence. Leave blank to preserve the recorded plate.</p></div>
              <div className="space-y-2"><Label htmlFor="referral-review-notes">Review notes</Label><Textarea id="referral-review-notes" required value={notes} maxLength={2000} rows={3} onChange={(event) => setNotes(event.target.value)} /></div>
              <Button type="submit" disabled={busy || !decision || !fleetAccount || (decision === "accepted" && (!inScope || !identityReviewed)) || referral.status === "paid"}>{busy ? "Working…" : "Save file review"}</Button>
              {referral.status === "paid" ? <p className="text-xs text-muted-foreground">A completed payout cannot be edited through this form. Refresh checks to flag later refunds.</p> : null}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Completed Interac transfer</CardTitle><CardDescription>This screen records a transfer that an operator has already completed. It cannot send an e-transfer.</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border bg-muted/30 p-4 text-sm">
              <p className="font-semibold">Payee: {referral.payee?.legal_name || "Verified portal user"}</p>
              <p className="mt-2 break-all">Interac email: {payoutEmail || "Unavailable — do not pay"}</p>
              {referral.payee?.address_line1 ? <p className="mt-2 text-muted-foreground">{[referral.payee.address_line1, referral.payee.address_line2, referral.payee.city, referral.payee.province, referral.payee.postal_code].filter(Boolean).join(", ")}</p> : null}
              <p className="mt-3 font-semibold">Amount: {referralMoney(referral.amount)} CAD</p>
              <p className="mt-2">Referrer paid this calendar year: {referralMoney(referral.year_to_date_paid)} CAD</p>
              <p className="mt-2 text-xs text-muted-foreground">{referral.profile_required && !referral.profile_complete ? "Legal name and address are required before this payout." : "Legal name and address must be on file before the second payout."}</p>
            </div>
            {referral.tax_reporting_review ? <Alert><AlertTitle>Tax reporting review</AlertTitle><AlertDescription>This referrer's paid rewards exceed $500 this calendar year. Confirm the payee details and applicable T4A reporting with your accountant. The payment category determines the reporting requirements.</AlertDescription></Alert> : null}
            {referral.status === "paid" ? <Alert><AlertTitle>Transfer already recorded</AlertTitle><AlertDescription>Paid {referralDate(referral.paid_at)}. Reference: {referral.payout_reference || "Recorded"}. Do not send or record another transfer for this referral.</AlertDescription></Alert> : (
              <>
                {!referral.payout_ready ? <Alert><AlertTitle>Not ready for payment</AlertTitle><AlertDescription>Wait for settlement, the seven-day period and all eligibility checks. Refresh payment checks after reviewing the file. Do not send a transfer while a hold remains.</AlertDescription></Alert> : <Alert><AlertTitle>Eligibility checks passed</AlertTitle><AlertDescription>Refresh payment checks before arranging a transfer. Confirm the payee and amount in your banking app, then record its completed reference here.</AlertDescription></Alert>}
                {!canRecordPayout ? <p className="text-sm text-muted-foreground">An administrator must record completed transfers. Case managers can review files and refresh checks.</p> : <form onSubmit={recordPayment} className="space-y-4">
                  <div className="space-y-2"><Label htmlFor="referral-payout-reference">Completed Interac confirmation reference</Label><Input id="referral-payout-reference" required maxLength={160} autoComplete="off" value={reference} onChange={(event) => setReference(event.target.value)} disabled={busy || !referral.payout_ready || !payoutEmail} /></div>
                  <div className="flex items-start gap-3"><Checkbox id="referral-payout-sent" checked={alreadySent} onCheckedChange={(checked) => setAlreadySent(checked === true)} disabled={busy || !referral.payout_ready || !payoutEmail} /><Label htmlFor="referral-payout-sent" className="text-sm font-normal leading-relaxed">I already completed the {referralMoney(referral.amount)} CAD Interac transfer to the payee shown above and checked that it has not been recorded before.</Label></div>
                  <Button type="submit" disabled={busy || !referral.payout_ready || !payoutEmail || !alreadySent || !reference.trim()}>{busy ? "Checking…" : "Record completed transfer"}</Button>
                  <p className="text-xs leading-relaxed text-muted-foreground">The server rechecks eligibility before recording. If this fails after money was sent, reconcile the existing transfer; do not send it again.</p>
                </form>}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

export default function AdminReferrals() {
  useSafeHead({ title: "Referral Review & Payout Records | Fabsy Admin", robots: "noindex, nofollow" });
  const [dashboard, setDashboard] = useState<AdminReferralDashboard | null>(null);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    void (async () => {
      try {
        const role = await getIdrStaffRole();
        if (!active) return;
        setHasAccess(Boolean(role));
        if (!role) return;
        const data = await requestReferralProgram<AdminReferralDashboard>({ action: "admin_list" });
        if (active) setDashboard(data);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load the referral queue.");
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [reload]);

  const action = async (body: Record<string, unknown>, success: string) => {
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      await requestReferralProgram(body);
      setNotice(success);
      const data = await requestReferralProgram<AdminReferralDashboard>({ action: "admin_list" });
      setDashboard(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The referral action could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const loadMore = async () => {
    if (!dashboard?.next_cursor) return;
    setBusy(true);
    setError(null);
    try {
      const data = await requestReferralProgram<AdminReferralDashboard>({ action: "admin_list", cursor: dashboard.next_cursor });
      setDashboard((current) => current ? { ...data, referrals: [...current.referrals, ...data.referrals.filter((row) => !current.referrals.some((existing) => existing.id === row.id))] } : data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load older referrals.");
    } finally {
      setBusy(false);
    }
  };

  const selected = dashboard?.referrals.find((row) => row.id === selectedId);

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="container mx-auto max-w-7xl">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><Button asChild variant="ghost" className="mb-3 -ml-4"><Link to="/admin/dashboard"><ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />Admin dashboard</Link></Button><h1 className="text-3xl font-bold tracking-tight">Referral review &amp; payouts</h1><p className="mt-3 max-w-3xl text-muted-foreground">Review file acceptance, verify payment settlement, and record completed manual Interac transfers.</p></div><Badge variant="outline"><ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />Staff only</Badge></div>
        <p role="status" aria-live="polite" className="my-5 text-sm font-medium text-primary">{notice}</p>
        {error ? <Alert variant="destructive" className="mb-6"><AlertTitle>Action needs attention</AlertTitle><AlertDescription>{error}<Button variant="outline" size="sm" className="ml-3 mt-2" disabled={busy} onClick={() => setReload((value) => value + 1)}>Reload queue</Button></AlertDescription></Alert> : null}
        {isLoading ? <p role="status" className="py-10 text-muted-foreground">Loading the staff referral queue…</p> : hasAccess === false ? <Alert><AlertTitle>Staff sign-in required</AlertTitle><AlertDescription>An administrator or case manager account is required. <Link to="/admin" className="underline underline-offset-4">Sign in to admin.</Link></AlertDescription></Alert> : dashboard ? (
          <>
            <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>Referral queue</CardTitle><CardDescription className="mt-2">No money moves from this screen. All amounts are CAD.</CardDescription></div><Button variant="outline" disabled={busy} onClick={() => setReload((value) => value + 1)}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Reload queue</Button></div></CardHeader><CardContent>
              {dashboard.referrals.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No referred orders yet.</p> : <Table><TableHeader><TableRow><TableHead>Referral / code</TableHead><TableHead>Created</TableHead><TableHead>Type</TableHead><TableHead>Reward</TableHead><TableHead>Status</TableHead><TableHead>Earliest payout</TableHead><TableHead>Checks</TableHead><TableHead className="text-right">Review</TableHead></TableRow></TableHeader><TableBody>{dashboard.referrals.map((referral) => <TableRow key={referral.id} data-state={selectedId === referral.id ? "selected" : undefined}><TableCell><span className="block font-mono text-xs">{referral.id.slice(0, 8)}</span><span className="mt-1 block text-xs text-muted-foreground">{referral.code}</span></TableCell><TableCell className="whitespace-nowrap">{referralDate(referral.created_at)}</TableCell><TableCell>{referral.ticket_type === "camera" ? "Camera" : "Officer"}</TableCell><TableCell>{referralMoney(referral.amount)}</TableCell><TableCell><Badge variant={referral.status === "paid" ? "default" : "outline"}>{referralStatusLabel(referral.status)}</Badge></TableCell><TableCell className="whitespace-nowrap">{referralDate(referral.eligible_at)}</TableCell><TableCell className="max-w-64 text-xs text-muted-foreground">{referral.refund_review_required ? "Refund review required" : referral.payout_ready ? "Ready for manual payout" : referral.hold_reason?.replace(/_/g, " ") || "Review needed"}</TableCell><TableCell className="text-right"><Button size="sm" variant="outline" disabled={busy} onClick={() => setSelectedId(referral.id)} aria-label={`Review referral ${referral.id.slice(0, 8)}`}>Review</Button></TableCell></TableRow>)}</TableBody></Table>}
            </CardContent></Card>
            {dashboard.next_cursor ? <div className="mt-5 text-center"><Button variant="outline" disabled={busy} onClick={() => void loadMore()}>{busy ? "Loading…" : "Load older referrals"}</Button></div> : null}
            {selected ? <ReferralReview key={`${selected.id}:${selected.status}:${selected.identity_reviewed_at}`} referral={selected} canRecordPayout={dashboard.can_record_payout} busy={busy} onAction={action} /> : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
