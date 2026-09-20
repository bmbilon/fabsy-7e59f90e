import { assertEquals, assertRejects, assertThrows } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { enqueuePaymentSms, paymentSmsBody, paymentSmsFromVerifiedCheckout, processPaymentSms, sendPaymentSms } from "./payment-notification-sms.ts";

const ids = { intent: "11111111-1111-4111-8111-111111111111", client: "22222222-2222-4222-8222-222222222222", ticket: "33333333-3333-4333-8333-333333333333" };
function source(kind = "ticket_only") {
  const session = { id: "cs_live_Synthetic", livemode: true, mode: "payment", payment_status: "paid", amount_total: 20790, amount_subtotal: 19800, currency: "cad", payment_intent: "pi_Synthetic",
    metadata: { fabsy_checkout_kind: kind, checkout_intent_id: ids.intent, ticket_submission_id: ids.ticket, assessment_submission_id: ids.ticket,
      client_id: ids.client, idr_order_id: ids.intent, idr_client_id: ids.client } };
  return { session, event: { id: "evt_Synthetic", type: "checkout.session.completed", created: 1800000000, livemode: true, data: { object: session } } };
}
const item = { id: ids.intent, claim_id: ids.client, amount_total: 20790, currency: "CAD", client_name: "Alex Example", ticket_number: "E12345678A" };
const config = { accountSid: `AC${"a".repeat(32)}`, authToken: "synthetic-only", from: "+14035550100" };
const sid = `SM${"b".repeat(32)}`;

Deno.test("producer covers all fulfilled products and projects actual gross amount without metadata labels", () => {
  for (const kind of ["ticket_only", "ticket_with_addon", "photo_radar", "ticket_assessment", "idr_only"]) {
    const { event, session } = source(kind);
    const evidence = paymentSmsFromVerifiedCheckout(event, session)!;
    assertEquals(evidence.amount_total, 20790);
    assertEquals(evidence.currency, "CAD");
    assertEquals(evidence.checkout_kind, kind);
    assertEquals(evidence.submission_id, ids.ticket);
    assertEquals("client_name" in evidence, false);
    assertEquals("ticket_number" in evidence, false);
    assertEquals(evidence.order_id, ["ticket_with_addon", "idr_only"].includes(kind) ? ids.intent : null);
  }
});
Deno.test("producer excludes testmode, failed, incomplete and unrelated payments", () => {
  for (const change of ["event_test", "session_test", "unpaid", "failed", "expired", "mode", "product"]) {
    const { event, session } = source();
    if (change === "event_test") event.livemode = false;
    if (change === "session_test") session.livemode = false;
    if (change === "unpaid") session.payment_status = "unpaid";
    if (change === "failed") event.type = "checkout.session.async_payment_failed";
    if (change === "expired") event.type = "checkout.session.expired";
    if (change === "mode") session.mode = "subscription";
    if (change === "product") session.metadata.fabsy_checkout_kind = "other";
    assertEquals(paymentSmsFromVerifiedCheckout(event, session), null, change);
  }
});
Deno.test("producer rejects invalid gross amounts and mismatched event/session identity", () => {
  for (const amount of [0, -1, 20.1, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    const { event, session } = source(); session.amount_total = amount;
    assertThrows(() => paymentSmsFromVerifiedCheckout(event, session), Error, "payment_sms_checkout_invalid");
  }
  const { event, session } = source();
  assertThrows(() => paymentSmsFromVerifiedCheckout(event, { ...session, id: "cs_live_Other" }), Error);
});
Deno.test("completed and async-success preserve the same checkout/payment dedup identities", () => {
  const { event, session } = source();
  const first = paymentSmsFromVerifiedCheckout(event, session)!;
  event.type = "checkout.session.async_payment_succeeded"; event.id = "evt_Later";
  const second = paymentSmsFromVerifiedCheckout(event, session)!;
  assertEquals(first.checkout_session_id, second.checkout_session_id);
  assertEquals(first.payment_intent_id, second.payment_intent_id);
});
Deno.test("enqueue persistence errors propagate for signed webhook retry without any provider call", async () => {
  const { event, session } = source(); let calls = 0;
  await enqueuePaymentSms({ rpc: (name, args) => { calls++; assertEquals(name, "enqueue_verified_payment_sms"); assertEquals((args.p_event as { amount_total: number }).amount_total, 20790); return Promise.resolve({ data: { status: "pending" }, error: null }); } }, event, session);
  assertEquals(calls, 1);
  await assertRejects(() => enqueuePaymentSms({ rpc: () => Promise.resolve({ data: null, error: {} }) }, event, session), Error, "payment_sms_enqueue_failed");
});
Deno.test("payment SMS body uses exact requested money emojis, gross CAD amount, name and full ticket", () => {
  assertEquals(paymentSmsBody(item), "💵 Payment received: $207.90 CAD — Alex Example — Ticket E12345678A 💵");
  for (const bad of [{ ...item, ticket_number: "" }, { ...item, client_name: "\n" }, { ...item, currency: "USD" }]) assertThrows(() => paymentSmsBody(bad));
});
Deno.test("Twilio route is fixed and accepted SID is checked without redirect following", async () => {
  let calls = 0;
  assertEquals(await sendPaymentSms(config, item, (_url, options) => {
    calls++; const body = new URLSearchParams(options!.body as URLSearchParams);
    assertEquals(body.get("To"), "+14036695353"); assertEquals(body.get("Body"), paymentSmsBody(item));
    assertEquals(options!.redirect, "error");
    return Promise.resolve(Response.json({ sid }));
  }), sid);
  assertEquals(calls, 1);
});
Deno.test("ambiguous provider outcome is held with exactly one send and no retry", async () => {
  for (const response of [() => Promise.reject(new Error("private provider detail")), () => Promise.resolve(Response.json({})), () => Promise.resolve(Response.json(null)), () => Promise.resolve(new Response("private", { status: 500 }))]) {
    let claimed = false, sends = 0; const outcomes: string[] = [];
    const result = await processPaymentSms({
      claim: () => { if (claimed) return Promise.resolve([]); claimed = true; return Promise.resolve([item]); },
      send: () => { sends++; return sendPaymentSms(config, item, response); },
      finish: (_item, outcome, providerId) => { outcomes.push(outcome); assertEquals(providerId, null); return Promise.resolve(true); },
    });
    assertEquals(sends, 1); assertEquals(outcomes, ["indeterminate"]); assertEquals(result.indeterminate, 1);
  }
});
Deno.test("lost completion write never sends the same claimed payment again", async () => {
  let claims = 0, sends = 0;
  const result = await processPaymentSms({ claim: () => Promise.resolve(claims++ === 0 ? [item] : []), send: () => { sends++; return Promise.resolve(sid); }, finish: () => Promise.reject(new Error("database unavailable")) });
  assertEquals(result.recordingFailed, 1); assertEquals(sends, 1);
});
