import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { secretMatches } from "../_shared/disclosure-confirmation.ts";
import { sendWorkspaceEmail } from "../_shared/google-workspace-email.ts";
import { senderHash } from "../_shared/whatsapp-vapi.ts";
import {
  channelHold,
  completionUrl,
  deliverRecovery,
  type RecoveryJob,
  recoveryMessage,
  type RecoverySnapshot,
  stripeRecoveryHold,
  unsubscribeSignature,
} from "../_shared/ticket-recovery.ts";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
const env = (name: string) => Deno.env.get(name) || "";

export async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const service = env("SUPABASE_SERVICE_ROLE_KEY");
  const db = createClient(env("SUPABASE_URL"), service, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(15000) }),
    },
  });
  if (url.searchParams.get("action") === "unsubscribe") {
    const origin = req.headers.get("origin");
    const allowed = !origin ||
      ["https://fabsy.ca", "https://www.fabsy.ca"].includes(origin) ||
      /^https:\/\/([a-z0-9-]+\.)?fabsy\.pages\.dev$/.test(origin);
    if (!allowed) return json({ error: "origin_not_allowed" }, 403);
    const cors = {
      "Access-Control-Allow-Origin": origin || "https://fabsy.ca",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
      "Cache-Control": "no-store",
    };
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    const id = url.searchParams.get("id") || "",
      sig = url.searchParams.get("signature") || "";
    if (
      !/^[a-f0-9-]{36}$/.test(id) ||
      !await secretMatches(
        sig,
        await unsubscribeSignature(id, env("IDR_CRON_SECRET")),
      )
    ) return json({ error: "invalid_link" }, 400);
    if (req.method === "GET") {
      // Supabase's shared domain does not serve HTML. Use the first-party static page.
      return new Response(null, {
        status: 303,
        headers: {
          ...cors,
          "Location":
            `https://fabsy.ca/reminder-preferences.html#id=${id}&signature=${sig}`,
          "Referrer-Policy": "no-referrer",
        },
      });
    }
    if (req.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }
    const { data: event, error } = await db.from("ticket_recovery_events")
      .select("channel,recipient").eq("id", id).maybeSingle();
    if (error || !event?.recipient) {
      return new Response(JSON.stringify({ error: "reminder_unavailable" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const { error: save } = await db.from("ticket_recovery_suppressions")
      .upsert({
        channel: event.channel,
        recipient: event.recipient,
        reason: "unsubscribe_link",
      }, { onConflict: "channel,recipient" });
    return new Response(
      JSON.stringify(save ? { error: "please_retry" } : { unsubscribed: true }),
      {
        status: save ? 503 : 200,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (
    !await secretMatches(
      req.headers.get("x-cron-secret") || "",
      env("IDR_CRON_SECRET"),
    ) &&
    !await secretMatches(
      req.headers.get("authorization") || "",
      service ? `Bearer ${service}` : "",
    )
  ) return json({ error: "unauthorized" }, 401);
  const rpc = async (name: string, args: Record<string, unknown> = {}) => {
    const { data, error } = await db.rpc(name, args);
    if (error) throw new Error("recovery_database_error");
    return data;
  };
  const snapshot = async (job: { source_kind: string; source_id: string }) =>
    await rpc("ticket_recovery_snapshot", {
      p_kind: job.source_kind,
      p_id: job.source_id,
    }) as RecoverySnapshot;
  try {
    const input = await req.json().catch(() => ({}));
    const { data: cfg, error } = await db.from("ticket_recovery_settings")
      .select("enabled,mailing_address,cadence_hours").single();
    if (error) throw new Error("settings_unavailable");
    const suppressed = async (
      s: RecoverySnapshot,
      job: { channel: string },
    ) => {
      const recipient = job.channel === "email" ? s.email : s.phone;
      const { data, error } = await db.from("ticket_recovery_suppressions")
        .select("recipient").eq("channel", job.channel).eq(
          "recipient",
          recipient,
        ).maybeSingle();
      if (error) throw new Error("suppression_unavailable");
      if (data) return "unsubscribed";
      if (job.channel === "sms") {
        const hash = await senderHash(s.phone, env("SMS_SENDER_HASH_KEY"));
        const { data: state, error } = await db.from("sms_vapi_conversations")
          .select("opted_out_at").eq("sender_hash", hash).maybeSingle();
        if (error) throw new Error("sms_preference_unavailable");
        if (state?.opted_out_at) return "unsubscribed";
      }
      return null;
    };
    if (input.dry_run === true) {
      const sources = await rpc("ticket_recovery_sources") as Array<
        { source_kind: string; source_id: string }
      >;
      const candidates = [];
      for (const source of sources.slice(0, 100)) {
        const s = await snapshot(source);
        const channels: Record<string, unknown> = {};
        for (const channel of ["email", "sms"] as const) {
          let hold = channelHold(s, channel);
          if (!hold) hold = await suppressed(s, { channel });
          if (!hold && input.check_payments === true) {
            hold = await stripeRecoveryHold(s, env("STRIPE_SECRET_KEY"));
          }
          channels[channel] = { eligible: !hold, hold };
        }
        candidates.push({
          ...source,
          ticket_number: s.ticket_number,
          email: s.email,
          has_phone: !!s.phone,
          consent_complete: s.has_consent,
          payment_complete: s.paid,
          url: completionUrl(s),
          legacy_sent_at: s.legacy_sent_at,
          channels,
        });
      }
      return json({
        dry_run: true,
        messages_sent: 0,
        enabled: cfg.enabled,
        cadence_hours: cfg.cadence_hours,
        mailing_address_configured: !!cfg.mailing_address,
        candidates,
        truncated: sources.length > 100,
      });
    }
    if (!cfg.enabled) return json({ enabled: false, messages_sent: 0 });
    if (
      !cfg.mailing_address || !env("STRIPE_SECRET_KEY") ||
      !env("IDR_CRON_SECRET")
    ) return json({ error: "configuration_incomplete" }, 503);
    await rpc("enqueue_ticket_recovery");
    const outcomes: Record<string, number> = {};
    const deadline = Date.now() + 100000;
    for (let i = 0; i < 8 && Date.now() < deadline; i++) {
      const job = (await rpc("claim_ticket_recovery") as RecoveryJob[])?.[0];
      if (!job) break;
      const result = await deliverRecovery(job, {
        snapshot,
        providerHold: async (s, j) =>
          await suppressed(s, j) ||
          await stripeRecoveryHold(s, env("STRIPE_SECRET_KEY")),
        begin: async (j, s) =>
          await rpc("begin_ticket_recovery_attempt", {
            p_id: j.id,
            p_claim: j.claim_id,
            p_snapshot: s,
          }) === true,
        send: async (j, s) => {
          const signature = await unsubscribeSignature(
            j.id,
            env("IDR_CRON_SECRET"),
          );
          const unsubscribe = `${
            env("SUPABASE_URL")
          }/functions/v1/process-ticket-recovery?action=unsubscribe&id=${j.id}&signature=${signature}`;
          const message = recoveryMessage(s, unsubscribe, cfg.mailing_address);
          if (j.channel === "email") {
            return (await sendWorkspaceEmail(
              message.email,
              `ticket-recovery/${j.id}`,
            )).id;
          }
          const account = env("TWILIO_ACCOUNT_SID"),
            token = env("TWILIO_AUTH_TOKEN"),
            from = env("TWILIO_SMS_NUMBER") || env("TWILIO_PHONE_NUMBER");
          if (!account || !token || !from) {
            throw new Error("sms_not_configured");
          }
          const response = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${account}/Messages.json`,
            {
              method: "POST",
              headers: {
                Authorization: `Basic ${btoa(`${account}:${token}`)}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                To: s.phone,
                From: from,
                Body: message.sms,
              }),
              signal: AbortSignal.timeout(20000),
            },
          );
          const result = await response.json().catch(() => ({}));
          if (result.code === 21610) {
            await db.from("ticket_recovery_suppressions").upsert({
              channel: "sms",
              recipient: s.phone,
              reason: "twilio_stop",
            }, { onConflict: "channel,recipient" });
          }
          if (!response.ok || typeof result.sid !== "string") {
            throw new Error("sms_not_accepted");
          }
          return result.sid;
        },
        finish: async (j, status, reason, provider) =>
          await rpc("finish_ticket_recovery", {
            p_id: j.id,
            p_claim: j.claim_id,
            p_status: status,
            p_reason: reason,
            p_provider: provider,
          }) === true,
      });
      outcomes[result] = (outcomes[result] || 0) + 1;
    }
    const ok = !outcomes.recording_failed && !outcomes.uncertain;
    await db.from("ticket_recovery_settings").update({
      last_worker_at: new Date().toISOString(),
      last_worker_error: ok ? null : "delivery_review_required",
    }).eq("singleton", true);
    return json({ enabled: true, outcomes }, ok ? 200 : 503);
  } catch {
    return json({ error: "recovery_worker_failed" }, 503);
  }
}
if (import.meta.main) Deno.serve(handler);
