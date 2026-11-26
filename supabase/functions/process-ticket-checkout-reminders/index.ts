// deno-lint-ignore-file no-import-prefix
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { buildWorkspaceMime, getWorkspaceMessage, listWorkspaceMessages, sendWorkspaceEmail, workspaceAccessToken } from "../_shared/google-workspace-email.ts";
import { equalSecret, reminderChannel, reminderEmail, reminderMessageId, reminderSms, reminderStopToken,
  type CheckoutReminderEvent } from "../_shared/ticket-checkout-reminder.ts";

import { mintCheckoutReminderResumeUrl } from "../_shared/checkout-reminder-link.ts";

const FROM = "+18257932279";
export class SmsRecipientOptedOut extends Error {}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export interface ReminderDependencies {
  db: SupabaseClient;
  prepareEmail: () => Promise<unknown>;
  sendEmail: typeof sendWorkspaceEmail;
  prepareSms: () => Promise<unknown>;
  sendSms: (phone: string, body: string) => Promise<string>;
  stopUrl: (campaign: string) => Promise<string>;
  resumeUrl: (event: string) => Promise<string>;
}
function twilioConfig() {
  const account = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
  const token = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
  if (!/^AC[a-f0-9]{32}$/i.test(account) || !token) throw new Error("CHECKOUT_SMS_NOT_CONFIGURED");
  return { base: `https://api.twilio.com/2010-04-01/Accounts/${account}`, headers: { Authorization: `Basic ${btoa(`${account}:${token}`)}` } };
}
async function prepareSms() {
  const { base, headers } = twilioConfig();
  const response = await fetch(`${base}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(FROM)}`, { headers, signal: AbortSignal.timeout(10000) });
  const result = await response.json();
  if (!response.ok || !result.incoming_phone_numbers?.some((p: { phone_number: string; capabilities: { sms: boolean } }) => p.phone_number === FROM && p.capabilities.sms)) throw new Error("FABSY_SMS_SENDER_UNAVAILABLE");
}
async function sendSms(phone: string, body: string): Promise<string> {
  const { base, headers } = twilioConfig();
  const response = await fetch(`${base}/Messages.json`, { method: "POST", headers,
    body: new URLSearchParams({ From: FROM, To: phone, Body: body }), signal: AbortSignal.timeout(20000) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok && result.code === 21610) throw new SmsRecipientOptedOut("SMS_RECIPIENT_OPTED_OUT");
  if (!response.ok || !/^SM[a-f0-9]{32}$/i.test(result.sid || "")) throw new Error(`CHECKOUT_SMS_NO_RECEIPT_${response.status}_${result.code || "unknown"}`);
  return result.sid;
}
async function rpc(db: SupabaseClient, name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(`${name.toUpperCase()}_FAILED`);
  return data;
}

export async function processReminders(deps: ReminderDependencies) {
  const rows = await rpc(deps.db, "claim_ticket_checkout_reminders") as CheckoutReminderEvent[];
  let sent = 0, changed = 0, uncertain = 0, deferred = 0;
  for (const row of rows || []) {
    let started = false;
    try {
      const choice = reminderChannel(row.context);
      const resumeUrl = await deps.resumeUrl(row.id);
      const payload = choice.channel === "email" ? reminderEmail(row.context, row.stage, await deps.stopUrl(row.campaign_id), resumeUrl)
        : { body: reminderSms(row.context, row.stage, resumeUrl) };
      // Authentication/rendering failures happen before the durable send boundary.
      if (choice.channel === "email") {
        await buildWorkspaceMime(payload as ReturnType<typeof reminderEmail>, `ticket-checkout-reminder/${row.id}`);
        await deps.prepareEmail();
      } else await deps.prepareSms();
      started = await rpc(deps.db, "begin_ticket_checkout_reminder", { p_id: row.id, p_claim: row.claim_token,
        p_context: row.context, p_channel: choice.channel, p_recipient: choice.recipient, p_payload: payload });
      if (!started) { changed++; continue; }
      let provider: string, thread: string | null = null;
      try {
        if (choice.channel === "email") {
          const receipt = await deps.sendEmail(payload as ReturnType<typeof reminderEmail>, `ticket-checkout-reminder/${row.id}`);
          provider = receipt.id; thread = receipt.threadId || null;
        } else provider = await deps.sendSms(choice.recipient, (payload as { body: string }).body);
      } catch (error) {
        if (choice.channel === "sms" && error instanceof SmsRecipientOptedOut) {
          await rpc(deps.db, "finish_ticket_checkout_reminder", { p_id: row.id, p_claim: row.claim_token, p_error: "SMS_RECIPIENT_OPTED_OUT" });
          await rpc(deps.db, "stop_ticket_checkout_reminders", { p_campaign: row.campaign_id });
          changed++; continue;
        }
        await rpc(deps.db, "finish_ticket_checkout_reminder", { p_id: row.id, p_claim: row.claim_token,
          p_error: "No confirmed provider receipt; hold for reconciliation, do not resend" });
        uncertain++; continue;
      }
      const saved = await rpc(deps.db, "finish_ticket_checkout_reminder", { p_id: row.id, p_claim: row.claim_token,
        p_provider: provider, p_thread: thread });
      if (saved !== true) throw new Error("REMINDER_RECEIPT_SAVE_FAILED");
      sent++;
    } catch (error) {
      if (started) throw error; // Preserve a known/uncertain provider write for reconciliation.
      await rpc(deps.db, "release_ticket_checkout_reminder", { p_id: row.id, p_claim: row.claim_token,
        p_error: error instanceof Error ? error.message : "Reminder preparation failed" });
      deferred++;
    }
  }
  return { sent, changed, uncertain, deferred };
}

/** Read-only reconciliation of lost receipts; never sends or changes channel. */
async function reconcileReceipts(db: SupabaseClient) {
  const { data, error } = await db.from("ticket_checkout_reminder_events").select("id,claim_token,channel,recipient,payload,sending_at,reconciliation_attempts")
    .eq("status", "uncertain").lt("reconciliation_attempts", 12).lte("next_reconcile_at", new Date().toISOString()).order("next_reconcile_at").limit(3);
  if (error) throw new Error("REMINDER_RECONCILIATION_READ_FAILED");
  let reconciled = 0;
  for (const row of data || []) {
    try {
      let provider: string | null = null, thread: string | null = null;
      if (row.channel === "email") {
        const matches = await listWorkspaceMessages(`in:sent rfc822msgid:${await reminderMessageId(row.id)}`, 2);
        if (matches.length === 1) {
          const message = await getWorkspaceMessage(matches[0].id) as { payload?: { headers?: Array<{ name: string; value: string }> } };
          const header = (name: string) => message.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";
          if (header("To") === row.recipient && header("X-Fabsy-Idempotency-Key") === `ticket-checkout-reminder/${row.id}`) {
            provider = matches[0].id; thread = matches[0].threadId || null;
          }
        }
      } else if (row.channel === "sms") {
        const { base, headers } = twilioConfig();
        const since = new Date(Date.parse(row.sending_at) - 86400000).toISOString().slice(0, 10);
        const query = new URLSearchParams({ From: FROM, To: row.recipient, "DateSent>": since, PageSize: "100" });
        const response = await fetch(`${base}/Messages.json?${query}`, { headers, signal: AbortSignal.timeout(10000) });
        const result = await response.json();
        if (!response.ok) throw new Error("SMS_RECONCILIATION_UNAVAILABLE");
        const matches = (result.messages || []).filter((m: { body: string; date_created: string; status: string }) =>
          m.body === row.payload.body && Math.abs(Date.parse(m.date_created) - Date.parse(row.sending_at)) < 120000 && !["failed", "undelivered"].includes(m.status));
        if (matches.length === 1) provider = matches[0].sid;
      }
      if (provider && await rpc(db, "finish_ticket_checkout_reminder", { p_id: row.id, p_claim: row.claim_token, p_provider: provider, p_thread: thread })) reconciled++;
    } catch { /* An unavailable provider lookup leaves the delivery held. */ }
    const attempts = row.reconciliation_attempts + 1;
    await db.from("ticket_checkout_reminder_events").update({ reconciliation_attempts: attempts,
      next_reconcile_at: new Date(Date.now() + 15 * 60000).toISOString(),
      ...(attempts >= 12 ? { status: "needs_review", last_error: "No unique provider receipt after bounded reconciliation; do not resend" } : {}),
    }).eq("id", row.id).eq("status", "uncertain");
  }
  return reconciled;
}

export async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Use POST" }, 405);
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  let authorized = await equalSecret(request.headers.get("x-cron-secret") || "", Deno.env.get("IDR_CRON_SECRET") || "") ||
    await equalSecret(request.headers.get("Authorization") || "", key ? `Bearer ${key}` : "");
  if (!authorized && request.headers.get("Authorization")?.startsWith("Bearer ")) {
    try {
      const caller = createClient(Deno.env.get("SUPABASE_URL")!, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: request.headers.get("Authorization")! },
          fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(10000) }) },
      });
      const result = await caller.rpc("ticket_checkout_reminder_worker_authorized");
      authorized = !result.error && result.data === true;
    } catch { authorized = false; }
  }
  if (!authorized) return json({ error: "Unauthorized" }, 401);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) }) } });
  try {
    const body = await request.json().catch(() => ({}));
    if (body.dry_run === true) {
      const { data: settings, error } = await db.from("ticket_checkout_reminder_settings").select("enabled,enabled_at,last_worker_at,last_worker_error").single();
      if (error) throw new Error("REMINDER_SETTINGS_UNAVAILABLE");
      await workspaceAccessToken(); await prepareSms();
      await reminderStopToken("00000000-0000-4000-8000-000000000000", Deno.env.get("IDR_CRON_SECRET") || "");
      return json({ dry_run: true, settings, providersReady: { email: true, sms: true }, sends: 0 });
    }
    const reconciled = await reconcileReceipts(db);
    const secret = Deno.env.get("IDR_CRON_SECRET") || "";
    const result = await processReminders({ db, prepareEmail: workspaceAccessToken, sendEmail: sendWorkspaceEmail,
      prepareSms, sendSms, resumeUrl: id => mintCheckoutReminderResumeUrl(id, secret), stopUrl: async id => `${Deno.env.get("SUPABASE_URL")}/functions/v1/ticket-reminder-unsubscribe?token=${await reminderStopToken(id, Deno.env.get("IDR_CRON_SECRET") || "")}` });
    const saved = await db.from("ticket_checkout_reminder_settings").update({ last_worker_at: new Date().toISOString(), last_worker_error: null }).eq("id", true);
    if (saved.error) throw new Error("REMINDER_HEALTH_SAVE_FAILED");
    return json({ ...result, reconciled });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reminder worker failed";
    await db.from("ticket_checkout_reminder_settings").update({ last_worker_at: new Date().toISOString(), last_worker_error: message }).eq("id", true);
    return json({ error: message }, 503);
  }
}
if (import.meta.main) Deno.serve(handler);
