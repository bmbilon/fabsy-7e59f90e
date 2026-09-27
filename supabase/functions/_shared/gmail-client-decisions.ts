import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { getWorkspaceMessage } from "./google-workspace-email.ts";
import { gmailMessageToIncomingEmail } from "./gmail-disclosure-inbox.ts";
import { listOfferMessages, verifyOfferMailbox } from "./gmail-offer-api.ts";
import { parseClientOfferDecision } from "./client-offer-decision.ts";

export async function processClientOfferDecisions(db: SupabaseClient, now = new Date()) {
  const { data: state, error } = await db.from("client_offer_decision_state").select("*").eq("id", true).single();
  if (error) throw new Error("CLIENT_DECISION_STATE_UNAVAILABLE");
  if (!state.enabled) return { enabled: false };
  let inspected = 0;
  let complete = true;
  try {
    await verifyOfferMailbox();
    const start = Math.max(Date.parse(state.scan_start), state.last_scan_at ? Date.parse(state.last_scan_at) - 86400000 : 0);
    // Includes read/archived replies. Never execute links or instructions from a reply.
    const messages = await listOfferMessages(`to:hello@fabsy.ca -from:hello@fabsy.ca -from:noreply@gov.ab.ca -in:spam -in:trash -in:drafts after:${Math.floor(start / 1000)} before:${Math.ceil(now.getTime() / 1000)}`);
    for (const item of messages) {
      const previous = await db.from("client_offer_decision_sources").select("message_id").eq("message_id", item.id).maybeSingle();
      if (previous.error) throw new Error("CLIENT_DECISION_SOURCE_LOOKUP_FAILED");
      if (previous.data) continue;
      if (inspected >= 10) { complete = false; break; }
      const raw = await getWorkspaceMessage(item.id) as { internalDate?: string; threadId?: string; labelIds?: string[] };
      inspected++;
      if (!raw.labelIds?.some(label => ["SENT", "DRAFT", "SPAM", "TRASH"].includes(label))) {
        const decision = parseClientOfferDecision(gmailMessageToIncomingEmail(raw));
        if (decision) {
          const received = Number(raw.internalDate);
          if (!Number.isFinite(received) || received <= 0 || received > now.getTime() + 60000 || !raw.threadId) throw new Error("CLIENT_DECISION_METADATA_REQUIRED");
          const saved = await db.rpc("ingest_client_offer_decision", { p_source: item.id, p_event: {
            ...decision, thread_id: raw.threadId, received_at: new Date(received).toISOString(),
          } });
          if (saved.error) throw new Error("CLIENT_DECISION_SAVE_FAILED");
        }
      }
      const source = await db.from("client_offer_decision_sources").upsert({ message_id: item.id }, { onConflict: "message_id", ignoreDuplicates: true });
      if (source.error) throw new Error("CLIENT_DECISION_SOURCE_SAVE_FAILED");
    }
    const saved = await db.from("client_offer_decision_state").update({ last_worker_at: now.toISOString(), ...(complete ? { last_scan_at: now.toISOString() } : {}), last_error: null }).eq("id", true);
    if (saved.error) throw new Error("CLIENT_DECISION_HEALTH_SAVE_FAILED");
    return { enabled: true, inspected, complete };
  } catch (error) {
    await db.from("client_offer_decision_state").update({ last_worker_at: now.toISOString(), last_error: "Client offer reply scan needs attention." }).eq("id", true);
    throw error;
  }
}
