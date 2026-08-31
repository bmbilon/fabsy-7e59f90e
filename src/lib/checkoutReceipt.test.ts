import test from "node:test";
import assert from "node:assert/strict";
import { paidCheckoutSummary, purchaseAdsDestination, type CheckoutReceipt } from "./checkoutReceipt.ts";

const photo: CheckoutReceipt = { id: "cs_test_syntheticreceipt", mode: "payment", payment_status: "paid", currency: "cad", amount_subtotal: 7900, amount_total: 8295, order_type: "photo_radar", total_details: { amount_tax: 395, amount_discount: 0 } };
test("a paid Photo Radar order reports79 revenue and3.95GST once under the Stripe transaction", () => {
  assert.deepEqual(paidCheckoutSummary(photo), { transactionId: photo.id, orderType: "photo_radar", name: "Rapid Resolution: Photo Radar", photoRadar: true, total: 82.95, tax: 3.95, serviceValue: 79, discount: 0, proDiscountApplied: false });
});
test("unpaid, unknown, malformed and incorrectly taxed camera receipts cannot become purchases", () => {
  for (const changed of [{ payment_status: "unpaid" }, { mode: "subscription" }, { id: "unverified" }, { order_type: "unknown" }, { amount_total: 7900 }, { amount_total: -8295 }, { amount_subtotal: 19800 }, { total_details: { amount_tax: 0 } }, { total_details: { amount_tax: 395, amount_discount: 100 } }]) assert.equal(paidCheckoutSummary({ ...photo, ...changed }), null);
  assert.equal(paidCheckoutSummary(null), null);
});
test("officer discounted purchases use the actual collected service value, not gross subtotal", () => {
  const pro = paidCheckoutSummary({ ...photo, order_type: "rapid_resolution", amount_subtotal: 19800, amount_total: 16632, total_details: { amount_discount: 3960, amount_tax: 792 }, pro_discount_applied: true });
  assert.equal(pro?.serviceValue, 158.4);
  assert.equal(pro?.tax, 7.92);
  assert.equal(pro?.proDiscountApplied, true);
  assert.equal(pro?.photoRadar, false);
});

test("camera purchase reporting cannot contaminate the officer-ticket advertising goal", () => {
  const config = { destinationId: "AW-123456", officerPurchaseLabel: "officer_test", photoRadarPurchaseLabel: "photo_test" };
  const paid = paidCheckoutSummary(photo)!;
  assert.equal(purchaseAdsDestination(paid.orderType, config), "AW-123456/photo_test");
  assert.equal(purchaseAdsDestination(paid.orderType, { ...config, photoRadarPurchaseLabel: undefined }), null);
  assert.equal(purchaseAdsDestination(paid.orderType, { ...config, photoRadarPurchaseLabel: "officer_test" }), null);
  assert.equal(purchaseAdsDestination("rapid_resolution", config), "AW-123456/officer_test");
  assert.equal(purchaseAdsDestination("rapid_resolution_bundle", config), "AW-123456/officer_test");
  assert.equal(purchaseAdsDestination("unverified", config), null);
  assert.equal(purchaseAdsDestination(paid.orderType, { ...config, destinationId: undefined }), null);
});
