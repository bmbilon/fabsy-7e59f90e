import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { secretMatches } from "../_shared/disclosure-confirmation.ts";
import {
  processTicketUploadAlerts,
  sendUploadAlertEmail,
  type UploadAlert,
  type UploadAlertEmail,
} from "../_shared/ticket-upload-alert.ts";
import {
  checkUploadSmsReadiness,
  processTicketUploadSms,
  sendUploadAlertSms,
  type UploadSmsAlert,
  validUploadSmsConfig,
} from "../_shared/ticket-upload-sms.ts";

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

  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  const url = Deno.env.get("SUPABASE_URL") || "";
  if (!url || !serviceKey) {
    return json({ error: "upload_alert_configuration_missing" }, 503);
  }

  const smsConfig = {
    accountSid: Deno.env.get("TWILIO_ACCOUNT_SID") || "",
    authToken: Deno.env.get("TWILIO_AUTH_TOKEN") || "",
    from: Deno.env.get("TICKET_UPLOAD_ALERT_SMS_FROM") ||
      Deno.env.get("TWILIO_PHONE_NUMBER") || "",
  };
  let requestBody: { dryRun?: boolean } = {};
  try {
    const raw = await req.text();
    requestBody = raw ? JSON.parse(raw) : {};
    if (
      !requestBody || typeof requestBody !== "object" ||
      Array.isArray(requestBody) ||
      (requestBody.dryRun !== undefined &&
        typeof requestBody.dryRun !== "boolean")
    ) return json({ error: "invalid_request" }, 400);
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  if (requestBody.dryRun === true) {
    // Authorized readiness checks never create a client, claim a row or send.
    const sms = await checkUploadSmsReadiness(smsConfig);
    const ok = Boolean(apiKey) && sms.ready;
    return json(
      { ok, dryRun: true, emailConfigured: Boolean(apiKey), sms },
      ok ? 200 : 503,
    );
  }

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (url, options) =>
        fetch(url, { ...options, signal: AbortSignal.timeout(15000) }),
    },
  });
  try {
    // Channels have independent queues/configuration. An email outage must not
    // suppress owner SMS, and a Twilio outage must not delay the existing email.
    const [emailOutcome, smsOutcome] = await Promise.allSettled([
      apiKey
        ? processTicketUploadAlerts({
          claim: async () => {
            const { data, error } = await db.rpc("claim_ticket_upload_alerts", {
              p_limit: 10,
            });
            if (error) throw error;
            return (data || []) as UploadAlert[];
          },
          freeze: async (alert, email) => {
            const { data, error } = await db.rpc(
              "freeze_ticket_upload_alert_email",
              {
                p_id: alert.id,
                p_claim_id: alert.claim_id,
                p_payload: email,
              },
            );
            if (error) throw error;
            return data as UploadAlertEmail;
          },
          send: (email, id) => sendUploadAlertEmail(apiKey, email, id),
          finish: async (alert, status, providerId, failureCode) => {
            const { data, error } = await db.rpc("finish_ticket_upload_alert", {
              p_id: alert.id,
              p_claim_id: alert.claim_id,
              p_status: status,
              p_provider_email_id: providerId,
              p_failure_code: failureCode,
            });
            if (error) throw error;
            return data === true;
          },
        })
        : Promise.reject(new Error("email_configuration_missing")),
      validUploadSmsConfig(smsConfig)
        ? processTicketUploadSms({
          claim: async () => {
            const { data, error } = await db.rpc(
              "claim_ticket_upload_sms_alerts",
              // Five sequential 10s sends + 15s completion writes fit the 3m lease.
              { p_limit: 5 },
            );
            if (error) throw error;
            return (data || []) as UploadSmsAlert[];
          },
          send: () => sendUploadAlertSms(smsConfig),
          finish: async (alert, status, providerId, failureCode) => {
            const { data, error } = await db.rpc(
              "finish_ticket_upload_sms_alert",
              {
                p_alert_id: alert.alert_id,
                p_claim_id: alert.claim_id,
                p_status: status,
                p_provider_message_sid: providerId,
                p_failure_code: failureCode,
              },
            );
            if (error) throw error;
            return data === true;
          },
        })
        : Promise.reject(new Error("sms_configuration_missing")),
    ]);
    const email = emailOutcome.status === "fulfilled"
      ? emailOutcome.value
      : null;
    const sms = smsOutcome.status === "fulfilled" ? smsOutcome.value : null;
    const ok = email !== null && sms !== null &&
      email.retry + email.failed + email.recordingFailed + sms.failed +
            sms.indeterminate + sms.recordingFailed === 0;
    return json({
      ok,
      // Preserve existing email counters for operational consumers.
      ...(email || {}),
      email: email ||
        {
          error: apiKey ? "email_worker_failed" : "email_configuration_missing",
        },
      sms: sms ||
        {
          error: validUploadSmsConfig(smsConfig)
            ? "sms_worker_failed"
            : "sms_configuration_missing",
        },
    }, ok ? 200 : 503);
  } catch {
    // Customer data, secrets, provider responses and payloads never enter logs.
    return json({ error: "upload_alert_worker_failed" }, 503);
  }
}

if (import.meta.main) Deno.serve(handler);
