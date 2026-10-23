import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { secretMatches } from "../_shared/disclosure-confirmation.ts";
import {
  type PracticeNotice,
  type PracticeNoticeEmail,
  processPracticeNotices,
  sendPracticeNoticeEmail,
} from "../_shared/practice-notices.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/**
 * Minute worker (and on-demand wake-up from practice-intake and
 * practice-portal): settles stalled practice intakes into staff review, then
 * sends queued client updates and staff alerts from practice_notices.
 */
export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const cronAuthorized = await secretMatches(req.headers.get("x-cron-secret") || "", Deno.env.get("IDR_CRON_SECRET") || "");
  const serviceAuthorized = await secretMatches(req.headers.get("authorization") || "", serviceKey ? `Bearer ${serviceKey}` : "");
  if (!cronAuthorized && !serviceAuthorized) return json({ error: "unauthorized" }, 401);

  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  const signingSecret = Deno.env.get("PRACTICE_PORTAL_SIGNING_SECRET") || "";
  const url = Deno.env.get("SUPABASE_URL") || "";
  if (!url || !serviceKey) return json({ error: "practice_notice_configuration_missing" }, 503);

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, options) => fetch(input, { ...options, signal: AbortSignal.timeout(15_000) }) },
  });
  try {
    const { data: swept } = await db.rpc("practice_sweep_stalled_intakes");
    if (!apiKey) return json({ ok: false, swept: swept ?? 0, error: "email_configuration_missing" }, 503);
    // Without PRACTICE_PORTAL_SIGNING_SECRET, client emails (which carry a
    // portal link) are retried with signing_secret_missing; staff alerts still go out.
    const result = await processPracticeNotices({
      claim: async () => {
        const { data, error } = await db.rpc("claim_practice_notices", { p_limit: 10 });
        if (error) throw error;
        return (data || []) as PracticeNotice[];
      },
      freeze: async (notice, email) => {
        const { data, error } = await db.rpc("freeze_practice_notice", {
          p_id: notice.id, p_claim_id: notice.claim_id, p_payload: email,
        });
        if (error) throw error;
        return data as PracticeNoticeEmail;
      },
      send: (email, id) => sendPracticeNoticeEmail(apiKey, email, id),
      finish: async (notice, status, providerId, failureCode) => {
        const { data, error } = await db.rpc("finish_practice_notice", {
          p_id: notice.id, p_claim_id: notice.claim_id, p_status: status,
          p_provider_email_id: providerId, p_failure_code: failureCode,
        });
        if (error) throw error;
        return data === true;
      },
      signingSecret,
    });
    return json({ ok: true, swept: swept ?? 0, ...result });
  } catch {
    return json({ error: "practice_notice_processing_failed" }, 500);
  }
}

if (import.meta.main) Deno.serve(handler);
