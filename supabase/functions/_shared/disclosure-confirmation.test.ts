import { assert, assertEquals, assertRejects, assertThrows } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { authenticatedCrown, disclosureNotice, parseConfirmation, readBoundedJson, secretMatches, type ImprovEmail } from "./disclosure-confirmation.ts";
import { processDisclosureNotices } from "./disclosure-delivery.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const now = new Date("2026-09-09T15:00:00Z");
const sample: ImprovEmail = {
  from: { email: "noreply@gov.ab.ca" }, to: [{ email: "hello@fabsy.ca" }],
  subject: "Disclosure Request Submitted", "message-id": "synthetic-confirmation@example.test",
  date: "Wed, 09 Sep 2026 07:03:00 -0600",
  headers: { "Authentication-Results": ["mx.google.com; dkim=pass header.d=gov.ab.ca; dmarc=pass header.from=gov.ab.ca"] },
  text: "Your request for disclosure has been received. A disclosure request for ticket T12345678Z was submitted using the Traffic Tickets Digital Service. You will be notified at this email address once disclosure is available. Please note that disclosure can take between 6 and 10 weeks. If you have not received a response within five weeks of your submission, please go to traffictickets.alberta.ca to check the status of the request.",
};

Deno.test("sample uses Crown estimate, not separate follow-up period", async () => {
  const parsed = await parseConfirmation(sample, now);
  assertEquals(parsed?.ticket_number, "T12345678Z");
  assertEquals(parsed?.confirmed_at, "2026-09-09T13:03:00.000Z");
  assertEquals(parsed?.timeframe_text, "Please note that disclosure can take between 6 and 10 weeks.");
  assertEquals(parsed?.parse_error, null);
});
Deno.test("HTML-only and changed estimates are extracted", async () => {
  const parsed = await parseConfirmation({ ...sample, text: "", html: `<h1>Your request for disclosure has been received</h1><p>A disclosure request for ticket <b>T12345678Z</b> was submitted.</p><p>Disclosure may take up to <b>12</b>&nbsp;weeks.</p>` }, now);
  assertEquals(parsed?.timeframe_text, "Disclosure may take up to 12 weeks.");
  assertEquals(parsed?.parse_error, null);
});
Deno.test("sender lookalikes, forwarded subject and unrelated messages ignored", async () => {
  for (const change of [{ from: { email: "noreply@gov.ab.ca.evil.test" } }, { subject: "Fwd: Disclosure Request Submitted" }, { subject: "Disclosure available" }]) {
    assertEquals(await parseConfirmation({ ...sample, ...change }, now), null);
  }
});
Deno.test("untrusted or nested authentication cannot pass", () => {
  for (const headers of [ {}, { "Authentication-Results": "evil.test; dmarc=pass header.from=gov.ab.ca" },
    { "Authentication-Results": ["mx.google.com; dmarc=fail header.from=gov.ab.ca", "mx.google.com; dmarc=pass header.from=gov.ab.ca"] },
    { "Authentication-Results": "mx.google.com; dkim=pass header.d=gov.ab.ca.evil.test" },
    { "Authentication-Results": "mx.google.com; dmarc=pass header.from=evil.test; dkim=fail header.d=gov.ab.ca" },
  ] as Record<string, string | string[]>[]) assertEquals(authenticatedCrown({ ...sample, headers }).ok, false);
});
Deno.test("missing or ambiguous information is retained for review", async () => {
  for (const change of [ { date: "not a date" }, { date: "Thu, 10 Sep 2026 07:03:00 -0600" }, { date: "Tue, 01 Sep 2026 07:03:00 -0600" },
    { headers: {} }, { to: [{ email: "other@fabsy.ca" }] }, { "message-id": "" },
    { text: sample.text + " A disclosure request for ticket T12345679Z was submitted." },
  ]) assert((await parseConfirmation({ ...sample, ...change }, now))?.parse_error);
  const first = await parseConfirmation({ ...sample, "message-id": "" }, now);
  const replay = await parseConfirmation({ ...sample, "message-id": "" }, now);
  assertEquals(first?.source_message_id, replay?.source_message_id);
});
Deno.test("an authenticated request acknowledgement does not require a timeframe", async () => {
  for (const text of [sample.text!.replace("Please note that disclosure can take between 6 and 10 weeks.", ""),
    sample.text + " Disclosure may take up to 12 weeks."]) {
    const parsed = await parseConfirmation({ ...sample, text }, now);
    assertEquals(parsed?.ticket_number, "T12345678Z");
    assertEquals(parsed?.timeframe_text, null);
    assertEquals(parsed?.parse_error, null);
  }
});
Deno.test("notice states the verified request with the full ticket and no timeline or plea claim", () => {
  const email = disclosureNotice({ recipient: "client@example.test", first_name: '<img src=x onerror="boom">',
    ticket_number: "T12345678Z", confirmed_on: "2026-09-09", timeframe_text: "Disclosure may take <12> weeks.",
    submission_id: "30000000-0000-4000-8000-000000000001" });
  assertEquals(email.subject, "Ticket T12345678Z — Disclosure requested");
  assert(email.html.includes("We’ve requested disclosure of evidence from the Crown"));
  assert(email.text.includes("We’ve requested disclosure of evidence from the Crown for ticket T12345678Z."));
  assert(email.html.includes("&lt;img"));
  assert(!email.html.includes("<img"));
  assert(!/\$198|insurance report|referral|weeks|September|plea|not guilty|evidence received|confirmed receipt/i.test(email.html));
});
Deno.test("portal receipt notice does not require Crown email metadata and rejects absent or malformed ticket references", () => {
  const snapshot = { recipient: "client@example.test", first_name: "Fixture", ticket_number: "T12345678Z",
    submission_id: "30000000-0000-4000-8000-000000000001" };
  assertEquals(disclosureNotice(snapshot).subject, "Ticket T12345678Z — Disclosure requested");
  for (const ticket_number of ["", "1234", "t12345678z", "T123 45678Z", "T12345678Z\nBcc: bad@example.test", "T".repeat(31), "MISSING"]) {
    assertThrows(() => disclosureNotice({ ...snapshot, ticket_number }));
  }
});
Deno.test("bounded JSON enforces streamed size and rejects arrays", async () => {
  await assertRejects(() => readBoundedJson(new Request("https://example.test", { method: "POST", body: "x".repeat(30) }), 20));
  await assertRejects(() => readBoundedJson(new Request("https://example.test", { method: "POST", body: "[]" })));
  assertEquals(await readBoundedJson(new Request("https://example.test", { method: "POST", body: "{}" })), {});
});
Deno.test("webhook and cron secrets cannot be empty or short", async () => {
  assertEquals(await secretMatches("", ""), false);
  assertEquals(await secretMatches("short", "short"), false);
  assertEquals(await secretMatches("a".repeat(64), "a".repeat(64)), true);
  assertEquals(await secretMatches("b".repeat(64), "a".repeat(64)), false);
});

Deno.test("worker preserves frozen payload for review after an unsaved provider receipt", async () => {
  const snapshot = { recipient: "client@example.test", first_name: "Fixture", ticket_number: "T12345678Z", confirmed_on: "2026-09-09", timeframe_text: "Disclosure can take 8 weeks.", submission_id: "30000000-0000-4000-8000-000000000001" };
  let available = true; let frozen: unknown = null; let first = true;
  const calls: { payload: unknown; key: string }[] = [];
  const db = { rpc: (name: string, args: Record<string, unknown>) => {
    if (name === "claim_disclosure_notices") { const claimed = available; available = false; return { data: claimed ? [{ id: "notice-1", claim_token: "lease", snapshot, email_payload: frozen }] : [], error: null }; }
    if (name === "freeze_disclosure_notice") { frozen ||= args.p_payload; return { data: frozen, error: null }; }
    if (name === "complete_disclosure_notice" && args.p_provider_id && first) { first = false; return { data: null, error: { message: "DB temporarily unavailable" } }; }
    return { data: true, error: null };
  } } as unknown as SupabaseClient;
  const send = async (payload: ReturnType<typeof disclosureNotice>, key: string) => { calls.push({ payload, key }); return "provider-1"; };
  assertEquals(await processDisclosureNotices(db, send), { sent: 0, failed: 1 });
  snapshot.first_name = "Changed after failed receipt";
  assertEquals(await processDisclosureNotices(db, send), { sent: 0, failed: 0 });
  assertEquals(calls.length, 1);
  assertEquals(calls[0].payload, frozen);
  assertEquals(calls[0].key, "disclosure-confirmation/notice-1");
});
Deno.test("snapshot persistence failure prevents sending", async () => {
  let available = true;
  const db = { rpc: (name: string) => {
    if (name === "claim_disclosure_notices") { const claimed=available; available=false; return { data: claimed ? [{ id: "x", claim_token: "y", email_payload: { subject: "frozen" } }] : [], error: null }; }
    return name === "freeze_disclosure_notice" ? { data: null, error: {} } : { data: true, error: null };
  } } as unknown as SupabaseClient;
  assertEquals(await processDisclosureNotices(db, () => { throw new Error("Must not send"); }), { sent: 0, failed: 1 });
});

Deno.test("an invalid full ticket in an unfrozen notice prevents provider delivery", async () => {
  let available = true;
  let recordedFailure = false;
  const db = { rpc: (name: string, args: Record<string, unknown>) => {
    if (name === "claim_disclosure_notices") {
      const claimed = available; available = false;
      return { data: claimed ? [{ id: "notice-1", claim_token: "lease", email_payload: null,
        snapshot: { recipient: "client@example.test", first_name: "Fixture", ticket_number: "",
          submission_id: "30000000-0000-4000-8000-000000000001" } }] : [], error: null };
    }
    assertEquals(name, "complete_disclosure_notice");
    assertEquals(args.p_error, "delivery_interrupted_or_uncertain");
    recordedFailure = true;
    return { data: true, error: null };
  } } as unknown as SupabaseClient;
  assertEquals(await processDisclosureNotices(db, () => { throw new Error("Must not send"); }), { sent: 0, failed: 1 });
  assert(recordedFailure);
});
