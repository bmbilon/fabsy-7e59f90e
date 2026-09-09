import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { secretMatches } from "../_shared/disclosure-confirmation.ts";
import {
  processTicketUploadAlerts,
  sendUploadAlertEmail,
  type UploadAlert,
  type UploadAlertEmail,
} from "../_shared/ticket-upload-alert.ts";

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

  const recipient = (Deno.env.get("TICKET_UPLOAD_ALERT_TO") || "").trim()
    .toLowerCase();
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  const url = Deno.env.get("SUPABASE_URL") || "";
  if (!recipient || !apiKey || !url || !serviceKey) {
    return json({ error: "upload_alert_configuration_missing" }, 503);
  }

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (url, options) =>
        fetch(url, { ...options, signal: AbortSignal.timeout(15000) }),
    },
  });
  try {
    const result = await processTicketUploadAlerts({
      recipient,
      verifyRecipient: async () => {
        const { data: roles, error } = await db.from("user_roles").select(
          "user_id",
        ).eq("role", "admin");
        if (error) throw error;
        for (const role of roles || []) {
          const { data, error } = await db.auth.admin.getUserById(role.user_id);
          if (error) throw error;
          if (
            data.user?.email?.toLowerCase() === recipient &&
            data.user.email_confirmed_at
          ) return true;
        }
        return false;
      },
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
    });
    const ok = result.retry + result.failed + result.recordingFailed === 0;
    return json({ ok, ...result }, ok ? 200 : 503);
  } catch {
    // Customer data, secrets, provider responses and payloads never enter logs.
    return json({ error: "upload_alert_worker_failed" }, 503);
  }
}

if (import.meta.main) Deno.serve(handler);
