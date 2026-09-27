import { queueEmailApproval } from "./outbound-email-approval.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { getWorkspaceMessage } from "./google-workspace-email.ts";
import { gmailMessageToIncomingEmail } from "./gmail-disclosure-inbox.ts";
import { listOfferMessages, verifyOfferMailbox } from "./gmail-offer-api.ts";
import { formatOfferDraft, parseOfferNotice } from "./prosecutor-offer.ts";

const message = (error: unknown) => error instanceof Error ? error.message.slice(0, 300) : "Offer processing failed.";

export async function processProsecutorOffers(db: SupabaseClient, now = new Date()) {
  // Separate opt-in gate permits deployment without granting new mailbox writes.
  if (Deno.env.get("PROSECUTOR_OFFER_WORKER_ENABLED") !== "true") return { enabled: false };
  const { data: state, error } = await db.from("prosecutor_offer_automation").select("*").eq("id", true).single();
  if (error) throw new Error("OFFER_WORKER_STATE_UNAVAILABLE");
  if (!state.enabled) return { enabled: false };
  let inspected = 0;
  let drafted = 0;
  let scanComplete = false;
  try {
    await verifyOfferMailbox();
    // A one-day overlap includes read and archived messages; no unread/inbox filter.
    const start = Math.max(Date.parse(`${state.scan_start}T00:00:00Z`), state.last_scan_at ? Date.parse(state.last_scan_at) - 86400000 : 0);
    const candidates = await listOfferMessages(`from:noreply@gov.ab.ca to:hello@fabsy.ca subject:"Prosecutor Response" after:${Math.floor(start / 1000)} before:${Math.ceil(now.getTime() / 1000)}`);
    scanComplete = true;
    for (const candidate of candidates) {
      const { data: prior, error: lookupError } = await db.from("prosecutor_offer_sources").select("message_id").eq("message_id", candidate.id).maybeSingle();
      if (lookupError) throw new Error("OFFER_EVENT_LOOKUP_FAILED");
      if (prior) continue;
      if (inspected >= 10) { scanComplete = false; break; }
      const mail = gmailMessageToIncomingEmail(await getWorkspaceMessage(candidate.id));
      inspected++;
      const notice = parseOfferNotice(mail);
      // Broad Gmail subject queries can return non-exact subjects. They are ignored.
      if (notice) {
        const { error: insertError } = await db.from("prosecutor_offer_events").insert({ source_message_id: candidate.id, ...notice });
        // Only the DB's identity constraints deduplicate; other errors must stop coverage.
        if (insertError && insertError.code !== "23505") throw new Error("OFFER_EVENT_SAVE_FAILED");
      }
      const { error: sourceError } = await db.from("prosecutor_offer_sources").upsert({ message_id: candidate.id }, { onConflict: "message_id", ignoreDuplicates: true });
      if (sourceError) throw new Error("OFFER_SOURCE_SAVE_FAILED");
    }
    const { data: rows, error: claimError } = await db.rpc("claim_prosecutor_offer_draft");
    if (claimError) throw new Error("OFFER_DRAFT_CLAIM_FAILED");
    const row = rows?.[0];
    if (row) {
      try {
        const { data: matched, error: matchError } = await db.rpc("offer_draft_case", { p_ticket: row.ticket_number });
        if (matchError || matched?.recipient !== row.recipient || matched?.submission_id !== row.submission_id) throw new Error("Case or recipient changed. Reverify the offer.");
        const payload = formatOfferDraft(row.ticket_number, row.recipient, row.terms, now);
        const { error: freezeError } = await db.from("prosecutor_offer_events").update({ draft_payload: payload }).eq("id", row.id).eq("status", "creating");
        if (freezeError) throw new Error("Offer draft snapshot could not be saved.");
        await queueEmailApproval(db, {kind: 'prosecutor_offer', id: row.id, submissionId: row.submission_id, ticket: row.ticket_number}, payload);
        drafted++;
      } catch (error) {
        const { error: saveError } = await db.from("prosecutor_offer_events").update({
          status: "needs_review",
          review_reason: message(error),
          updated_at: now.toISOString(),
        }).eq("id", row.id).eq("status", "creating");
        if (saveError) throw new Error("OFFER_DRAFT_RECOVERY_SAVE_FAILED");
        throw error;
      }
    }
    const { error: healthError } = await db.from("prosecutor_offer_automation").update({ last_worker_at: now.toISOString(), ...(scanComplete ? { last_scan_at: now.toISOString() } : {}), last_error: null }).eq("id", true);
    if (healthError) throw new Error("OFFER_WORKER_HEALTH_SAVE_FAILED");
    return { enabled: true, inspected, drafted, scanComplete };
  } catch (error) {
    await db.from("prosecutor_offer_automation").update({ last_worker_at: now.toISOString(), last_error: message(error) }).eq("id", true);
    throw error;
  }
}
