// Repository-standard pinned test assertions.
// deno-lint-ignore no-import-prefix
import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { handler } from "./index.ts";

const settings = { SUPABASE_URL: "https://welcome.example.test", SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key", IDR_CRON_SECRET: "synthetic-cron-".repeat(3), RESEND_API_KEY: "synthetic-resend", STRIPE_SECRET_KEY: "synthetic-stripe" };
async function isolated(run: () => Promise<void>) {
  const original = globalThis.fetch; const saved = Object.fromEntries(Object.keys(settings).map(key => [key, Deno.env.get(key)]));
  for (const [key, value] of Object.entries(settings)) Deno.env.set(key, value);
  try { await run(); } finally { globalThis.fetch = original; for (const [key, value] of Object.entries(saved)) if (value === undefined) Deno.env.delete(key); else Deno.env.set(key, value); }
}
const request = (body = {}, authorized = true) => new Request("https://worker.example.test", { method: "POST", headers: authorized ? { "x-cron-secret": settings.IDR_CRON_SECRET } : {}, body: JSON.stringify(body) });
Deno.test("welcome unauthorized and config-only dryrun never claim, inspect clients, or send", () => isolated(async () => {
  globalThis.fetch = () => { throw new Error("network forbidden"); };
  assertEquals((await handler(request({}, false))).status, 401);
  const response = await handler(request({ dryRun: true })); assertEquals(response.status, 200);
  assertEquals(await response.json(), { ok: true, dryRun: true, databaseConfigured: true, emailConfigured: true, paymentReadConfigured: true });
}));
Deno.test("zero-job worker success persists health", () => isolated(async () => {
  const calls: string[] = [];
  globalThis.fetch = (input, options) => {
    const route = new URL(String(input)).pathname; calls.push(route);
    if (route.endsWith("claim_consent_welcome_notifications")) return Promise.resolve(Response.json([]));
    if (route.endsWith("record_consent_welcome_worker_health")) { assertEquals(JSON.parse(String(options?.body)).p_error, null); return Promise.resolve(new Response(null, { status: 204 })); }
    throw new Error("Unexpected call");
  };
  const response = await handler(request()); assertEquals(response.status, 200); assertEquals(calls.length, 2);
}));
Deno.test("missing email configuration records failure without claiming", () => isolated(async () => {
  Deno.env.delete("RESEND_API_KEY");
  globalThis.fetch = (input, options) => {
    assertEquals(new URL(String(input)).pathname.endsWith("record_consent_welcome_worker_health"), true);
    assertEquals(JSON.parse(String(options?.body)).p_error, "welcome_configuration_missing");
    return Promise.resolve(new Response(null, { status: 204 }));
  };
  assertEquals((await handler(request())).status, 503);
}));
Deno.test("worker integrates authoritative queue, actual private attachments, durable send boundary and provider receipt", () => isolated(async () => {
  const id = "10000000-0000-4000-8000-000000000001", submission = "20000000-0000-4000-8000-000000000001";
  const client = "30000000-0000-4000-8000-000000000001", claim = "40000000-0000-4000-8000-000000000001";
  const job = { id, claim_id: claim, source_type: "submission", submission_id: submission, invite_id: null };
  const context = { ...job, eligible: true, source_fingerprint: "a".repeat(64), recipient: "alex@example.test", first_name: "Alex",
    preferred_locale: "en", ticket_number: "E12345678A", client_id: client, submission_status: "awaiting_payment",
    payment_recorded: false, payment_unknown: false, checkout_sessions: [], ticket_document_owner_id: submission,
    ticket_document_bucket: "assessment-tickets", ticket_document_path: `${submission}/ticket.jpg`,
    consent_bucket: "consent-forms", consent_form_path: `${submission}/consent.pdf`, signature_method: "checkbox" };
  const pdf = "%PDF-1.7\nsynthetic-consent-copy\n%%EOF\n";
  let claimed = false, began = false, sent = false, finished = false, reads = 0;
  globalThis.fetch = (input, options) => {
    const url = new URL(String(input));
    const body = options?.body ? JSON.parse(String(options.body)) : {};
    if (url.pathname.endsWith("claim_consent_welcome_notifications")) { const rows = claimed ? [] : [job]; claimed = true; return Promise.resolve(Response.json(rows)); }
    if (url.pathname.endsWith("get_consent_welcome_context")) { assertEquals(body, { p_id: id, p_claim_id: claim }); return Promise.resolve(Response.json(context)); }
    if (url.pathname.includes("/storage/v1/object/")) { reads++; return Promise.resolve(new Response(url.pathname.includes("consent-forms") ? pdf : new Uint8Array([255, 216, 255]))); }
    if (url.pathname.endsWith("begin_consent_welcome_send")) {
      assertEquals(reads, 4); assertEquals(body.p_source_fingerprint, context.source_fingerprint);
      assertEquals(/^[a-f0-9]{64}$/.test(body.p_payload_sha256), true);
      assertEquals(body.p_attachment_fingerprints.map((entry: { path: string }) => entry.path), [`assessment-tickets/${submission}/ticket.jpg`, `consent-forms/${submission}/consent.pdf`]);
      began = true; return Promise.resolve(Response.json(true));
    }
    if (url.href === "https://api.resend.com/emails") {
      assertEquals(began, true); assertEquals(sent, false); sent = true;
      assertEquals(body.to, ["alex@example.test"]); assertEquals(body.subject, "Ticket E12345678A — Welcome and your consent copy");
      assertEquals(body.attachments.length, 1); assertEquals(atob(body.attachments[0].content), pdf);
      assertEquals(body.text.includes("Complete payment from your ticket upload screen"), true);
      assertEquals((options?.headers as Record<string, string>)["Idempotency-Key"], `consent-welcome-v1/${id}`);
      return Promise.resolve(Response.json({ id: "synthetic_provider_receipt" }));
    }
    if (url.pathname.endsWith("finish_consent_welcome_notification")) {
      assertEquals(sent, true); assertEquals(body.p_status, "sent"); assertEquals(body.p_provider_id, "synthetic_provider_receipt"); finished = true;
      return Promise.resolve(Response.json(true));
    }
    if (url.pathname.endsWith("record_consent_welcome_worker_health")) { assertEquals(finished, true); assertEquals(body.p_error, null); return Promise.resolve(new Response(null, { status: 204 })); }
    throw new Error("Unexpected provider or database request");
  };
  const response = await handler(request());
  assertEquals(response.status, 200); assertEquals(await response.json(), { ok: true, claimed: 1, sent: 1, pending: 0, failed: 0, indeterminate: 0, recordingFailed: 0 });
}));
