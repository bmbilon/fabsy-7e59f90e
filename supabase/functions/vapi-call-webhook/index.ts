import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { getFabsyEmailSignature } from "../_shared/email-signature.ts";

// Receives Vapi server messages. On an end-of-call report it stores the transcript,
// recording and metadata in the call_logs table (audio copied into the
// call-recordings storage bucket) and emails hello@fabsy.ca for every call.

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const NOTIFY_TO = "hello@fabsy.ca";
const EMAIL_FROM = "Fabsy Calls <hello@fabsy.ca>";
const RECORDINGS_BUCKET = "call-recordings";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function pick<T>(...vals: (T | undefined | null)[]): T | undefined {
  for (const v of vals) if (v !== undefined && v !== null) return v as T;
  return undefined;
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const msg = body?.message ?? body ?? {};
  const type = msg?.type;

  // Only act on the end-of-call report. Acknowledge everything else so Vapi is happy.
  if (type !== "end-of-call-report") {
    return json({ ok: true, ignored: type ?? "unknown" });
  }

  const call = msg.call ?? {};
  const artifact = msg.artifact ?? {};
  const analysis = msg.analysis ?? {};

  const vapiCallId: string | undefined = pick(call.id, msg.callId);
  const direction = pick(call.type, msg.type);
  const fromNumber = pick(call?.customer?.number, msg?.customer?.number);
  const toNumber = pick(msg?.phoneNumber?.number, call?.phoneNumber?.number);
  const startedAt = pick(msg.startedAt, call.startedAt);
  const endedAt = pick(msg.endedAt, call.endedAt);
  const endedReason = pick(msg.endedReason);
  const durationSeconds = pick<number>(
    msg.durationSeconds,
    typeof msg.durationMs === "number" ? msg.durationMs / 1000 : undefined,
  );
  const transcript = pick<string>(artifact.transcript, msg.transcript) ?? "";
  const summary = pick<string>(analysis.summary, msg.summary) ?? "";
  const recordingUrl = pick<string>(
    artifact.recordingUrl,
    artifact?.recording?.combinedUrl,
    msg.recordingUrl,
  );
  const structured = pick(analysis.structuredData, analysis.structuredOutputs, msg.structuredOutputs) ?? null;
  const cost = pick<number>(msg.cost);

  // 1) Copy the recording into Supabase Storage (best-effort).
  let recordingPath: string | null = null;
  let signedRecordingUrl: string | null = null;
  if (recordingUrl && vapiCallId) {
    try {
      const res = await fetch(recordingUrl);
      if (res.ok) {
        const contentType = res.headers.get("content-type") ?? "audio/wav";
        const ext = contentType.includes("mpeg") || recordingUrl.includes(".mp3") ? "mp3" : "wav";
        const path = `${vapiCallId}.${ext}`;
        const bytes = new Uint8Array(await res.arrayBuffer());
        const up = await supabase.storage
          .from(RECORDINGS_BUCKET)
          .upload(path, bytes, { contentType, upsert: true });
        if (!up.error) {
          recordingPath = path;
          const signed = await supabase.storage
            .from(RECORDINGS_BUCKET)
            .createSignedUrl(path, 60 * 60 * 24 * 30); // 30 days
          signedRecordingUrl = signed.data?.signedUrl ?? null;
        } else {
          console.error("recording upload failed", up.error.message);
        }
      } else {
        console.error("recording fetch failed", res.status);
      }
    } catch (e) {
      console.error("recording copy error", (e as Error).message);
    }
  }

  // 2) Store the call row (idempotent on vapi_call_id).
  const row = {
    vapi_call_id: vapiCallId ?? null,
    direction: direction ?? null,
    phone_number_from: fromNumber ?? null,
    phone_number_to: toNumber ?? null,
    started_at: startedAt ?? null,
    ended_at: endedAt ?? null,
    duration_seconds: durationSeconds ?? null,
    ended_reason: endedReason ?? null,
    summary: summary || null,
    transcript: transcript || null,
    recording_url: recordingUrl ?? null,
    recording_path: recordingPath,
    structured,
    cost: cost ?? null,
    raw: body,
  };

  const { error: dbError } = await supabase
    .from("call_logs")
    .upsert(row, { onConflict: "vapi_call_id" });
  if (dbError) console.error("call_logs upsert failed", dbError.message);

  // 3) Email hello@fabsy.ca for every call.
  try {
    const mins = durationSeconds ? `${Math.floor(durationSeconds / 60)}m ${Math.round(durationSeconds % 60)}s` : "n/a";
    const recordingLink = signedRecordingUrl || recordingUrl || "";
    const subject = `New Fabsy call${fromNumber ? ` from ${fromNumber}` : ""} (${mins})`;
    const html = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#111;line-height:1.5">
        <h2 style="margin:0 0 12px">New call to the Fabsy line</h2>
        <table style="border-collapse:collapse">
          <tr><td style="padding:2px 12px 2px 0;color:#555">From</td><td><strong>${esc(fromNumber) || "Unknown"}</strong></td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#555">To</td><td>${esc(toNumber) || "n/a"}</td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#555">Direction</td><td>${esc(direction) || "n/a"}</td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#555">Duration</td><td>${esc(mins)}</td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#555">Ended</td><td>${esc(endedReason) || "n/a"}</td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#555">Call ID</td><td>${esc(vapiCallId) || "n/a"}</td></tr>
        </table>
        ${summary ? `<h3 style="margin:16px 0 6px">Summary</h3><p>${esc(summary)}</p>` : ""}
        ${recordingLink ? `<p style="margin:16px 0"><a href="${recordingLink}" style="color:#2563eb">Listen to the recording</a> (link valid ~30 days)</p>` : ""}
        ${transcript ? `<h3 style="margin:16px 0 6px">Transcript</h3><pre style="white-space:pre-wrap;background:#f6f7f9;padding:12px;border-radius:8px;font-family:inherit">${esc(transcript)}</pre>` : ""}
        ${getFabsyEmailSignature ? getFabsyEmailSignature() : ""}
      </div>`;

    await resend.emails.send({ from: EMAIL_FROM, to: [NOTIFY_TO], subject, html });
  } catch (e) {
    console.error("email send failed", (e as Error).message);
  }

  return json({ ok: true, stored: Boolean(vapiCallId), recording_saved: Boolean(recordingPath) });
});
