import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Bundle only the pure reporter and receipt helpers in memory. Every receipt and
// destination is synthetic; dispatch only records objects and never loads a tag.
const bundled = await build({
  entryPoints: [fileURLToPath(new URL("../src/lib/paidPurchaseMeasurement.ts", import.meta.url))],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  logLevel: "silent",
});
const { createPaidPurchaseReporter } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
);

const config = { ga4Id: "G-TEST123456", adsId: "AW-123456789", rrLabel: "RR_TEST_1", photoLabel: "PHOTO_TEST_1" };
const rrDestination = `${config.adsId}/${config.rrLabel}`;
const photoDestination = `${config.adsId}/${config.photoLabel}`;
const context = {
  page_location: "https://fabsy.ca/thank-you",
  page_referrer: "https://checkout.stripe.com/",
  page_title: "Payment Confirmation | Fabsy",
};
const rr = {
  id: "cs_live_SYNTHETICrr1", livemode: true, mode: "payment", payment_status: "paid", currency: "cad",
  amount_subtotal: 19800, amount_total: 20790, order_type: "rapid_resolution",
  total_details: { amount_tax: 990, amount_discount: 0 },
};
const photo = {
  ...rr, id: "cs_live_SYNTHETICphoto1", order_type: "photo_radar",
  amount_subtotal: 7900, amount_total: 8295, total_details: { amount_tax: 395, amount_discount: 0 },
};
function memoryStorage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function collector(storage) {
  const events = [];
  const report = createPaidPurchaseReporter((eventName, params) => {
    events.push({ eventName, params });
    return true;
  }, storage);
  return { events, report };
}

test("discounted RR reports actual net revenue, separate GST and only whitelisted fields", () => {
  const receipt = {
    ...rr, amount_total: 16632, pro_discount_applied: true,
    total_details: { amount_tax: 792, amount_discount: 3960 },
    customer_email: "synthetic-private@example.invalid",
    metadata: { case_id: "SYNTHETIC-PRIVATE-CASE", ticket_number: "SYNTHETIC-PRIVATE-TICKET" },
    line_items: [{ description: "SYNTHETIC-PRIVATE-DESCRIPTION" }],
  };
  const { events, report } = collector();
  assert.deepEqual(report(receipt, receipt.id, config, {
    ...context, customer_email: receipt.customer_email, gclid: "SYNTHETIC-ATTRIBUTION", send_to: "UNTRUSTED",
  }, true), [config.ga4Id, rrDestination]);
  const expectedCommon = { transaction_id: rr.id, order_type: "rapid_resolution", value: 158.4, currency: "CAD", ...context };
  assert.deepEqual(events, [
    { eventName: "purchase", params: {
      ...expectedCommon, tax: 7.92,
      items: [{ item_id: "rapid_resolution", item_name: "Rapid Resolution", quantity: 1, price: 158.4 }],
      send_to: config.ga4Id,
    } },
    { eventName: "conversion", params: { ...expectedCommon, send_to: rrDestination } },
  ]);
});

test("Photo Radar uses $79 net, $3.95 GST and only its separate Ads destination", () => {
  const { events, report } = collector();
  assert.deepEqual(report(photo, photo.id, config, context, true), [config.ga4Id, photoDestination]);
  assert.equal(events[0].params.value, 79);
  assert.equal(events[0].params.tax, 3.95);
  assert.equal(events[0].params.items[0].item_id, "photo_radar");
  assert.equal(events[1].params.value, 79);
  assert.equal(events[1].params.order_type, "photo_radar");
  assert.ok(events.every(event => event.params.send_to !== rrDestination));
});

test("a missing Photo label can be supplied later without repeating GA4 or falling back to RR", () => {
  const { events, report } = collector();
  assert.deepEqual(report(photo, photo.id, { ...config, photoLabel: undefined }, context, true), [config.ga4Id]);
  assert.deepEqual(report(photo, photo.id, config, context, true), [photoDestination]);
  assert.deepEqual(report(photo, photo.id, config, context, true), []);
  assert.deepEqual(events.map(event => event.params.send_to), [config.ga4Id, photoDestination]);
});

test("Photo cannot use an identical RR label or a malformed separate label", () => {
  for (const photoLabel of [config.rrLabel, "", "PHOTO/OTHER", "PHOTO\n"]) {
    const { events, report } = collector();
    assert.deepEqual(report(photo, photo.id, { ...config, photoLabel }, context, true), [config.ga4Id]);
    assert.deepEqual(events.map(event => event.eventName), ["purchase"]);
  }
});

test("false dispatch does not deduplicate or persist either destination", () => {
  const storage = memoryStorage();
  let ready = false;
  let attempts = 0;
  const report = createPaidPurchaseReporter(() => { attempts += 1; return ready; }, storage);
  assert.deepEqual(report(rr, rr.id, config, context, true), []);
  assert.equal(storage.values.size, 0);
  ready = true;
  assert.deepEqual(report(rr, rr.id, config, context, true), [config.ga4Id, rrDestination]);
  assert.equal(storage.values.size, 2);
  assert.deepEqual(report(rr, rr.id, config, context, true), []);
  assert.equal(attempts, 4);
});

test("readiness is independent for GA4 and Ads", () => {
  const attempts = [];
  let adsReady = false;
  const report = createPaidPurchaseReporter((eventName, params) => {
    attempts.push(params.send_to);
    return eventName === "purchase" || adsReady;
  });
  assert.deepEqual(report(rr, rr.id, config, context, true), [config.ga4Id]);
  adsReady = true;
  assert.deepEqual(report(rr, rr.id, config, context, true), [rrDestination]);
  assert.deepEqual(attempts, [config.ga4Id, rrDestination, rrDestination]);
});

test("dispatch exceptions remain retryable and do not block the other destination", () => {
  let ga4Ready = false;
  const report = createPaidPurchaseReporter(eventName => {
    if (eventName === "purchase" && !ga4Ready) throw new Error("Synthetic unavailable dispatcher");
    return true;
  });
  assert.deepEqual(report(rr, rr.id, config, context, true), [rrDestination]);
  ga4Ready = true;
  assert.deepEqual(report(rr, rr.id, config, context, true), [config.ga4Id]);
});

test("memory and supplied session storage deduplicate reloads but allow another transaction", () => {
  const storage = memoryStorage();
  const first = collector(storage);
  assert.deepEqual(first.report(rr, rr.id, config, context, true), [config.ga4Id, rrDestination]);
  assert.deepEqual(first.report(rr, rr.id, config, context, true), []);
  const reloaded = collector(storage);
  assert.deepEqual(reloaded.report(rr, rr.id, config, context, true), []);
  const second = { ...rr, id: "cs_live_SYNTHETICrr2" };
  assert.deepEqual(reloaded.report(second, second.id, config, context, true), [config.ga4Id, rrDestination]);
  assert.equal(first.events.length, 2);
  assert.equal(reloaded.events.length, 2);
});

test("unavailable storage retains memory deduplication", () => {
  const storage = {
    getItem() { throw new Error("Synthetic storage denied"); },
    setItem() { throw new Error("Synthetic storage denied"); },
  };
  const { report, events } = collector(storage);
  assert.deepEqual(report(rr, rr.id, config, context, true), [config.ga4Id, rrDestination]);
  assert.deepEqual(report(rr, rr.id, config, context, true), []);
  assert.equal(events.length, 2);
});

test("test, nonproduction, mismatched and explicitly non-live receipts never dispatch", () => {
  const { report, events } = collector();
  const cases = [
    [{ ...rr, id: "cs_test_SYNTHETICrr1" }, "cs_test_SYNTHETICrr1", true],
    [rr, rr.id, false],
    [rr, "cs_live_SYNTHETICother", true],
    [{ ...rr, livemode: false }, rr.id, true],
    [{ ...rr, id: "cs_live_SYNTHETICrr1\n" }, "cs_live_SYNTHETICrr1\n", true],
    [rr, null, true],
    [rr, undefined, true],
  ];
  for (const [receipt, expected, eligible] of cases) assert.deepEqual(report(receipt, expected, config, context, eligible), []);
  assert.deepEqual(events, []);
  assert.deepEqual(report(rr, rr.id, config, context, true), [config.ga4Id, rrDestination]);
});

test("invalid receipts, standalone reports and inherited object keys never become purchases", () => {
  const { report, events } = collector();
  const invalid = [
    null, undefined, {},
    { ...rr, payment_status: "unpaid" },
    { ...rr, payment_status: "no_payment_required" },
    { ...rr, mode: "subscription" },
    { ...rr, currency: "usd" },
    { ...rr, amount_total: 20791 },
    { ...rr, amount_total: Number.NaN },
    { ...rr, amount_subtotal: "19800" },
    { ...rr, total_details: { amount_tax: -1 } },
    { ...rr, total_details: undefined },
    { ...rr, order_type: "standalone_report" },
    { ...rr, order_type: "insurance_damage_report" },
    { ...rr, order_type: "ticket_triage" },
    { ...rr, order_type: "__proto__" },
    { ...rr, order_type: "constructor" },
    { ...photo, amount_subtotal: 8000, amount_total: 8400, total_details: { amount_tax: 400 } },
  ];
  for (const receipt of invalid) assert.deepEqual(report(receipt, receipt?.id, config, context, true), []);
  assert.deepEqual(events, []);
});

test("valid RR bundles remain eligible without admitting standalone reports", () => {
  const bundle = {
    ...rr, id: "cs_live_SYNTHETICbundle1", order_type: "rapid_resolution_bundle",
    amount_subtotal: 29700, amount_total: 31185, total_details: { amount_tax: 1485, amount_discount: 0 },
  };
  const { report, events } = collector();
  assert.deepEqual(report(bundle, bundle.id, config, context, true), [config.ga4Id, rrDestination]);
  assert.equal(events[0].params.value, 297);
  assert.equal(events[0].params.tax, 14.85);
  assert.equal(events[0].params.items[0].item_id, "rapid_resolution_bundle");
});

test("GA4 and Ads require valid explicit destinations and can be configured independently", () => {
  for (const ga4Id of [undefined, "", "AW-123456789", "G-", "G-TEST,AW-OTHER", "G-TEST\n"]) {
    const { report, events } = collector();
    assert.deepEqual(report(rr, rr.id, { ...config, ga4Id }, context, true), [rrDestination]);
    assert.deepEqual(events.map(event => event.eventName), ["conversion"]);
  }
  for (const overrides of [{ adsId: undefined }, { adsId: "AW-bad" }, { rrLabel: undefined }, { rrLabel: "RR/OTHER" }, { rrLabel: "RR\n" }]) {
    const { report, events } = collector();
    assert.deepEqual(report(rr, rr.id, { ...config, ...overrides }, context, true), [config.ga4Id]);
    assert.deepEqual(events.map(event => event.eventName), ["purchase"]);
  }
  const { report, events } = collector();
  assert.deepEqual(report(rr, rr.id, {}, context, true), []);
  assert.deepEqual(events, []);
});

test("live receipts remain compatible before the server adds the livemode field", () => {
  const receipt = { ...rr };
  delete receipt.livemode;
  const { report } = collector();
  assert.deepEqual(report(receipt, receipt.id, config, context, true), [config.ga4Id, rrDestination]);
});
