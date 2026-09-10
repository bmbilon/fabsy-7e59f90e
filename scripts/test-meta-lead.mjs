import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const thisFile = fileURLToPath(import.meta.url);
if (!process.execArgv.includes("--experimental-strip-types")) {
  const child = spawnSync(process.execPath, [
    "--experimental-strip-types",
    "--no-warnings",
    thisFile,
  ], { stdio: "inherit" });
  process.exit(child.status ?? 1);
}

const root = path.resolve(path.dirname(thisFile), "..");
const lead = await import(pathToFileURL(path.join(
  root,
  "supabase/functions/_shared/meta-lead.ts",
)).href);
const context = {
  consentVersion: "meta-measurement-v1",
  consentedAt: new Date().toISOString(),
  fbp: "fb.1.1788350000000.1234567890",
  fbc: "fb.1.1788350000000.click_fixture",
};
const draftId = "550e8400-e29b-41d4-a716-446655440000";
const eventTime = Math.floor(Date.now() / 1000) - 1;

assert.deepEqual(lead.parseMetaLeadContext(context), context);
for (const invalid of [
  null,
  {},
  { ...context, consentVersion: "fabsy-funnel-v1" },
  { ...context, email: "must-not-be-accepted@example.test" },
  { ...context, fbp: "bad" },
  { ...context, fbp: undefined, fbc: undefined },
]) assert.equal(lead.parseMetaLeadContext(invalid), null);

const payload = await lead.buildMetaLeadPayload({
  draftId,
  context,
  clientUserAgent: "Synthetic\nBrowser/1.0",
  eventTimeEpochSeconds: eventTime,
});
assert.deepEqual(payload, {
  data: [{
    event_name: "Lead",
    event_time: eventTime,
    event_id: crypto.createHash("sha256").update(`fabsy-lead:${draftId}`).digest("hex"),
    action_source: "website",
    event_source_url: "https://fabsy.ca/submit-ticket",
    user_data: {
      client_user_agent: "Synthetic Browser/1.0",
      fbp: context.fbp,
      fbc: context.fbc,
    },
  }],
});
assert.doesNotMatch(JSON.stringify(payload), /email|phone|ticketNumber|fineAmount/i);

let calls = 0;
const environment = {
  enabled: "true",
  pixelId: "2917050565322500",
  accessToken: "synthetic-token-never-sent",
};
const sent = await lead.deliverMetaLeadBestEffort(environment, {
  draftId,
  context,
  clientUserAgent: "Synthetic Browser/1.0",
  eventTimeEpochSeconds: eventTime,
}, async (url, options) => {
  calls += 1;
  assert.equal(url, "https://graph.facebook.com/v25.0/2917050565322500/events");
  assert.equal(options.headers.Authorization, "Bearer synthetic-token-never-sent");
  assert.deepEqual(JSON.parse(options.body), payload);
  return new Response(JSON.stringify({ events_received: 1 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
assert.equal(sent, true);
assert.equal(calls, 1);

for (const disabled of [
  { ...environment, enabled: "false" },
  { ...environment, pixelId: "2917050565322501" },
  { ...environment, accessToken: "short" },
]) {
  assert.equal(await lead.deliverMetaLeadBestEffort(disabled, {
    draftId, context, clientUserAgent: "Synthetic Browser/1.0",
  }, async () => { throw new Error("disabled delivery attempted"); }), false);
}

const migration = fs.readFileSync(path.join(
  root,
  "supabase/migrations/20260910190000_contact_first_ticket_intake.sql",
), "utf8");
assert.match(migration, /if not draft\.contact_permission then/);
assert.doesNotMatch(migration, /ticket_uploaded_at is null/);
assert.match(migration, /create or replace function public\.set_ticket_intake_follow_up_status/);
assert.match(migration, /and \(draft\.email is not null or draft\.phone is not null\)/);

const adminQueue = fs.readFileSync(path.join(
  root,
  "src/pages/AdminCaseManagement.tsx",
), "utf8");
assert.doesNotMatch(adminQueue, /\.not\('ticket_uploaded_at', 'is', null\)/);
assert.match(adminQueue, /Ticket not uploaded/);

const resumeDelivery = fs.readFileSync(path.join(
  root,
  "supabase/functions/_shared/ticket-intake-resume-delivery.ts",
), "utf8");
assert.match(resumeDelivery, /Your Fabsy intake is saved/);
assert.match(resumeDelivery, /Add your Alberta ticket to continue/);

const endpoint = fs.readFileSync(path.join(
  root,
  "supabase/functions/ticket-intake-draft/index.ts",
), "utf8");
assert.match(endpoint, /const hasFile = body\.file !== undefined/);
assert.match(endpoint, /deliverMetaLeadBestEffort/);
assert.match(endpoint, /safeAttemptResumeDelivery\([\s\S]*?accessTokenHash,[\s\S]*?false/);
assert.match(endpoint, /ticketUploaded: Boolean\(claimed\.ticket_uploaded_at\)/);

console.log("Meta Lead contract passed: contact-first draft, separate consent, PII-free payload, deterministic dedupe and immediate resume delivery.");
