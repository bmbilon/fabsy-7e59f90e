import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { getFabsyEmailSignature } from "../_shared/email-signature.ts";
import { sendResendEmail } from "../_shared/resend-email.ts";

const DISCLAIMER = "This report is consumer research based on publicly available information. Fabsy is not an insurance agent or broker and does not sell, quote, or place insurance.";

type JsonRecord = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function edmontonToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function formatDate(value: unknown) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text || "Unavailable";
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${text}T12:00:00Z`));
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = ReturnType<typeof createClient<any>>;

async function isAuthorized(req: Request, admin: SupabaseAdmin, anonKey: string) {
  const expectedSecret = Deno.env.get("IDR_CRON_SECRET");
  const suppliedSecret = req.headers.get("x-cron-secret");
  if (expectedSecret && suppliedSecret && suppliedSecret === expectedSecret) return true;

  const authorization = req.headers.get("authorization");
  if (!authorization) return false;
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return false;
  const { data: role, error: roleError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .in("role", ["admin", "case_manager"])
    .limit(1)
    .maybeSingle();
  return !roleError && Boolean(role);
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!supabaseUrl || !serviceRoleKey || !anonKey || !resendKey || !Deno.env.get("IDR_CRON_SECRET")) {
    return json({ error: "Reminder configuration is incomplete." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (!await isAuthorized(req, admin, anonKey)) return json({ error: "Unauthorized." }, 401);

  const today = edmontonToday();
  const { data: dueRows, error: dueError } = await admin
    .from("idr_reminder_events")
    .select("id,idr_report_id,event_type,event_key,scheduled_for,sent_at,claimed_at,attempts,last_error")
    .lte("scheduled_for", today)
    .is("sent_at", null)
    .order("scheduled_for", { ascending: true })
    .limit(100);
  if (dueError) return json({ error: "Unable to load due reminders." }, 500);

  const siteUrl = (Deno.env.get("SITE_URL") || "https://fabsy.ca").replace(/\/$/, "");
  let sent = 0;
  let skipped = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (const row of dueRows || []) {
    let emailAccepted = false;
    try {
      if (row.claimed_at && !row.last_error && Date.now() - new Date(row.claimed_at).getTime() > 30 * 60 * 1000) {
        await admin.from("idr_reminder_events").update({ claimed_at: null }).eq("id", row.id).is("sent_at", null);
      }
      const claimedAt = new Date().toISOString();
      const { data: claimed, error: claimError } = await admin
        .from("idr_reminder_events")
        .update({ claimed_at: claimedAt, last_error: null })
        .eq("id", row.id)
        .is("sent_at", null)
        .is("claimed_at", null)
        .select("id")
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) {
        skipped += 1;
        continue;
      }

      const { data: report, error: reportError } = await admin
        .from("idr_reports")
        .select("id,idr_order_id,report_json")
        .eq("id", row.idr_report_id)
        .single();
      if (reportError || !report) throw reportError || new Error("Reminder report was not found.");
      const { data: order, error: orderError } = await admin
        .from("idr_orders")
        .select("id,status,client_id,preferred_locale")
        .eq("id", report.idr_order_id)
        .single();
      if (orderError || !order || order.status !== "delivered") {
        throw orderError || new Error("Reminder order is not delivered.");
      }
      const { data: client, error: clientError } = await admin
        .from("clients")
        .select("first_name,email")
        .eq("id", order.client_id)
        .single();
      if (clientError || !client?.email) throw clientError || new Error("Reminder client was not found.");

      const reportJson = report.report_json as JsonRecord;
      let subject = "Your Fabsy insurance renewal reminder";
      const renewalKey = /^renewal:(\d{4}-\d{2}-\d{2})(?::\d+)?$/.exec(row.event_key);
      let message = `Your renewal window is approaching. Your recorded renewal date is ${formatDate(renewalKey?.[1] || row.scheduled_for)}. Review the report before calling carriers for current eligibility and pricing.`;
      if (row.event_type === "conviction_aging") {
        subject = "A conviction aging date in your Fabsy report is here";
        const convictionId = row.event_key.replace("conviction:", "");
        const convictions = Array.isArray(reportJson.convictions) ? reportJson.convictions as JsonRecord[] : [];
        const conviction = convictions.find((item) => item.convictionId === convictionId);
        message = `${conviction?.offence || "A conviction"} reaches the report's three-year aging date on ${formatDate(row.scheduled_for)}. Confirm how each carrier applies its current underwriting rules before making a policy decision.`;
      }

      await sendResendEmail(resendKey, {
        localization: { preferredLocale: order.preferred_locale, template: "renewal_reminder" },
        from: "Fabsy <hello@fabsy.ca>",
        reply_to: "hello@fabsy.ca",
        to: [client.email],
        subject,
        html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#1f2937"><h1>${escapeHtml(subject)}</h1><p>Hi ${escapeHtml(client.first_name)},</p><p style="line-height:1.65">${escapeHtml(message)}</p><p style="margin:28px 0"><a href="${siteUrl}/portal/insurance-reports/${encodeURIComponent(order.id)}" style="background:#7c3aed;color:white;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:700">Review your private report</a> <a href="${siteUrl}/portal/insurance-reports/${encodeURIComponent(order.id)}/survey" style="margin-left:10px">Share your outcome</a></p><p style="font-size:13px;color:#6b7280;line-height:1.5">${DISCLAIMER}</p>${getFabsyEmailSignature()}</div>`,
      }, `idr-reminder/${row.id}`);
      emailAccepted = true;

      const now = new Date().toISOString();
      const { error: sentError } = await admin.from("idr_reminder_events").update({
        sent_at: now,
        claimed_at: null,
        attempts: Number(row.attempts || 0) + 1,
      }).eq("id", row.id);
      if (sentError && emailAccepted) {
        console.error("Reminder email was accepted but its sent status could not be saved", sentError);
        throw new Error("Reminder sent status could not be saved.");
      }
      await admin.from("outcome_surveys").upsert({
        client_id: order.client_id,
        idr_report_id: report.id,
        sent_at: now,
      }, { onConflict: "client_id,idr_report_id", ignoreDuplicates: true });
      const { data: nextReminder } = await admin
        .from("idr_reminder_events")
        .select("scheduled_for")
        .eq("idr_report_id", report.id)
        .is("sent_at", null)
        .order("scheduled_for", { ascending: true })
        .limit(1)
        .maybeSingle();
      const { error: reportUpdateError } = await admin.from("idr_reports").update({
        next_reminder_at: nextReminder?.scheduled_for ? `${nextReminder.scheduled_for}T15:00:00Z` : null,
      }).eq("id", report.id);
      if (reportUpdateError) throw reportUpdateError;
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reminder failed.";
      const { data: current } = await admin.from("idr_reminder_events").select("sent_at").eq("id", row.id).maybeSingle();
      if (!current?.sent_at && !emailAccepted) {
        await admin.from("idr_reminder_events").update({
          claimed_at: null,
          attempts: Number(row.attempts || 0) + 1,
          last_error: message.slice(0, 1000),
        }).eq("id", row.id);
      } else if (!current?.sent_at && emailAccepted) {
        await admin.from("idr_reminder_events").update({
          attempts: Number(row.attempts || 0) + 1,
          last_error: `Email accepted by provider, manual sent-status reconciliation required. ${message}`.slice(0, 1000),
        }).eq("id", row.id);
      }
      failures.push({ id: row.id, error: message });
    }
  }

  return json({ processed: dueRows?.length || 0, sent, skipped, failures }, failures.length ? 500 : 200);
});
