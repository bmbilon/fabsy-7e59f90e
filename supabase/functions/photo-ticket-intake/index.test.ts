import assert from "node:assert/strict";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { PHOTO_UPLOAD_CONSENT_VERSION, LEGACY_PHOTO_UPLOAD_CONSENT_VERSION } from "../_shared/intake-consent.ts";
import { processPhotoIntake } from "../_shared/process-photo-intake.ts";
import { photoIntakeDetails } from "../_shared/photo-intake-details.ts";

Deno.env.set("SUPABASE_URL", "https://photo-intake.example.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "synthetic-key");
const originalFetch = globalThis.fetch;
let activeFetch: typeof fetch = () => Promise.reject(new Error("No test boundary"));
globalThis.fetch = (...args) => activeFetch(...args);
const { handler } = await import("./index.ts");
const { handler: finalize } = await import("../generate-consent-form/index.ts");
const admin = createClient("https://photo-intake.example.test", "synthetic-key");
globalThis.fetch = originalFetch;
const submissionId = "11111111-1111-4111-8111-111111111111";
const accessToken = "a".repeat(64);
const request = (body: unknown) => new Request("https://photo-intake.example.test/functions/v1/photo-ticket-intake", {
  method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": crypto.randomUUID() }, body: JSON.stringify(body),
});
const prepare = {
  action: "prepare", submissionId, accessToken,
  file: { contentType: "image/png", size: 100 },
  consent: { accepted: true, method: "checkbox", version: PHOTO_UPLOAD_CONSENT_VERSION, pleadNotGuilty: true },
};
const fixture = { firstName: "Alex", lastName: "Example", ticketNumber: "TEST-TICKET", officer_issued_format: true };

async function boundary(run: (state: { row: Record<string, any>; clients: Record<string, any>[]; writes: string[]; ticketExists: boolean; pdf: Uint8Array | null; scanFail: boolean }) => Promise<void>) {
  const state = { row: {} as Record<string, any>, clients: [] as Record<string, any>[], writes: [] as string[], ticketExists: false, pdf: null as Uint8Array | null, scanFail: false };
  const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
  activeFetch = async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.hostname, "photo-intake.example.test");
    const method = options?.method || "GET";
    const body = typeof options?.body === "string" ? JSON.parse(options.body) : null;
    if (method !== "GET") state.writes.push(`${method} ${url.pathname}`);
    if (url.pathname.endsWith("/rpc/prepare_photo_ticket_intake") || url.pathname.endsWith("/rpc/prepare_photo_ticket_with_contact")) {
      if (!state.row.id) Object.assign(state.row, {
        id: body.p_id, client_id: body.p_id, service_type: "representation", status: "awaiting_payment", preferred_locale: "en",
        intake_mode: "photo_only", intake_review_status: "pending_scan", intake_consent: body.p_consent,
        representation_access_token_hash: body.p_token_hash, ticket_document_path: body.p_ticket_path,
        first_name: "", last_name: "", ticket_number: "", email: "", phone: "", ticket_type: "officer_issued",
      });
      else assert.equal(state.row.representation_access_token_hash, body.p_token_hash);
      if (url.pathname.endsWith("/rpc/prepare_photo_ticket_with_contact")) Object.assign(state.row, {
        email: body.p_email, intake_ticket_type: body.p_ticket_type,
        intake_bundle_requested: body.p_bundle_requested, landing_page_variant: body.p_landing_page,
      });
      return json(body.p_id);
    }
    if (url.pathname.endsWith("/rpc/save_photo_intake_contact")) {
      assert.equal(body.p_token_hash, state.row.representation_access_token_hash);
      state.row.email = body.p_email; state.row.phone = body.p_phone;
      return json(null);
    }
    if (url.pathname.endsWith("/ticket_submissions")) {
      if (method === "PATCH") {
        const expected = url.searchParams.get("intake_review_status");
        if (expected && state.row.intake_review_status !== expected.slice(3)) return json(null);
        Object.assign(state.row, body);
      }
      return json(state.row.id ? state.row : null);
    }
    if (url.pathname.endsWith("/clients") && method === "PATCH") { state.clients.push(body); return json(null); }
    if (url.pathname.includes("/object/upload/sign/")) return json({ url: `/object/upload/sign/assessment-tickets/${submissionId}/representation-ticket.png?token=synthetic-upload` });
    if (url.pathname.endsWith("/object/list/assessment-tickets")) return json(state.ticketExists ? [{ name: "representation-ticket.png", metadata: { size: 100 } }] : []);
    if (url.pathname.includes("/object/consent-forms/")) { state.pdf = options?.body as Uint8Array; return json({ Key: url.pathname }); }
    if (method === "GET" && url.pathname.includes("/assessment-tickets/")) return new Response("synthetic ticket bytes", { headers: { "Content-Type": "image/png" } });
    if (url.pathname.endsWith("/functions/v1/ocr-ticket")) {
      if (state.scanFail) return new Response("Scan unavailable", { status: 503 });
      return json({ success: true, data: fixture });
    }
    throw new Error(`Unexpected test request ${method} ${url.pathname}`);
  };
  try { await run(state); } finally { activeFetch = () => Promise.reject(new Error("No test boundary")); }
}

Deno.test("photo upload rejects missing consent and invalid files before creating any record", async () => {
  await boundary(async state => {
    for (const body of [{ ...prepare, consent: undefined }, { ...prepare, consent: { ...prepare.consent, accepted: false } }, { ...prepare, file: { contentType: "text/plain", size: 1 } }]) {
      const response = await handler(request(body)); assert.equal(response.status, 400); await response.body?.cancel();
    }
    assert.deepEqual(state.writes, []);
  });
});

Deno.test("a photo with no identity or contact fields saves affirmative consent bound to its file", async () => {
  await boundary(async state => {
    const response = await handler(request(prepare));
    const receipt = await response.json(); assert.equal(response.status, 200, JSON.stringify(receipt));
    assert.equal(state.row.first_name, ""); assert.equal(state.row.email, "");
    assert.equal(state.row.intake_consent.name, "");
    assert.equal(state.row.intake_consent.ticketDocumentPath, state.row.ticket_document_path);
    assert.equal(state.row.intake_consent.identitySource, "uploaded_ticket_pending_review");
    const beforeFile = await finalize(request({ submissionId, accessToken })); assert.equal(beforeFile.status, 409); await beforeFile.body?.cancel();
    state.ticketExists = true;
    const complete = await finalize(request({ submissionId, accessToken })); assert.equal(complete.status, 200); await complete.body?.cancel();
    assert.ok(state.pdf && state.pdf.length > 1000);
    assert.equal(state.row.intake_review_status, "pending_scan", "Success must not wait on OCR");
    assert.ok(!state.writes.some(path => path.includes("ocr-ticket")));
  });
});

Deno.test("true, false and legacy missing plea instructions survive intake and consent PDF creation", async () => {
  for (const choice of [true, false, undefined]) {
    await boundary(async state => {
      const consent = choice === undefined
        ? { accepted: true, method: "checkbox", version: LEGACY_PHOTO_UPLOAD_CONSENT_VERSION }
        : { ...prepare.consent, pleadNotGuilty: choice };
      const response = await handler(request({ ...prepare, consent }));
      assert.equal(response.status, 200); await response.body?.cancel();
      assert.equal(state.row.intake_consent.pleadNotGuilty, choice);
      state.ticketExists = true;
      const complete = await finalize(request({ submissionId, accessToken }));
      assert.equal(complete.status, 200); await complete.body?.cancel();
      assert.ok(state.pdf && state.pdf.length > 1000);
      assert.equal(state.row.intake_consent.pleadNotGuilty, choice);
      if (choice === undefined) assert.equal("pleadNotGuilty" in state.row.intake_consent, false);
    });
  }
});

Deno.test("contact details require email after receipt, with optional phone", async () => {
  await boundary(async state => {
    await (await handler(request(prepare))).body?.cancel();
    const early = await handler(request({ action: "contact", submissionId, accessToken, email: "alex@example.test" }));
    assert.equal(early.status, 403); await early.body?.cancel();
    state.row.consent_form_path = `${submissionId}/consent.pdf`;
    for (const contact of [{ email: "Alex@Example.test", phone: "" }, { email: "alex@example.test", phone: "+14035550123" }]) {
      const response = await handler(request({ action: "contact", submissionId, accessToken, ...contact }));
      assert.equal(response.status, 200); const result = await response.json();
      assert.equal(result.fields.email, contact.email.toLowerCase());
      assert.equal(result.fields.phone.replace(/\D/g, ""), contact.phone.replace(/\D/g, ""));
      assert.ok(state.row.consent_form_path);
    }
    for (const contact of [{ email: "", phone: "" }, { email: "", phone: "(403) 555-0123" }, { email: "bad-address", phone: "" }, { email: "alex@example.test", phone: "123" }]) {
      const response = await handler(request({ action: "contact", submissionId, accessToken, ...contact })); assert.equal(response.status, 400); await response.body?.cancel();
    }
    const badToken = await handler(request({ action: "contact", submissionId, accessToken: "b".repeat(64), email: "other@example.test" }));
    assert.equal(badToken.status, 403); await badToken.body?.cancel();
    assert.equal(state.row.email, "alex@example.test");
  });
});

Deno.test("background OCR enriches only the provisional client and preserves separately saved contact and consent", async () => {
  await boundary(async state => {
    await (await handler(request(prepare))).body?.cancel();
    state.row.consent_form_path = `${submissionId}/consent.pdf`; state.row.email = "alex@example.test";
    const consent = structuredClone(state.row.intake_consent);
    await processPhotoIntake(admin, submissionId);
    assert.equal(state.row.intake_review_status, "ready"); assert.equal(state.row.ticket_number, fixture.ticketNumber);
    assert.equal(state.row.email, "alex@example.test"); assert.deepEqual(state.row.intake_consent, consent);
    assert.equal(state.clients.length, 1); assert.equal(state.clients[0].email, undefined); assert.equal(state.clients[0].drivers_license, undefined);
    const writes = state.writes.length;
    await processPhotoIntake(admin, submissionId);
    assert.equal(state.writes.length, writes + 1, "A second worker cannot repeat completed OCR");
  });
});

Deno.test("a failed scan becomes staff follow-up without losing the receipt or contact details", async () => {
  await boundary(async state => {
    await (await handler(request(prepare))).body?.cancel();
    state.row.consent_form_path = `${submissionId}/consent.pdf`; state.row.phone = "4035550123"; state.scanFail = true;
    await processPhotoIntake(admin, submissionId);
    assert.equal(state.row.intake_review_status, "needs_review"); assert.equal(state.row.phone, "4035550123");
    assert.ok(state.row.consent_form_path); assert.equal(state.row.intake_consent.accepted, true);
  });
});

Deno.test("unreadable, unclassified and seized tickets need review; camera ownership is never invented", () => {
  for (const raw of [{}, { ...fixture, officer_issued_format: false }, { ...fixture, vehicle_seized: true }]) assert.equal(photoIntakeDetails(raw).intake_review_status, "needs_review");
  const camera = photoIntakeDetails({ ...fixture, ticket_type: "photo_radar", dateOfBirth: "2026-02-31" });
  assert.equal(camera.registered_owner_on_offence_date, null); assert.equal(camera.date_of_birth, null);
  assert.equal(camera.order_type, "photo_radar"); assert.equal(camera.representation_includes_assessment, false);
});

Deno.test("contact and offer context are supplied before upload without setting authoritative ticket type", async () => {
  await boundary(async state => {
    const response = await handler(request({ ...prepare, email: "Alex@Example.test", ticketType: "photo_radar", landingPage: "rapid-resolution", bundleRequested: false }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).contactSaved, true);
    assert.equal(state.row.email, "alex@example.test");
    assert.equal(state.row.intake_ticket_type, "photo_radar");
    assert.equal(state.row.ticket_type, "officer_issued", "entry selection must not determine the reviewed service or checkout price");
    assert.equal(state.row.landing_page_variant, "rapid-resolution");
    assert.equal(state.ticketExists, false);
  });
});
Deno.test("invalid contact or arbitrary landing context is rejected before writes", async () => {
  for (const values of [{email:"bad"}, {email:""}, {ticketType:"criminal"}, {landingPage:"person@example.test"}]) {
    await boundary(async state => {
      const response = await handler(request({ ...prepare, email:"alex@example.test", ticketType:"officer_issued", ...values }));
      assert.equal(response.status, 400); await response.body?.cancel();
      assert.deepEqual(state.writes, []);
    });
  }
});
