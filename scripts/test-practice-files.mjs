import assert from "node:assert/strict";
import test, { after } from "node:test";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

// AnderHue practice files: intake, portal, ticket reader and notices.
// The pure Deno modules import nothing remote, so esbuild bundles them for
// Node. One bundle holds every module so error classes keep one identity.
const root = fileURLToPath(new URL("..", import.meta.url));
const sharedDir = path.join(root, "supabase/functions/_shared");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "fabsy-practice-files-test-"));
after(() => fs.rm(temporary, { recursive: true, force: true }));

const entry = `
export * as catalog from "./practice-catalog.ts";
export * as core from "./practice-intake-core.ts";
export * as token from "./practice-portal-token.ts";
export * as portal from "./practice-portal-core.ts";
export * as intake from "./practice-intake-handler.ts";
export * as notices from "./practice-notices.ts";
export * as extract from "./practice-extract.ts";
export * as reader from "./process-practice-intake.ts";
`;
const bundlePath = path.join(temporary, "practice-modules.mjs");
await build({
  stdin: { contents: entry, resolveDir: sharedDir, loader: "ts", sourcefile: "practice-modules.ts" },
  outfile: bundlePath, bundle: true, format: "esm", platform: "node", logLevel: "silent",
});
const { catalog, core, token, portal, intake, notices, extract, reader } = await import(pathToFileURL(bundlePath).href);

const SECRET = "test-portal-signing-secret-0123456789abcdef";
const NOW = Date.parse("2026-10-01T15:00:00Z");
const NOW_DATE = new Date(NOW);
const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";
const TRAFFIC_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LTB_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GENERAL_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CLOSED_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DOC_CLIENT = "e0000000-0000-4000-8000-000000000001";
const DOC_SHARED = "e0000000-0000-4000-8000-000000000002";
const DOC_PRIVATE = "e0000000-0000-4000-8000-000000000003";
const DOC_B = "e0000000-0000-4000-8000-000000000004";
const ORIGIN = "https://anderhue.ca";
const EM_DASH = "\u2014";

const sequence = (prefix = "f") => {
  let n = 0;
  return () => `${prefix}0000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
};
const hmac = (secret, payload) => crypto.createHmac("sha256", secret).update(payload).digest("base64url");
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const post = (handler, url, body, headers = { origin: ORIGIN }) => handler(new Request(url, {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
}));

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

test("catalog: unique values, common stages, notify and terminal flags, outcomes", () => {
  const { PRACTICE_AREAS, STAGES, OUTCOMES, PHASES, AREAS, DOCUMENT_KINDS, UPLOAD_LIMITS } = catalog;
  const unique = list => new Set(list).size === list.length;
  assert.deepEqual([...PRACTICE_AREAS], ["ltb", "traffic", "general"]);
  for (const area of PRACTICE_AREAS) {
    const values = STAGES[area].map(stage => stage.value);
    assert.ok(unique(values), `${area}: stage values are unique`);
    for (const common of ["new_intake", "under_review", "quoted", "retained", "closed", "declined"]) {
      assert.ok(values.includes(common), `${area} has ${common}`);
    }
    for (const stage of STAGES[area]) {
      assert.equal(stage.notify, stage.value !== "new_intake", `${area}/${stage.value}: notify is false only for new_intake`);
      assert.equal(Boolean(stage.terminal), ["closed", "declined"].includes(stage.value),
        `${area}/${stage.value}: terminal only on closed and declined`);
      assert.ok(PHASES.some(phase => phase.value === stage.phase), `${area}/${stage.value}: known phase`);
      assert.ok(stage.staffLabel && stage.clientLabel && stage.clientNext, `${area}/${stage.value}: labels present`);
      assert.ok(!`${stage.clientLabel}${stage.clientNext}`.includes(EM_DASH), "client copy has no em dash");
    }
    const outcomes = OUTCOMES[area].map(outcome => outcome.value);
    assert.ok(unique(outcomes), `${area}: outcome values are unique`);
    assert.ok(!outcomes.includes(catalog.DECLINED_OUTCOME), "declined is stored automatically, not offered");
    assert.ok(unique(DOCUMENT_KINDS[area].map(kind => kind.value)), `${area}: document kinds are unique`);
    assert.equal(catalog.areaFromParam(AREAS[area].startParam), area, `${area}: /start param round trip`);
  }
  for (const list of [catalog.TICKET_TYPES, catalog.TICKET_OPTION_CHOSEN, catalog.GENERAL_CATEGORIES, catalog.LTB_ISSUES]) {
    assert.ok(unique(list.map(item => item.value)));
  }
  assert.ok(unique(PRACTICE_AREAS.map(area => AREAS[area].numberPrefix)));
  for (const [extension, type] of Object.entries(UPLOAD_LIMITS.extensionTypes)) {
    assert.ok(UPLOAD_LIMITS.contentTypes[type], `.${extension} maps to an accepted type`);
  }
});

const MIGRATION = path.join(root, "supabase/migrations/20261001150000_anderhue_practice_files.sql");
const migrationMissing = !existsSync(MIGRATION) &&
  "supabase/migrations/20261001150000_anderhue_practice_files.sql does not exist yet; the SQL marker comparison runs once it does";

test("catalog: SQL marker lines in the practice migration equal the catalog", { skip: migrationMissing }, () => {
  const sql = readFileSync(MIGRATION, "utf8");
  const markers = new Map();
  for (const match of sql.matchAll(/^[ \t]*--[ \t]*catalog:(stages|notify|outcomes):([a-z_]+)[ \t]*=[ \t]*(.*)$/gm)) {
    markers.set(`${match[1]}:${match[2]}`, match[3].split(/[\s,|'"()]+/).filter(Boolean));
  }
  // The migration owns every stage and notify list, and the outcome CHECKs of
  // practice_matters. ltb_cases outcomes come from the LTB pipeline migration.
  const required = [...catalog.PRACTICE_AREAS.flatMap(area => [`stages:${area}`, `notify:${area}`]),
    "outcomes:traffic", "outcomes:general"];
  for (const key of required) assert.ok(markers.has(key), `missing marker line "-- catalog:${key}=..." in the migration`);
  if (!markers.has("outcomes:ltb")) {
    const ltbSql = readFileSync(path.join(root, "supabase/migrations/20260925150000_ltb_intake_pipeline.sql"), "utf8");
    const check = ltbSql.match(/outcome text check \(outcome in \(([^)]*)\)\)/);
    assert.ok(check, "ltb_cases outcome CHECK found");
    markers.set("outcomes:ltb", [...check[1].matchAll(/'([a-z_]+)'/g)].map(match => match[1]));
  }
  for (const area of catalog.PRACTICE_AREAS) {
    const expected = {
      stages: catalog.STAGES[area].map(stage => stage.value),
      notify: catalog.STAGES[area].filter(stage => stage.notify).map(stage => stage.value),
      outcomes: catalog.OUTCOMES[area].map(outcome => outcome.value),
    };
    for (const kind of ["stages", "notify", "outcomes"]) {
      // The SQL outcome CHECK also allows the automatic "declined" outcome.
      const found = markers.get(`${kind}:${area}`);
      const actual = kind === "outcomes" ? found.filter(value => value !== catalog.DECLINED_OUTCOME) : found;
      assert.deepEqual([...actual].sort(), [...expected[kind]].sort(), `catalog:${kind}:${area} matches the catalog`);
    }
  }
});

// ---------------------------------------------------------------------------
// Intake parsing
// ---------------------------------------------------------------------------

const trafficForm = (overrides = {}) => ({
  action: "submit", practiceId: "anderhue-paralegal", area: "traffic", name: "Jordan Lee Driver",
  email: "Jordan@Example.COM", phone: "(905) 555-0100", notes: "Stopped on the 401.\nOfficer was polite.",
  ticketType: "speeding", ticketCity: "Mississauga", ticketReceivedOn: "2026-09-28", optionChosen: "none",
  company: "", elapsedMs: 9000,
  files: [{ name: "C:\\fakepath\\ticket.jpg", contentType: "image/jpeg", size: 1200 }],
  ...overrides,
});
const generalForm = (overrides = {}) => ({
  action: "submit", area: "general", name: "Sam Client", email: "sam@example.com",
  notes: "My former landlord kept my deposit.", category: "small_claims", deadline: "2026-11-15",
  otherParty: "Acme Property Ltd.", clientCity: "Hamilton", company: "", elapsedMs: 9000, files: [],
  ...overrides,
});
const parse = input => core.parsePracticeSubmission(input, NOW_DATE);
const status = code => error => error instanceof core.RequestError && error.status === code;

test("intake: traffic submission normalises identity, dates, enums and files", () => {
  const parsed = parse(trafficForm());
  assert.equal(parsed.area, "traffic");
  assert.equal(parsed.practiceId, "anderhue-paralegal");
  assert.equal(parsed.firstName, "Jordan Lee");
  assert.equal(parsed.lastName, "Driver");
  assert.equal(parsed.email, "jordan@example.com");
  assert.equal(parsed.phone, "9055550100");
  assert.equal(parsed.notes, "Stopped on the 401.\nOfficer was polite.");
  assert.equal(parsed.ticketType, "speeding");
  assert.equal(parsed.ticketCity, "Mississauga");
  assert.equal(parsed.ticketReceivedOn, "2026-09-28");
  assert.equal(parsed.optionChosen, "none");
  assert.equal(parsed.category, null);
  assert.equal(parsed.deadline, null);
  assert.deepEqual(parsed.files, [{ name: "ticket.jpg", contentType: "image/jpeg", extension: "jpg", size: 1200 }]);
  assert.equal(parsed.bot, false);
  assert.deepEqual(core.intakeRecord(parsed, "Mozilla/5.0"), {
    email: "jordan@example.com", firstName: "Jordan Lee", lastName: "Driver", phone: "9055550100",
    notes: "Stopped on the 401.\nOfficer was polite.", userAgent: "Mozilla/5.0",
    ticketType: "speeding", ticketCity: "Mississauga", ticketReceivedOn: "2026-09-28", optionChosen: "none",
  });
  const fallback = parse(trafficForm({ ticketType: "rm -rf", optionChosen: "maybe", ticketReceivedOn: "" }));
  assert.equal(fallback.ticketType, "other");
  assert.equal(fallback.optionChosen, "unsure");
  assert.equal(fallback.ticketReceivedOn, null, "the ticket date is optional");
  assert.equal(core.intakeRecord(fallback, "x".repeat(900)).userAgent.length, 400);
});

test("intake: general submission requires a description and keeps its own fields", () => {
  const parsed = parse(generalForm());
  assert.equal(parsed.area, "general");
  assert.equal(parsed.category, "small_claims");
  assert.equal(parsed.deadline, "2026-11-15");
  assert.equal(parsed.otherParty, "Acme Property Ltd.");
  assert.equal(parsed.clientCity, "Hamilton");
  assert.equal(parsed.ticketType, null);
  assert.equal(parsed.optionChosen, null);
  assert.deepEqual(parsed.files, []);
  assert.deepEqual(Object.keys(core.intakeRecord(parsed, "")).sort(),
    ["category", "clientCity", "deadline", "email", "firstName", "lastName", "notes", "otherParty", "phone", "userAgent"]);
  assert.equal(parse(generalForm({ area: "other", category: "weird" })).category, "other", "/start param and enum fallback");
  assert.equal(parse(generalForm({ deadline: undefined })).deadline, null);
  assert.throws(() => parse(generalForm({ notes: "short" })),
    error => status(422)(error) && error.message === "Check these fields: description (at least 10 characters).");
});

test("intake: 422s list every invalid field in one plain sentence", () => {
  assert.throws(() => parse(trafficForm({ name: " ", email: "nope", phone: "12" })),
    error => status(422)(error) && error.message === "Check these fields: name, email, phone.");
  assert.throws(() => parse(trafficForm({ ticketReceivedOn: "2026-10-02" })), /ticket date/, "future date");
  assert.throws(() => parse(trafficForm({ ticketReceivedOn: "2024-09-30" })), /ticket date/, "older than two years");
  assert.ok(parse(trafficForm({ ticketReceivedOn: "2024-10-01" })), "exactly two years ago is accepted");
  assert.throws(() => parse(trafficForm({ ticketReceivedOn: "2026-02-30" })), /ticket date/, "not a calendar date");
  assert.throws(() => parse(trafficForm({ ticketReceivedOn: "2026-9-1" })), /ticket date/, "not YYYY-MM-DD");
  assert.throws(() => parse(generalForm({ deadline: "2037-01-01" })), /deadline/, "more than ten years out");
  assert.throws(() => parse(generalForm({ deadline: "15/11/2026" })), /deadline/);
});

test("intake: bad requests, bots, and the file rules with extension fallback", () => {
  assert.throws(() => parse(null), status(400));
  assert.throws(() => parse(trafficForm({ area: "landlord" })), error => status(400)(error) && /practice area/.test(error.message));
  assert.throws(() => parse(trafficForm({ area: undefined })), status(400));
  assert.throws(() => parse(trafficForm({ practiceId: "Bad Practice!" })), /Unknown practice/);
  assert.equal(parse(trafficForm({ company: "Acme" })).bot, true);
  assert.equal(parse(trafficForm({ elapsedMs: 400 })).bot, true);
  assert.equal(parse(trafficForm({ elapsedMs: undefined })).bot, true);
  const file = spec => parse(trafficForm({ files: [spec] })).files[0];
  assert.equal(file({ name: "IMG_0001.HEIC", contentType: "", size: 10 }).contentType, "image/heic");
  assert.equal(file({ name: "scan.PDF", contentType: "application/octet-stream", size: 10 }).contentType, "application/pdf");
  assert.equal(file({ name: "photo", contentType: "image/jpg", size: 10 }).extension, "jpg", "non-standard alias");
  assert.equal(file({ name: "folder/sub/receipt.png", contentType: "image/png", size: 10 }).name, "receipt.png");
  assert.throws(() => file({ name: "notes", contentType: "", size: 10 }), /photos or PDFs, 10 MB/);
  assert.throws(() => file({ name: "page.html", contentType: "text/html", size: 10 }), /photos or PDFs/);
  assert.throws(() => file({ name: "big.jpg", contentType: "image/jpeg", size: 10 * 1024 * 1024 + 1 }), /10 MB/);
  assert.throws(() => file({ name: "zero.jpg", contentType: "image/jpeg", size: 0 }), /10 MB/);
  assert.throws(() => parse(trafficForm({ files: Array(7).fill({ name: "a.png", contentType: "image/png", size: 5 }) })),
    error => status(400)(error) && error.message === "Attach up to 6 files.");
  assert.throws(() => core.parseFileSpecs([], { required: true }), /at least one file/);
});

// ---------------------------------------------------------------------------
// Ticket extraction normalisation and merge
// ---------------------------------------------------------------------------

const TODAY = "2026-10-01";
const fullTicket = (id = "doc-1", overrides = {}) => core.normalizeTicketExtraction(id, {
  offence_number: " 4009 123456a ", offence_date: "2026-09-20",
  offence_description: "Speeding 80 km/h in a posted 60 km/h zone", statute_section: "HTA 128",
  set_fine: "$95.00", total_payable: 125, court_location: "Mississauga Provincial Offences Court",
  ticket_city: "Mississauga", low_confidence_fields: [], notes: null, ...overrides,
}, TODAY);
const emptyMatter = (overrides = {}) => ({
  offence_number: null, offence_date: null, offence_description: null, statute_section: null,
  set_fine_cents: null, total_payable_cents: null, court_location: null, ticket_city: null,
  option_deadline: null, field_sources: {}, ...overrides,
});

test("extraction: normalises numbers, money, dates and confidence; never keeps ID numbers", () => {
  const extraction = core.normalizeTicketExtraction("doc-1", {
    offence_number: " 4009 123456a ", offence_date: "2026-09-20",
    offence_description: "Speeding 80 km/h, licence A1234-56789-01234 shown", statute_section: "HTA 128",
    set_fine: "$95.00", total_payable: 125, court_location: "Mississauga POA Court", ticket_city: "N/A",
    low_confidence_fields: ["total_payable", "made_up", "ticket_city"],
    notes: "Driver licence A12345678901234 is visible", driver_licence_number: "A1234-56789-01234",
    plate_number: "ABCD 123", date_of_birth: "1990-01-01",
  }, TODAY);
  assert.equal(extraction.kind, "ticket");
  assert.deepEqual(extraction.fields, {
    offenceNumber: "4009 123456A", offenceDate: "2026-09-20",
    offenceDescription: "Speeding 80 km/h, licence [number removed] shown", statuteSection: "HTA 128",
    setFineCents: 9500, totalPayableCents: 12500, courtLocation: "Mississauga POA Court", ticketCity: null,
  });
  assert.deepEqual(extraction.lowConfidence, ["totalPayableCents"], "only returned, known fields");
  assert.equal(extraction.notes, "Driver licence [number removed] is visible");
  const serialized = JSON.stringify(extraction);
  for (const secret of ["A1234", "A12345678901234", "ABCD 123", "1990-01-01"]) {
    assert.equal(serialized.includes(secret), false, `${secret} is never retained`);
  }
  assert.equal(extraction.readSomething, true);

  const odd = core.normalizeTicketExtraction("doc-2", {
    offence_number: "A1234-56789-01234", offence_date: "2026-10-02", offence_description: "x".repeat(400),
    set_fine: "about $90", total_payable: -5,
  }, TODAY);
  assert.equal(odd.fields.offenceNumber, null, "a licence-shaped number is dropped");
  assert.equal(odd.fields.offenceDate, null, "an offence date in the future is dropped");
  assert.equal(odd.fields.offenceDescription.length, 300);
  assert.equal(odd.fields.setFineCents, null);
  assert.equal(odd.fields.totalPayableCents, null);
  assert.equal(core.normalizeOffenceNumber("X".repeat(41) + "1"), null, "too long is dropped, not truncated");
  assert.equal(core.normalizeOffenceNumber("ABCDEF"), null, "no digit");
  assert.equal(core.normalizeOffenceNumber("123<script>"), null);
  assert.equal(core.normalizeTicketExtraction("doc-3", { offence_date: "2026-02-30" }, TODAY).fields.offenceDate, null);
  assert.equal(core.normalizeTicketExtraction("doc-4", {}, TODAY).readSomething, false);
});

test("merge: a complete ticket fills empty fields, estimates the deadline and is ready", () => {
  const result = core.mergeTicketIntake({
    matter: emptyMatter({ ticket_city: "Mississauga", field_sources: { ticket_city: { source: "form" } } }),
    extractions: [fullTicket()], unreadDocuments: [],
  });
  assert.equal(result.reviewStatus, "ready", result.notes.join("\n"));
  assert.equal(result.matterPatch.offence_number, "4009 123456A");
  assert.equal(result.matterPatch.offence_date, "2026-09-20");
  assert.equal(result.matterPatch.set_fine_cents, 9500);
  assert.equal(result.matterPatch.total_payable_cents, 12500);
  assert.equal(result.matterPatch.ticket_city, undefined, "the client's own value is kept");
  assert.equal(result.matterPatch.option_deadline, "2026-10-05", "offence date plus 15 days");
  assert.deepEqual(result.matterPatch.field_sources.offence_number,
    { source: "document", documentId: "doc-1", kind: "ticket", confidence: "high" });
  assert.deepEqual(result.matterPatch.field_sources.option_deadline,
    { source: "document", documentId: "doc-1", kind: "ticket", confidence: "low" });
  assert.deepEqual(result.matterPatch.field_sources.ticket_city, { source: "form" });
  assert.match(result.notes[0], /Read automatically from 1 image\. Nothing here has been confirmed by the client/);
  assert.ok(result.notes.some(note => /2026-10-05 is an estimate/.test(note)));
});

test("merge: conflicts, low confidence, PDFs, failures and gaps go to needs_review", () => {
  const conflict = core.mergeTicketIntake({
    matter: emptyMatter({ ticket_city: "Toronto" }), extractions: [fullTicket()], unreadDocuments: [],
  });
  assert.equal(conflict.reviewStatus, "needs_review");
  assert.ok(conflict.notes.includes(
    'Conflict: A ticket image shows the ticket city as "Mississauga", but the file has "Toronto".'), conflict.notes.join("\n"));

  const twoTickets = core.mergeTicketIntake({
    matter: emptyMatter(), extractions: [fullTicket("doc-1"), fullTicket("doc-2", { offence_number: "4009 999999B" })],
    unreadDocuments: [],
  });
  assert.equal(twoTickets.reviewStatus, "needs_review");
  assert.ok(twoTickets.notes.some(note => /offence number as "4009 999999B", but the file has "4009 123456A"/.test(note)));

  const low = core.mergeTicketIntake({
    matter: emptyMatter(), extractions: [fullTicket("doc-1", { low_confidence_fields: ["total_payable"] })], unreadDocuments: [],
  });
  assert.equal(low.reviewStatus, "needs_review");
  assert.ok(low.notes.includes("Low confidence: total payable."));
  assert.equal(low.matterPatch.field_sources.total_payable_cents.confidence, "low");

  const unread = core.mergeTicketIntake({
    matter: emptyMatter(), extractions: [fullTicket()],
    unreadDocuments: [{ documentId: "p1", reason: "pdf" }, { documentId: "f1", reason: "failed" }],
  });
  assert.equal(unread.reviewStatus, "needs_review");
  assert.ok(unread.notes.includes("1 PDF not read automatically. Review it directly."));
  assert.ok(unread.notes.includes("1 document could not be read. Review directly or ask for a clearer copy."));

  const missing = core.mergeTicketIntake({
    matter: emptyMatter(), extractions: [fullTicket("doc-1", { offence_description: null, offence_date: null })],
    unreadDocuments: [],
  });
  assert.equal(missing.reviewStatus, "needs_review");
  assert.ok(missing.notes.includes("Missing: offence date, offence description."));
  assert.equal(missing.matterPatch.option_deadline, undefined, "no estimate without an offence date");

  const nothing = core.mergeTicketIntake({ matter: emptyMatter(), extractions: [], unreadDocuments: [{ documentId: "p", reason: "pdf" }] });
  assert.equal(nothing.reviewStatus, "needs_review");
  assert.equal(nothing.notes[0], "No ticket image could be read automatically.");
  assert.deepEqual(nothing.matterPatch, {});
});

test("merge: never overwrites, keeps an existing deadline, and flags non-ticket images", () => {
  const result = core.mergeTicketIntake({
    matter: emptyMatter({
      offence_number: "4009 123456A", option_deadline: "2026-10-13",
      field_sources: { offence_number: { source: "staff" }, option_deadline: { source: "form" } },
    }),
    extractions: [fullTicket("doc-1"), core.normalizeTicketExtraction("doc-2", { notes: "A photo of a driver's licence." }, TODAY)],
    unreadDocuments: [],
  });
  assert.equal(result.reviewStatus, "ready", result.notes.join("\n"));
  assert.equal(result.matterPatch.offence_number, undefined, "same value, no change");
  assert.equal(result.matterPatch.option_deadline, undefined, "existing deadline kept");
  assert.deepEqual(result.matterPatch.field_sources.offence_number, { source: "staff" });
  assert.ok(result.notes.includes("One image did not show a readable offence notice. Review it directly."));
  assert.ok(result.notes.includes("Ticket image: A photo of a driver's licence."));
});

// ---------------------------------------------------------------------------
// Portal tokens
// ---------------------------------------------------------------------------

test("token: signs the documented format and verifies it", async () => {
  const iat = Math.floor(NOW / 1000);
  const signed = await token.signPortalToken(SECRET, { clientId: CLIENT_A, iat, exp: iat + 30 * 86_400 });
  const payload = `ahp1.${CLIENT_A}.${iat}.${iat + 30 * 86_400}`;
  assert.equal(signed, `${payload}.${hmac(SECRET, payload)}`, "sig = base64url(HMAC-SHA256(secret, payload))");
  assert.deepEqual(await token.verifyPortalToken(SECRET, signed, NOW), { clientId: CLIENT_A, iat, exp: iat + 30 * 86_400 });
  const issued = await token.issuePortalToken(SECRET, CLIENT_A.toUpperCase(), { issuedAt: iat, days: 30 });
  assert.equal(issued, signed, "client ids are signed in lowercase");
});

test("token: tampering, wrong secrets and malformed tokens are rejected", async () => {
  const iat = Math.floor(NOW / 1000);
  const exp = iat + 86_400;
  const good = await token.signPortalToken(SECRET, { clientId: CLIENT_A, iat, exp });
  const [version, clientId, iatText, expText, sig] = good.split(".");
  const flip = value => value.slice(0, -1) + (value.endsWith("A") ? "B" : "A");
  const variants = [
    [version, clientId, iatText, expText, flip(sig)],
    [version, CLIENT_B, iatText, expText, sig],
    [version, clientId, iatText, String(exp + 60), sig],
    ["ahp2", clientId, iatText, expText, sig],
    [version, clientId, `0${iatText}`, expText, sig],
    [version, clientId, iatText, expText, sig, "extra"],
    [version, clientId, iatText, expText],
  ].map(parts => parts.join("."));
  for (const variant of variants) assert.equal(await token.verifyPortalToken(SECRET, variant, NOW), null, variant);
  // Only the canonical lowercase client id is accepted, even with a valid signature over it.
  const lettered = "abcdef12-3456-4789-8abc-def012345678";
  const canonical = await token.signPortalToken(SECRET, { clientId: lettered, iat, exp });
  assert.ok(await token.verifyPortalToken(SECRET, canonical, NOW));
  const upperPayload = `ahp1.${lettered.toUpperCase()}.${iat}.${exp}`;
  assert.equal(await token.verifyPortalToken(SECRET, `${upperPayload}.${hmac(SECRET, upperPayload)}`, NOW), null, "uppercase id");
  assert.equal(await token.verifyPortalToken(`${SECRET}-other`, good, NOW), null, "another secret");
  assert.equal(await token.verifyPortalToken("short", good, NOW), null, "a short secret never verifies");
  for (const value of [undefined, null, 42, {}, "", `${good}${"x".repeat(200)}`]) {
    assert.equal(await token.verifyPortalToken(SECRET, value, NOW), null);
  }
  await assert.rejects(token.signPortalToken("short", { clientId: CLIENT_A, iat, exp }),
    error => error instanceof token.PortalTokenError && error.code === "signing_secret_missing");
});

test("token: expiry, maximum lifetime and clock skew", async () => {
  const iat = Math.floor(NOW / 1000);
  const exp = iat + 3_600;
  const signed = await token.signPortalToken(SECRET, { clientId: CLIENT_A, iat, exp });
  assert.ok(await token.verifyPortalToken(SECRET, signed, (exp - 1) * 1000));
  assert.equal(await token.verifyPortalToken(SECRET, signed, exp * 1000), null, "expired at exp");
  // A correctly signed token that lives longer than 31 days is still refused.
  const forge = (from, to) => `ahp1.${CLIENT_A}.${from}.${to}.${hmac(SECRET, `ahp1.${CLIENT_A}.${from}.${to}`)}`;
  assert.equal(await token.verifyPortalToken(SECRET, forge(iat, iat + 31 * 86_400 + 1), NOW), null, "too long");
  assert.ok(await token.verifyPortalToken(SECRET, forge(iat, iat + 31 * 86_400), NOW), "exactly 31 days");
  assert.equal(await token.verifyPortalToken(SECRET, forge(iat + 3_600, iat + 7_200), NOW), null, "issued in the future");
  await assert.rejects(token.signPortalToken(SECRET, { clientId: CLIENT_A, iat, exp: iat + 32 * 86_400 }),
    error => error.code === "token_claims_invalid");
});

test("token: revocation compares iat with portal_revoked_before and fails closed", () => {
  const claims = { clientId: CLIENT_A, iat: Math.floor(NOW / 1000), exp: Math.floor(NOW / 1000) + 60 };
  assert.equal(token.portalTokenRevoked(claims, null), false);
  assert.equal(token.portalTokenRevoked(claims, "2026-10-01T14:00:00Z"), false, "revoked before it was issued");
  assert.equal(token.portalTokenRevoked(claims, "2026-10-01T15:00:00.500+00:00"), true, "revoked after it was issued");
  assert.equal(token.portalTokenRevoked(claims, "not a date"), true);
});

// ---------------------------------------------------------------------------
// Portal handler against an in-memory practice
// ---------------------------------------------------------------------------

function portalFixture() {
  const state = {
    clients: {
      [CLIENT_A]: { id: CLIENT_A, email: "jordan@example.com", firstName: "Jordan", lastName: "Driver", organizationName: null, revokedBefore: null },
      [CLIENT_B]: { id: CLIENT_B, email: "sam@example.com", firstName: "Sam", lastName: "Other", organizationName: null, revokedBefore: null },
    },
    files: [
      {
        area: "traffic", id: TRAFFIC_ID, clientId: CLIENT_A, number: "TKT-2026-0007", stage: "trial_scheduled", outcome: null,
        issue: null, ticketType: "speeding", category: null, createdAt: "2026-09-20T14:00:00Z", updatedAt: "2026-09-30T15:00:00Z",
        closedAt: null,
        keyDates: { noticeTerminationDate: null, hearingDate: null, optionDeadline: "2026-10-05", offenceDate: "2026-09-20",
          meetingDate: null, trialDate: "2027-01-12", deadlineDate: null },
        request: { message: "Please send the back of the ticket.", at: "2026-09-29T15:00:00Z" },
        clientUploadedAt: "2026-09-30T15:00:00Z",
        history: [
          { at: "2026-09-20T14:00:00Z", event: "intake_received" },
          { at: "2026-09-25T14:00:00Z", event: "stage_changed", stage: "trial_scheduled" },
          { at: "2026-09-29T15:00:00Z", event: "documents_requested" },
          { at: "2026-09-30T15:00:00Z", event: "client_uploaded", count: 2 },
          { at: "2026-09-30T16:00:00Z", event: "document_shared" },
          { at: "2026-09-30T17:00:00Z", event: "case_updated" },
        ],
      },
      {
        area: "ltb", id: LTB_ID, clientId: CLIENT_A, number: "LTB-2026-0003", stage: "filed", outcome: null, issue: "arrears",
        ticketType: null, category: null, createdAt: "2026-09-10T14:00:00Z", updatedAt: "2026-09-28T15:00:00Z", closedAt: null,
        keyDates: { noticeTerminationDate: "2026-09-30", hearingDate: "2026-11-04" }, request: null, clientUploadedAt: null, history: [],
      },
      {
        area: "general", id: CLOSED_ID, clientId: CLIENT_A, number: "MAT-2026-0002", stage: "closed", outcome: "settled", issue: null,
        ticketType: null, category: "small_claims", createdAt: "2026-08-01T14:00:00Z", updatedAt: "2026-09-01T15:00:00Z",
        closedAt: "2026-09-01T15:00:00Z", keyDates: {}, request: null, clientUploadedAt: null, history: [],
      },
      {
        area: "general", id: GENERAL_B, clientId: CLIENT_B, number: "MAT-2026-0004", stage: "under_review", outcome: null, issue: null,
        ticketType: null, category: "tribunal", createdAt: "2026-09-15T14:00:00Z", updatedAt: "2026-09-15T14:00:00Z", closedAt: null,
        keyDates: {}, request: null, clientUploadedAt: null, history: [],
      },
    ],
    documents: [
      { id: DOC_CLIENT, fileId: TRAFFIC_ID, name: "ticket front.jpg", contentType: "image/jpeg", sizeBytes: 1200,
        uploadedAt: "2026-09-20T14:01:00Z", uploadedBy: "client", shared: false, kind: "ticket" },
      { id: DOC_SHARED, fileId: TRAFFIC_ID, name: "Disclosure #1 & notes.pdf", contentType: "application/pdf", sizeBytes: 5000,
        uploadedAt: "2026-09-30T16:00:00Z", uploadedBy: "staff", shared: true, kind: "disclosure" },
      { id: DOC_PRIVATE, fileId: TRAFFIC_ID, name: "Internal memo.pdf", contentType: "application/pdf", sizeBytes: 5000,
        uploadedAt: "2026-09-30T17:00:00Z", uploadedBy: "staff", shared: false, kind: "correspondence" },
      { id: DOC_B, fileId: GENERAL_B, name: "B notice.pdf", contentType: "application/pdf", sizeBytes: 900,
        uploadedAt: "2026-09-15T14:01:00Z", uploadedBy: "client", shared: false, kind: "notice" },
    ],
    objects: { "practice-documents": new Set(), "ltb-documents": new Set() },
    calls: [], signed: [], background: [], woken: 0, logs: [],
  };
  const fileOf = id => state.files.find(file => file.id === id);
  const bucketOf = area => catalog.AREAS[area].bucket;
  const pathOf = doc => `${doc.fileId}/${doc.id}.${catalog.UPLOAD_LIMITS.contentTypes[doc.contentType]}`;
  for (const doc of state.documents) state.objects[bucketOf(fileOf(doc.fileId).area)].add(pathOf(doc));
  const owned = args => state.files.find(file =>
    file.clientId === args.p_client_id && file.area === args.p_area && file.id === args.p_case_id);
  const visible = doc => doc.uploadedAt && (doc.uploadedBy === "client" || doc.shared);
  const raise = code => ({ data: null, error: { code: "P0001", message: code } });
  const rpc = async (name, args) => {
    state.calls.push([name, args]);
    switch (name) {
      case "practice_portal_session": {
        const client = state.clients[args.p_client_id];
        if (!client) return { data: null, error: null };
        return {
          data: {
            client: { id: client.id, email: client.email, firstName: client.firstName, lastName: client.lastName, organizationName: null },
            practice: { id: "anderhue-paralegal", name: "AnderHue Paralegal Professional Corporation", displayName: "AnderHue Paralegal",
              phone: "(289) 985-0166", publicEmail: "hello@anderhue.ca", siteUrl: "https://anderhue.ca" },
            revokedBefore: client.revokedBefore,
            files: state.files.filter(file => file.clientId === client.id).map(file => ({
              area: file.area, id: file.id, number: file.number, stage: file.stage, outcome: file.outcome, issue: file.issue,
              ticketType: file.ticketType, category: file.category, createdAt: file.createdAt, updatedAt: file.updatedAt,
              requestOpen: Boolean(file.request), closed: ["closed", "declined"].includes(file.stage),
            })),
          },
          error: null,
        };
      }
      case "practice_portal_file": {
        const file = owned(args);
        if (!file) return { data: null, error: null };
        const { clientId: _client, history, ...rest } = file;
        return {
          data: {
            ...rest, history,
            documents: state.documents.filter(doc => doc.fileId === file.id && visible(doc)).map(doc => ({
              id: doc.id, name: doc.name, contentType: doc.contentType, sizeBytes: doc.sizeBytes, uploadedAt: doc.uploadedAt,
              uploadedBy: doc.uploadedBy, kind: doc.kind,
            })),
          },
          error: null,
        };
      }
      case "practice_portal_document": {
        const file = owned(args);
        const doc = file && state.documents.find(item => item.id === args.p_document_id && item.fileId === file.id && visible(item));
        if (!doc) return { data: [], error: null };
        return { data: [{ bucket: bucketOf(file.area), storage_path: pathOf(doc), original_name: doc.name, content_type: doc.contentType }], error: null };
      }
      case "practice_portal_register_uploads": {
        const file = owned(args);
        if (!file) return raise("PRACTICE_CASE_NOT_FOUND");
        if (catalog.isTerminalStage(file.area, file.stage)) return raise("PRACTICE_FILE_CLOSED");
        if (args.p_documents.length > 6) return raise("PRACTICE_UPLOAD_LIMIT");
        for (const doc of args.p_documents) {
          state.documents.push({ id: doc.id, fileId: file.id, name: doc.name, contentType: doc.contentType, sizeBytes: doc.size,
            uploadedAt: null, uploadedBy: "client", shared: false, kind: null });
        }
        return {
          data: args.p_documents.map(doc => ({ documentId: doc.id, bucket: bucketOf(file.area), storagePath: `${file.id}/${doc.id}.${doc.extension}` })),
          error: null,
        };
      }
      case "practice_portal_confirm_uploads": {
        const file = owned(args);
        if (!file) return raise("PRACTICE_CASE_NOT_FOUND");
        let count = 0;
        for (const doc of state.documents) {
          if (doc.fileId === file.id && args.p_document_ids.includes(doc.id) && !doc.uploadedAt) {
            doc.uploadedAt = new Date(NOW).toISOString();
            count += 1;
          }
        }
        return { data: count, error: null };
      }
      case "practice_request_portal_link":
        return { data: Object.values(state.clients).some(client => client.email === args.p_email), error: null };
      default:
        throw new Error(`unexpected rpc ${name}`);
    }
  };
  const storage = bucket => ({
    createSignedUploadUrl: async objectPath => ({
      data: { signedUrl: `https://project.test/storage/v1/object/upload/sign/${bucket}/${objectPath}?token=up` }, error: null,
    }),
    createSignedUrl: async (objectPath, expiresIn, options) => {
      state.signed.push({ bucket, path: objectPath, expiresIn, options });
      return {
        data: { signedUrl: `https://project.test/storage/v1/object/sign/${bucket}/${objectPath}?token=dl&download=${encodeURIComponent(options.download)}` },
        error: null,
      };
    },
    list: async (prefix, options) => ({
      data: [...state.objects[bucket]].filter(name => name.startsWith(`${prefix}/`)).slice(0, options?.limit ?? 100)
        .map(name => ({ name: name.slice(prefix.length + 1) })),
      error: null,
    }),
  });
  return { state, rpc, storage };
}

const PORTAL_URL = "https://project.test/functions/v1/practice-portal";
function makePortal(fixture, overrides = {}) {
  return portal.createPortalHandler({
    rpc: fixture.rpc,
    storage: fixture.storage,
    env: key => ({ PRACTICE_PORTAL_SIGNING_SECRET: SECRET })[key],
    now: () => NOW,
    randomUUID: sequence("f"),
    background: task => fixture.state.background.push(task),
    wakeNotices: async () => { fixture.state.woken += 1; },
    log: (...parts) => fixture.state.logs.push(parts.join(" ")),
    ...overrides,
  });
}
const tokenFor = (clientId, iat = Math.floor(NOW / 1000) - 60, days = 30) =>
  token.issuePortalToken(SECRET, clientId, { issuedAt: iat, days });
const EXPIRED = "This link has expired. Enter your email and we will send a fresh one.";

test("portal: CORS allowlist with the documented fallback, preflight and POST only", async () => {
  const fixture = portalFixture();
  const handler = makePortal(fixture);
  for (const origin of ["https://anderhue.ca", "https://www.anderhue.ca", "https://anderhue-paralegal.vercel.app"]) {
    const preflight = await handler(new Request(PORTAL_URL, { method: "OPTIONS", headers: { origin } }));
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
    assert.match(preflight.headers.get("access-control-allow-methods"), /POST/);
  }
  assert.equal((await handler(new Request(PORTAL_URL, { method: "OPTIONS", headers: { origin: "https://evil.test" } }))).status, 403);
  const evil = await post(handler, PORTAL_URL, { action: "session" }, { origin: "https://evil.test" });
  assert.equal(evil.status, 403);
  assert.equal((await handler(new Request(PORTAL_URL, { method: "GET", headers: { origin: ORIGIN } }))).status, 405);
  const response = await post(handler, PORTAL_URL, { action: "nope" });
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "Unknown portal action." });
  const custom = makePortal(fixture, { env: key => ({ PRACTICE_PORTAL_SIGNING_SECRET: SECRET, PRACTICE_ALLOWED_ORIGINS: "https://staging.anderhue.ca/" })[key] });
  assert.equal((await post(custom, PORTAL_URL, { action: "nope" })).status, 403, "the env list replaces the fallback");
  assert.equal((await post(custom, PORTAL_URL, { action: "nope" }, { origin: "https://staging.anderhue.ca" })).status, 400);
  const unreadable = await handler(new Request(PORTAL_URL, { method: "POST", headers: { origin: ORIGIN }, body: "{not json" }));
  assert.deepEqual([unreadable.status, await unreadable.json()], [400, { error: "Your request could not be read." }]);
});

test("portal: session maps the client, practice and files with catalog labels", async () => {
  const fixture = portalFixture();
  const handler = makePortal(fixture);
  const signed = await tokenFor(CLIENT_A);
  const response = await post(handler, PORTAL_URL, { action: "session", token: signed });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.client, { firstName: "Jordan", displayName: "Jordan Driver", email: "jordan@example.com" });
  assert.deepEqual(body.practice, { name: "AnderHue Paralegal Professional Corporation", displayName: "AnderHue Paralegal",
    phone: "(289) 985-0166", publicEmail: "hello@anderhue.ca", siteUrl: "https://anderhue.ca" });
  assert.equal(body.expiresAt, new Date((Math.floor(NOW / 1000) - 60 + 30 * 86_400) * 1000).toISOString());
  assert.deepEqual(body.files.map(file => file.id), [TRAFFIC_ID, LTB_ID, CLOSED_ID], "only this client's files");
  assert.deepEqual(body.files[0], {
    area: "traffic", id: TRAFFIC_ID, number: "TKT-2026-0007", title: "Speeding", stage: "trial_scheduled",
    stageLabel: "Trial scheduled", phase: "active", closed: false, requestOpen: true,
    updatedAt: "2026-09-30T15:00:00Z", createdAt: "2026-09-20T14:00:00Z",
  });
  assert.equal(body.files[1].title, "Unpaid rent");
  assert.equal(body.files[1].stageLabel, "Application filed");
  assert.deepEqual([body.files[2].closed, body.files[2].phase, body.files[2].stageLabel], [true, "done", "File closed"]);
  assert.deepEqual(fixture.state.calls.map(([name, args]) => [name, args.p_client_id]), [["practice_portal_session", CLIENT_A]]);
});

test("portal: invalid, expired, tampered, revoked and unknown tokens all get the same 401", async () => {
  const fixture = portalFixture();
  const handler = makePortal(fixture);
  const iat = Math.floor(NOW / 1000) - 60;
  const good = await tokenFor(CLIENT_A, iat);
  const expired = await token.signPortalToken(SECRET, { clientId: CLIENT_A, iat: iat - 40 * 86_400, exp: iat - 10 * 86_400 });
  const otherSecret = await token.signPortalToken(`${SECRET}-rotated`, { clientId: CLIENT_A, iat, exp: iat + 86_400 });
  const unknown = await tokenFor("99999999-9999-4999-8999-999999999999", iat);
  for (const value of [undefined, "garbage", expired, otherSecret, `${good.slice(0, -2)}xx`, unknown]) {
    const response = await post(handler, PORTAL_URL, { action: "file", token: value, area: "traffic", id: TRAFFIC_ID });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: EXPIRED });
  }
  fixture.state.clients[CLIENT_A].revokedBefore = new Date((iat + 1) * 1000).toISOString();
  const revoked = await post(handler, PORTAL_URL, { action: "session", token: good });
  assert.deepEqual([revoked.status, (await revoked.json()).error], [401, EXPIRED]);
  const fresh = await tokenFor(CLIENT_A, iat + 30);
  assert.equal((await post(handler, PORTAL_URL, { action: "session", token: fresh })).status, 200, "links issued after revocation work");
  assert.ok(!fixture.state.calls.some(([name]) => name === "practice_portal_file"), "no file data is read without a valid session");
  const misconfigured = makePortal(fixture, { env: () => undefined });
  const response = await post(misconfigured, PORTAL_URL, { action: "session", token: fresh });
  assert.equal(response.status, 503);
});

test("portal: file maps status, dates, request, documents and history for the client", async () => {
  const fixture = portalFixture();
  const handler = makePortal(fixture);
  const signed = await tokenFor(CLIENT_A);
  const response = await post(handler, PORTAL_URL, { action: "file", token: signed, area: "traffic", id: TRAFFIC_ID.toUpperCase() });
  assert.equal(response.status, 200);
  const { file } = await response.json();
  const trial = catalog.stageDef("traffic", "trial_scheduled");
  assert.equal(file.title, "Speeding");
  assert.equal(file.areaLabel, "Traffic ticket");
  assert.equal(file.id, TRAFFIC_ID);
  assert.deepEqual([file.stage, file.stageLabel, file.clientNext, file.phase, file.closed, file.outcomeLabel],
    ["trial_scheduled", trial.clientLabel, trial.clientNext, "active", false, null]);
  assert.deepEqual(file.keyDates, [
    { label: "Offence date", date: "2026-09-20" },
    { label: "Response deadline (estimate)", date: "2026-10-05" },
    { label: "Trial date", date: "2027-01-12" },
  ]);
  assert.deepEqual(file.request, { message: "Please send the back of the ticket.", at: "2026-09-29T15:00:00Z", answered: true });
  assert.deepEqual(file.documents.map(doc => [doc.id, doc.from, doc.kindLabel]),
    [[DOC_SHARED, "practice", "Disclosure"], [DOC_CLIENT, "you", "Ticket"]], "private staff documents never appear");
  assert.deepEqual(Object.keys(file.documents[0]).sort(), ["contentType", "from", "id", "kindLabel", "name", "sizeBytes", "uploadedAt"]);
  assert.deepEqual(file.history.map(entry => entry.label), [
    "New document from the practice", "You added 2 documents", "Documents requested", "Trial scheduled", "File opened",
  ]);
  assert.equal(file.canUpload, true);
  assert.deepEqual(file.limits, { maxFiles: 6, maxBytes: 10 * 1024 * 1024 });
  assert.deepEqual(fixture.state.calls.at(-1), ["practice_portal_file", { p_client_id: CLIENT_A, p_area: "traffic", p_case_id: TRAFFIC_ID }]);

  const closed = (await (await post(handler, PORTAL_URL, { action: "file", token: signed, area: "general", id: CLOSED_ID })).json()).file;
  assert.deepEqual([closed.closed, closed.outcomeLabel, closed.canUpload, closed.limits.maxFiles, closed.title],
    [true, "Settled", false, 0, "Small Claims Court"]);
  const ltb = (await (await post(handler, PORTAL_URL, { action: "file", token: signed, area: "landlord", id: LTB_ID })).json()).file;
  assert.deepEqual(ltb.keyDates.map(entry => entry.label), ["Earliest termination date", "Hearing date"]);
  assert.equal(ltb.areaLabel, "Landlord and Tenant Board file");
  assert.equal(ltb.request, null);
});

test("portal: another client's file is never reachable, whatever area and id are sent", async () => {
  const fixture = portalFixture();
  const handler = makePortal(fixture);
  const signed = await tokenFor(CLIENT_A);
  const notFound = { error: "That file could not be found." };
  const file = await post(handler, PORTAL_URL, { action: "file", token: signed, area: "general", id: GENERAL_B });
  assert.deepEqual([file.status, await file.json()], [404, notFound]);
  const download = await post(handler, PORTAL_URL, { action: "download", token: signed, area: "general", id: GENERAL_B, documentId: DOC_B });
  assert.deepEqual([download.status, await download.json()], [404, { error: "That document could not be found." }]);
  const crossDoc = await post(handler, PORTAL_URL, { action: "download", token: signed, area: "traffic", id: TRAFFIC_ID, documentId: DOC_B });
  assert.equal(crossDoc.status, 404, "a document id from another file");
  const prepare = await post(handler, PORTAL_URL, { action: "prepare_upload", token: signed, area: "general", id: GENERAL_B,
    files: [{ name: "a.jpg", contentType: "image/jpeg", size: 10 }] });
  assert.deepEqual([prepare.status, await prepare.json()], [404, notFound]);
  fixture.state.objects["practice-documents"].add(`${GENERAL_B}/${DOC_B}.pdf`);
  const confirm = await post(handler, PORTAL_URL, { action: "confirm_upload", token: signed, area: "general", id: GENERAL_B, documentIds: [DOC_B] });
  assert.deepEqual([confirm.status, await confirm.json()], [404, notFound]);
  const wrongArea = await post(handler, PORTAL_URL, { action: "file", token: signed, area: "traffic", id: LTB_ID });
  assert.equal(wrongArea.status, 404);
  for (const [name, args] of fixture.state.calls.filter(([name]) => name !== "practice_portal_session")) {
    assert.equal(args.p_client_id, CLIENT_A, `${name} always carries the token's client id`);
  }
  assert.ok(fixture.state.signed.length === 0, "nothing was signed for another client");
});

test("portal: download signs a 120 second URL named after the original file", async () => {
  const fixture = portalFixture();
  const handler = makePortal(fixture);
  const signed = await tokenFor(CLIENT_A);
  const response = await post(handler, PORTAL_URL, { action: "download", token: signed, area: "traffic", id: TRAFFIC_ID, documentId: DOC_SHARED });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.name, "Disclosure #1 & notes.pdf");
  assert.match(body.url, /^https:\/\/project\.test\/storage\/v1\/object\/sign\/practice-documents\//);
  assert.deepEqual(fixture.state.signed.at(-1), {
    bucket: "practice-documents", path: `${TRAFFIC_ID}/${DOC_SHARED}.pdf`, expiresIn: 120,
    options: { download: "Disclosure _1 _ notes.pdf" },
  });
  const own = await (await post(handler, PORTAL_URL, { action: "download", token: signed, area: "traffic", id: TRAFFIC_ID, documentId: DOC_CLIENT })).json();
  assert.equal(own.name, "ticket front.jpg");
  const hidden = await post(handler, PORTAL_URL, { action: "download", token: signed, area: "traffic", id: TRAFFIC_ID, documentId: DOC_PRIVATE });
  assert.equal(hidden.status, 404, "unshared staff documents cannot be downloaded");
  assert.equal((await post(handler, PORTAL_URL, { action: "download", token: signed, area: "traffic", id: TRAFFIC_ID, documentId: "x" })).status, 404);
  assert.equal(portal.downloadName("", "image/png"), "document.png");
  assert.equal(portal.downloadName("IMG_1234", "image/jpeg"), "IMG_1234.jpg");
  assert.equal(portal.downloadName("scan.JPEG", "image/jpeg"), "scan.JPEG");
  assert.equal(portal.downloadName(`${"a".repeat(200)}.pdf`, "application/pdf").length, 120);
});

test("portal: prepare and confirm uploads, trusting storage over the browser", async () => {
  const fixture = portalFixture();
  const handler = makePortal(fixture);
  const signed = await tokenFor(CLIENT_A);
  const prepared = await post(handler, PORTAL_URL, { action: "prepare_upload", token: signed, area: "traffic", id: TRAFFIC_ID,
    files: [{ name: "back.jpg", contentType: "image/jpeg", size: 100 }, { name: "letter.pdf", contentType: "", size: 200 }] });
  assert.equal(prepared.status, 200);
  const { uploads } = await prepared.json();
  assert.deepEqual(uploads.map(upload => [upload.index, upload.contentType]), [[0, "image/jpeg"], [1, "application/pdf"]]);
  assert.deepEqual(Object.keys(uploads[0]).sort(), ["contentType", "documentId", "index", "signedUrl"]);
  assert.equal(uploads[0].signedUrl, `https://project.test/storage/v1/object/upload/sign/practice-documents/${TRAFFIC_ID}/${uploads[0].documentId}.jpg?token=up`);
  const [, registerArgs] = fixture.state.calls.at(-1);
  assert.deepEqual(registerArgs.p_documents[1], { id: uploads[1].documentId, extension: "pdf", contentType: "application/pdf", size: 200, name: "letter.pdf" });

  // Only the first file actually reached storage.
  fixture.state.objects["practice-documents"].add(`${TRAFFIC_ID}/${uploads[0].documentId}.jpg`);
  const confirm = await post(handler, PORTAL_URL, { action: "confirm_upload", token: signed, area: "traffic", id: TRAFFIC_ID,
    documentIds: [uploads[0].documentId, uploads[1].documentId, "not-a-uuid"], note: "  Back of the ticket\r\n" });
  assert.deepEqual([confirm.status, await confirm.json()], [200, { ok: true, received: 1 }]);
  assert.deepEqual(fixture.state.calls.at(-1), ["practice_portal_confirm_uploads", {
    p_client_id: CLIENT_A, p_area: "traffic", p_case_id: TRAFFIC_ID, p_document_ids: [uploads[0].documentId], p_note: "Back of the ticket",
  }]);
  await Promise.all(fixture.state.background);
  assert.equal(fixture.state.woken, 1, "the staff alert is sent promptly");

  const before = fixture.state.calls.length;
  const nothing = await post(handler, PORTAL_URL, { action: "confirm_upload", token: signed, area: "traffic", id: TRAFFIC_ID, documentIds: [uploads[1].documentId] });
  assert.deepEqual(await nothing.json(), { ok: true, received: 0 });
  assert.equal(fixture.state.calls.length, before + 1, "only the session was read; nothing was confirmed");

  const ltb = await (await post(handler, PORTAL_URL, { action: "prepare_upload", token: signed, area: "ltb", id: LTB_ID,
    files: [{ name: "n4.jpg", contentType: "image/jpeg", size: 100 }] })).json();
  assert.match(ltb.uploads[0].signedUrl, new RegExp(`/ltb-documents/${LTB_ID}/`), "landlord files use the ltb-documents bucket");

  const closed = await post(handler, PORTAL_URL, { action: "prepare_upload", token: signed, area: "general", id: CLOSED_ID,
    files: [{ name: "late.jpg", contentType: "image/jpeg", size: 100 }] });
  assert.deepEqual([closed.status, (await closed.json()).error], [403,
    "This file is closed, so it cannot take new uploads. Call or email the office if you need to send something."]);
  const none = await post(handler, PORTAL_URL, { action: "prepare_upload", token: signed, area: "traffic", id: TRAFFIC_ID, files: [] });
  assert.equal(none.status, 400);
  const tooMany = await post(handler, PORTAL_URL, { action: "prepare_upload", token: signed, area: "traffic", id: TRAFFIC_ID,
    files: Array(7).fill({ name: "a.png", contentType: "image/png", size: 5 }) });
  assert.deepEqual([tooMany.status, (await tooMany.json()).error], [400, "Attach up to 6 files."]);
  const html = await post(handler, PORTAL_URL, { action: "prepare_upload", token: signed, area: "traffic", id: TRAFFIC_ID,
    files: [{ name: "x.html", contentType: "text/html", size: 5 }] });
  assert.equal(html.status, 400);
});

test("portal: storage listing failures and upload limits answer with plain sentences", async () => {
  const fixture = portalFixture();
  const failing = { ...fixture, storage: bucket => ({ ...fixture.storage(bucket), list: async () => ({ data: null, error: { message: "down" } }) }) };
  const handler = makePortal(failing);
  const signed = await tokenFor(CLIENT_A);
  const response = await post(handler, PORTAL_URL, { action: "confirm_upload", token: signed, area: "traffic", id: TRAFFIC_ID, documentIds: [DOC_CLIENT] });
  assert.deepEqual([response.status, (await response.json()).error], [503, "Your upload could not be confirmed. Please try again or call the office."]);
  const limited = makePortal({ ...fixture, rpc: async (name, args) => name === "practice_portal_register_uploads"
    ? { data: null, error: { code: "P0001", message: "PRACTICE_UPLOAD_LIMIT" } } : fixture.rpc(name, args) });
  const limit = await post(limited, PORTAL_URL, { action: "prepare_upload", token: signed, area: "traffic", id: TRAFFIC_ID,
    files: [{ name: "a.jpg", contentType: "image/jpeg", size: 10 }] });
  assert.deepEqual([limit.status, (await limit.json()).error], [422, "This file has reached the limit for online uploads. Email or call the office to send more documents."]);
});

test("portal: request_link never reveals whether an email has a file", async () => {
  const fixture = portalFixture();
  const handler = makePortal(fixture);
  const ask = (email, extra = {}, ip = "203.0.113.5") => post(handler, PORTAL_URL,
    { action: "request_link", practiceId: "anderhue-paralegal", email, company: "", elapsedMs: 6000, ...extra },
    { origin: ORIGIN, "x-forwarded-for": `${ip}, 10.0.0.1` });
  const known = await ask("Jordan@Example.com");
  const unknown = await ask("nobody@example.com");
  assert.deepEqual([known.status, await known.json()], [200, { ok: true }]);
  assert.deepEqual([unknown.status, await unknown.json()], [200, { ok: true }]);
  assert.deepEqual(fixture.state.calls.slice(-2).map(([name, args]) => [name, args]), [
    ["practice_request_portal_link", { p_practice_id: "anderhue-paralegal", p_email: "jordan@example.com" }],
    ["practice_request_portal_link", { p_practice_id: "anderhue-paralegal", p_email: "nobody@example.com" }],
  ]);
  await Promise.all(fixture.state.background);
  assert.equal(fixture.state.woken, 1, "only a queued link wakes the worker");

  const calls = fixture.state.calls.length;
  assert.deepEqual(await (await ask("jordan@example.com", { company: "Spam Inc" })).json(), { ok: true });
  assert.deepEqual(await (await ask("jordan@example.com", { elapsedMs: 300 })).json(), { ok: true });
  assert.equal(fixture.state.calls.length, calls, "bots never reach the database");
  const invalid = await ask("not-an-email");
  assert.deepEqual([invalid.status, await invalid.json()], [422, { error: "Enter a valid email address." }]);

  for (let index = 0; index < 3; index += 1) assert.equal((await ask("someone@example.com")).status, 200);
  const limited = await ask("someone@example.com");
  assert.deepEqual([limited.status, (await limited.json()).error], [429, "Too many link requests. Please try again later or call the office."]);
  assert.equal((await ask("someone@example.com", {}, "198.51.100.7")).status, 200, "limits are per IP");

  const broken = makePortal({ ...fixture, rpc: async () => ({ data: null, error: { code: "XX000", message: "boom" } }) });
  const failed = await post(broken, PORTAL_URL, { action: "request_link", email: "jordan@example.com", elapsedMs: 6000 });
  assert.equal(failed.status, 503);
  for (const line of fixture.state.logs) assert.ok(!/@|Jordan|Driver/.test(line), `log line carries no personal data: ${line}`);
});

// ---------------------------------------------------------------------------
// Intake handler
// ---------------------------------------------------------------------------

const MATTER_ID = "9a9a9a9a-0000-4000-8000-00000000000a";
const INTAKE_URL = "https://project.test/functions/v1/practice-intake";
function intakeFixture(overrides = {}) {
  const state = { calls: [], background: [], woken: 0, readers: [], logs: [], objects: new Set(), finalizeStatus: "pending_scan", listError: null };
  const rpc = async (name, args) => {
    state.calls.push([name, args]);
    if (name === "practice_register_intake") {
      if (args.p_intake.email === "broken@example.com") return { data: null, error: { code: "XX000", message: "boom" } };
      if (args.p_intake.email === "odd@example.com") return { data: null, error: { code: "P0001", message: "PRACTICE_EMAIL_INVALID" } };
      if (args.p_practice_id === "someone-else") return { data: null, error: { code: "P0001", message: "PRACTICE_PRACTICE_UNKNOWN" } };
      return { data: [{ matter_id: MATTER_ID, client_id: CLIENT_A, matter_number: "TKT-2026-0011", returning_client: false }], error: null };
    }
    if (name === "practice_finalize_intake") {
      if (args.p_token_hash !== sha256("b".repeat(64))) return { data: null, error: { code: "P0001", message: "PRACTICE_INTAKE_UNAUTHORIZED" } };
      return { data: state.finalizeStatus, error: null };
    }
    throw new Error(`unexpected rpc ${name}`);
  };
  const storage = bucket => ({
    createSignedUploadUrl: async objectPath => ({ data: { signedUrl: `https://project.test/storage/v1/object/upload/sign/${bucket}/${objectPath}?token=t` }, error: null }),
    createSignedUrl: async () => { throw new Error("not used"); },
    list: async prefix => {
      state.listed = [bucket, prefix];
      if (state.listError) return { data: null, error: state.listError };
      return { data: [...state.objects].filter(name => name.startsWith(`${prefix}/`)).map(name => ({ name: name.slice(prefix.length + 1) })), error: null };
    },
  });
  const handler = intake.createIntakeHandler({
    rpc, storage,
    env: () => undefined,
    background: task => state.background.push(task),
    startReader: async matterId => { state.readers.push(matterId); },
    wakeNotices: async () => { state.woken += 1; },
    randomUUID: sequence("7"),
    randomToken: () => "a".repeat(64),
    now: () => NOW_DATE,
    log: (...parts) => state.logs.push(parts.join(" ")),
    ...overrides,
  });
  return { state, handler };
}

test("intake handler: CORS, bots and bad input never reach the database", async () => {
  const { state, handler } = intakeFixture();
  const preflight = await handler(new Request(INTAKE_URL, { method: "OPTIONS", headers: { origin: "https://www.anderhue.ca" } }));
  assert.equal(preflight.status, 204);
  assert.equal((await post(handler, INTAKE_URL, trafficForm(), { origin: "https://evil.test" })).status, 403);
  const bot = await post(handler, INTAKE_URL, trafficForm({ company: "spam" }));
  assert.deepEqual(await bot.json(), { ok: true, matterId: null, matterNumber: null, intakeToken: null, uploads: [] });
  const fast = await post(handler, INTAKE_URL, trafficForm({ elapsedMs: 1200 }));
  assert.deepEqual((await fast.json()).uploads, []);
  const invalid = await post(handler, INTAKE_URL, trafficForm({ email: "nope" }));
  assert.deepEqual([invalid.status, await invalid.json()], [422, { error: "Check these fields: email." }]);
  assert.equal((await post(handler, INTAKE_URL, { action: "delete" })).status, 400);
  assert.equal(state.calls.length, 0);
});

test("intake handler: submit opens the matter and returns private upload slots in file order", async () => {
  const { state, handler } = intakeFixture();
  const response = await post(handler, INTAKE_URL, trafficForm({ files: [
    { name: "front.jpg", contentType: "image/jpeg", size: 100 }, { name: "back.heic", contentType: "", size: 200 },
  ] }), { origin: ORIGIN, "user-agent": "TestBrowser/1.0" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.matterId, MATTER_ID);
  assert.equal(body.matterNumber, "TKT-2026-0011");
  assert.equal(body.intakeToken, "a".repeat(64));
  assert.deepEqual(body.uploads.map(upload => [upload.index, upload.contentType, upload.path]), [
    [0, "image/jpeg", `${MATTER_ID}/70000000-0000-4000-8000-000000000001.jpg`],
    [1, "image/heic", `${MATTER_ID}/70000000-0000-4000-8000-000000000002.heic`],
  ]);
  assert.match(body.uploads[0].signedUrl, /\/practice-documents\//);
  const [name, args] = state.calls.at(-1);
  assert.equal(name, "practice_register_intake");
  assert.equal(args.p_area, "traffic");
  assert.equal(args.p_practice_id, "anderhue-paralegal");
  assert.equal(args.p_token_hash, sha256("a".repeat(64)), "only the SHA-256 of the token is stored");
  assert.deepEqual(args.p_documents[1], { id: "70000000-0000-4000-8000-000000000002", extension: "heic", contentType: "image/heic", size: 200, name: "back.heic" });
  assert.equal(args.p_intake.userAgent, "TestBrowser/1.0");
  assert.equal(args.p_intake.ticketType, "speeding");
  assert.equal("source" in args.p_intake, false, "no smoke-test switch");
  assert.equal(state.background.length, 0, "with uploads, emails wait for finalize");

  const general = await post(handler, INTAKE_URL, generalForm());
  assert.deepEqual((await general.json()).uploads, []);
  assert.equal(state.calls.at(-1)[1].p_area, "general");
  await Promise.all(state.background);
  assert.equal(state.woken, 1, "a file without documents is final at once, so the worker is woken");
  const broken = await post(handler, INTAKE_URL, trafficForm({ email: "broken@example.com" }));
  assert.deepEqual([broken.status, (await broken.json()).error], [503, "Your file could not be opened. Please try again or call the office."]);
  const odd = await post(handler, INTAKE_URL, trafficForm({ email: "odd@example.com" }));
  assert.deepEqual([odd.status, (await odd.json()).error], [422, "Check these fields: email."], "SQL validation codes become plain 4xx answers");
  const unknown = await post(handler, INTAKE_URL, trafficForm({ practiceId: "someone-else" }));
  assert.deepEqual([unknown.status, (await unknown.json()).error], [400, "Unknown practice."]);
  for (const line of state.logs) assert.ok(!/@|Jordan|broken/.test(line), `log line carries no personal data: ${line}`);
});

test("intake handler: 8 submissions per IP per hour", async () => {
  const { handler } = intakeFixture();
  const send = ip => post(handler, INTAKE_URL, trafficForm(), { origin: ORIGIN, "x-forwarded-for": ip });
  for (let index = 0; index < 8; index += 1) assert.equal((await send("203.0.113.9")).status, 200);
  const limited = await send("203.0.113.9");
  assert.deepEqual([limited.status, (await limited.json()).error], [429, "Too many submissions. Please try again later or call the office."]);
  assert.equal((await send("203.0.113.10")).status, 200);
});

test("intake handler: finalize trusts storage and starts the ticket reader for traffic", async () => {
  const { state, handler } = intakeFixture();
  const first = "70000000-0000-4000-8000-000000000001";
  const second = "70000000-0000-4000-8000-000000000002";
  state.objects.add(`${MATTER_ID}/${first}.jpg`);
  const bad = await post(handler, INTAKE_URL, { action: "finalize", matterId: MATTER_ID, intakeToken: "short" });
  assert.deepEqual([bad.status, (await bad.json()).error], [403, "Your upload could not be confirmed. Please call the office."]);
  const wrong = await post(handler, INTAKE_URL, { action: "finalize", matterId: MATTER_ID, intakeToken: "c".repeat(64), uploaded: [first] });
  assert.equal(wrong.status, 403, "the token hash must match");
  const response = await post(handler, INTAKE_URL, { action: "finalize", matterId: MATTER_ID.toUpperCase(),
    intakeToken: "b".repeat(64), uploaded: [first, second, "not-a-uuid"] });
  assert.deepEqual(await response.json(), { ok: true, received: 1 });
  assert.deepEqual(state.listed, ["practice-documents", MATTER_ID]);
  assert.deepEqual(state.calls.at(-1), ["practice_finalize_intake",
    { p_matter_id: MATTER_ID, p_token_hash: sha256("b".repeat(64)), p_uploaded: [first] }]);
  await Promise.all(state.background);
  assert.deepEqual(state.readers, [MATTER_ID]);
  assert.equal(state.woken, 0);

  state.finalizeStatus = "needs_review";
  await post(handler, INTAKE_URL, { action: "finalize", matterId: MATTER_ID, intakeToken: "b".repeat(64), uploaded: [first] });
  await Promise.all(state.background);
  assert.deepEqual([state.readers.length, state.woken], [1, 1], "general files go straight to review");

  state.listError = { message: "storage down" };
  const calls = state.calls.length;
  const unavailable = await post(handler, INTAKE_URL, { action: "finalize", matterId: MATTER_ID, intakeToken: "b".repeat(64), uploaded: [first] });
  assert.equal(unavailable.status, 503);
  assert.equal(state.calls.length, calls, "never finalizes on a failed listing");
});

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

const CREATED_AT = "2026-10-01T15:04:05.123456+00:00";
const CREATED_S = Math.floor(Date.parse(CREATED_AT) / 1000);
const NUMBERS = { ltb: "LTB-2026-0003", traffic: "TKT-2026-0007", general: "MAT-2026-0004" };
const IDS = { ltb: LTB_ID, traffic: TRAFFIC_ID, general: GENERAL_B };
const practiceSnapshot = (overrides = {}) => ({
  id: "anderhue-paralegal", name: "AnderHue Paralegal Professional Corporation", displayName: "AnderHue Paralegal",
  licenseeName: "Don Anderson", phone: "(289) 985-0166", publicEmail: "hello@anderhue.ca", siteUrl: "https://anderhue.ca",
  clientEmailFrom: "AnderHue Paralegal <files@anderhue.ca>", clientReplyTo: "hello@anderhue.ca", noticeFrom: null, ...overrides,
});
const fileSnapshot = (area, overrides = {}) => ({
  area, id: IDS[area], number: NUMBERS[area], stage: "new_intake", outcome: null,
  issue: area === "ltb" ? "arrears" : null, ticketType: area === "traffic" ? "speeding" : null,
  category: area === "general" ? "small_claims" : null, city: area === "general" ? "Hamilton" : "Mississauga",
  createdAt: "2026-10-01T14:00:00Z", reviewStatus: "ready", documentCount: 2,
  clientNotes: "Officer said <b>80</b> & I disagree.",
  keyDates: area === "traffic"
    ? { optionDeadline: "2026-10-16", offenceDate: "2026-10-01", meetingDate: null, trialDate: null }
    : area === "ltb" ? { hearingDate: "2026-11-04" } : { deadlineDate: "2026-11-15" },
  request: null, ...overrides,
});
const makeNotice = (kind, area = "traffic", overrides = {}) => {
  const client = kind.startsWith("staff_") ? false : true;
  const snapshot = {
    practice: practiceSnapshot(overrides.practice),
    client: { id: CLIENT_A, firstName: "Jordan <i>", lastName: "Driver", organizationName: null, email: "jordan@example.com", ...overrides.client },
    file: kind === "portal_link" ? null : fileSnapshot(area, overrides.file),
  };
  return {
    id: overrides.id || `notice-${kind}`, claim_id: "claim-1", kind, audience: client ? "client" : "staff",
    practice_id: "anderhue-paralegal", area: kind === "portal_link" ? null : area,
    case_id: kind === "portal_link" ? null : IDS[area], client_id: CLIENT_A,
    detail: overrides.detail || {}, snapshot,
    recipients: overrides.recipients || (client ? ["jordan@example.com"] : ["info@onlineparalegals.ca", "brett@execom.ca"]),
    created_at: overrides.created_at || CREATED_AT,
  };
};
const render = notice => notices.renderPracticeNotice(notice, { signingSecret: SECRET });
const hrefs = html => [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1].replace(/&amp;/g, "&"));

async function assertClientEmail(email, { subject, link, headline }) {
  assert.equal(email.from, "AnderHue Paralegal <files@anderhue.ca>");
  assert.equal(email.reply_to, "hello@anderhue.ca");
  assert.deepEqual(email.to, ["jordan@example.com"]);
  assert.equal(email.subject, subject);
  for (const part of [email.subject, email.from, email.reply_to, email.html, email.text]) {
    assert.equal(/fabsy/i.test(part), false, "no Fabsy branding in client emails");
    assert.equal(part.includes(EM_DASH), false, "no em dashes");
  }
  const { html, text } = email;
  for (const piece of ['src="https://anderhue.ca/crest-email.png"', 'width="56"', 'alt="AnderHue Paralegal"', "max-width:600px",
    "background-color:#f7f1e8", "background-color:#1d1032", "background-color:#b28d54", "color:#1d1032", "font-family:Georgia",
    "font-family:Arial", 'role="presentation"', "(289) 985-0166", "hello@anderhue.ca", "AnderHue Paralegal Professional Corporation",
    "Representation begins only after a written retainer.", "Hello Jordan &lt;i&gt;,", escapeHtml(headline)]) {
    assert.ok(html.includes(piece), `html includes ${piece}`);
  }
  assert.ok(!html.includes("<i>"), "names are escaped");
  assert.ok(!/<script/i.test(html), "no script survives");
  const button = hrefs(html).find(href => href.includes("#t="));
  assert.ok(button.startsWith(link), `${button} starts with ${link}`);
  const portalToken = button.split("#t=")[1];
  const claims = await token.verifyPortalToken(SECRET, portalToken, (CREATED_S + 60) * 1000);
  assert.deepEqual(claims, { clientId: CLIENT_A, iat: CREATED_S, exp: CREATED_S + 30 * 86_400 }, "30-day link from created_at");
  assert.ok(text.includes(headline) && text.includes(button) && text.includes("Representation begins only after a written retainer."),
    "plain text alternative carries the headline, link and footer");
  assert.ok(text.includes("Hello Jordan <i>,"), "plain text is not HTML-escaped");
}
const escapeHtml = value => value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

test("notices: every client kind renders branded, escaped, linked email with a text part", async () => {
  const fileLink = `https://anderhue.ca/files/traffic/${TRAFFIC_ID}#t=`;
  const received = await render(makeNotice("intake_received"));
  await assertClientEmail(received, { subject: "TKT-2026-0007 · We have your file", link: fileLink, headline: "We have your file" });
  assert.ok(received.html.includes(escapeHtml(catalog.stageDef("traffic", "new_intake").clientNext)));
  assert.ok(received.html.includes("We received 2 documents with your file."));
  assert.ok(received.html.includes("Speeding · File TKT-2026-0007"));
  assert.ok(received.html.includes("Response deadline (estimate)") && received.html.includes("Fri, October 16, 2026"));
  assert.ok(received.html.includes("The response deadline is an estimate. Always go by the date printed on your ticket."));
  assert.ok(received.text.includes("Offence date: Thu, October 1, 2026"));

  const requested = await render(makeNotice("documents_requested", "traffic", {
    detail: { message: "Please send the back of the ticket <script>alert(1)</script>\nand your licence class." },
  }));
  await assertClientEmail(requested, { subject: "TKT-2026-0007 · We need a document from you", link: fileLink, headline: "We need a document from you" });
  assert.ok(requested.html.includes("What we need"));
  assert.ok(requested.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;<br>and your licence class."));
  assert.ok(requested.html.includes(">Upload documents</a>"));
  const order = (body, ...pieces) => pieces.map(piece => body.indexOf(piece)).every((at, index, all) => at >= 0 && (index === 0 || at > all[index - 1]));
  assert.ok(order(requested.html, "Please send us the following", "What we need", "Use the button below", ">Upload documents</a>"),
    "the request reads in order: ask, what, how, button");
  assert.ok(order(requested.text, "Please send us the following", "What we need:", "Use the button below", "Upload documents: https://"));
  const fromSnapshot = await render(makeNotice("documents_requested", "traffic", { file: { request: { message: "Your ID", at: CREATED_AT } } }));
  assert.ok(fromSnapshot.html.includes("Your ID"), "falls back to the file's open request");

  const shared = await render(makeNotice("document_shared", "general", { detail: { documentId: DOC_SHARED, documentName: "Reply <draft>.pdf" } }));
  await assertClientEmail(shared, { subject: "MAT-2026-0004 · A new document is in your file",
    link: `https://anderhue.ca/files/general/${GENERAL_B}#t=`, headline: "A new document is in your file" });
  assert.ok(shared.html.includes("We added a document to your file: Reply &lt;draft&gt;.pdf."));
  assert.ok(!shared.html.includes("Key dates"));
  const sharedNote = await render(makeNotice("document_shared", "general", { detail: { documentName: "Reply.pdf", message: "Please read page 2." } }));
  assert.ok(order(sharedNote.html, "We added a document to your file: Reply.pdf.", "A note from AnderHue Paralegal", "Please read page 2.",
    "Open your file to view or download it.", ">View the document</a>"));

  const invite = await render(makeNotice("upload_invite", "ltb", { detail: { message: "Lease and ledger, please." } }));
  await assertClientEmail(invite, { subject: "LTB-2026-0003 · Upload your documents",
    link: `https://anderhue.ca/files/ltb/${LTB_ID}#t=`, headline: "Upload your documents" });
  assert.ok(invite.html.includes("We have opened file LTB-2026-0003 for you."));
  assert.ok(invite.html.includes("A note from AnderHue Paralegal") && invite.html.includes("Lease and ledger, please."));

  const link = await render(makeNotice("portal_link"));
  await assertClientEmail(link, { subject: "Your secure link · AnderHue Paralegal", link: "https://anderhue.ca/files#t=", headline: "Your secure link" });
  assert.ok(link.html.includes("Here is your secure link to your files with AnderHue Paralegal."));
  assert.ok(link.html.includes(">Open your files</a>"));
});

test("notices: stage updates render for every notify stage in every area", async () => {
  let rendered = 0;
  for (const area of catalog.PRACTICE_AREAS) {
    for (const stage of catalog.STAGES[area].filter(def => def.notify)) {
      const outcome = stage.value === "closed" ? catalog.OUTCOMES[area][0] : null;
      const email = await render(makeNotice("stage_changed", area, {
        file: { stage: stage.value, outcome: stage.value === "declined" ? "declined" : outcome?.value || null },
        detail: { stage: stage.value, outcome: stage.value === "declined" ? "declined" : outcome?.value || null,
          message: stage.value === "quoted" ? "Fee is $350 + HST <firm>." : "" },
      }));
      const headline = outcome ? `${stage.clientLabel}: ${outcome.clientLabel}` : stage.clientLabel;
      await assertClientEmail(email, { subject: `${NUMBERS[area]} · ${headline}`,
        link: `https://anderhue.ca/files/${area}/${IDS[area]}#t=`, headline });
      assert.ok(email.html.includes(escapeHtml(stage.clientNext)), `${area}/${stage.value} carries clientNext`);
      assert.ok(email.text.includes(stage.clientNext));
      assert.equal(email.html.includes("Key dates"), stage.value !== "closed", `${area}/${stage.value} key dates`);
      if (stage.value === "quoted") {
        assert.ok(email.html.includes("A note from AnderHue Paralegal") && email.html.includes("Fee is $350 + HST &lt;firm&gt;."));
      } else {
        assert.ok(!email.html.includes("A note from"), "no empty quote block");
      }
      rendered += 1;
    }
  }
  assert.equal(rendered, catalog.PRACTICE_AREAS.reduce((sum, area) => sum + catalog.STAGES[area].filter(def => def.notify).length, 0));
  const other = await render(makeNotice("stage_changed", "traffic", { detail: { stage: "closed", outcome: "other" }, file: { stage: "closed" } }));
  assert.equal(other.subject, "TKT-2026-0007 · File closed", "the generic outcome adds nothing");
  const declined = await render(makeNotice("stage_changed", "traffic", { detail: { stage: "declined", outcome: "declined" }, file: { stage: "declined" } }));
  assert.equal(declined.subject, "TKT-2026-0007 · Not taken on");
  assert.ok(declined.html.includes("Response deadline (estimate)"), "a declined ticket still shows its deadline");
});

test("notices: staff alerts carry the intake summary and the admin link", async () => {
  const traffic = await render(makeNotice("staff_new_intake"));
  assert.equal(traffic.from, "Fabsy Case Desk <hello@fabsy.ca>");
  assert.deepEqual(traffic.to, ["info@onlineparalegals.ca", "brett@execom.ca"]);
  assert.equal(traffic.subject, "New traffic file TKT-2026-0007 · Speeding · Mississauga");
  assert.ok(hrefs(traffic.html).includes(`https://anderhue.ca/admin/files/traffic/${TRAFFIC_ID}`));
  assert.ok(traffic.html.includes("Officer said &lt;b&gt;80&lt;/b&gt; &amp; I disagree."));
  assert.ok(traffic.html.includes("Jordan &lt;i&gt; Driver"));
  assert.ok(traffic.html.includes("Response deadline (estimate)"));
  assert.ok(traffic.text.includes(`Open the file: https://anderhue.ca/admin/files/traffic/${TRAFFIC_ID}`));
  assert.equal(traffic.reply_to, undefined);
  const review = await render(makeNotice("staff_new_intake", "general", {
    file: { reviewStatus: "needs_review" }, practice: { noticeFrom: "AnderHue Case Desk <files@anderhue.ca>" },
  }));
  assert.equal(review.subject, "New file MAT-2026-0004 · Small Claims Court · Hamilton · needs review");
  assert.equal(review.from, "AnderHue Case Desk <files@anderhue.ca>");
  assert.ok(review.html.includes("Needs review. Something is missing, unclear or conflicting. The review notes are on the file."),
    "never points at notes the snapshot does not carry");
  const withNotes = await render(makeNotice("staff_new_intake", "traffic", { file: { reviewStatus: "needs_review", reviewNotes: "Missing: offence date." } }));
  assert.ok(withNotes.html.includes("See the notes below.") && withNotes.html.includes("Missing: offence date."));
  const uploaded = await render(makeNotice("staff_client_uploaded", "ltb", { detail: { count: 2, note: "Here is the <N4>." } }));
  assert.equal(uploaded.subject, "LTB-2026-0003 · Client added 2 documents");
  assert.ok(uploaded.html.includes("Here is the &lt;N4&gt;."));
  assert.ok(hrefs(uploaded.html).includes(`https://anderhue.ca/admin/files/ltb/${LTB_ID}`));
  for (const email of [traffic, review, uploaded]) assert.ok(!`${email.html}${email.text}${email.subject}`.includes(EM_DASH));
});

test("notices: unsafe or incomplete notices are refused permanently", async () => {
  const refuse = async (notice, code, secret = SECRET) => {
    await assert.rejects(notices.renderPracticeNotice(notice, { signingSecret: secret }),
      error => error instanceof notices.PracticeNoticeError && error.code === code && error.permanent === true, code);
  };
  await refuse(makeNotice("stage_changed", "traffic", { practice: { clientEmailFrom: null }, detail: { stage: "quoted" } }), "sender_missing");
  await refuse(makeNotice("intake_received", "traffic", { practice: { clientReplyTo: "" } }), "sender_missing");
  await refuse(makeNotice("intake_received", "traffic", { practice: { clientEmailFrom: "Evil\r\nBcc: x@y.z" } }), "sender_missing");
  await refuse(makeNotice("intake_received"), "signing_secret_missing", "");
  await refuse(makeNotice("intake_received", "traffic", { recipients: ["someone-else@example.com"] }), "recipients_missing");
  await refuse(makeNotice("staff_new_intake", "traffic", { recipients: [] }), "recipients_missing");
  await refuse(makeNotice("stage_changed", "traffic", { detail: { stage: "warp_speed" } }), "stage_unknown");
  await refuse({ ...makeNotice("intake_received"), kind: "marketing_blast" }, "kind_unknown");
  await refuse({ ...makeNotice("intake_received"), audience: "staff" }, "audience_mismatch");
  await refuse(makeNotice("intake_received", "traffic", { practice: { siteUrl: "http://anderhue.ca" } }), "snapshot_invalid");
  await refuse(makeNotice("intake_received", "traffic", { created_at: "yesterday" }), "snapshot_invalid");
});

test("notices: processing sends, retries, fails permanently and accounts for recording failures", async () => {
  const finished = [];
  const frozen = [];
  const list = [
    makeNotice("intake_received", "traffic", { id: "sent" }),
    makeNotice("stage_changed", "traffic", { id: "retry", detail: { stage: "quoted" } }),
    makeNotice("document_shared", "traffic", { id: "permanent" }),
    makeNotice("staff_new_intake", "traffic", { id: "policy" }),
    makeNotice("intake_received", "traffic", { id: "sender", practice: { clientEmailFrom: "" } }),
    makeNotice("upload_invite", "general", { id: "freeze-error" }),
    makeNotice("portal_link", "traffic", { id: "unrecorded" }),
    makeNotice("staff_client_uploaded", "general", { id: "finish-throws", detail: { count: 1 } }),
  ];
  const result = await notices.processPracticeNotices({
    claim: async () => list,
    freeze: async (notice, email) => {
      frozen.push(notice.id);
      if (notice.id === "freeze-error") throw new Error("PRACTICE_NOTICE_CLAIM_LOST");
      return notice.id === "policy" ? { ...email, to: ["old@example.com", "brett@execom.ca"] } : email;
    },
    send: async (email, id) => {
      if (id === "retry") throw new notices.PracticeNoticeError("provider_http_503");
      if (id === "permanent") throw new notices.PracticeNoticeError("provider_http_422", true);
      return `em_${id}`;
    },
    finish: async (notice, status, providerId, code) => {
      finished.push([notice.id, status, providerId, code]);
      if (notice.id === "unrecorded") return false;
      if (notice.id === "finish-throws") throw new Error("database unavailable");
      return true;
    },
    signingSecret: SECRET,
  });
  assert.deepEqual(finished, [
    ["sent", "sent", "em_sent", null],
    ["retry", "retry", null, "provider_http_503"],
    ["permanent", "failed", null, "provider_http_422"],
    ["policy", "failed", null, "recipient_policy_changed"],
    ["sender", "failed", null, "sender_missing"],
    ["freeze-error", "retry", null, "notice_processing_error"],
    ["unrecorded", "sent", "em_unrecorded", null],
    ["finish-throws", "sent", "em_finish-throws", null],
  ]);
  assert.deepEqual(result, { claimed: 8, sent: 1, retry: 2, failed: 3, recordingFailed: 2 });
  assert.ok(!frozen.includes("sender"), "a refused notice is never frozen or sent");
  const secretless = await notices.processPracticeNotices({
    claim: async () => [makeNotice("intake_received")], freeze: async (_n, email) => email,
    send: async () => "em", finish: async (notice, status, _id, code) => { finished.push([notice.id, status, code]); return true; },
    signingSecret: "",
  });
  assert.deepEqual([secretless.failed, finished.at(-1)], [1, ["notice-intake_received", "failed", "signing_secret_missing"]]);
});

test("notices: the provider call carries a stable idempotency key and classifies failures", async () => {
  const payload = { from: "f@x.co", to: ["a@b.co"], subject: "s", html: "h", text: "t", reply_to: "r@x.co" };
  let seen;
  const id = await notices.sendPracticeNoticeEmail("key", payload, "n-9", async (url, init) => {
    seen = { url, headers: init.headers, body: JSON.parse(init.body), signal: init.signal };
    return new Response(JSON.stringify({ id: "em_1" }), { status: 200 });
  });
  assert.equal(id, "em_1");
  assert.equal(seen.url, "https://api.resend.com/emails");
  assert.equal(seen.headers["Idempotency-Key"], "practice-notice/n-9");
  assert.equal(seen.headers.Authorization, "Bearer key");
  assert.deepEqual(seen.body, payload, "the frozen payload is sent as is");
  assert.ok(seen.signal);
  const failure = async (responder) => notices.sendPracticeNoticeEmail("key", payload, "n-9", responder).then(() => null, error => error);
  assert.deepEqual(await failure(async () => new Response("{}", { status: 422 })).then(e => [e.code, e.permanent]), ["provider_http_422", true]);
  assert.deepEqual(await failure(async () => new Response("{}", { status: 429 })).then(e => [e.code, e.permanent]), ["provider_http_429", false]);
  assert.deepEqual(await failure(async () => new Response("{}", { status: 500 })).then(e => [e.code, e.permanent]), ["provider_http_500", false]);
  assert.deepEqual(await failure(async () => { throw new TypeError("offline"); }).then(e => [e.code, e.permanent]), ["provider_network_error", false]);
  assert.deepEqual(await failure(async () => new Response("{}", { status: 200 })).then(e => [e.code, e.permanent]), ["provider_response_invalid", false]);
});

// ---------------------------------------------------------------------------
// Ticket reader
// ---------------------------------------------------------------------------

function readerDb({ matter = {}, documents = [], claim = true, failMatterUpdate = false } = {}) {
  const tables = {
    practice_matters: [{
      id: MATTER_ID, practice_id: "anderhue-paralegal", client_id: CLIENT_A, area: "traffic", offence_number: null,
      offence_date: null, offence_description: null, statute_section: null, set_fine_cents: null, total_payable_cents: null,
      court_location: null, ticket_city: "Mississauga", option_deadline: null, field_sources: { ticket_city: { source: "form" } },
      review_notes: null, intake_review_status: "scanning", ...matter,
    }],
    practice_matter_documents: documents.map(doc => ({ matter_id: MATTER_ID, extraction_status: "pending", kind: null,
      uploaded_at: "2026-10-01T15:00:00Z", size_bytes: 3, created_at: "2026-10-01T15:00:00Z", ...doc })),
    practice_matter_events: [],
  };
  const ops = [];
  const invoked = [];
  const query = table => {
    if (!tables[table]) throw new Error(`unexpected table ${table}`);
    const filters = [];
    let patch = null;
    let single = false;
    const run = () => {
      const rows = tables[table].filter(row => filters.every(filter => filter(row)));
      if (patch) {
        if (table === "practice_matters" && failMatterUpdate) return { data: null, error: { code: "23514" } };
        rows.forEach(row => Object.assign(row, patch));
        ops.push(["update", table, patch, rows.length]);
        return { data: null, error: null };
      }
      if (single) return rows.length === 1 ? { data: { ...rows[0] }, error: null } : { data: null, error: { code: "PGRST116" } };
      return { data: rows.map(row => ({ ...row })), error: null };
    };
    const chain = {
      eq: (column, value) => { filters.push(row => row[column] === value); return chain; },
      not: (column, operator, value) => {
        assert.deepEqual([operator, value], ["is", null]);
        filters.push(row => row[column] !== null);
        return chain;
      },
      order: () => chain,
      single: () => { single = true; return chain; },
      then: (resolve, reject) => Promise.resolve().then(run).then(resolve, reject),
    };
    return {
      select: () => chain,
      update: values => { patch = values; return chain; },
      insert: async values => { tables[table].push(values); ops.push(["insert", table, values]); return { data: null, error: null }; },
    };
  };
  const db = {
    rpc: async (name, args) => {
      ops.push(["rpc", name, args]);
      return { data: claim, error: null };
    },
    from: query,
    storage: { from: bucket => ({ download: async objectPath => {
      ops.push(["download", bucket, objectPath]);
      return objectPath.includes("missing") ? { data: null, error: { message: "not found" } } : { data: new Blob([new Uint8Array([1, 2, 3])]), error: null };
    } }) },
    functions: { invoke: async (name, options) => { invoked.push([name, options]); return { data: null, error: null }; } },
  };
  return { db, tables, ops, invoked };
}

const IMG = "71000000-0000-4000-8000-000000000001";
const PDF = "71000000-0000-4000-8000-000000000002";
const MISSING = "71000000-0000-4000-8000-000000000003";
const ticketRaw = {
  offence_number: "4009 123456A", offence_date: "2026-09-20", offence_description: "Speeding 80 km/h in a posted 60 km/h zone",
  statute_section: "HTA 128", set_fine: 95, total_payable: 125, court_location: "Mississauga POA Court", ticket_city: "Mississauga",
  low_confidence_fields: [], notes: null, driver_licence_number: "A1234-56789-01234",
};

test("reader: a clear ticket image fills the matter, marks the document and settles ready", async () => {
  const { db, tables, ops, invoked } = readerDb({ documents: [{ id: IMG, storage_path: `${MATTER_ID}/${IMG}.jpg`, content_type: "image/jpeg" }] });
  const seen = [];
  const outcome = await reader.processPracticeIntake(db, MATTER_ID, "key", {
    today: TODAY, extract: async dataUrl => { seen.push(dataUrl); return ticketRaw; }, log: () => {},
  });
  assert.equal(outcome, "ready");
  assert.deepEqual(ops[0], ["rpc", "practice_claim_intake_scan", { p_matter_id: MATTER_ID }]);
  assert.deepEqual(seen, ["data:image/jpeg;base64,AQID"]);
  assert.ok(ops.some(op => op[0] === "download" && op[1] === "practice-documents"));
  const matter = tables.practice_matters[0];
  assert.deepEqual([matter.intake_review_status, matter.offence_number, matter.option_deadline, matter.ticket_city],
    ["ready", "4009 123456A", "2026-10-05", "Mississauga"]);
  assert.equal(matter.field_sources.offence_number.documentId, IMG);
  assert.match(matter.review_notes, /Read automatically from 1 image/);
  const doc = tables.practice_matter_documents[0];
  assert.deepEqual([doc.kind, doc.extraction_status], ["ticket", "extracted"]);
  assert.equal(JSON.stringify(doc.extracted).includes("A1234"), false, "the licence number is not stored");
  assert.deepEqual(tables.practice_matter_events[0].detail, { read: 1, unread: 0, reviewStatus: "ready" });
  assert.equal(tables.practice_matter_events[0].event, "documents_read");
  assert.deepEqual(invoked, [["process-practice-notices", { body: {} }]], "the staff alert worker is woken");
});

test("reader: PDFs, unreadable images and failures end in needs_review with clear notes", async () => {
  const mixed = readerDb({ documents: [
    { id: IMG, storage_path: `${MATTER_ID}/${IMG}.jpg`, content_type: "image/jpeg" },
    { id: PDF, storage_path: `${MATTER_ID}/${PDF}.pdf`, content_type: "application/pdf" },
    { id: MISSING, storage_path: `${MATTER_ID}/missing.png`, content_type: "image/png" },
  ] });
  const logs = [];
  assert.equal(await reader.processPracticeIntake(mixed.db, MATTER_ID, "key", {
    today: TODAY, extract: async () => ticketRaw, log: (...parts) => logs.push(parts.join(" ")),
  }), "needs_review");
  const matter = mixed.tables.practice_matters[0];
  assert.equal(matter.intake_review_status, "needs_review");
  assert.match(matter.review_notes, /1 PDF not read automatically/);
  assert.match(matter.review_notes, /1 document could not be read/);
  assert.deepEqual(mixed.tables.practice_matter_documents.map(doc => doc.extraction_status), ["extracted", "skipped", "failed"]);
  assert.deepEqual(logs, ["practice ticket read failed download_failed"]);

  const broken = readerDb({ documents: [{ id: IMG, storage_path: `${MATTER_ID}/${IMG}.jpg`, content_type: "image/jpeg" }] });
  assert.equal(await reader.processPracticeIntake(broken.db, MATTER_ID, "", { today: TODAY, log: () => {} }), "needs_review",
    "no API key: the image is recorded as unread");
  assert.equal(broken.tables.practice_matter_documents[0].extraction_status, "failed");

  const general = readerDb({ matter: { area: "general", review_notes: "Client note." } });
  assert.equal(await reader.processPracticeIntake(general.db, MATTER_ID, "key", { log: () => {} }), "failed");
  assert.equal(general.tables.practice_matters[0].intake_review_status, "needs_review");
  assert.equal(general.tables.practice_matters[0].review_notes,
    "Client note.\nDocuments received. Automatic reading failed, so review the uploads directly before acting.");
  assert.equal(general.invoked.length, 1);

  const failing = readerDb({ documents: [{ id: IMG, storage_path: `${MATTER_ID}/${IMG}.jpg`, content_type: "image/jpeg" }], failMatterUpdate: true });
  assert.equal(await reader.processPracticeIntake(failing.db, MATTER_ID, "key", { today: TODAY, extract: async () => ticketRaw, log: () => {} }), "failed");

  const unclaimed = readerDb({ claim: false });
  assert.equal(await reader.processPracticeIntake(unclaimed.db, MATTER_ID, "key"), "skipped");
  assert.deepEqual(unclaimed.ops.map(op => op[0]), ["rpc"], "nothing else is touched without the claim");
  assert.equal(unclaimed.invoked.length, 0);
});

test("reader: reads two images at a time and still merges them in upload order", async () => {
  let active = 0;
  let peak = 0;
  const seen = await reader.mapInOrder([30, 5, 20, 1, 10], 2, async delay => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, delay));
    active -= 1;
    return delay;
  });
  assert.deepEqual(seen, [30, 5, 20, 1, 10]);
  assert.equal(peak, 2);
  assert.deepEqual(await reader.mapInOrder([], 2, async value => value), []);

  const ids = ["72000000-0000-4000-8000-000000000001", "72000000-0000-4000-8000-000000000002", "72000000-0000-4000-8000-000000000003"];
  const { db, tables } = readerDb({ documents: ids.map(id => ({ id, storage_path: `${MATTER_ID}/${id}.jpg`, content_type: "image/jpeg" })) });
  let call = 0;
  await reader.processPracticeIntake(db, MATTER_ID, "key", {
    today: TODAY, log: () => {},
    extract: async () => {
      const mine = call++;
      // The first upload answers last; it must still win the empty fields.
      await new Promise(resolve => setTimeout(resolve, mine === 0 ? 25 : 1));
      return { ...ticketRaw, offence_number: `4009 00000${mine}` };
    },
  });
  const matter = tables.practice_matters[0];
  assert.equal(matter.offence_number, "4009 000000");
  assert.equal(matter.field_sources.offence_number.documentId, ids[0]);
  assert.match(matter.review_notes, /offence number as "4009 000001", but the file has "4009 000000"/);
});

test("extract: forced tool call with the privacy prompt, same gateway, model and timeout", async () => {
  let request;
  const raw = await extract.extractOffenceNotice("key", "data:image/png;base64,AAAA", async (url, init) => {
    request = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: {
      name: "extract_ontario_offence_notice", arguments: JSON.stringify({ offence_number: "123" }) } }] } }] }), { status: 200 });
  });
  assert.deepEqual(raw, { offence_number: "123" });
  assert.equal(request.url, "https://ai.gateway.lovable.dev/v1/chat/completions");
  assert.equal(request.body.model, "google/gemini-2.5-flash");
  assert.deepEqual(request.body.tool_choice, { type: "function", function: { name: "extract_ontario_offence_notice" } });
  assert.deepEqual(Object.keys(request.body.tools[0].function.parameters.properties), [
    "offence_number", "offence_date", "offence_description", "statute_section", "set_fine", "total_payable",
    "court_location", "ticket_city", "low_confidence_fields", "notes"]);
  const prompt = request.body.messages[0].content[0].text;
  assert.match(prompt, /Never return a driver's licence number, a licence plate number/);
  assert.match(prompt, /Never guess, infer, calculate or complete a partial value/);
  assert.equal(request.body.messages[0].content[1].image_url.url, "data:image/png;base64,AAAA");
  assert.ok(request.init.signal instanceof AbortSignal);
  assert.equal(request.init.headers.Authorization, "Bearer key");
  const code = async (fetcher, apiKey = "key") => extract.extractOffenceNotice(apiKey, "data:x", fetcher).then(() => null, error => error.code);
  assert.equal(await code(async () => new Response("{}", { status: 500 })), "extraction_http_500");
  assert.equal(await code(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })), "extraction_response_invalid");
  assert.equal(await code(async () => new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "other", arguments: "{}" } }] } }] }))), "extraction_response_invalid");
  assert.equal(await code(async () => { throw new Error("offline"); }), "extraction_network_error");
  assert.equal(await code(async () => { throw new Error("never called"); }, ""), "extraction_not_configured");
  assert.equal(extract.imageBytesToDataUrl(new Uint8Array([1, 2, 3]), "image/jpeg"), "data:image/jpeg;base64,AQID");
});

// ---------------------------------------------------------------------------
// The three Deno entry points, with Deno, EdgeRuntime and Supabase faked.
// ---------------------------------------------------------------------------

const env = {
  SUPABASE_URL: "https://project.test", SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-tests-0123456789",
  PRACTICE_PORTAL_SIGNING_SECRET: SECRET, RESEND_API_KEY: "re_test", LOVABLE_API_KEY: "",
  IDR_CRON_SECRET: "cron-secret-for-tests-0123456789abcdef",
};
const waitUntil = [];
globalThis.Deno = { env: { get: key => env[key] } };
globalThis.EdgeRuntime = { waitUntil: task => waitUntil.push(task) };
const adminCalls = [];
const adminResults = {};
globalThis.__practiceFakeAdmin = {
  rpc: async (name, args) => {
    adminCalls.push([name, args]);
    const result = adminResults[name];
    return typeof result === "function" ? result(args) : result || { data: null, error: null };
  },
  storage: { from: bucket => ({
    createSignedUploadUrl: async objectPath => ({ data: { signedUrl: `https://project.test/upload/${bucket}/${objectPath}` }, error: null }),
    createSignedUrl: async objectPath => ({ data: { signedUrl: `https://project.test/sign/${bucket}/${objectPath}` }, error: null }),
    list: async () => ({ data: [{ name: "70000000-0000-4000-8000-000000000001.jpg" }], error: null }),
    download: async () => ({ data: null, error: { message: "unused" } }),
  }) },
  functions: { invoke: async name => { adminCalls.push(["invoke", name]); return { data: null, error: null }; } },
  from: () => { throw new Error("unexpected table access"); },
};
async function loadEntry(relative) {
  const outfile = path.join(temporary, `${relative.replace(/[/.]/g, "-")}.mjs`);
  await build({
    entryPoints: [path.join(root, relative)], outfile, bundle: true, format: "esm", platform: "node", logLevel: "silent",
    plugins: [{ name: "deno-remote-fakes", setup(builder) {
      builder.onResolve({ filter: /^https:\/\// }, args => ({ path: args.path, namespace: "fake" }));
      builder.onLoad({ filter: /.*/, namespace: "fake" }, args => ({
        contents: args.path.includes("supabase-js")
          ? "export const createClient = () => globalThis.__practiceFakeAdmin;"
          : "export const serve = () => {};",
        loader: "js",
      }));
    } }],
  });
  return import(pathToFileURL(outfile).href);
}

test("entry: practice-intake wires the handler, storage and the background reader", async () => {
  const { handler } = await loadEntry("supabase/functions/practice-intake/index.ts");
  adminResults.practice_register_intake = { data: [{ matter_id: MATTER_ID, client_id: CLIENT_A, matter_number: "TKT-2026-0012", returning_client: false }], error: null };
  adminResults.practice_finalize_intake = { data: "pending_scan", error: null };
  adminResults.practice_claim_intake_scan = { data: false, error: null };
  const submit = await post(handler, INTAKE_URL, trafficForm());
  const body = await submit.json();
  assert.equal(submit.status, 200);
  assert.match(body.uploads[0].signedUrl, new RegExp(`^https://project.test/upload/practice-documents/${MATTER_ID}/`));
  const finalize = await post(handler, INTAKE_URL, { action: "finalize", matterId: MATTER_ID, intakeToken: body.intakeToken,
    uploaded: ["70000000-0000-4000-8000-000000000001"] });
  assert.deepEqual(await finalize.json(), { ok: true, received: 1 });
  await Promise.all(waitUntil.splice(0));
  assert.deepEqual(adminCalls.find(([name]) => name === "practice_claim_intake_scan"), ["practice_claim_intake_scan", { p_matter_id: MATTER_ID }]);
});

test("entry: practice-portal wires token checks and the session RPC", async () => {
  const { handler } = await loadEntry("supabase/functions/practice-portal/index.ts");
  adminResults.practice_portal_session = { data: { client: { id: CLIENT_A, firstName: "Jordan", email: "jordan@example.com" },
    practice: { name: "AnderHue Paralegal Professional Corporation", displayName: "AnderHue Paralegal" }, revokedBefore: null, files: [] }, error: null };
  const session = await post(handler, PORTAL_URL, { action: "session", token: await tokenFor(CLIENT_A, Math.floor(Date.now() / 1000) - 5) });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).client.displayName, "Jordan");
  const expired = await post(handler, PORTAL_URL, { action: "session", token: "ahp1.x" });
  assert.deepEqual([expired.status, (await expired.json()).error], [401, EXPIRED]);
  adminResults.practice_request_portal_link = { data: true, error: null };
  const link = await post(handler, PORTAL_URL, { action: "request_link", email: "jordan@example.com", elapsedMs: 5000 });
  assert.deepEqual(await link.json(), { ok: true });
  await Promise.all(waitUntil.splice(0));
  assert.ok(adminCalls.some(call => call[0] === "invoke" && call[1] === "process-practice-notices"));
});

test("entry: process-practice-notices authenticates, sweeps, then claims, freezes, sends and finishes", async () => {
  const { handler } = await loadEntry("supabase/functions/process-practice-notices/index.ts");
  const url = "https://project.test/functions/v1/process-practice-notices";
  const call = headers => handler(new Request(url, { method: "POST", headers, body: "{}" }));
  assert.equal((await handler(new Request(url, { method: "GET" }))).status, 405);
  assert.deepEqual([(await call({})).status], [401]);
  assert.equal((await call({ "x-cron-secret": "wrong-secret-wrong-secret-wrong-secret" })).status, 401);

  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    sent.push({ url: String(input), key: init.headers["Idempotency-Key"], body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ id: "em_live" }), { status: 200 });
  };
  try {
    adminCalls.length = 0;
    adminResults.practice_sweep_stalled_intakes = { data: 2, error: null };
    adminResults.claim_practice_notices = { data: [makeNotice("intake_received", "traffic", { id: "live-1" })], error: null };
    adminResults.freeze_practice_notice = args => ({ data: args.p_payload, error: null });
    adminResults.finish_practice_notice = { data: true, error: null };
    const response = await call({ authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` });
    assert.deepEqual(await response.json(), { ok: true, swept: 2, claimed: 1, sent: 1, retry: 0, failed: 0, recordingFailed: 0 });
    assert.deepEqual(adminCalls.map(([name]) => name), ["practice_sweep_stalled_intakes", "claim_practice_notices",
      "freeze_practice_notice", "finish_practice_notice"]);
    assert.deepEqual(adminCalls[1][1], { p_limit: 10 });
    assert.deepEqual(adminCalls[3][1], { p_id: "live-1", p_claim_id: "claim-1", p_status: "sent", p_provider_email_id: "em_live", p_failure_code: null });
    assert.equal(sent[0].key, "practice-notice/live-1");
    assert.equal(sent[0].body.from, "AnderHue Paralegal <files@anderhue.ca>");

    adminCalls.length = 0;
    env.PRACTICE_PORTAL_SIGNING_SECRET = "";
    const noSecret = await call({ "x-cron-secret": env.IDR_CRON_SECRET });
    assert.deepEqual([noSecret.status, (await noSecret.json()).error], [503, "portal_signing_secret_missing"]);
    assert.deepEqual(adminCalls.map(([name]) => name), ["practice_sweep_stalled_intakes"], "the outbox is left untouched");
    env.PRACTICE_PORTAL_SIGNING_SECRET = SECRET;
    env.RESEND_API_KEY = "";
    const noKey = await call({ "x-cron-secret": env.IDR_CRON_SECRET });
    assert.deepEqual([noKey.status, (await noKey.json()).error], [503, "email_configuration_missing"]);
  } finally {
    globalThis.fetch = realFetch;
    env.RESEND_API_KEY = "re_test";
    env.PRACTICE_PORTAL_SIGNING_SECRET = SECRET;
  }
});

// ---------------------------------------------------------------------------
// Repository wiring and copy rules
// ---------------------------------------------------------------------------

test("config.toml declares the three functions with verify_jwt = false and a comment", () => {
  const config = readFileSync(path.join(root, "supabase/config.toml"), "utf8");
  for (const name of ["practice-intake", "practice-portal", "process-practice-notices"]) {
    const block = config.match(new RegExp(`\\[functions\\.${name}\\]\\n(#[^\\n]+)\\nverify_jwt = false\\n`));
    assert.ok(block, `[functions.${name}] block with a one-line comment`);
  }
});

test("copy: user-facing messages are plain sentences without em dashes", () => {
  const messages = [...Object.values(core.MESSAGES), ...Object.values(portal.PORTAL_MESSAGES),
    ...Object.values(intake.INTAKE_MESSAGES), ...Object.values(notices.CLIENT_HEADLINES), notices.RETAINER_LINE];
  for (const message of messages) {
    assert.equal(message.includes(EM_DASH), false, message);
    assert.match(message, /^[A-Z]/, `${message} starts like a sentence`);
  }
  for (const message of [...Object.values(core.MESSAGES), ...Object.values(portal.PORTAL_MESSAGES), ...Object.values(intake.INTAKE_MESSAGES)]) {
    assert.match(message, /\.$/, `${message} ends with a full stop`);
  }
  const files = ["_shared/practice-intake-core.ts", "_shared/practice-portal-token.ts", "_shared/practice-portal-core.ts",
    "_shared/practice-intake-handler.ts", "_shared/practice-notices.ts", "_shared/practice-extract.ts",
    "_shared/process-practice-intake.ts", "practice-intake/index.ts", "practice-portal/index.ts", "process-practice-notices/index.ts"];
  for (const file of files) {
    const source = readFileSync(path.join(root, "supabase/functions", file), "utf8");
    assert.equal(source.includes(EM_DASH), false, `${file} has no em dash`);
  }
});
