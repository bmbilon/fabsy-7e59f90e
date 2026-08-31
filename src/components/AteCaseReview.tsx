import { useCallback, useEffect, useRef, useState } from "react";
import { ATE_CHECKS, buildAteChecklist, type AteEvidence, type AteEvidenceStatus, type AteNoticeKind } from "@/lib/ate-review";
import { idrDb } from "@/lib/idr/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ateNotificationDraft, type AteCaseEvent } from "@/lib/ate-notifications";
import { ResolutionEmailAction } from "@/components/ResolutionEmailAction";

interface CrownOffer {
  id: string; version: number; response_text: string; proposed_fine_cents: number;
  expires_at: string | null; client_decision: string; client_reply: string | null;
}
interface ReviewRecord {
  notice_kind: AteNoticeKind; jurisdiction: string; evidence: AteEvidence;
  complete_disclosure_at: string | null; action_due_at: string | null; action_taken_at: string | null;
  action_notes: string; original_fine_cents: number | null; final_fine_cents: number | null;
  resolved_at: string | null; outcome: string | null;
}
const cad = (cents: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
const localDateTime = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const moneyCents = (value: string) => {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) throw new Error("Enter a non-negative fine in dollars and cents.");
  const amount = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(amount) || amount > 2147483647) throw new Error("Fine amount is too large.");
  return amount;
};

export function AteCaseReview({ submissionId, offenceDate, ownership, onOutcomeRecorded }: { submissionId: string; offenceDate?: string; ownership?: string | null; onOutcomeRecorded?: () => void | Promise<void> }) {
  const [record, setRecord] = useState<ReviewRecord | null>(null);
  const [offers, setOffers] = useState<CrownOffer[]>([]);
  const [events, setEvents] = useState<AteCaseEvent[]>([]);
  const [evidence, setEvidence] = useState<AteEvidence>({});
  const [noticeKind, setNoticeKind] = useState<AteNoticeKind>("unknown");
  const [jurisdiction, setJurisdiction] = useState("");
  const [complete, setComplete] = useState(false);
  const [completeReceivedAt, setCompleteReceivedAt] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  const [actionTaken, setActionTaken] = useState(false);
  const [response, setResponse] = useState("");
  const [proposedFine, setProposedFine] = useState("");
  const [expiry, setExpiry] = useState("");
  const [originalFine, setOriginalFine] = useState("");
  const [finalFine, setFinalFine] = useState("");
  const [outcome, setOutcome] = useState("unchanged");
  const [outcomeReference, setOutcomeReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");

  const reviewLoadRevision = useRef(0);
  const load = useCallback(async () => {
    const revision = ++reviewLoadRevision.current;
    const [{ data, error }, offerResult, eventResult] = await Promise.all([
      idrDb.from("ate_reviews").select("*").eq("ticket_submission_id", submissionId).maybeSingle(),
      idrDb.from("ate_crown_offers").select("*").eq("ticket_submission_id", submissionId).order("version", { ascending: false }),
      idrDb.from("ate_case_events").select("id,event_type,audience,status,created_at,payload").eq("ticket_submission_id", submissionId).neq("status", "completed").order("created_at", { ascending: true }),
    ]);
    if (revision !== reviewLoadRevision.current) return;
    if (error || offerResult.error || eventResult.error) { setLoadError("ATE review is unavailable. Confirm the migration and verified payment before reviewing this case."); return; }
    if (!data) { setLoadError("The ATE review opens only after Stripe confirms payment."); return; }
    const saved = data as ReviewRecord;
    setRecord(saved); setEvidence(saved.evidence || {}); setNoticeKind(saved.notice_kind); setJurisdiction(saved.jurisdiction);
    setComplete(Boolean(saved.complete_disclosure_at)); setActionNotes(saved.action_notes); setActionTaken(Boolean(saved.action_taken_at));
    setCompleteReceivedAt(localDateTime(saved.complete_disclosure_at));
    setOriginalFine(saved.original_fine_cents === null ? "" : (saved.original_fine_cents / 100).toFixed(2));
    setFinalFine(saved.final_fine_cents === null ? "" : (saved.final_fine_cents / 100).toFixed(2));
    setOutcome(saved.outcome || "unchanged");
    setOffers((offerResult.data || []) as CrownOffer[]); setLoadError("");
    setEvents((eventResult.data || []) as AteCaseEvent[]);
  }, [submissionId]);
  useEffect(() => { setRecord(null); void load(); return () => { reviewLoadRevision.current += 1; }; }, [load]);
  const checklist = buildAteChecklist({ noticeKind, jurisdiction, offenceDate, ownership, evidence });
  const asks = checklist.flatMap((item) => item.crownAsk ? [item.crownAsk] : []);
  const mutate = async (task: () => Promise<unknown>, success: string) => {
    setBusy(true); setMessage("");
    try { await task(); await load(); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The change could not be saved."); }
    finally { setBusy(false); }
  };
  const rpc = async (name: string, args: Record<string, unknown>) => { const { error } = await idrDb.rpc(name, args); if (error) throw new Error(error.message); };
  if (loadError) return <Card><CardHeader><CardTitle>ATE review</CardTitle></CardHeader><CardContent><p role="status">{loadError}</p></CardContent></Card>;
  if (!record) return <p>Loading ATE review…</p>;

  return <div className="space-y-6">
    <Card><CardHeader><CardTitle>Queued ATE updates</CardTitle><CardDescription>These updates are durable staff/clone handoffs. Copy a draft for review and use the authorized communication process; this app does not automatically send them.</CardDescription></CardHeader><CardContent className="space-y-4">
      {events.length ? events.map((event) => <div key={event.id} className="space-y-2 rounded-lg border p-4"><Badge variant="outline">{event.audience} · {event.event_type.replace(/_/g, " ")} · {event.status}</Badge><p className="whitespace-pre-wrap text-sm">{ateNotificationDraft(event, submissionId)}</p><Button variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(ateNotificationDraft(event, submissionId)).then(() => setMessage("Draft copied for review. Nothing was sent."), () => setMessage("Clipboard access is unavailable. Select and copy the visible draft text."))}>Copy draft for review</Button></div>) : <p className="text-sm">No pending ATE update handoffs.</p>}
      <a className="text-sm underline" href={`/portal/cases/${submissionId}`} target="_blank" rel="noopener noreferrer">Open secure client case link</a>
    </CardContent></Card>
    <Card>
      <CardHeader><CardTitle>Photo Radar · ATE disclosure review</CardTitle><CardDescription>No demerits, no insurance impact, no IIR, no trial and no success fee. A missing record creates a review question; it does not establish an invalid notice.</CardDescription></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="ate-kind">Notice type</Label><select id="ate-kind" className="mt-1 w-full rounded-md border bg-background p-2" value={noticeKind} onChange={(e) => setNoticeKind(e.target.value as AteNoticeKind)}><option value="unknown">Confirm from notice</option><option value="speed">Automated speed enforcement</option><option value="red_light">Red-light camera</option></select></div>
          <div><Label htmlFor="ate-jurisdiction">Municipality / jurisdiction</Label><Input id="ate-jurisdiction" value={jurisdiction} maxLength={200} onChange={(e) => setJurisdiction(e.target.value)} /></div>
        </div>
        <p className="text-sm">Offence date: {offenceDate || "Needs confirmation"}. Owner answer: {ownership?.replace(/_/g, " ") || "Needs confirmation"}.</p>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={complete} disabled={Boolean(record.complete_disclosure_at)} onChange={(e) => setComplete(e.target.checked)} className="mt-1" /><span>I confirm complete, readable disclosure has been received and matched to this file. The 48-hour clock runs from the actual receipt/matching time below, not from saving this review; it cannot be reset.</span></label>
        {complete && <div><Label htmlFor="ate-disclosure-received">Actual time complete disclosure was received and matched (local time)</Label><Input id="ate-disclosure-received" type="datetime-local" value={completeReceivedAt} max={localDateTime(new Date().toISOString())} disabled={Boolean(record.complete_disclosure_at)} onChange={(e) => setCompleteReceivedAt(e.target.value)} /><p className="mt-1 text-sm text-muted-foreground">Use the actual document receipt/matching record, even if this review is entered later.</p></div>}
        {record.action_due_at && <p className="rounded-md border p-3 text-sm">Next Fabsy action due: <strong>{new Date(record.action_due_at).toLocaleString()}</strong>. Crown response time is separate.</p>}
        {ATE_CHECKS.map((check) => <div key={check.key} className="space-y-2 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor={`ate-${check.key}`}>{check.label}</Label><Badge variant="outline">{checklist.find((item) => item.key === check.key)?.status.replace(/_/g, " ")}</Badge></div>
          <p className="text-sm text-muted-foreground">{check.question}</p>
          <select id={`ate-${check.key}`} className="w-full rounded-md border bg-background p-2 text-sm" value={evidence[check.key]?.status || "unknown"} onChange={(e) => setEvidence((previous) => ({ ...previous, [check.key]: { reference: previous[check.key]?.reference || "", status: e.target.value as AteEvidenceStatus } }))}>
            <option value="unknown">Not reviewed / unknown</option><option value="supported">Supported by referenced evidence</option><option value="concern">Documented discrepancy / concern</option><option value="missing">Requested evidence missing</option><option value="not_applicable">Not applicable (explain)</option>
          </select>
          <Textarea aria-label={`${check.label}: evidence and document reference`} placeholder="Record the document/page, observed facts and applicable rule or approval. No assumptions." maxLength={5000} value={evidence[check.key]?.reference || ""} onChange={(e) => setEvidence((previous) => ({ ...previous, [check.key]: { status: previous[check.key]?.status || "unknown", reference: e.target.value } }))} />
        </div>)}
        <div className="space-y-2"><h3 className="font-semibold">Proposed Crown questions</h3><p className="text-sm text-muted-foreground">Generated from unresolved checks. Review and substantiate these before any external request.</p>{asks.length ? <ul className="list-disc space-y-2 pl-5 text-sm">{asks.map((ask) => <li key={ask}>{ask}</li>)}</ul> : <p className="text-sm">No unresolved checklist questions. This does not promise a reduction.</p>}</div>
        <Label htmlFor="ate-action">Next authorized action / record of action</Label><Textarea id="ate-action" value={actionNotes} maxLength={10000} onChange={(e) => setActionNotes(e.target.value)} />
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={actionTaken} disabled={Boolean(record.action_taken_at)} onChange={(e) => setActionTaken(e.target.checked)} />I have prepared or taken the authorized action described above.</label>
        <Button disabled={busy} onClick={() => void mutate(async () => {
          if (actionTaken && (!complete || !actionNotes.trim())) throw new Error("Confirm complete disclosure and describe the authorized action before recording it.");
          if (complete && (!completeReceivedAt || !Number.isFinite(Date.parse(completeReceivedAt)))) throw new Error("Enter the actual time complete disclosure was received and matched.");
          if (complete && Date.parse(completeReceivedAt) > Date.now()) throw new Error("The complete disclosure time cannot be in the future.");
          await rpc("save_ate_review", { p_submission_id: submissionId, p_notice_kind: noticeKind, p_jurisdiction: jurisdiction,
            p_evidence: evidence, p_checklist: checklist, p_crown_asks: asks,
            p_complete_disclosure_at: record.complete_disclosure_at || (complete ? new Date(completeReceivedAt).toISOString() : null),
            p_action_notes: actionNotes, p_action_taken_at: record.action_taken_at || (actionTaken ? new Date().toISOString() : null) });
        }, "ATE review saved. No message or Crown action was sent.")}>Save ATE review</Button>
      </CardContent>
    </Card>
    <Card><CardHeader><CardTitle>Crown response and client instruction</CardTitle><CardDescription>Record the exact response. A new version requires a new client decision; no deal is accepted automatically.</CardDescription></CardHeader><CardContent className="space-y-4">
      {offers.map((offer) => <div key={offer.id} className="rounded-lg border p-4 text-sm"><Badge variant="outline">Version {offer.version} · {offer.client_decision}</Badge><p className="mt-2 whitespace-pre-wrap">{offer.response_text}</p><p className="mt-2">Proposed fine: {cad(offer.proposed_fine_cents)}</p>{offer.client_reply && <p className="mt-2 whitespace-pre-wrap">Client reply: {offer.client_reply}</p>}</div>)}
      {!record.resolved_at && <><Label htmlFor="ate-response">Exact Crown response / terms</Label><Textarea id="ate-response" value={response} maxLength={10000} onChange={(e) => setResponse(e.target.value)} /><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="ate-proposed">Proposed fine (CAD)</Label><Input id="ate-proposed" inputMode="decimal" value={proposedFine} onChange={(e) => setProposedFine(e.target.value)} /></div><div><Label htmlFor="ate-expiry">Offer expiry (optional, local time)</Label><Input id="ate-expiry" type="datetime-local" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div></div><Button disabled={busy || !response.trim()} onClick={() => void mutate(async () => { await rpc("record_ate_crown_offer", { p_submission_id: submissionId, p_response_text: response, p_proposed_fine_cents: moneyCents(proposedFine), p_expires_at: expiry ? new Date(expiry).toISOString() : null }); setResponse(""); }, "Crown response is available in the secure client portal. No email or acceptance was sent.")}>Record response for client approval</Button></>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Actual outcome · first 20 ATE files</CardTitle><CardDescription>Record the final Crown/court outcome, including an unchanged fine. Missing outcomes stay pending; unchanged fines count as $0 reduction.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="ate-original">Original fine (CAD)</Label><Input id="ate-original" inputMode="decimal" value={originalFine} onChange={(e) => setOriginalFine(e.target.value)} /></div><div><Label htmlFor="ate-final">Actual final fine (CAD)</Label><Input id="ate-final" inputMode="decimal" value={finalFine} onChange={(e) => setFinalFine(e.target.value)} /></div></div>
      <select aria-label="Actual ATE outcome" className="w-full rounded-md border bg-background p-2" value={outcome} onChange={(e) => setOutcome(e.target.value)}><option value="unchanged">Unchanged — $0 reduction</option><option value="reduced">Reduced — client-approved deal required</option><option value="withdrawn">Withdrawn — final fine $0</option></select>
      <Label htmlFor="ate-outcome-reference">Final Crown/court record reference</Label><Textarea id="ate-outcome-reference" value={outcomeReference} onChange={(e) => setOutcomeReference(e.target.value)} />
      <Button disabled={busy || !outcomeReference.trim()} onClick={() => void mutate(async () => { await rpc("record_ate_outcome", { p_submission_id: submissionId, p_original_fine_cents: moneyCents(originalFine), p_final_fine_cents: moneyCents(finalFine), p_outcome: outcome, p_reference: outcomeReference }); await onOutcomeRecorded?.(); }, "Actual outcome saved, including any zero reduction.")}>Save actual outcome</Button>
      {record.resolved_at && record.outcome && <div className="space-y-3 rounded-lg border p-4"><p className="text-sm">Saved outcome: {record.outcome.replace(/_/g, " ")}. {record.final_fine_cents !== null ? `Actual final fine: ${cad(record.final_fine_cents)}.` : ""} The email action uses this saved record, not any unsaved edits above.</p><ResolutionEmailAction submissionId={submissionId} outcomeSaved={Boolean(record.resolved_at && record.outcome)} /></div>}
    </CardContent></Card>
    {message && <p className="rounded-md border p-4 text-sm" role="status">{message}</p>}
  </div>;
}

export function AteClientOffers({ submissionId }: { submissionId: string }) {
  const [offer, setOffer] = useState<CrownOffer | null>(null);
  const [reply, setReply] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const loadRevision = useRef(0);
  const load = useCallback(async () => {
    const revision = ++loadRevision.current;
    const { data, error } = await idrDb.from("ate_crown_offers").select("*").eq("ticket_submission_id", submissionId).order("version", { ascending: false }).limit(1).maybeSingle();
    if (revision !== loadRevision.current) return;
    if (error) setMessage("Crown responses are temporarily unavailable. Contact Fabsy if a deadline is close.");
    else { setOffer(data as CrownOffer | null); setConfirmed(false); setReply(""); }
  }, [submissionId]);
  useEffect(() => {
    setOffer(null); setConfirmed(false); setReply(""); setMessage(""); setBusy(false);
    void load();
    return () => { loadRevision.current += 1; };
  }, [load]);
  const decide = async (decision: string) => {
    if (!offer || (decision === "approved" && !confirmed)) return;
    const revision = loadRevision.current;
    setBusy(true);
    const { error } = await idrDb.rpc("respond_to_ate_crown_offer", { p_offer_id: offer.id, p_decision: decision, p_reply: reply });
    if (revision !== loadRevision.current) return;
    setMessage(error ? "Your instruction was not recorded. Refresh the offer or contact Fabsy; it may have changed or expired." : "Your instruction is recorded. Fabsy must still take the authorized next step; this screen does not finalize the Crown agreement.");
    if (!error) { await load(); setConfirmed(false); }
    setBusy(false);
  };
  const expired = offer?.expires_at ? Date.parse(offer.expires_at) <= Date.now() : false;
  const canDecide = offer && !expired && ["pending", "question"].includes(offer.client_decision);
  return <div className="space-y-4">
    {offer ? <><Badge variant="outline">Crown response {offer.version} · {offer.client_decision}</Badge><h3 className="text-xl font-semibold">Proposed fine: {cad(offer.proposed_fine_cents)}</h3><p className="whitespace-pre-wrap rounded-lg border p-4">{offer.response_text}</p>{offer.expires_at && <p className="text-sm">Offer expires: {new Date(offer.expires_at).toLocaleString()}</p>}{expired && <p className="text-sm">This offer has expired. Contact Fabsy about the next step.</p>}
      {canDecide && <><Label htmlFor="ate-client-reply">Your reply or question</Label><Textarea id="ate-client-reply" value={reply} maxLength={10000} onChange={(e) => setReply(e.target.value)} /><label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" /><span>I have read these exact terms and instruct Fabsy to accept this version of the proposed agreement.</span></label><div className="flex flex-wrap gap-3"><Button disabled={busy || !confirmed} onClick={() => void decide("approved")}>Approve this deal</Button><Button variant="outline" disabled={busy} onClick={() => void decide("declined")}>Decline</Button><Button variant="outline" disabled={busy || !reply.trim()} onClick={() => void decide("question")}>Ask about this offer</Button></div></>}
    </> : <p>No Crown response is available for your decision yet. Fabsy will explain any proposed deal before you approve it.</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </div>;
}

export function AtePilotMetrics() {
  const [metrics, setMetrics] = useState<{ cohort_count: number; resolved_count: number; pending_count: number; median_reduction_cad: number | null; below_40: boolean | null; cohort_complete: boolean } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => { void idrDb.rpc("ate_first_twenty_metrics").then(({ data, error }: { data: typeof metrics; error: unknown }) => { if (error) setUnavailable(true); else setMetrics(data); }); }, []);
  return <Card className="mb-6"><CardHeader><CardTitle>Photo Radar · first 20 paid files</CardTitle><CardDescription>Measure Crown fine reduction, with unchanged fines counted as zero.</CardDescription></CardHeader><CardContent>
    {metrics ? <><p>{metrics.resolved_count} resolved / {metrics.cohort_count} in the first-20 cohort · {metrics.pending_count} pending.</p><p className="mt-2 text-xl font-semibold">Median reduction: {metrics.median_reduction_cad === null ? "No resolved outcomes yet" : cad(Math.round(metrics.median_reduction_cad * 100))}</p>{metrics.below_40 && <p className="mt-2 text-sm">Median is below $40. Review the consumer offer economics and fleet focus.</p>}<p className="mt-2 text-sm text-muted-foreground">{metrics.cohort_complete ? "All first 20 files have an actual outcome." : "Provisional until all first 20 paid files have outcomes. Pending files are not silently counted as zero."}</p></> : <p>{unavailable ? "ATE measurement is unavailable until the workflow migration is deployed." : "Loading ATE measurement…"}</p>}
  </CardContent></Card>;
}
