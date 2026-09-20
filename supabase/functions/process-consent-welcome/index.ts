// Repository-standard pinned Supabase Edge Function import.
// deno-lint-ignore no-import-prefix
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { secretMatches } from "../_shared/disclosure-confirmation.ts";
import { processConsentWelcome, sendConsentWelcome } from "../_shared/consent-welcome-delivery.ts";
import { consentWelcomePayment } from "../_shared/consent-welcome-payment.ts";
import { type ConsentWelcomeContext, type ConsentWelcomeJob, ConsentWelcomeError } from "../_shared/consent-welcome-types.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!await secretMatches(req.headers.get("x-cron-secret") || "", Deno.env.get("IDR_CRON_SECRET") || "")
    && !await secretMatches(req.headers.get("authorization") || "", serviceKey ? `Bearer ${serviceKey}` : "")) return json({ error: "unauthorized" }, 401);
  const url = Deno.env.get("SUPABASE_URL") || "", resendKey = Deno.env.get("RESEND_API_KEY") || "", stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
  let dryRun = false;
  try {
    const raw = await req.text(); const value = raw ? JSON.parse(raw) : {};
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => key !== "dryRun")
      || (value.dryRun !== undefined && typeof value.dryRun !== "boolean")) return json({ error: "invalid_request" }, 400);
    dryRun = value.dryRun === true;
  } catch { return json({ error: "invalid_request" }, 400); }
  const configured = Boolean(url && serviceKey && resendKey && stripeKey);
  if (dryRun) {
    // Config-only readiness never claims jobs, loads client files or sends mail.
    return json({ ok: configured, dryRun: true, databaseConfigured: Boolean(url && serviceKey), emailConfigured: Boolean(resendKey), paymentReadConfigured: Boolean(stripeKey) }, configured ? 200 : 503);
  }
  if (!url || !serviceKey) return json({ error: "welcome_configuration_missing" }, 503);
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false }, global: {
    fetch: (target, options) => fetch(target, { ...options, signal: AbortSignal.timeout(15000) }),
  } });
  const rpc = async (name: string, parameters: Record<string, unknown>) => {
    const { data, error } = await db.rpc(name, parameters);
    if (error) throw new Error("welcome_database_unavailable");
    return data;
  };
  const health = (code: string | null) => rpc("record_consent_welcome_worker_health", { p_error: code });
  try {
    if (!resendKey) {
      await health("welcome_configuration_missing");
      return json({ error: "welcome_configuration_missing" }, 503);
    }
    const result = await processConsentWelcome({
      claim: async () => ((await rpc("claim_consent_welcome_notifications", { p_limit: 1 })) as ConsentWelcomeJob[] | null)?.[0] || null,
      context: async job => await rpc("get_consent_welcome_context", { p_id: job.id, p_claim_id: job.claim_id }) as ConsentWelcomeContext,
      readDocument: async (bucket, path) => {
        const { data, error } = await db.storage.from(bucket).download(path);
        if (error || !data || data.size <= 0 || data.size > 20 * 1024 * 1024) throw new ConsentWelcomeError("welcome_document_unavailable");
        return new Uint8Array(await data.arrayBuffer());
      },
      payment: context => consentWelcomePayment(context, stripeKey),
      begin: async (job, sourceHash, payloadHash, documents) => await rpc("begin_consent_welcome_send", {
        p_id: job.id, p_claim_id: job.claim_id, p_source_fingerprint: sourceHash, p_payload_sha256: payloadHash, p_attachment_fingerprints: documents,
      }) === true,
      send: (email, id) => sendConsentWelcome(resendKey, email, id),
      finish: async (job, status, providerId, code) => await rpc("finish_consent_welcome_notification", {
        p_id: job.id, p_claim_id: job.claim_id, p_status: status, p_provider_id: providerId, p_failure_code: code,
      }) === true,
    });
    const ok = result.failed + result.indeterminate + result.recordingFailed === 0;
    await health(ok ? null : "welcome_attempt_needs_review");
    return json({ ok, ...result }, ok ? 200 : 503);
  } catch {
    try { await health("welcome_worker_unavailable"); } catch { /* Health failures remain visible in cron's503. */ }
    return json({ error: "welcome_worker_unavailable" }, 503);
  }
}
if (import.meta.main) Deno.serve(handler);
