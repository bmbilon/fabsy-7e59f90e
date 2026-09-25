import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { secretMatches } from "../_shared/disclosure-confirmation.ts";
import {
  type LtbAlertEmail,
  type LtbIntakeAlert,
  processLtbIntakeAlerts,
  sendLtbAlertEmail,
} from "../_shared/ltb-intake-alert.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/**
 * Minute worker (and on-demand wake-up from ltb-intake): settles stalled
 * intakes into staff review, then sends queued practice alerts.
 */
export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const cronAuthorized = await secretMatches(req.headers.get("x-cron-secret") || "", Deno.env.get("IDR_CRON_SECRET") || "");
  const serviceAuthorized = await secretMatches(req.headers.get("authorization") || "", serviceKey ? `Bearer ${serviceKey}` : "");
  if (!cronAuthorized && !serviceAuthorized) return json({ error: "unauthorized" }, 401);

  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  const url = Deno.env.get("SUPABASE_URL") || "";
  if (!url || !serviceKey) return json({ error: "ltb_alert_configuration_missing" }, 503);

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, options) => fetch(input, { ...options, signal: AbortSignal.timeout(15_000) }) },
  });
  try {
    const { data: swept } = await db.rpc("ltb_sweep_stalled_intakes");
    if (!apiKey) return json({ ok: false, swept: swept ?? 0, error: "email_configuration_missing" }, 503);
    const result = await processLtbIntakeAlerts({
      claim: async () => {
        const { data, error } = await db.rpc("claim_ltb_intake_alerts", { p_limit: 10 });
        if (error) throw error;
        return (data || []) as LtbIntakeAlert[];
      },
      freeze: async (alert, email) => {
        const { data, error } = await db.rpc("freeze_ltb_intake_alert_email", {
          p_id: alert.id, p_claim_id: alert.claim_id, p_payload: email,
        });
        if (error) throw error;
        return data as LtbAlertEmail;
      },
      send: (email, id) => sendLtbAlertEmail(apiKey, email, id),
      finish: async (alert, status, providerId, failureCode) => {
        const { data, error } = await db.rpc("finish_ltb_intake_alert", {
          p_id: alert.id, p_claim_id: alert.claim_id, p_status: status,
          p_provider_email_id: providerId, p_failure_code: failureCode,
        });
        if (error) throw error;
        return data === true;
      },
    });
    return json({ ok: true, swept: swept ?? 0, ...result });
  } catch {
    return json({ error: "ltb_alert_processing_failed" }, 500);
  }
}

if (import.meta.main) Deno.serve(handler);
