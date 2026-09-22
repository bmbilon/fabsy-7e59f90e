import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseServiceOrder, serviceProduct, validateServicePayment, SERVICE_CONSENT_VERSION } from "./service-checkout.ts";
const fixture = () => ({ name: "Alex Example", email: " ALEX@example.test ", product: "photo_radar", mode: "both",
  termsAccepted: true, consentAccepted: true, consentVersion: SERVICE_CONSENT_VERSION, pleadNotGuilty: false, registeredOwner: true });

Deno.test("all published products use server prices and GST, ignoring submitted amounts", () => {
  for (const [product, cents, total] of [["photo_radar", 7900, 8295], ["rapid_resolution", 19800, 20790], ["insurance_report", 4900, 5145], ["bundle", 22900, 24045]] as const) {
    const order = parseServiceOrder({ ...fixture(), product, total_cents: 1, subtotal_cents: 1 });
    assertEquals(order.subtotal_cents, cents); assertEquals(order.total_cents, total);
  }
  assertThrows(() => serviceProduct("discounted"));
});
Deno.test("no ticket or staff-created case is needed; email is normalized and no ticket number invented", () => {
  const order = parseServiceOrder(fixture());
  assertEquals(order.email, "alex@example.test"); assertEquals(order.ticket_number, null);
  assertEquals(order.consent?.ticketNumber, undefined);
});
Deno.test("consent and plea are independently affirmative; payment only never fabricates them", () => {
  for (const pleadNotGuilty of [true, false]) assertEquals(parseServiceOrder({ ...fixture(), pleadNotGuilty }).consent?.pleadNotGuilty, pleadNotGuilty);
  assertEquals(parseServiceOrder({ ...fixture(), mode: "payment", consentAccepted: false, pleadNotGuilty: true }).consent, null);
  assertEquals(parseServiceOrder({ ...fixture(), product: "insurance_report", pleadNotGuilty: true }).consent?.pleadNotGuilty, false);
  for (const change of [{ consentAccepted: false }, { consentVersion: "old" }, { pleadNotGuilty: undefined }, { termsAccepted: false }, { registeredOwner: false }, { email: "invalid" }])
    assertThrows(() => parseServiceOrder({ ...fixture(), ...change }));
});
Deno.test("company authority retains signer separately from represented entity", () => {
  const order = parseServiceOrder({ ...fixture(), representedName: "Example Productions Inc", ticketNumber: " ticket123 " });
  assertEquals(order.name, "Alex Example"); assertEquals(order.represented_name, "Example Productions Inc");
  assertEquals(order.consent?.name, "Alex Example"); assertEquals(order.ticket_number, "TICKET123");
});
Deno.test("payment verification requires exact order, attempt, email, amount, tax and a completed paid session", () => {
  const order = { id: "order", product: "photo_radar", email: "alex@example.test", subtotal_cents: 7900, gst_cents: 395, total_cents: 8295, stripe_session_id: "cs_expected", checkout_attempt: 1 };
  const session = { id: "cs_expected", mode: "payment", payment_status: "paid", status: "complete", currency: "cad", amount_subtotal: 7900, amount_total: 8295,
    total_details: { amount_tax: 395, amount_discount: 0 }, customer_details: { email: order.email },
    metadata: { fabsy_checkout_kind: "service_order", service_order_id: order.id, product: order.product, checkout_attempt: "1" } };
  validateServicePayment(order, session);
  for (const change of [{ id: "cs_other" }, { payment_status: "unpaid" }, { status: "open" }, { currency: "usd" }, { amount_subtotal: 1 }, { amount_total: 1 },
    { total_details: { amount_tax: 0, amount_discount: 395 } }, { customer_details: { email: "other@example.test" } },
    { metadata: { ...session.metadata, checkout_attempt: "2" } }, { metadata: { ...session.metadata, service_order_id: "other" } }]) {
    assertThrows(() => validateServicePayment(order, { ...session, ...change }));
  }
});
