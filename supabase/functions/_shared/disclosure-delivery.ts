import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { disclosureNotice, type NoticeSnapshot } from "./disclosure-confirmation.ts";

export type NoticePayload = ReturnType<typeof disclosureNotice>;
export interface ClaimedNotice {
  id: string;
  claim_token: string;
  snapshot: NoticeSnapshot;
  email_payload: NoticePayload | null;
}

export async function deliverDisclosureEmail(apiKey: string, payload: NoticePayload, idempotencyKey: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({})) as { id?: string };
  if (!response.ok || !result.id) throw new Error(`email_provider_status_${response.status}`);
  return result.id;
}

export async function processDisclosureNotices(
  db: SupabaseClient,
  apiKey: string,
  deliver = deliverDisclosureEmail,
) {
  if (!apiKey) throw new Error("email_provider_not_configured");
  // One-at-a-time claims keep a slow API call from consuming other jobs' leases.
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < 5; i++) {
    const { data, error } = await db.rpc("claim_disclosure_notices", { p_limit: 1 });
    if (error) throw new Error("notice_claim_failed");
    const item = (data as ClaimedNotice[] | null)?.[0];
    if (!item) break;
    try {
      const proposed = item.email_payload || disclosureNotice(item.snapshot);
      const { data: payload, error: snapshotError } = await db.rpc("freeze_disclosure_notice", {
        p_id: item.id, p_claim: item.claim_token, p_payload: proposed,
      });
      if (snapshotError || !payload) throw new Error("notice_snapshot_failed");
      const providerId = await deliver(apiKey, payload as NoticePayload, `disclosure-confirmation/${item.id}`);
      const { data: completed, error: completeError } = await db.rpc("complete_disclosure_notice", {
        p_id: item.id, p_claim: item.claim_token, p_provider_id: providerId,
      });
      if (completeError || !completed) throw new Error("notice_receipt_not_saved");
      sent++;
    } catch (error) {
      failed++;
      // Retrying after an uncertain API response or failed DB receipt uses the
      // exact same frozen payload and key, and is bounded to less than 24 hours.
      const message = error instanceof Error && /^(email_provider_status_\d+|notice_\w+)$/.test(error.message)
        ? error.message : "delivery_interrupted_or_uncertain";
      const { error: failureError } = await db.rpc("complete_disclosure_notice", {
        p_id: item.id, p_claim: item.claim_token, p_error: message,
      });
      if (failureError) throw new Error("notice_failure_receipt_not_saved");
    }
  }
  return { sent, failed };
}
