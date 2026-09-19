import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { checkSmsBridgeReadiness } from "../_shared/sms-readiness.ts";
import { secretMatches } from "../_shared/disclosure-confirmation.ts";
import {
  processSmsIntakeEmails,
  sendSmsIntakeEmail,
  type SmsIntakeEmail,
  type SmsIntakeEmailPayload,
} from "../_shared/sms-intake-email.ts";

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
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const cron = await secretMatches(
    req.headers.get("x-cron-secret") || "",
    Deno.env.get("IDR_CRON_SECRET") || "",
  );
  const authorized = await secretMatches(
    req.headers.get("authorization") || "",
    service ? `Bearer ${service}` : "",
  );
  if (!cron && !authorized) return json({ error: "unauthorized" }, 401);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  if (!url || !service || !apiKey) {
    return json({ error: "configuration_missing" }, 503);
  }
  let body: { dryRun?: boolean };
  try {
    const raw = await req.text();
    if (raw.length > 1024) return json({ error: "invalid_request" }, 400);
    body = raw ? JSON.parse(raw) : {};
    if (
      !body || typeof body !== "object" || Array.isArray(body) ||
      (body.dryRun !== undefined && typeof body.dryRun !== "boolean")
    ) return json({ error: "invalid_request" }, 400);
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const db = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (url, options) =>
        fetch(url, { ...options, signal: AbortSignal.timeout(15000) }),
    },
  });
  if (body.dryRun) {
    const readiness = await checkSmsBridgeReadiness({
      accountSid: Deno.env.get("TWILIO_ACCOUNT_SID") || "",
      authToken: Deno.env.get("TWILIO_AUTH_TOKEN") || "",
      from: Deno.env.get("TWILIO_SMS_NUMBER") || "",
      assistantId: Deno.env.get("SMS_VAPI_ASSISTANT_ID") || "",
      vapiKey: Deno.env.get("VAPI_PRIVATE_API_KEY") || "",
      senderHashKey: Deno.env.get("SMS_SENDER_HASH_KEY") || "",
      webhookUrl: Deno.env.get("SMS_WEBHOOK_URL") || "",
      supabaseUrl: url,
      previousSenderHashKey: Deno.env.get("SMS_SENDER_HASH_KEY_PREVIOUS")
        ?.trim(),
      senderRateLimit: Deno.env.get("SMS_RATE_LIMIT_PER_10_MINUTES")?.trim(),
      globalRateLimit: Deno.env.get("SMS_GLOBAL_RATE_LIMIT_PER_10_MINUTES")
        ?.trim(),
      dailyRateLimit: Deno.env.get("SMS_GLOBAL_RATE_LIMIT_PER_DAY")?.trim(),
    }, async () => {
      const { data, error } = await db.rpc("sms_intake_readiness");
      if (error) throw error;
      return data;
    });
    return json(
      { ok: readiness.ready, dryRun: true, ...readiness },
      readiness.ready ? 200 : 503,
    );
  }
  try {
    const result = await processSmsIntakeEmails({
      claim: async () => {
        const { data, error } = await db.rpc(
          "claim_sms_intake_email_notifications",
          { p_limit: 5 },
        );
        if (error) throw error;
        return (data || []) as SmsIntakeEmail[];
      },
      freeze: async (alert, email) => {
        const { data, error } = await db.rpc(
          "freeze_sms_intake_email_notification",
          { p_id: alert.id, p_claim_id: alert.claim_id, p_payload: email },
        );
        if (error) throw error;
        return data as SmsIntakeEmailPayload;
      },
      send: (email, id) => sendSmsIntakeEmail(apiKey, email, id),
      finish: async (alert, status, providerId, failureCode) => {
        const { data, error } = await db.rpc(
          "finish_sms_intake_email_notification",
          {
            p_id: alert.id,
            p_claim_id: alert.claim_id,
            p_status: status,
            p_provider_email_id: providerId,
            p_failure_code: failureCode,
          },
        );
        if (error) throw error;
        return data === true;
      },
    });
    const ok = result.recordingFailed === 0 && result.failed === 0 &&
      result.retry === 0;
    return json({ ok, ...result }, ok ? 200 : 503);
  } catch {
    return json({ error: "sms_email_processing_failed" }, 503);
  }
}

if (import.meta.main) Deno.serve(handler);
