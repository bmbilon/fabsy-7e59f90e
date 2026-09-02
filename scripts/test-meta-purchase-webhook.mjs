import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const thisFile = fileURLToPath(import.meta.url);
if (!process.execArgv.includes("--experimental-strip-types")) {
  const child = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", thisFile],
    { stdio: "inherit" },
  );
  process.exit(child.status ?? 1);
}

const repoRoot = path.resolve(path.dirname(thisFile), "..");
const mapperPath = path.join(
  repoRoot,
  "supabase/functions/_shared/meta-purchase.ts",
);
const capiPath = path.join(repoRoot, "supabase/functions/_shared/meta-capi.ts");
const webhookPath = path.join(
  repoRoot,
  "supabase/functions/idr-payment-webhook/index.ts",
);
const { currentMetaPurchaseFromSignedCheckout } = await import(
  pathToFileURL(mapperPath).href
);
const { enqueueMetaPurchase, MetaCapiDeliveryError } = await import(
  pathToFileURL(capiPath).href
);

const ids = {
  intent: "11111111-1111-4111-8111-111111111111",
  submission: "22222222-2222-4222-8222-222222222222",
  client: "33333333-3333-4333-8333-333333333333",
  verification: "44444444-4444-4444-8444-444444444444",
};
const event = {
  type: "checkout.session.completed",
  created: Math.floor(Date.now() / 1000) - 5,
  livemode: true,
};
const baseMetadata = {
  checkout_intent_id: ids.intent,
  submission_id: ids.submission,
  ticket_submission_id: ids.submission,
  client_id: ids.client,
  checkout_attempt: "1",
  fabsy_checkout_kind: "ticket_only",
  fabsy_product: "rapid_resolution",
  fabsy_pricing_version: "rapid_resolution_2026_08",
  pro_pricing_version: "pro_drivers_2026_08",
  pro_coupon: "",
  pro_verification_id: "",
  pro_discount_cents: "0",
  ticket_type: "officer_issued",
  order_type: "rapid_resolution",
  review_path: "standard",
  ticket_base_cents: "19800",
  representation_includes_assessment: "false",
};
const rr = {
  id: "cs_live_SYNTHETIC_RR_12345678",
  livemode: true,
  mode: "payment",
  payment_status: "paid",
  status: "complete",
  currency: "cad",
  amount_subtotal: 19_800,
  amount_total: 20_790,
  client_reference_id: ids.submission,
  total_details: {
    amount_discount: 0,
    amount_tax: 990,
    amount_shipping: 0,
  },
  metadata: { ...baseMetadata },
};

function map(eventOverrides = {}, sessionOverrides = {}) {
  return currentMetaPurchaseFromSignedCheckout(
    { ...event, ...eventOverrides },
    { ...rr, ...sessionOverrides },
  );
}

assert.deepEqual(map(), {
  checkoutSessionId: rr.id,
  valueCents: 19_800,
  eventTimeEpochSeconds: event.created,
  contentId: "rapid_resolution",
});

const proRr = {
  amount_total: 16_632,
  total_details: {
    amount_discount: 3_960,
    amount_tax: 792,
    amount_shipping: 0,
  },
  metadata: {
    ...baseMetadata,
    pro_coupon: "PRO20",
    pro_verification_id: ids.verification,
    pro_discount_cents: "3960",
  },
};
assert.equal(map({}, proRr)?.valueCents, 15_840);

function bundle(pro = false) {
  const discount = pro ? 4_580 : 0;
  const value = 22_900 - discount;
  const tax = value / 20;
  return {
    id: `cs_live_SYNTHETIC_BUNDLE_${pro ? "PRO" : "STD"}_12345678`,
    amount_subtotal: 22_900,
    amount_total: value + tax,
    total_details: {
      amount_discount: discount,
      amount_tax: tax,
      amount_shipping: 0,
    },
    metadata: {
      ...baseMetadata,
      fabsy_checkout_kind: "ticket_with_addon",
      fabsy_product: "rapid_resolution_bundle",
      idr_order_id: ids.intent,
      idr_client_id: ids.client,
      idr_type: "addon",
      idr_checkout_kind: "ticket_with_addon",
      idr_price_cents: "3100",
      pro_coupon: pro ? "PRO20" : "",
      pro_verification_id: pro ? ids.verification : "",
      pro_discount_cents: String(discount),
    },
  };
}
assert.equal(map({}, bundle(false))?.valueCents, 22_900);
assert.equal(map({}, bundle(false))?.contentId, "rapid_resolution_bundle");
assert.equal(map({}, bundle(true))?.valueCents, 18_320);

const immutableInput = bundle(true);
const snapshot = structuredClone(immutableInput);
assert.deepEqual(map({}, immutableInput), map({}, immutableInput));
assert.deepEqual(immutableInput, snapshot);

const excluded = [
  ["test event", { livemode: false }, {}],
  ["test session", {}, { livemode: false }],
  ["test id", {}, { id: "cs_test_SYNTHETIC_RR_12345678" }],
  ["wrong currency", {}, { currency: "usd" }],
  ["wrong currency case", {}, { currency: "CAD" }],
  ["not paid", {}, { payment_status: "unpaid" }],
  ["not complete", {}, { status: "open" }],
  ["future product", {}, { metadata: { ...baseMetadata, fabsy_product: "rapid_resolution_v2" } }],
  ["Photo Radar", {}, { metadata: { ...baseMetadata, fabsy_checkout_kind: "photo_radar", fabsy_product: "photo_radar" } }],
  ["assessment", {}, { metadata: { ...baseMetadata, fabsy_checkout_kind: "ticket_assessment", fabsy_product: "ticket_assessment" } }],
  ["standalone IDR", {}, { metadata: { ...baseMetadata, fabsy_checkout_kind: "idr_only", fabsy_product: "insurance_impact_review" } }],
  ["later RR price", {}, { amount_subtotal: 48_800, amount_total: 51_240 }],
  ["wrong total equation", {}, { amount_total: 20_791 }],
  ["wrong discount", {}, { total_details: { amount_discount: 1, amount_tax: 990, amount_shipping: 0 } }],
  ["shipping", {}, { total_details: { amount_discount: 0, amount_tax: 990, amount_shipping: 100 } }],
  ["wrong pricing version", {}, { metadata: { ...baseMetadata, fabsy_pricing_version: "rapid_resolution_future" } }],
  ["forged PRO20", {}, { metadata: { ...baseMetadata, pro_coupon: "PRO20", pro_discount_cents: "3960" } }],
  ["bundle fields on RR", {}, { metadata: { ...baseMetadata, idr_order_id: ids.intent } }],
  ["mismatched bundle reservation", {}, { metadata: { ...bundle(false).metadata, idr_order_id: "55555555-5555-4555-8555-555555555555" } }],
];
for (const [label, eventOverrides, sessionOverrides] of excluded) {
  assert.equal(map(eventOverrides, sessionOverrides), null, label);
}

const validPurchase = map();
assert.ok(validPurchase);
let noConsentCalls = 0;
const noConsent = await enqueueMetaPurchase({
  async rpc(name) {
    noConsentCalls += 1;
    assert.equal(name, "enqueue_meta_capi_purchase");
    return { data: null, error: null };
  },
}, validPurchase);
assert.deepEqual(noConsent, {
  ok: true,
  queued: false,
  reason: "no_consented_attribution",
});
assert.equal(noConsentCalls, 1);

await assert.rejects(
  () => enqueueMetaPurchase({
    async rpc() {
      return { data: null, error: { code: "synthetic" } };
    },
  }, validPurchase),
  (error) => error instanceof MetaCapiDeliveryError &&
    error.code === "enqueue_rpc_failed",
);

const webhook = fs.readFileSync(webhookPath, "utf8");
assert.match(
  webhook,
  /failedCheckoutKind === "ticket_only" \|\|\s*failedCheckoutKind === "ticket_with_addon"[\s\S]*?clearMetaCheckoutAttribution\(supabase, session\.id\)/,
  "Only RR and RR bundle failures may touch Meta attribution storage",
);
assert.equal(
  webhook.match(/await enqueueCurrentMetaPurchaseIfEligible\(supabase, event, session\);/g)?.length,
  2,
);
assert.ok(
  webhook.indexOf("await enqueueCurrentMetaPurchaseIfEligible(supabase, event, session);") >
    webhook.indexOf("await recordRepresentationPayment(supabase, session);"),
  "ticket Purchase must enqueue after representation fulfillment",
);
assert.ok(
  webhook.lastIndexOf("await enqueueCurrentMetaPurchaseIfEligible(supabase, event, session);") >
    webhook.indexOf("await sendAccessEmail(supabase, session.metadata!.idr_order_id);"),
  "bundle Purchase must enqueue after report access fulfillment",
);

console.log("Meta signed-payment webhook tests passed (4 eligible values, 19 exclusions, consent no-op, retry contract). ");
