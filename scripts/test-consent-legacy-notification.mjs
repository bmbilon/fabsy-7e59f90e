import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { resolve } from "node:path";
import { build } from "esbuild";

// Execute the existing notification handler with every external boundary mocked.
const root = resolve(import.meta.dirname, "..");
const compiled = await build({
  absWorkingDir: root, entryPoints: ["supabase/functions/send-notification/index.ts"],
  bundle: true, write: false, platform: "neutral", format: "cjs", logLevel: "silent",
  plugins: [{ name: "offline-notification", setup(bundler) {
    bundler.onResolve({ filter: /^https:\/\/deno\.land\/std@0\.190\.0\/http\/server\.ts$/ }, () => ({ path: "serve", namespace: "offline" }));
    bundler.onResolve({ filter: /^npm:resend@2\.0\.0$/ }, () => ({ path: "resend", namespace: "offline" }));
    bundler.onResolve({ filter: /^https:\/\/esm\.sh\/@supabase\/supabase-js@/ }, () => ({ path: "database", namespace: "offline" }));
    bundler.onLoad({ filter: /.*/, namespace: "offline" }, ({ path }) => ({ loader: "js", contents:
      path === "serve" ? "export const serve = handler => { globalThis.__handler = handler; };"
      : path === "resend" ? "export class Resend { emails = { send: body => globalThis.__send(body) }; }"
      : "export const createClient = () => globalThis.__database;" }));
  } }],
});
const submissionId = "00000000-0000-4000-8000-000000000001";
const token = "a".repeat(64);
const tokenHash = Buffer.from(await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(token))).toString("hex");
async function run(options = {}) {
  const messages = [], sms = [], finishes = [], reads = [];
  let downloads = 0;
  const submission = { id: submissionId, first_name: "Test", last_name: "Person", email: "client@example.test", phone: "+14035550100", ticket_number: "E12345678T", violation: "Test", fine_amount: 100, created_at: "2026-09-20T18:00:00Z", sms_opt_in: options.smsOptIn === true, status: "awaiting_payment", service_type: "representation", consent_form_path: `${submissionId}/consent.pdf`, representation_access_token_hash: tokenHash, preferred_locale: "en", ...options.submission };
  const claim = { acquired: true, status: "sending", ...(Object.hasOwn(options, "owner") ? { clientEmailOwner: options.owner } : {}), ...options.claim };
  const database = {
    from(table) { reads.push(table); return { select() { return this; }, eq() { return this; }, maybeSingle() { return Promise.resolve({ data: table === "ticket_submissions" ? submission : null, error: null }); } }; },
    rpc(name, args) {
      if (name === "claim_ticket_submission_notification") return Promise.resolve({ data: options.claimFailure ? null : claim, error: options.claimFailure ? { message: "synthetic claim failure" } : null });
      if (name === "finish_ticket_submission_notification") { finishes.push(args); return Promise.resolve({ data: true, error: null }); }
      throw new Error("Unexpected offline RPC");
    },
    storage: { from() { return { download() { downloads++; return Promise.resolve(options.pdfMissing ? { data: null, error: { message: "synthetic missing PDF" } } : { data: new Blob(["%PDF-1.7 synthetic consent"]), error: null }); } }; } },
  };
  const context = vm.createContext({
    Request, Response, URL, URLSearchParams, TextEncoder, TextDecoder, Blob, AbortSignal,
    crypto: webcrypto, btoa, atob, setTimeout: callback => { callback(); return 1; }, clearTimeout() {},
    console: { log() {}, error() {}, warn() {} },
    Deno: { env: { get: key => key === "SITE_URL" ? "https://fabsy.ca" : "synthetic-value" } },
    __database: database,
    __send: async message => { messages.push(message); return { data: { id: `synthetic-${messages.length}` }, error: null }; },
    fetch: async (url, init) => {
      assert.equal(new URL(String(url)).hostname, "api.twilio.com");
      sms.push(Object.fromEntries(new URLSearchParams(init.body)));
      return Response.json({ sid: `SM${"a".repeat(32)}`, status: "accepted" });
    },
  });
  vm.runInContext(compiled.outputFiles[0].text, context);
  const response = await context.__handler(new Request("https://fabsy.example.test/notification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ submissionId, accessToken: token }) }));
  return { status: response.status, body: await response.json(), messages, sms, finishes, downloads, reads };
}

for (const owner of [undefined, "legacy"]) {
  test(`legacy owner ${String(owner)} preserves consent attachment and admin/client channels`, async () => {
    const result = await run(owner === undefined ? {} : { owner });
    assert.equal(result.status, 200); assert.equal(result.messages.length, 2);
    assert.deepEqual(Array.from(result.messages[0].to), ["hello@fabsy.ca"]);
    assert.equal(result.messages[0].subject, "Ticket E12345678T — Payment pending");
    assert.deepEqual(Array.from(result.messages[1].to), ["client@example.test"]);
    assert.equal(result.messages[1].attachments.length, 1); assert.equal(result.downloads, 1);
    assert.equal(result.finishes[0].p_status, "sent");
  });
}

test("welcome-owned client email skips PDF and client provider call while admin/SMS continue", async () => {
  const result = await run({ owner: "consent_welcome", smsOptIn: true });
  assert.equal(result.status, 200); assert.equal(result.messages.length, 1); assert.equal(result.downloads, 0);
  assert.equal(result.body.clientEmailDeferredToConsentWelcome, true);
  assert.equal(result.sms.length, 2);
  assert.match(result.sms[1].Body, /^Ticket E12345678T:/);
  assert.match(result.sms[1].Body, /will arrive by email/);
  assert.doesNotMatch(result.sms[1].Body, /We've emailed/);
  assert.equal(result.reads.includes("consent_welcome_notifications"), false);
});

test("unknown owner and failed claim cannot send client or staff messages", async () => {
  for (const options of [{ owner: null }, { owner: "unexpected" }, { claimFailure: true }]) {
    const result = await run(options);
    assert.equal(result.status, 500); assert.equal(result.messages.length, 0); assert.equal(result.sms.length, 0);
    assert.equal(result.downloads, 0);
  }
});

test("existing whole-bundle history is deduplicated without another provider attempt", async () => {
  for (const status of ["sent", "indeterminate", "sending"]) {
    const result = await run({ claim: { acquired: false, status } });
    assert.equal(result.status, 200); assert.equal(result.body.deduplicated, true);
    assert.equal(result.messages.length, 0); assert.equal(result.sms.length, 0); assert.equal(result.downloads, 0);
  }
});

test("missing stored ticket holds notification before any provider request", async () => {
  const result = await run({ submission: { ticket_number: "" } });
  assert.equal(result.status, 409); assert.equal(result.messages.length, 0); assert.equal(result.sms.length, 0);
});

test("legacy missing consent file never sends a client email and fences partial bundle", async () => {
  const result = await run({ owner: "legacy", pdfMissing: true });
  assert.equal(result.status, 500); assert.equal(result.messages.length, 1);
  assert.deepEqual(Array.from(result.messages[0].to), ["hello@fabsy.ca"]);
  assert.equal(result.downloads, 3); assert.equal(result.finishes[0].p_status, "indeterminate");
});
