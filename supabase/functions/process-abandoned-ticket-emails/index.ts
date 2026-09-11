import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { secretMatches } from "../_shared/disclosure-confirmation.ts";
import type { AbandonedTicketEmail } from "../_shared/abandoned-ticket-email.ts";
import {
  type AbandonedTicketContext,
  type AbandonedTicketJob,
  checkoutHasCompleted,
  processAbandonedTicketEmails,
  sendAbandonedTicketEmail,
} from "../_shared/abandoned-ticket-delivery.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const cronAuthorized = await secretMatches(
    req.headers.get("x-cron-secret") || "",
    Deno.env.get("IDR_CRON_SECRET") || "",
  );
  const serviceAuthorized = await secretMatches(
    req.headers.get("authorization") || "",
    serviceKey ? `Bearer ${serviceKey}` : "",
  );
  if (!cronAuthorized && !serviceAuthorized) {
    return json({ error: "unauthorized" }, 401);
  }
  const url = Deno.env.get("SUPABASE_URL") || "";
  const resendKey = Deno.env.get("RESEND_API_KEY") || "";
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
  if (!url || !serviceKey || !resendKey || !stripeKey) {
    return json({ error: "reminder_configuration_missing" }, 503);
  }
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (url, options) =>
        fetch(url, { ...options, signal: AbortSignal.timeout(15000) }),
    },
  });
  const rpc = async (name: string, parameters: Record<string, unknown>) => {
    const { data, error } = await db.rpc(name, parameters);
    if (error) throw new Error("reminder_database_error");
    return data;
  };
  try {
    const result = await processAbandonedTicketEmails({
      claim: async () =>
        ((await rpc("claim_abandoned_ticket_emails", { p_limit: 1 })) as
          | AbandonedTicketJob[]
          | null)?.[0] || null,
      context: async (job) =>
        await rpc("get_abandoned_ticket_email_context", {
          p_id: job.id,
          p_claim_id: job.claim_id,
        }) as AbandonedTicketContext,
      freeze: async (job, email) =>
        await rpc("freeze_abandoned_ticket_email", {
          p_id: job.id,
          p_claim_id: job.claim_id,
          p_payload: email,
        }) as AbandonedTicketEmail | null,
      checkoutCompleted: (id) => checkoutHasCompleted(stripeKey, id),
      send: (email, id) => sendAbandonedTicketEmail(resendKey, email, id),
      finish: async (job, status, providerId, reason) =>
        await rpc("finish_abandoned_ticket_email", {
          p_id: job.id,
          p_claim_id: job.claim_id,
          p_status: status,
          p_provider_email_id: providerId,
          p_failure_code: reason,
        }) === true,
    });
    const ok = result.retry + result.failed + result.recordingFailed === 0;
    return json({ ok, ...result }, ok ? 200 : 503);
  } catch {
    // Do not log intake details, payloads, credentials or provider responses.
    return json({ error: "reminder_worker_failed" }, 503);
  }
}

if (import.meta.main) Deno.serve(handler);
