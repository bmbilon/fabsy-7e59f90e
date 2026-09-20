// Match the repository's pinned Supabase Edge Function import convention.
// deno-lint-ignore no-import-prefix
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { secretMatches } from "../_shared/disclosure-confirmation.ts";
import { checkUploadSmsReadiness, validUploadSmsConfig } from "../_shared/ticket-upload-sms.ts";
import { type PaymentSms, processPaymentSms, sendPaymentSms } from "../_shared/payment-notification-sms.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const cronAuthorized = await secretMatches(req.headers.get("x-cron-secret") || "", Deno.env.get("IDR_CRON_SECRET") || "");
  const serviceAuthorized = await secretMatches(req.headers.get("authorization") || "", serviceKey ? `Bearer ${serviceKey}` : "");
  if (!cronAuthorized && !serviceAuthorized) return json({ error: "unauthorized" }, 401);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const config = {
    accountSid: Deno.env.get("TWILIO_ACCOUNT_SID") || "", authToken: Deno.env.get("TWILIO_AUTH_TOKEN") || "",
    from: Deno.env.get("PAYMENT_SMS_FROM_NUMBER") || Deno.env.get("TWILIO_SMS_NUMBER") || Deno.env.get("TWILIO_PHONE_NUMBER") || "",
  };
  let dryRun = false;
  try {
    const raw = await req.text(); const body = raw ? JSON.parse(raw) : {};
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => key !== "dryRun")
      || (body.dryRun !== undefined && typeof body.dryRun !== "boolean")) return json({ error: "invalid_request" }, 400);
    dryRun = body.dryRun === true;
  } catch { return json({ error: "invalid_request" }, 400); }
  if (dryRun) {
    const sms = await checkUploadSmsReadiness(config);
    const ok = Boolean(url && serviceKey) && sms.ready;
    return json({ ok, dryRun: true, sms }, ok ? 200 : 503);
  }
  if (!url || !serviceKey) return json({ error: "payment_sms_configuration_missing" }, 503);
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false }, global: {
    fetch: (target, options) => fetch(target, { ...options, signal: AbortSignal.timeout(15000) }),
  } });
  const health = async (code: string | null) => {
    const { error } = await db.rpc("record_payment_sms_worker_health", { p_error: code });
    if (error) throw new Error("payment_sms_health_write_failed");
  };
  try {
    if (!validUploadSmsConfig(config)) {
      await health("payment_sms_configuration_missing");
      return json({ error: "payment_sms_configuration_missing" }, 503);
    }
    const result = await processPaymentSms({
      claim: async () => {
        const { data, error } = await db.rpc("claim_payment_sms_notifications", { p_limit: 1 });
        if (error) throw new Error("payment_sms_claim_failed");
        return (data || []) as PaymentSms[];
      },
      send: item => sendPaymentSms(config, item),
      finish: async (item, outcome, sid, code) => {
        const { data, error } = await db.rpc("finish_payment_sms_notification", {
          p_id: item.id, p_claim_id: item.claim_id, p_status: outcome, p_provider_message_sid: sid, p_failure_code: code,
        });
        if (error) throw new Error("payment_sms_finish_failed");
        return data === true;
      },
    });
    const ok = result.failed + result.indeterminate + result.recordingFailed === 0;
    await health(ok ? null : "payment_sms_attempt_needs_review");
    return json({ ok, ...result }, ok ? 200 : 503);
  } catch {
    try { await health("payment_sms_worker_failed"); } catch { /* Cron receives503 if health itself cannot persist. */ }
    return json({ error: "payment_sms_worker_failed" }, 503);
  }
}

if (import.meta.main) Deno.serve(handler);
