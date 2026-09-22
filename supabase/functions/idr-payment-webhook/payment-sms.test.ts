import Stripe from "https://esm.sh/stripe@18.5.0";
import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { handler } from "./index.ts";

const id = { intent: "11111111-1111-4111-8111-111111111111", client: "22222222-2222-4222-8222-222222222222", submission: "33333333-3333-4333-8333-333333333333" };
const env = { STRIPE_SECRET_KEY: "sk_test_synthetic", STRIPE_WEBHOOK_SECRET: "whsec_synthetic", SUPABASE_URL: "https://payment-webhook.example.test", SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role" };
function event() {
  return { id: "evt_Synthetic", type: "checkout.session.completed", created: Math.floor(Date.now() / 1000), livemode: true, data: { object: {
    id: "cs_live_Synthetic", livemode: true, mode: "payment", payment_status: "paid", amount_total: 14900, amount_subtotal: 14900,
    currency: "cad", client_reference_id: id.submission, payment_intent: "pi_Synthetic", customer_email: "person@example.test", total_details: { amount_tax: 710 },
    metadata: { fabsy_checkout_kind: "ticket_assessment", checkout_intent_id: id.intent, assessment_submission_id: id.submission, client_id: id.client,
      checkout_attempt: "1", assessment_price_cents: "14900", assessment_total_cents: "14900", price_includes_applicable_tax: "true" },
  } } };
}
async function runCase(options: { badSignature?: boolean; testMode?: boolean; unpaid?: boolean; ownershipMismatch?: boolean } = {}) {
  const original = globalThis.fetch; const saved = Object.fromEntries(Object.keys(env).map(key => [key, Deno.env.get(key)]));
  const calls: string[] = []; const snapshot = event();
  if (options.testMode) snapshot.livemode = false;
  if (options.unpaid) snapshot.data.object.payment_status = "unpaid";
  for (const [key, value] of Object.entries(env)) Deno.env.set(key, value);
  globalThis.fetch = (input, request) => {
    const url = new URL(String(input)); const name = url.pathname.split("/").at(-1)!;
    calls.push(name + ":" + (request?.method || "GET"));
    if (name === "enqueue_portal_activity") return Promise.resolve(Response.json(null));
    if (name === "idr_checkout_intents" && request?.method === "GET") return Promise.resolve(Response.json({ id: id.intent, client_id: options.ownershipMismatch ? "44444444-4444-4444-8444-444444444444" : id.client,
      ticket_submission_id: id.submission, type: "assessment", checkout_kind: "ticket_assessment", expected_amount_cents: 14900,
      purchaser_email: "person@example.test", stripe_checkout_session_id: snapshot.data.object.id, status: "open", attempts: 1 }));
    if (name === "ticket_submissions" && request?.method === "GET") {
      if (url.searchParams.get("select")?.includes("assessment_confirmation_sent_at")) {
        // Existing customer-email lookup fails after SMS has already persisted.
        return Promise.resolve(Response.json({ message: "synthetic email-only failure" }, { status: 503 }));
      }
      return Promise.resolve(Response.json({ id: id.submission, client_id: id.client, status: "assessment_awaiting_payment", service_type: "ticket_insurance_assessment",
        assessment_price_cad: 149, assessment_paid_at: null, assessment_checkout_session_id: null, ticket_type: "officer_issued" }));
    }
    if (name === "mark_source_assessment_checkout_paid") return Promise.resolve(Response.json(true));
    if (request?.method === "PATCH") return Promise.resolve(Response.json(name === "ticket_submissions" ? { id: id.submission } : null));
    if (name === "enqueue_verified_payment_sms") {
      const evidence = JSON.parse(String(request?.body)).p_event;
      assertEquals(evidence.amount_total, 14900); assertEquals(evidence.submission_id, id.submission); assertEquals(evidence.livemode, true);
      return Promise.resolve(Response.json({ status: "pending", created: true }));
    }
    throw new Error("Unexpected network route");
  };
  try {
    const body = JSON.stringify(snapshot); const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const signature = options.badSignature ? "invalid" : await stripe.webhooks.generateTestHeaderStringAsync({ payload: body, secret: env.STRIPE_WEBHOOK_SECRET, cryptoProvider: Stripe.createSubtleCryptoProvider() });
    const response = await handler(new Request("https://webhook.example.test", { method: "POST", headers: { "stripe-signature": signature }, body }));
    await response.text(); return { status: response.status, calls };
  } finally {
    globalThis.fetch = original;
    for (const [key, value] of Object.entries(saved)) if (value === undefined) Deno.env.delete(key); else Deno.env.set(key, value);
  }
}
Deno.test("signed live paid fulfillment queues SMS before an independent customer-email failure", async () => {
  const result = await runCase();
  assertEquals(result.status, 500);
  assertEquals(result.calls.filter(name => name === "enqueue_verified_payment_sms:POST").length, 1);
  const enqueueAt = result.calls.indexOf("enqueue_verified_payment_sms:POST");
  assertEquals(result.calls.slice(0, enqueueAt).includes("idr_checkout_intents:PATCH"), true);
  assertEquals(result.calls.at(-1), "ticket_submissions:GET");
});
Deno.test("invalid signature, test events, unpaid and ownership mismatch cannot enqueue SMS", async () => {
  for (const options of [{ badSignature: true }, { testMode: true }, { unpaid: true }, { ownershipMismatch: true }]) {
    const result = await runCase(options);
    assertEquals(result.calls.includes("enqueue_verified_payment_sms:POST"), false);
    if (options.badSignature) { assertEquals(result.status, 400); assertEquals(result.calls.length, 0); }
    if (options.unpaid) assertEquals(result.status, 200);
  }
});

async function runReportPurchase(type: "addon" | "standalone", combined = false): Promise<{
  status: number; calls: string[]; storedOrder: Record<string, unknown> | null;
}> {
  const original = globalThis.fetch; const saved = Object.fromEntries(Object.keys(env).map(key => [key, Deno.env.get(key)]));
  const calls: string[] = []; let storedOrder: Record<string, unknown> | null = null;
  const reportCents = type === "addon" ? 3100 : 4900;
  const gross = Math.round((reportCents + (combined ? 19800 : 0)) * 1.05);
  const originalRepresentation = { representation_checkout_session_id: "cs_live_OriginalRepresentation", representation_payment_intent_id: "pi_OriginalRepresentation", representation_paid_at: "2026-09-01T00:00:00Z" };
  const snapshot = { id: "evt_SeparateReport", type: "checkout.session.completed", created: Math.floor(Date.now() / 1000), livemode: true, data: { object: {
    id: "cs_live_SeparateReport", livemode: true, mode: "payment", payment_status: "paid", amount_subtotal: reportCents + (combined ? 19800 : 0), amount_total: gross,
    currency: "cad", customer_email: "person@example.test", client_reference_id: combined ? id.submission : id.intent, payment_intent: "pi_SeparateReport",
    metadata: { ...(combined ? { fabsy_checkout_kind: "ticket_with_addon", ticket_base_cents: "19800" } : {}), idr_order_id: id.intent, idr_client_id: id.client,
      idr_type: type, idr_checkout_kind: combined ? "ticket_with_addon" : "idr_only", idr_price_cents: String(reportCents), ticket_submission_id: id.submission },
  } } };
  for (const [key, value] of Object.entries(env)) Deno.env.set(key, value);
  globalThis.fetch = (input, request) => {
    const url = new URL(String(input)); const name = url.pathname.split("/").at(-1)!;
    calls.push(name + ":" + (request?.method || "GET"));
    if (name === "enqueue_portal_activity") return Promise.resolve(Response.json(null));
    if (name === "idr_checkout_intents" && request?.method === "GET") return Promise.resolve(Response.json({ id: id.intent, client_id: id.client,
      ticket_submission_id: id.submission, type, checkout_kind: combined ? "ticket_with_addon" : "idr_only", expected_amount_cents: reportCents,
      purchaser_email: "person@example.test", stripe_checkout_session_id: snapshot.data.object.id, status: "open", attempts: 1 }));
    if (name === "clients" && request?.method === "GET") return Promise.resolve(Response.json({ id: id.client }));
    if (name === "ticket_submissions" && request?.method === "GET") return Promise.resolve(Response.json({ id: id.submission, client_id: id.client,
      status: "in_progress", ticket_type: "officer_issued", representation_includes_assessment: true,
      source_assessment_id: "55555555-5555-4555-8555-555555555555", ...originalRepresentation }));
    if (name === "idr_orders" && request?.method === "GET") return Promise.resolve(Response.json(url.searchParams.get("select")?.includes("access_email_sent_at")
      ? { id: id.intent, access_email_sent_at: "2026-09-20T00:00:00Z" } : storedOrder));
    if (name === "idr_orders" && request?.method === "POST") { storedOrder = JSON.parse(String(request.body)); return Promise.resolve(Response.json(null)); }
    if (name === "idr_checkout_intents" && request?.method === "PATCH") return Promise.resolve(Response.json(null));
    if (name === "enqueue_verified_payment_sms") {
      const evidence = JSON.parse(String(request?.body)).p_event;
      assertEquals(evidence.checkout_kind, "idr_only"); assertEquals(evidence.amount_total, gross); assertEquals(evidence.submission_id, id.submission);
      return Promise.resolve(Response.json({ status: "pending", created: true }));
    }
    // Any representation patch or source-assessment activation is forbidden for
    // a separately purchased report and makes the signed HTTP request fail.
    throw new Error("Unexpected network route");
  };
  try {
    const payload = JSON.stringify(snapshot); const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const signature = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret: env.STRIPE_WEBHOOK_SECRET, cryptoProvider: Stripe.createSubtleCryptoProvider() });
    const response = await handler(new Request("https://webhook.example.test", { method: "POST", headers: { "stripe-signature": signature }, body: payload }));
    await response.text(); return { status: response.status, calls, storedOrder };
  } finally {
    globalThis.fetch = original;
    for (const [key, value] of Object.entries(saved)) if (value === undefined) Deno.env.delete(key); else Deno.env.set(key, value);
  }
}
Deno.test("signed separate report purchases on an already-paid ticket queue SMS without changing representation or included assessment", async () => {
  for (const type of ["addon", "standalone"] as const) {
    const result = await runReportPurchase(type);
    assertEquals(result.status, 200); assertEquals(result.storedOrder?.type, type);
    assertEquals(result.calls.filter(call => call === "enqueue_verified_payment_sms:POST").length, 1);
    assertEquals(result.calls.includes("ticket_submissions:PATCH"), false);
    assertEquals(result.calls.some(call => call.includes("mark_source_assessment") || call.includes("referral_record_checkout_payment")), false);
  }
});
Deno.test("combined ticket-plus-report still rejects a conflicting representation payment session", async () => {
  const result = await runReportPurchase("addon", true);
  assertEquals(result.status, 500); assertEquals(result.calls.includes("enqueue_verified_payment_sms:POST"), false);
  assertEquals(result.calls.includes("idr_orders:POST"), false);
});
