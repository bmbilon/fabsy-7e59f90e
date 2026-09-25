import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

// Bundle the pure Deno modules for Node. They import nothing remote.
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "fabsy-ltb-intake-test-"));
async function load(relative) {
  const outfile = path.join(temporary, `${path.basename(relative, ".ts")}.mjs`);
  await build({
    entryPoints: [new URL(`../${relative}`, import.meta.url).pathname],
    outfile, bundle: true, format: "esm", platform: "node", logLevel: "silent",
  });
  return import(pathToFileURL(outfile).href);
}
const core = await load("supabase/functions/_shared/ltb-intake-core.ts");
const alert = await load("supabase/functions/_shared/ltb-intake-alert.ts");
const funnel = await load("src/lib/admin/ltbFunnel.ts");

const form = (overrides = {}) => ({
  action: "submit", name: "Mary Anne Landlord", email: "Mary@Example.COM", phone: "(905) 555-0100",
  city: "Hamilton", issue: "arrears", owed: "$2,400", served: "yes", notes: "Two months behind",
  company: "", elapsedMs: 9000, files: [{ name: "C:\\fakepath\\lease.jpg", contentType: "image/jpeg", size: 1200 }],
  ...overrides,
});

test("submission: normalizes identity fields and file specs", () => {
  const parsed = core.parseLtbSubmission(form());
  assert.equal(parsed.firstName, "Mary Anne");
  assert.equal(parsed.lastName, "Landlord");
  assert.equal(parsed.email, "mary@example.com");
  assert.equal(parsed.phone, "9055550100");
  assert.equal(parsed.practiceId, "anderhue-paralegal");
  assert.deepEqual(parsed.files, [{ name: "lease.jpg", contentType: "image/jpeg", extension: "jpg", size: 1200 }]);
  assert.equal(parsed.bot, false);
});

test("submission: rejects bad email, bad files, too many files; flags bots", () => {
  assert.throws(() => core.parseLtbSubmission(form({ email: "nope" })), error => error.status === 422);
  assert.throws(() => core.parseLtbSubmission(form({ files: [{ contentType: "text/html", size: 10 }] })), /10 MB/);
  assert.throws(() => core.parseLtbSubmission(form({ files: [{ contentType: "image/png", size: 11 * 1024 * 1024 }] })), /10 MB/);
  assert.throws(() => core.parseLtbSubmission(form({ files: Array(7).fill({ contentType: "image/png", size: 5 }) })), /up to 6/);
  assert.equal(core.parseLtbSubmission(form({ company: "Acme" })).bot, true);
  assert.equal(core.parseLtbSubmission(form({ elapsedMs: 400 })).bot, true);
  assert.equal(core.parseLtbSubmission(form({ issue: "rm -rf", served: "maybe" })).issue, "other");
});

test("extraction: maps kinds, money, dates and confidence; never keeps unknown keys", () => {
  const extraction = core.normalizeLtbExtraction("doc-1", {
    document_kind: "n4_notice", rental_unit_address: "12 King St W, Unit 3", rental_unit_city: "Hamilton",
    tenant_names: ["Tom Tenant", "", null], arrears_total: "2,400.00", notice_served_date: "2026-10-01",
    notice_service_method: "Mail", notice_termination_date: "2026-10-31", rent_amount: 1200,
    rent_period: "Monthly", rent_due_day: 1, lease_start_date: "2025-02-30", id_number: "A1234-56789",
    low_confidence_fields: ["arrears_total", "made_up"], notes: "Signed by agent",
  });
  assert.equal(extraction.kind, "notice");
  assert.equal(extraction.fields.noticeForm, "N4");
  assert.equal(extraction.fields.arrearsCents, 240000);
  assert.equal(extraction.fields.rentCents, 120000);
  assert.equal(extraction.fields.rentPeriod, "monthly");
  assert.equal(extraction.fields.noticeServiceMethod, "mail");
  assert.equal(extraction.fields.leaseStartDate, null, "invalid calendar date dropped");
  assert.deepEqual(extraction.fields.tenantNames, ["Tom Tenant"]);
  assert.deepEqual(extraction.lowConfidence, ["arrearsCents"]);
  assert.equal(JSON.stringify(extraction).includes("A1234"), false, "ID numbers are never retained");
});

test("N4 dates: 7 days after Sept 21 2026, mail adds 5, older notices keep 14", () => {
  assert.equal(core.n4EarliestTermination("2026-10-01", "hand", "monthly"), "2026-10-08");
  assert.equal(core.n4EarliestTermination("2026-10-01", "mail", "monthly"), "2026-10-13");
  assert.equal(core.n4EarliestTermination("2026-09-10", "hand", "monthly"), "2026-09-24");
  assert.equal(core.n4EarliestTermination("2026-09-10", "hand", "weekly"), "2026-09-17");
  assert.equal(core.n4EarliestTermination("2026-10-01", "courier", "monthly"), null);
  assert.equal(core.l1EarliestFiling("2026-10-08"), "2026-10-09");
});

const caseState = (overrides = {}) => ({
  issue: "arrears", rental_unit_address: null, unit_city: "Hamilton", tenant_names: [], rent_amount_cents: null,
  rent_period: null, rent_due_day: null, lease_start_date: null, arrears_claimed_cents: null, notice_form: null,
  notice_served_on: null, notice_service_method: null, notice_termination_date: null, hearing_date: null,
  field_sources: { unit_city: { source: "form" } }, ...overrides,
});
const client = (overrides = {}) => ({
  registration_status: "provisional", client_type: "individual", first_name: "Mary Anne", last_name: "Landlord",
  organization_name: null, phone: "9055550100", mailing_address: null, city: "Hamilton", province: null,
  postal_code: null, identity_document_type: null, field_sources: {}, ...overrides,
});
const lease = core.normalizeLtbExtraction("lease-1", {
  document_kind: "lease", landlord_name: "Mary Anne Landlord", landlord_address: "88 Bay St", landlord_city: "Hamilton",
  landlord_province: "ON", landlord_postal_code: "L8P 1A1", rental_unit_address: "12 King St W, Unit 3",
  rental_unit_city: "Hamilton", tenant_names: ["Tom Tenant"], rent_amount: 1200, rent_period: "monthly",
  rent_due_day: 1, lease_start_date: "2025-03-01",
});
const n4 = core.normalizeLtbExtraction("n4-1", {
  document_kind: "n4_notice", rental_unit_address: "12 King St W, Unit 3", tenant_names: ["Tom Tenant"],
  arrears_total: 2400, notice_served_date: "2026-10-01", notice_service_method: "hand",
  notice_termination_date: "2026-10-08",
});

test("merge: complete lease + N4 fills empty fields and is ready for review", () => {
  const result = core.mergeLtbIntake({ caseState: caseState(), client: client(), extractions: [lease, n4], unreadDocuments: [] });
  assert.equal(result.reviewStatus, "ready", result.notes.join("\n"));
  assert.equal(result.casePatch.rental_unit_address, "12 King St W, Unit 3");
  assert.equal(result.casePatch.arrears_claimed_cents, 240000);
  assert.equal(result.casePatch.rent_amount_cents, 120000);
  assert.equal(result.casePatch.notice_form, "N4");
  assert.equal(result.casePatch.unit_city, undefined, "form value kept");
  assert.equal(result.clientPatch.mailing_address, "88 Bay St");
  assert.equal(result.clientPatch.postal_code, "L8P 1A1");
  assert.equal(result.casePatch.field_sources.arrears_claimed_cents.documentId, "n4-1");
  assert.equal(result.casePatch.field_sources.unit_city.source, "form");
  assert.match(result.notes[0], /Nothing here has been confirmed by the client/);
});

test("merge: registered client identity is never changed by uploads", () => {
  const id = core.normalizeLtbExtraction("id-1", { document_kind: "government_id", id_first_name: "Someone",
    id_last_name: "Else", id_address: "1 Other Rd" });
  const result = core.mergeLtbIntake({
    caseState: caseState(), client: client({ registration_status: "registered", mailing_address: null }),
    extractions: [id, lease, n4], unreadDocuments: [],
  });
  assert.deepEqual(result.clientPatch, {});
  assert.ok(result.notes.some(note => /Returning registered client/.test(note)));
});

test("merge: conflicts, low confidence, PDFs and short N4 dates go to needs_review", () => {
  const torontoLease = core.normalizeLtbExtraction("lease-2", { document_kind: "lease",
    rental_unit_address: "5 Queen St", rental_unit_city: "Toronto", rent_amount: 1200 });
  const conflict = core.mergeLtbIntake({ caseState: caseState(), client: client(), extractions: [torontoLease, n4], unreadDocuments: [] });
  assert.equal(conflict.reviewStatus, "needs_review");
  assert.ok(conflict.notes.some(note => /Conflict: .*rental unit city/.test(note)), conflict.notes.join("\n"));

  const shortN4 = core.normalizeLtbExtraction("n4-2", { document_kind: "n4_notice", notice_served_date: "2026-10-01",
    notice_service_method: "mail", notice_termination_date: "2026-10-08", arrears_total: 2400,
    rental_unit_address: "12 King St W, Unit 3", low_confidence_fields: ["arrears_total"] });
  const flagged = core.mergeLtbIntake({ caseState: caseState(), client: client(), extractions: [lease, shortN4],
    unreadDocuments: [{ documentId: "ledger.pdf", reason: "pdf" }] });
  assert.equal(flagged.reviewStatus, "needs_review");
  assert.ok(flagged.notes.some(note => /earlier than the minimum 2026-10-13/.test(note)));
  assert.ok(flagged.notes.some(note => /Low confidence: arrears/.test(note)));
  assert.ok(flagged.notes.some(note => /1 PDF not read automatically/.test(note)));
});

test("merge: a lease naming a company prompts an organization check", () => {
  const corpLease = core.normalizeLtbExtraction("lease-3", { document_kind: "lease",
    landlord_organization: "Bayfront Holdings Inc.", rental_unit_address: "12 King St W" });
  const result = core.mergeLtbIntake({ caseState: caseState(), client: client(), extractions: [corpLease], unreadDocuments: [] });
  assert.ok(result.notes.some(note => /Bayfront Holdings Inc\..*authorized to instruct/.test(note)));
});

const snapshot = (overrides = {}) => ({
  caseId: "8f14e45f-ceea-4e7a-9a3b-2c6f1d7e9a10", caseNumber: "LTB-2026-0001", practiceId: "anderhue-paralegal",
  practiceName: "AnderHue Paralegal Professional Corporation", adminBaseUrl: "https://fabsy.ca",
  recipients: ["info@onlineparalegals.ca", "brett@execom.ca"], clientName: "Mary <b>Landlord</b>",
  email: "mary@example.com", phone: "9055550100", issue: "arrears", noticeServed: "yes", unitCity: "Hamilton",
  arrearsClaimedCents: 240000, reviewStatus: "ready", reviewNotes: "Line one\nLine two", documentCount: 2,
  createdAt: "2026-10-02T14:00:00Z", ...overrides,
});

test("alert: renders escaped summary, practice recipients and deep link", () => {
  const email = alert.renderLtbAlertEmail({ id: "a1", case_id: "c1", claim_id: "k1", case_snapshot: snapshot() });
  assert.deepEqual(email.to, ["info@onlineparalegals.ca", "brett@execom.ca"]);
  assert.equal(email.subject, "New LTB file LTB-2026-0001 · Unpaid rent · Hamilton");
  assert.ok(email.html.includes("Mary &lt;b&gt;Landlord&lt;/b&gt;"));
  assert.ok(email.html.includes("$2,400.00"));
  assert.ok(email.html.includes("https://fabsy.ca/admin/ltb/cases/8f14e45f-ceea-4e7a-9a3b-2c6f1d7e9a10"));
  const review = alert.renderLtbAlertEmail({ id: "a1", case_id: "c1", claim_id: "k1", case_snapshot: snapshot({ reviewStatus: "needs_review" }) });
  assert.match(review.subject, /needs review$/);
});

test("alert: worker sends once, retries transient errors, refuses changed recipients", async () => {
  const finished = [];
  const alerts = [
    { id: "a1", case_id: "c1", claim_id: "k1", case_snapshot: snapshot() },
    { id: "a2", case_id: "c2", claim_id: "k2", case_snapshot: snapshot() },
    { id: "a3", case_id: "c3", claim_id: "k3", case_snapshot: snapshot() },
  ];
  const result = await alert.processLtbIntakeAlerts({
    claim: async () => alerts,
    freeze: async (row, email) => row.id === "a3" ? { ...email, to: ["old@example.com", "brett@execom.ca"] } : email,
    send: async (_email, id) => {
      if (id === "a2") throw new alert.LtbAlertSendError("provider_http_503");
      return `em_${id}`;
    },
    finish: async (row, status, providerId, code) => { finished.push([row.id, status, providerId, code]); return true; },
  });
  assert.deepEqual(finished, [
    ["a1", "sent", "em_a1", null],
    ["a2", "retry", null, "provider_http_503"],
    ["a3", "failed", null, "recipient_policy_changed"],
  ]);
  assert.equal(result.sent, 1);
});

test("alert: provider call carries a stable idempotency key", async () => {
  let seen;
  const id = await alert.sendLtbAlertEmail("key", { from: "f", to: ["a@b.co"], subject: "s", html: "h" }, "a9",
    async (_url, init) => { seen = init.headers["Idempotency-Key"]; return new Response(JSON.stringify({ id: "em_1" }), { status: 200 }); });
  assert.equal(id, "em_1");
  assert.equal(seen, "ltb-intake/a9");
  await assert.rejects(alert.sendLtbAlertEmail("key", { from: "f", to: ["a@b.co"], subject: "s", html: "h" }, "a9",
    async () => new Response("{}", { status: 422 })), error => error.permanent === true);
});

test("funnel: groups by stage, flags review and file-ready N4 cases", () => {
  const rows = [
    { id: "1", case_number: "LTB-2026-0001", stage: "new_intake", issue: "arrears", intake_review_status: "needs_review",
      notice_form: null, notice_termination_date: null, returning_client: false, unit_city: "Hamilton",
      arrears_claimed_cents: 240000, arrears_reported_text: null, created_at: "2026-10-02T14:00:00Z",
      stage_changed_at: "2026-10-02T14:00:00Z", ltb_clients: { first_name: "Mary", last_name: "Landlord", organization_name: null, email: "m@x.co", phone: "1", registration_status: "provisional" } },
    { id: "2", case_number: "LTB-2026-0002", stage: "notice_served", issue: "arrears", intake_review_status: "ready",
      notice_form: "N4", notice_termination_date: "2026-10-08", returning_client: true, unit_city: "Oshawa",
      arrears_claimed_cents: null, arrears_reported_text: "$900", created_at: "2026-10-01T14:00:00Z",
      stage_changed_at: "2026-10-03T14:00:00Z", ltb_clients: { first_name: null, last_name: null, organization_name: "Bayfront Holdings", email: "b@x.co", phone: null, registration_status: "registered" } },
  ];
  const cards = funnel.buildLtbBoard(rows, "2026-10-09");
  assert.equal(cards.find(card => card.id === "1").flags.includes("Needs review"), true);
  const ready = cards.find(card => card.id === "2");
  assert.equal(ready.name, "Bayfront Holdings");
  assert.ok(ready.flags.includes("Ready to file L1"));
  assert.equal(ready.amount, "$900");
  assert.equal(funnel.buildLtbBoard(rows, "2026-10-08").find(card => card.id === "2").flags.includes("Ready to file L1"), false);
  assert.equal(funnel.filterLtbCards(cards, "bayfront").length, 1);
  assert.equal(funnel.torontoToday(new Date("2026-10-09T03:30:00Z")), "2026-10-08");
});

// ---------------------------------------------------------------------------
// ltb-intake handler, with Deno and Supabase replaced by in-memory fakes.
// ---------------------------------------------------------------------------
const calls = [];
globalThis.Deno = { env: { get: key => ({ SUPABASE_URL: "https://project.test", SUPABASE_SERVICE_ROLE_KEY: "service",
  LTB_ALLOWED_ORIGINS: "https://anderhue-paralegal.vercel.app", LOVABLE_API_KEY: "" })[key] } };
globalThis.__ltbFakeAdmin = {
  rpc: async (name, args) => {
    calls.push([name, args]);
    if (name === "ltb_register_intake") {
      if (args.p_intake.email === "broken@example.com") return { data: null, error: { code: "XX000" } };
      return { data: [{ case_id: "8f14e45f-ceea-4e7a-9a3b-2c6f1d7e9a10", client_id: "c1", case_number: "LTB-2026-0009", returning_client: false }], error: null };
    }
    if (name === "ltb_finalize_intake") return { data: "needs_review", error: null };
    return { data: null, error: null };
  },
  storage: { from: () => ({
    createSignedUploadUrl: async path => ({ data: { signedUrl: `https://project.test/storage/v1/object/upload/sign/ltb-documents/${path}?token=t`, token: "t" }, error: null }),
    list: async () => ({ data: [{ name: "aaaaaaaa-0000-4000-8000-000000000001.jpg" }], error: null }),
  }) },
  functions: { invoke: async () => ({ data: null, error: null }) },
  from: () => { throw new Error("unexpected table access"); },
};
const handlerOut = path.join(temporary, "ltb-intake-handler.mjs");
await build({
  entryPoints: [new URL("../supabase/functions/ltb-intake/index.ts", import.meta.url).pathname],
  outfile: handlerOut, bundle: true, format: "esm", platform: "node", logLevel: "silent",
  plugins: [{ name: "deno-remote-fakes", setup(builder) {
    builder.onResolve({ filter: /^https:\/\// }, args => ({ path: args.path, namespace: "fake" }));
    builder.onLoad({ filter: /.*/, namespace: "fake" }, args => ({
      contents: args.path.includes("supabase-js")
        ? "export const createClient = () => globalThis.__ltbFakeAdmin;"
        : "export const serve = () => {};",
      loader: "js",
    }));
  } }],
});
const { handler } = await import(pathToFileURL(handlerOut).href);
const origin = "https://anderhue-paralegal.vercel.app";
const request = (body, headers = { origin }) => new Request("https://project.test/functions/v1/ltb-intake", {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
});

test("handler: CORS allowlist, bots and bad input never reach the database", async () => {
  const preflight = await handler(new Request("https://x.test", { method: "OPTIONS", headers: { origin } }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  assert.equal((await handler(request(form(), { origin: "https://evil.test" }))).status, 403);
  const bot = await handler(request(form({ company: "spam" })));
  assert.deepEqual(await bot.json(), { ok: true, caseId: null, caseNumber: null, intakeToken: null, uploads: [] });
  assert.equal((await handler(request(form({ email: "nope" })))).status, 422);
  assert.equal((await handler(request({ action: "delete" }))).status, 400);
  assert.equal(calls.length, 0);
});

test("handler: submit opens a case and returns private upload slots in file order", async () => {
  const response = await handler(request(form({ files: [
    { name: "lease.jpg", contentType: "image/jpeg", size: 100 }, { name: "n4.pdf", contentType: "application/pdf", size: 200 },
  ] })));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.caseNumber, "LTB-2026-0009");
  assert.match(body.intakeToken, /^[0-9a-f]{64}$/);
  assert.deepEqual(body.uploads.map(upload => [upload.index, upload.contentType]), [[0, "image/jpeg"], [1, "application/pdf"]]);
  const [name, args] = calls.at(-1);
  assert.equal(name, "ltb_register_intake");
  assert.match(args.p_token_hash, /^[0-9a-f]{64}$/);
  assert.notEqual(args.p_token_hash, body.intakeToken, "only the hash is stored");
  assert.equal(args.p_documents[1].extension, "pdf");
  assert.equal("index" in args.p_documents[0], false);
  assert.equal(args.p_intake.lastName, "Landlord");
  assert.equal((await handler(request(form({ email: "broken@example.com" })))).status, 503);
});

test("handler: finalize trusts storage, not the browser, for uploaded files", async () => {
  const bad = await handler(request({ action: "finalize", caseId: "8f14e45f-ceea-4e7a-9a3b-2c6f1d7e9a10", intakeToken: "short" }));
  assert.equal(bad.status, 403);
  const response = await handler(request({ action: "finalize", caseId: "8f14e45f-ceea-4e7a-9a3b-2c6f1d7e9a10",
    intakeToken: "b".repeat(64), uploaded: ["aaaaaaaa-0000-4000-8000-000000000001", "aaaaaaaa-0000-4000-8000-000000000002", "not-a-uuid"] }));
  assert.deepEqual(await response.json(), { ok: true, received: 1 });
  const [name, args] = calls.at(-1);
  assert.equal(name, "ltb_finalize_intake");
  assert.deepEqual(args.p_uploaded, ["aaaaaaaa-0000-4000-8000-000000000001"]);
});
