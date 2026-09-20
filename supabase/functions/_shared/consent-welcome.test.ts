// Repository-standard pinned test assertions.
// deno-lint-ignore no-import-prefix
import { assert, assertEquals, assertRejects, assertThrows } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { consentWelcomeDocuments } from "./consent-welcome-documents.ts";
import { consentWelcomeEmail } from "./consent-welcome-email.ts";
import { consentWelcomePayment } from "./consent-welcome-payment.ts";
import { processConsentWelcome, sendConsentWelcome, type ConsentWelcomeDependencies } from "./consent-welcome-delivery.ts";
import { type ConsentWelcomeContext, type ConsentWelcomeEmail, ConsentWelcomeError, consentWelcomeHash, welcomeTicketNumbers } from "./consent-welcome-types.ts";

const ids = { job: "10000000-0000-4000-8000-000000000001", submission: "20000000-0000-4000-8000-000000000001", client: "30000000-0000-4000-8000-000000000001", intent: "40000000-0000-4000-8000-000000000001", invite: "50000000-0000-4000-8000-000000000001", claim: "60000000-0000-4000-8000-000000000001" };
const pdf = new TextEncoder().encode("%PDF-1.7\nsynthetic-private-consent\n%%EOF\n");
const ticketBytes = new Uint8Array([255, 216, 255, 25]);
const now = Date.parse("2026-09-21T16:00:00Z");
const sessionId = "cs_live_SyntheticSession123";
function context(): ConsentWelcomeContext {
  return { id: ids.job, eligible: true, source_type: "submission", submission_id: ids.submission, invite_id: null,
    source_fingerprint: "a".repeat(64), recipient: "alex@example.test", first_name: "Alex", last_name: "Example", preferred_locale: "en",
    ticket_number: "E-12345678 A", ticket_document_bucket: "assessment-tickets", ticket_document_path: `${ids.submission}/ticket.jpg`,
    ticket_document_owner_id: ids.submission, ticket_upload_required: true, consent_bucket: "consent-forms", consent_form_path: `${ids.submission}/consent-form.pdf`,
    signature_method: "checkbox", consent_sha256: null, client_id: ids.client, submission_status: "awaiting_payment", payment_recorded: false,
    payment_unknown: false, representation_paid_at: null, representation_checkout_session_id: null, representation_payment_intent_id: null,
    checkout_sessions: [], payment_link: null };
}
function withCheckout(kind = "ticket_only"): ConsentWelcomeContext {
  return { ...context(), checkout_sessions: [{ id: ids.intent, client_id: ids.client, ticket_submission_id: ids.submission,
    checkout_kind: kind, status: "open", stripe_checkout_session_id: sessionId }],
    payment_link: { code: "a".repeat(22), expires_at: new Date(now + 3600000).toISOString(), checkout_intent_id: ids.intent, stripe_checkout_session_id: sessionId } };
}
function stripeSession(kind = "ticket_only") {
  return { id: sessionId, livemode: true, mode: "payment", status: "open", payment_status: "unpaid", payment_intent: null,
    expires_at: (now + 3600000) / 1000, client_reference_id: ids.submission,
    metadata: { ticket_submission_id: ids.submission, submission_id: ids.submission, client_id: ids.client,
      checkout_intent_id: ids.intent, fabsy_checkout_kind: kind, idr_client_id: ids.client, idr_order_id: ids.intent } };
}
function harness(change: Partial<ConsentWelcomeDependencies> = {}) {
  let claimed = false; const sent: ConsentWelcomeEmail[] = []; const finished: unknown[][] = []; const starts: unknown[][] = [];
  const job = { id: ids.job, claim_id: ids.claim, source_type: "submission" as const, submission_id: ids.submission, invite_id: null };
  const deps: ConsentWelcomeDependencies = {
    claim: () => { if (claimed) return Promise.resolve(null); claimed = true; return Promise.resolve(job); },
    context: () => Promise.resolve(context()), readDocument: bucket => Promise.resolve(bucket === "assessment-tickets" ? ticketBytes : pdf),
    payment: () => Promise.resolve({ state: "unpaid", paymentUrl: null }),
    begin: (...args) => { starts.push(args); return Promise.resolve(true); },
    send: payload => { sent.push(payload); return Promise.resolve("provider_accepted"); },
    finish: (...args) => { finished.push(args); return Promise.resolve(true); }, ...change,
  };
  return { deps, sent, finished, starts };
}

Deno.test("welcome attaches exact native consent, keeps full stored ticket, and gives precheckout instructions without fabricated link", async () => {
  const test = harness(); const result = await processConsentWelcome(test.deps);
  assertEquals(result.sent, 1); assertEquals(test.starts.length, 1);
  assertEquals(test.sent[0].subject, "Ticket E-12345678 A — Welcome and your consent copy");
  assertEquals(test.sent[0].to, ["alex@example.test"]);
  assertEquals(atob(test.sent[0].attachments[0].content), new TextDecoder().decode(pdf));
  assertEquals(test.sent[0].attachments.length, 1); // Uploaded ticket is proof, not an email attachment.
  assertEquals(test.sent[0].attachments[0].filename, "Consent-copy.pdf");
  assert(test.sent[0].text.includes("Complete payment from your ticket upload screen"));
  assert(!test.sent[0].text.includes("/pay/") && !test.sent[0].text.includes("/portal"));
  assert(test.sent[0].text.includes("Once payment and the required information are confirmed"));
  assert(test.sent[0].text.includes("does not confirm that a plea or disclosure request has been filed"));
  assertEquals((test.starts[0][3] as unknown[]).length, 2);
});
Deno.test("actual ticket validation preserves stored format and accepts explicit multiple-ticket arrays only", () => {
  assertEquals(welcomeTicketNumbers({ ...context(), ticket_numbers: ["E-12345678 A", "F87654321B"] }), ["E-12345678 A", "F87654321B"]);
  for (const value of ["1", "unknown 1", "", "E12345678A,F87654321B", "<script>1", "ABCD"]) {
    assertThrows(() => welcomeTicketNumbers({ ...context(), ticket_number: value }));
  }
});
Deno.test("standalone unlinked consent sends only actual signed copy with no ticket-upload/payment claim", async () => {
  const invite = { ...context(), source_type: "invite" as const, submission_id: null, invite_id: ids.invite,
    consent_form_path: `standalone/${ids.invite}/${ids.claim}/signed-consent.pdf`, consent_sha256: await consentWelcomeHash(pdf),
    signature_method: "typed", ticket_numbers: ["E12345678A", "F87654321B"], payment_unknown: true };
  const documents = await consentWelcomeDocuments(invite, bucket => { assertEquals(bucket, "consent-forms"); return Promise.resolve(pdf); });
  const email = consentWelcomeEmail(invite, documents, { state: "unknown", paymentUrl: null });
  assertEquals(email.subject, "Ticket E12345678A, F87654321B — Welcome and your consent copy");
  assert(!email.text.includes("ticket upload") && !email.text.includes("outstanding"));
});
Deno.test("manual consent requires matched scan and audit hashes and attaches both", async () => {
  const invite = { ...context(), source_type: "invite" as const, submission_id: null, invite_id: ids.invite,
    consent_form_path: `standalone/${ids.invite}/${ids.claim}/signed-consent.pdf`, consent_sha256: await consentWelcomeHash(pdf), signature_method: "manual_scan",
    manual_scan_bucket: "representation-consent-scans", manual_scan_pdf_path: `manual/${ids.invite}/${ids.claim}/signed-scan.pdf`, manual_scan_pdf_sha256: await consentWelcomeHash(pdf) };
  assertEquals((await consentWelcomeDocuments(invite, () => Promise.resolve(pdf))).attachments.map(item => item.filename), ["Signed-consent-scan.pdf", "Consent-signing-record.pdf"]);
  await assertRejects(() => consentWelcomeDocuments({ ...invite, manual_scan_pdf_sha256: "f".repeat(64) }, () => Promise.resolve(pdf)), ConsentWelcomeError, "consent_hash_mismatch");
  await assertRejects(() => consentWelcomeDocuments({ ...invite, manual_scan_pdf_path: `manual/${ids.client}/${ids.claim}/signed-scan.pdf` }, () => Promise.resolve(pdf)), ConsentWelcomeError, "manual_scan_ownership_invalid");
});
Deno.test("missing ticket or consent attachment prevents begin/send and remains pending", async () => {
  for (const unavailable of ["assessment-tickets", "consent-forms"]) {
    const test = harness({ readDocument: bucket => bucket === unavailable ? Promise.reject(new ConsentWelcomeError("welcome_document_unavailable")) : Promise.resolve(pdf) });
    const result = await processConsentWelcome(test.deps);
    assertEquals(result.pending, 1); assertEquals(test.sent.length, 0); assertEquals(test.starts.length, 0);
  }
});
Deno.test("changed recipient/source or document bytes cannot escape the pre-send recheck", async () => {
  let reads = 0;
  const changedRecipient = harness({ context: () => Promise.resolve(reads++ ? { ...context(), source_fingerprint: "b".repeat(64), recipient: "other@example.test" } : context()) });
  assertEquals((await processConsentWelcome(changedRecipient.deps)).pending, 1); assertEquals(changedRecipient.sent.length, 0);
  let documents = 0;
  const changedFile = harness({ readDocument: bucket => Promise.resolve(bucket === "assessment-tickets" ? ticketBytes : ++documents === 1 ? pdf : new TextEncoder().encode("%PDF-1.7\nchanged-document\n%%EOF\n")) });
  assertEquals((await processConsentWelcome(changedFile.deps)).pending, 1); assertEquals(changedFile.starts.length, 0);
});
Deno.test("payment arriving during preparation suppresses the stale unpaid reminder", async () => {
  let calls = 0; const test = harness({ payment: () => Promise.resolve({ state: calls++ ? "paid" : "unpaid", paymentUrl: null }) });
  assertEquals((await processConsentWelcome(test.deps)).pending, 1); assertEquals(test.sent.length, 0); assertEquals(test.starts.length, 0);
});
Deno.test("false begin CAS never sends; uncertain begin result holds without a later provider retry", async () => {
  const rejected = harness({ begin: () => Promise.resolve(false) });
  assertEquals((await processConsentWelcome(rejected.deps)).pending, 1); assertEquals(rejected.sent.length, 0);
  const uncertain = harness({ begin: () => Promise.reject(new Error("lost database response")) });
  assertEquals((await processConsentWelcome(uncertain.deps)).indeterminate, 1); assertEquals(uncertain.sent.length, 0);
});
Deno.test("Resend uses stable idempotency and attachment bytes; uncertain send has no automatic retry", async () => {
  const test = harness(); await processConsentWelcome(test.deps); let calls = 0;
  await sendConsentWelcome("synthetic", test.sent[0], ids.job, (_url, options) => {
    calls++; assertEquals((options!.headers as Record<string, string>)["Idempotency-Key"], `consent-welcome-v1/${ids.job}`);
    assertEquals(options!.redirect, "error"); assertEquals(JSON.parse(String(options!.body)).attachments.length, 1);
    return Promise.resolve(Response.json({ id: "provider_id" }));
  });
  assertEquals(calls, 1);
  const uncertain = harness({ send: () => Promise.reject(new ConsentWelcomeError("welcome_provider_uncertain")) });
  assertEquals((await processConsentWelcome(uncertain.deps)).indeterminate, 1); assertEquals(uncertain.starts.length, 1);
  await assertRejects(() => sendConsentWelcome("synthetic", test.sent[0], ids.job, () => Promise.resolve(Response.json(null))), ConsentWelcomeError);
});
Deno.test("lost completion write records reconciliation failure without sending again", async () => {
  const test = harness({ finish: () => Promise.reject(new Error("lost receipt")) });
  assertEquals((await processConsentWelcome(test.deps)).recordingFailed, 1); assertEquals(test.sent.length, 1);
});
Deno.test("paid/unknown welcome omits reminders and uses established locale fallback", async () => {
  const documents = await consentWelcomeDocuments(context(), bucket => Promise.resolve(bucket === "assessment-tickets" ? ticketBytes : pdf));
  for (const state of ["paid", "unknown"] as const) {
    const email = consentWelcomeEmail({ ...context(), preferred_locale: "es" }, documents, { state, paymentUrl: null });
    assert(!email.text.includes("outstanding") && !email.text.includes("/pay/"));
    assertEquals(email.headers["Content-Language"], "en"); assertEquals(email.headers["X-Fabsy-Preferred-Locale"], "es");
    assert(email.html.includes("approved translation is not yet available"));
  }
});
Deno.test("new authoritative awaiting-payment intake before checkout yields unpaid without provider call or fabricated button", async () => {
  assertEquals(await consentWelcomePayment(context(), "synthetic", () => { throw new Error("must not call Stripe without a session"); }, now), { state: "unpaid", paymentUrl: null });
  for (const changed of [{ submission_status: "pending" }, { payment_unknown: true }, { representation_paid_at: "2026-01-01" }, { representation_payment_intent_id: "pi_unknown" }, { payment_recorded: true }]) {
    assertEquals((await consentWelcomePayment({ ...context(), ...changed }, "synthetic", fetch, now)).state, "unknown");
  }
});
Deno.test("matching live unpaid representation checkout yields only its existing bound unexpired pay link", async () => {
  for (const kind of ["ticket_only", "ticket_with_addon", "photo_radar"]) {
    const snapshot = withCheckout(kind);
    assertEquals(await consentWelcomePayment(snapshot, "synthetic", () => Promise.resolve(Response.json(stripeSession(kind))), now), { state: "unpaid", paymentUrl: `https://fabsy.ca/pay/${"a".repeat(22)}` });
    assertEquals((await consentWelcomePayment({ ...snapshot, payment_link: { ...snapshot.payment_link!, expires_at: new Date(now - 1).toISOString() } }, "synthetic", () => Promise.resolve(Response.json(stripeSession(kind))), now)).paymentUrl, null);
  }
});
Deno.test("Stripe paid or pending payment, source mismatch and failed lookups never produce unpaid reminder", async () => {
  for (const patch of [{ payment_status: "paid", status: "complete" }, { payment_status: "unpaid", status: "complete" }, { livemode: false }, { client_reference_id: ids.client }, { metadata: { ...stripeSession().metadata, client_id: ids.submission } }]) {
    assert((await consentWelcomePayment(withCheckout(), "synthetic", () => Promise.resolve(Response.json({ ...stripeSession(), ...patch })), now)).state !== "unpaid");
  }
  assertEquals((await consentWelcomePayment(withCheckout(), "synthetic", () => Promise.reject(new Error("provider unavailable")), now)).state, "unknown");
  assertEquals((await consentWelcomePayment(withCheckout(), "synthetic", () => Promise.resolve(Response.json(null)), now)).state, "unknown");
});
Deno.test("checkout-bound succeeded payment intent defeats webhook lag, unrelated report is not representation paid", async () => {
  for (const [status, expected] of [["succeeded", "paid"], ["processing", "unknown"]]) {
    assertEquals((await consentWelcomePayment(withCheckout(), "synthetic", () => Promise.resolve(Response.json({ ...stripeSession(), payment_intent: { id: "pi_SyntheticPayment123", livemode: true, status } })), now)).state, expected);
  }
  assertEquals((await consentWelcomePayment(withCheckout("idr_only"), "synthetic", () => { throw new Error("report excluded"); }, now)).state, "unknown");
});
Deno.test("Stripe preflight stops at its shared deadline and first unknown without walking a slow queue", async () => {
  const snapshot = withCheckout();
  snapshot.checkout_sessions = Array.from({ length: 10 }, (_, i) => ({ ...snapshot.checkout_sessions![0],
    id: `40000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, stripe_checkout_session_id: `${sessionId}${i}` }));
  let elapsed = 0, calls = 0;
  const result = await consentWelcomePayment(snapshot, "synthetic", () => {
    const reference = snapshot.checkout_sessions![calls++]; elapsed += 10000;
    return Promise.resolve(Response.json({ ...stripeSession(), id: reference.stripe_checkout_session_id,
      metadata: { ...stripeSession().metadata, checkout_intent_id: reference.id } }));
  }, now, () => elapsed);
  assertEquals(result, { state: "unknown", paymentUrl: null }); assertEquals(calls, 2);
  calls = 0;
  assertEquals((await consentWelcomePayment(snapshot, "synthetic", () => { calls++; return Promise.resolve(Response.json({}, { status: 503 })); }, now)).state, "unknown");
  assertEquals(calls, 1);
});
