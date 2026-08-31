import assert from "node:assert/strict";
import {
  deriveReferralPaymentFacts,
  mintReferralAttribution,
  normalizeReferralCode,
  normalizeReferralPlate,
  REFERRAL_WINDOW_MS,
  type ReferralStripePayment,
  verifyReferralAttribution,
} from "./referrals.ts";

const TEST_SECRET = "isolated-referral-test-key-no-production-use";
const NOW = Date.parse("2026-08-31T12:00:00Z");

Deno.test("signed attribution lasts 30 days, normalises the code, and expires at the boundary", async () => {
  const capture = await mintReferralAttribution(" owner-01 ", { now: NOW, secret: TEST_SECRET });
  assert.equal(capture.code, "OWNER-01");
  assert.equal(Date.parse(capture.expiresAt) - Date.parse(capture.attributedAt), REFERRAL_WINDOW_MS);
  const input = { refCode: "owner-01", refAttributionToken: capture.attributionToken };
  assert.equal((await verifyReferralAttribution(input, { now: NOW + REFERRAL_WINDOW_MS - 1, secret: TEST_SECRET }))?.code, "OWNER-01");
  assert.equal(await verifyReferralAttribution(input, { now: NOW + REFERRAL_WINDOW_MS, secret: TEST_SECRET }), null);
});

Deno.test("attribution rejects forged code, modified payload, wrong secret and future-issued token", async () => {
  const capture = await mintReferralAttribution("OWNER01", { now: NOW, secret: TEST_SECRET });
  const input = { refCode: "OWNER01", refAttributionToken: capture.attributionToken };
  assert.equal(await verifyReferralAttribution({ ...input, refCode: "OTHER01" }, { now: NOW, secret: TEST_SECRET }), null);
  const tampered = capture.attributionToken.replace(/^./, capture.attributionToken[0] === "e" ? "f" : "e");
  assert.equal(await verifyReferralAttribution({ ...input, refAttributionToken: tampered }, { now: NOW, secret: TEST_SECRET }), null);
  assert.equal(await verifyReferralAttribution(input, { now: NOW, secret: `${TEST_SECRET}-rotated` }), null);
  assert.equal(await verifyReferralAttribution(input, { now: NOW - 6000, secret: TEST_SECRET }), null);
});

Deno.test("malformed or oversized attribution cannot enter a database operation", async () => {
  for (const value of [undefined, null, "", {}, [], "a".repeat(1025), "a.b.c", "???.!", "e30.AA"]) {
    assert.equal(await verifyReferralAttribution({ refCode: "OWNER01", refAttributionToken: value }, { now: NOW, secret: TEST_SECRET }), null);
  }
  for (const value of [null, undefined, {}, "a", "//redirect", "CODE\nBcc:other", "ਵਾਹਨ", "x".repeat(33)]) assert.equal(normalizeReferralCode(value), null);
});

Deno.test("declared plates accept only a bounded alphanumeric identity", () => {
  assert.equal(normalizeReferralPlate(" abc-123 "), "ABC123");
  assert.equal(normalizeReferralPlate("0AB 9Z8"), "0AB9Z8");
  for (const value of [undefined, null, {}, "", "A".repeat(21), "A/B", "<script>", "ਹਰਪ੍ਰੀਤ"]) assert.equal(normalizeReferralPlate(value), null);
});

function paidPayment(): ReferralStripePayment {
  return {
    id: "pi_fixture",
    currency: "cad",
    status: "succeeded",
    customer: "cus_fixture",
    latest_charge: {
      id: "ch_fixture",
      payment_intent: "pi_fixture",
      paid: true,
      captured: true,
      amount_refunded: 0,
      disputed: false,
      balance_transaction: { status: "available", available_on: (NOW - 86_400_000) / 1000, amount: 19800 },
    },
  };
}

Deno.test("settlement uses available funds date rather than checkout completion or payment creation", () => {
  const facts = deriveReferralPaymentFacts(paidPayment(), { data: [], has_more: false }, "pi_fixture", NOW);
  assert.equal(facts.settledAt, new Date(NOW - 86_400_000).toISOString());
  assert.equal(facts.stripeCustomerId, "cus_fixture");
  assert.equal(facts.refundedAt, null);
  const mutations: Array<(payment: ReferralStripePayment) => void> = [
    (payment) => { payment.status = "processing"; },
    (payment) => { payment.latest_charge = "ch_unexpanded"; },
    (payment) => { if (typeof payment.latest_charge === "object" && payment.latest_charge) payment.latest_charge.captured = false; },
    (payment) => { if (typeof payment.latest_charge === "object" && payment.latest_charge) payment.latest_charge.paid = false; },
    (payment) => { if (typeof payment.latest_charge === "object" && payment.latest_charge) payment.latest_charge.balance_transaction = { status: "pending", available_on: NOW / 1000 - 5, amount: 19800 }; },
    (payment) => { if (typeof payment.latest_charge === "object" && payment.latest_charge) payment.latest_charge.balance_transaction = { status: "available", available_on: NOW / 1000 + 5, amount: 19800 }; },
  ];
  for (const mutate of mutations) {
    const payment = paidPayment();
    mutate(payment);
    assert.equal(deriveReferralPaymentFacts(payment, { data: [], has_more: false }, "pi_fixture", NOW).settledAt, null);
  }
});

Deno.test("partial and pending refunds hold referral payouts; failed refunds alone do not", () => {
  const payment = paidPayment();
  if (typeof payment.latest_charge === "object" && payment.latest_charge) payment.latest_charge.amount_refunded = 3960;
  assert.equal(deriveReferralPaymentFacts(payment, { data: [], has_more: false }, "pi_fixture", NOW).refundedAt, new Date(NOW).toISOString());
  assert.equal(deriveReferralPaymentFacts(paidPayment(), { data: [{ status: "pending", created: NOW / 1000 - 10 }], has_more: false }, "pi_fixture", NOW).refundedAt,
    new Date(NOW - 10_000).toISOString());
  assert.equal(deriveReferralPaymentFacts(paidPayment(), { data: [{ status: "failed" }, { status: "canceled" }], has_more: false }, "pi_fixture", NOW).refundedAt, null);
  assert.notEqual(deriveReferralPaymentFacts(paidPayment(), { data: [], has_more: true }, "pi_fixture", NOW).refundedAt, null);
});

Deno.test("disputes hold payouts and mismatched Stripe identities/currency fail closed", () => {
  const payment = paidPayment();
  if (typeof payment.latest_charge === "object" && payment.latest_charge) payment.latest_charge.disputed = true;
  assert.equal(deriveReferralPaymentFacts(payment, { data: [], has_more: false }, "pi_fixture", NOW).disputedAt, new Date(NOW).toISOString());
  assert.throws(() => deriveReferralPaymentFacts({ ...payment, id: "pi_other" }, { data: [] }, "pi_fixture", NOW));
  assert.throws(() => deriveReferralPaymentFacts({ ...payment, currency: "usd" }, { data: [] }, "pi_fixture", NOW));
  if (typeof payment.latest_charge === "object" && payment.latest_charge) payment.latest_charge.payment_intent = "pi_other";
  assert.throws(() => deriveReferralPaymentFacts(payment, { data: [] }, "pi_fixture", NOW));
});
