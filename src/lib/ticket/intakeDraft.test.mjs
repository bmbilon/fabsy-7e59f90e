import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "fabsy-intake-draft-test-"));
const outfile = path.join(temporary, "intakeDraft.mjs");
const createPaymentSource = await fs.readFile(new URL("../../../supabase/functions/create-payment/index.ts", import.meta.url), "utf8");
await build({
  entryPoints: [new URL("./intakeDraft.ts", import.meta.url).pathname],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
  plugins: [{
    name: "offline-supabase",
    setup(builder) {
      builder.onResolve({ filter: /integrations\/supabase\/client$/ }, () => ({ path: "supabase", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({
        loader: "js",
        contents: "export const supabase = { functions: { invoke() { throw new Error('network forbidden'); } }, storage: { from() { throw new Error('network forbidden'); } } };",
      }));
    },
  }],
});
const draft = await import(pathToFileURL(outfile).href);

test("serializes only the server allowlist and excludes sensitive browser state", () => {
  const issueDate = new Date("2026-08-14T18:00:00.000Z");
  const serialized = draft.serializeIntakeDraftData({
    email: "driver@example.test",
    phone: "4035550123",
    ticketNumber: "TEST-1",
    issueDate,
    consentGiven: true,
    digitalSignature: "Private Signature",
    sourceAssessmentAccessToken: "secret",
    referral: { attributionToken: "secret" },
    ticketImage: { name: "ticket.pdf" },
    driversLicenseImage: { name: "licence.jpg" },
    unexpected: "discard me",
  });

  assert.deepEqual(serialized, {
    email: "driver@example.test",
    phone: "4035550123",
    ticketNumber: "TEST-1",
    issueDate: issueDate.toISOString(),
  });
  for (const forbidden of ["consentGiven", "digitalSignature", "sourceAssessmentAccessToken", "referral", "ticketImage", "driversLicenseImage", "unexpected"]) {
    assert.equal(forbidden in serialized, false);
  }
});

test("hydrates saved dates and always requires fresh representation consent", () => {
  const hydrated = draft.hydrateIntakeDraftData({
    firstName: "Test",
    issueDate: "2026-08-14T18:00:00.000Z",
    courtDate: "not-a-date",
    consentGiven: true,
    digitalSignature: "should never arrive",
  });
  assert.equal(hydrated.firstName, "Test");
  assert.ok(hydrated.issueDate instanceof Date);
  assert.equal(hydrated.courtDate, undefined);
  assert.equal(hydrated.consentGiven, false);
  assert.equal(hydrated.digitalSignature, "");
});

test("resume links keep the bearer token in the fragment and strip it after use", () => {
  const token = "a".repeat(64);
  assert.equal(draft.resumeTokenFromHash(`#resume=${token}&section=ticket`), token);
  assert.equal(draft.stripResumeTokenFromUrl({ pathname: "/submit-ticket", search: "?ticket_type=officer_issued", hash: `#resume=${token}&section=ticket` }), "/submit-ticket?ticket_type=officer_issued#section=ticket");
  const url = draft.resumeUrl({
    draftId: "550e8400-e29b-41d4-a716-446655440000",
    accessToken: token,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }, { origin: "https://fabsy.test", pathname: "/submit-ticket" });
  assert.equal(url, `https://fabsy.test/submit-ticket#resume=${token}`);
  assert.equal(new URL(url).search, "");
  const localizedUrl = draft.resumeUrl({
    draftId: "550e8400-e29b-41d4-a716-446655440000",
    accessToken: token,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }, { origin: "https://fabsy.test", pathname: "/pa/submit-ticket" });
  assert.equal(localizedUrl, `https://fabsy.test/pa/submit-ticket#resume=${token}`);
});

test("stored capabilities reject malformed and expired bearer tokens", () => {
  let raw = JSON.stringify({
    draftId: "550e8400-e29b-41d4-a716-446655440000",
    accessToken: "b".repeat(64),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  let removed = false;
  const storage = { getItem: () => raw, removeItem: () => { removed = true; } };
  assert.equal(draft.readStoredIntakeDraft(storage).accessToken, "b".repeat(64));
  raw = JSON.stringify({ ...JSON.parse(raw), expiresAt: "2020-01-01T00:00:00.000Z" });
  assert.equal(draft.readStoredIntakeDraft(storage), null);
  assert.equal(removed, true);
});

test("Stripe cancellation returns only an opaque draft id, never a bearer capability", () => {
  const cancelUrl = createPaymentSource.split("\n").find(line => line.includes("cancel_url:"));
  assert.ok(cancelUrl, "create-payment must define an explicit cancellation URL");
  assert.match(cancelUrl, /\?draft=/);
  assert.match(cancelUrl, /draftId/);
  assert.doesNotMatch(cancelUrl, /accessToken|capability|resume=/i);
});

test.after(async () => fs.rm(temporary, { recursive: true, force: true }));
