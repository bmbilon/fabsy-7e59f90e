import assert from "node:assert/strict";
import { CHECKOUT_CONSENT_VERSION } from "../_shared/manual-representation.ts";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "https://esm.sh/pdf-lib@1.17.1";

Deno.env.set("SUPABASE_URL", "https://manual-checkout.example.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "synthetic-key");
Deno.env.set("SUPABASE_ANON_KEY", "synthetic-anon");
Deno.env.set("SITE_URL", "https://fabsy.example.test");
const originalFetch = globalThis.fetch;
let activeFetch: typeof fetch = () => Promise.reject(new Error("No test boundary"));
globalThis.fetch = (...args) => activeFetch(...args);
const { handler } = await import("./index.ts");
const { handler: generate } = await import("../generate-consent-form/index.ts");
globalThis.fetch = originalFetch;
const submissionId = "11111111-1111-4111-8111-111111111111";
const accessToken = "a".repeat(64);
const tokenHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(accessToken)))).map(byte => byte.toString(16).padStart(2, "0")).join("");
const consent = { version: CHECKOUT_CONSENT_VERSION, accepted: true, method: "checkbox", pleadNotGuilty: false };
const request = (body: unknown, origin = "https://fabsy.example.test") => new Request("https://manual-checkout.example.test/functions/v1/manual-representation-link", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ submissionId, accessToken, ...body as object }),
});
type State = { row: Record<string, any>; patches: Record<string, unknown>[]; checkoutStatus: string | null; pdf: Uint8Array | null; fileExists: boolean };

async function boundary(run: (state: State) => Promise<void>) {
  const state: State = { row: {
    id: submissionId, client_id: submissionId, first_name: "Alex", last_name: "Example", email: "alex@example.test", ticket_number: "TEST-TICKET",
    ticket_type: "photo_radar", registered_owner_on_offence_date: "yes", violation: "Speeding", violation_date: "2026-09-01",
    status: "awaiting_payment", service_type: "representation", intake_source: "emailed_ticket", preferred_locale: "en",
    representation_access_token_hash: tokenHash, consent_form_path: null, intake_consent: null,
    ticket_document_path: `${submissionId}/emailed-ticket-receipt.json`,
  }, patches: [], checkoutStatus: null, pdf: null, fileExists: true };
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  activeFetch = async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.hostname, "manual-checkout.example.test", "No real network allowed");
    const method = options?.method || "GET";
    const body = typeof options?.body === "string" ? JSON.parse(options.body) : null;
    if (url.pathname.endsWith("/ticket_submissions")) {
      if (method === "PATCH") {
        assert.equal(url.searchParams.get("representation_access_token_hash"), `eq.${tokenHash}`);
        assert.equal(url.searchParams.get("status"), "eq.awaiting_payment");
        if (body.intake_consent) {
          assert.equal(url.searchParams.get("intake_consent"), "is.null");
          assert.equal(url.searchParams.get("consent_form_path"), "is.null");
        }
        state.patches.push(body); Object.assign(state.row, body);
      }
      return json(method === "GET" ? [state.row] : state.row);
    }
    if (url.pathname.endsWith("/idr_checkout_intents")) return json(state.checkoutStatus ? [{ status: state.checkoutStatus }] : []);
    if (url.pathname.includes("/object/list/assessment-tickets")) return json(state.fileExists ? [{ name: "emailed-ticket-receipt.json", metadata: { size: 100 } }] : []);
    if (url.pathname.includes("/object/consent-forms/")) { state.pdf = options?.body as Uint8Array; return json({ Key: url.pathname }); }
    throw new Error(`Unexpected boundary request ${method} ${url.pathname}`);
  };
  try { await run(state); } finally { activeFetch = () => Promise.reject(new Error("No test boundary")); }
}

Deno.test("checkout rejects absent, false, stale and coerced consent without writing", async () => {
  await boundary(async state => {
    for (const value of [null, {}, { ...consent, accepted: false }, { ...consent, accepted: "true" }, { ...consent, version: "old" }, { ...consent, pleadNotGuilty: "false" }]) {
      const response = await handler(request({ action: "consent", consent: value }));
      assert.equal(response.status, 400); await response.body?.cancel();
    }
    assert.deepEqual(state.patches, []);
  });
});

Deno.test("private checkout requires the case capability and staff-created emailed source", async () => {
  await boundary(async state => {
    const denied = await handler(request({ action: "consent", accessToken: "b".repeat(64), consent }));
    assert.equal(denied.status, 403); await denied.body?.cancel();
    state.row.intake_source = "web_upload";
    const otherSource = await handler(request({ action: "consent", consent }));
    assert.equal(otherSource.status, 403); await otherSource.body?.cancel();
    const staff = await handler(request({ action: "create" }));
    assert.equal(staff.status, 401); await staff.body?.cancel();
    assert.deepEqual(state.patches, []);
  });
});

Deno.test("both plea choices persist in the real generated PDF without a fabricated signature", async () => {
  for (const choice of [false, true]) await boundary(async state => {
    const response = await handler(request({ action: "consent", consent: { ...consent, pleadNotGuilty: choice, name: "Forged Name", acceptedAt: "1900-01-01", authorization: ["Forged"] } }));
    assert.equal(response.status, 200); await response.body?.cancel();
    const stored = state.row.intake_consent;
    assert.equal(stored.name, "Alex Example"); assert.equal(stored.pleadNotGuilty, choice);
    assert.notEqual(stored.acceptedAt, "1900-01-01"); assert.ok(!stored.authorization.includes("Forged"));
    assert.ok(!stored.authorization.join(" ").includes("Enter a not-guilty plea"));
    const pdfResponse = await generate(request({}));
    assert.equal(pdfResponse.status, 200); await pdfResponse.body?.cancel();
    const pdf = await PDFDocument.load(state.pdf!);
    const embedded = pdf.catalog.lookup(PDFName.of("Names"), PDFDict).lookup(PDFName.of("EmbeddedFiles"), PDFDict).lookup(PDFName.of("Names"), PDFArray);
    const stream = embedded.lookup(1, PDFDict).lookup(PDFName.of("EF"), PDFDict).lookup(PDFName.of("F"));
    assert.ok(stream instanceof PDFRawStream);
    const source = JSON.parse(new TextDecoder().decode(decodePDFRawStream(stream).decode()));
    assert.equal(source.fields.digitalSignature, "");
    assert.deepEqual(source.fields.intakeConsent, stored);
  });
});

Deno.test("retries preserve acceptance time and reject changed instructions", async () => {
  await boundary(async state => {
    const first = await handler(request({ action: "consent", consent })); const initial = await first.json();
    const retry = await handler(request({ action: "consent", consent })); const retried = await retry.json();
    assert.equal(retry.status, 200); assert.equal(retried.acceptedAt, initial.acceptedAt); assert.equal(state.patches.length, 1);
    const change = await handler(request({ action: "consent", consent: { ...consent, pleadNotGuilty: true } }));
    assert.equal(change.status, 409); await change.body?.cancel(); assert.equal(state.row.intake_consent.pleadNotGuilty, false);
  });
});

Deno.test("payment status uses verified checkout state and blocks closed cases", async () => {
  await boundary(async state => {
    state.row.status = "cancelled";
    const closed = await handler(request({ action: "read" })); assert.equal((await closed.json()).paymentState, "unavailable");
    state.checkoutStatus = "paid";
    const paid = await handler(request({ action: "read" })); assert.equal((await paid.json()).paymentState, "paid");
    const acceptance = await handler(request({ action: "consent", consent })); assert.equal(acceptance.status, 409); await acceptance.body?.cancel();
    assert.equal(state.patches.length, 0);
  });
});

Deno.test("changed case details cannot reuse an earlier checkout authorization", async () => {
  for (const [field, value] of [["ticket_number", "DIFFERENT-TICKET"], ["last_name", "Different"], ["ticket_type", "officer_issued"]]) await boundary(async state => {
    const accepted = await handler(request({ action: "consent", consent })); assert.equal(accepted.status, 200); await accepted.body?.cancel();
    state.row[field] = value;
    const stale = await handler(request({ action: "read" })); assert.equal(stale.status, 409); await stale.body?.cancel();
    const retry = await handler(request({ action: "consent", consent })); assert.equal(retry.status, 409); await retry.body?.cancel();
    assert.equal(state.patches.length, 1);
  });
});
