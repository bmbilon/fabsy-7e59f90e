import { evaluateProLicence, isOfficerOrder, proPricing, proRefundAmount, PRO_PRICING_VERSION, validateProPayment } from "./pro-pricing.ts";
import { decodeLicenceImage } from "./pro-licence.ts";
import offers from "../../../src/config/offers.json" with { type: "json" };

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(JSON.stringify({ actual, expected }));
}
function rejects(operation: () => unknown) {
  let rejected = false;
  try { operation(); } catch { rejected = true; }
  if (!rejected) throw new Error("Expected validation to reject this input.");
}
const officer = {
  id: "00000000-0000-4000-8000-000000000001", service_type: "representation",
  ticket_type: "officer_issued", drivers_license: "SYNTH-12345",
  first_name: "Test", last_name: "Driver",
};
const licence = {
  documentType: "drivers_licence", licenceClass: "1", classReadable: true, province: "Alberta",
  driversLicense: "SYNTH12345", firstName: "Test", lastName: "Driver", expiryDate: "2030-08-31",
};
const evidenceId = "00000000-0000-4000-8000-000000000002";
function paid(bundle = false, pro = true) {
  const pricing = proPricing(bundle, pro);
  const snapshot = {
    pro_coupon: pro ? "PRO20" : null, pro_verification_id: pro ? evidenceId : null,
    pro_subtotal_cents: pricing.subtotalCents, pro_discount_cents: pricing.discountCents,
  };
  const tax = Math.round(pricing.netSubtotalCents * 0.05);
  const session = {
    amount_subtotal: pricing.subtotalCents, amount_total: pricing.netSubtotalCents + tax,
    total_details: { amount_tax: tax, amount_discount: pricing.discountCents },
    metadata: { pro_pricing_version: PRO_PRICING_VERSION, pro_coupon: pro ? "PRO20" : "", pro_verification_id: pro ? evidenceId : "" },
  };
  return { snapshot, session };
}

Deno.test("verified officer and bundle cents stay aligned with canonical offers", () => {
  equal(proPricing(false, false).subtotalCents, offers.rapidResolution.priceCents);
  equal(proPricing(true, false).subtotalCents, offers.bundle.priceCents);
  equal(proPricing(false, true).netSubtotalCents, 15840);
  equal(proPricing(true, true).netSubtotalCents, 18320);
  equal(proPricing(true, true).netAddonCents, 2480);
  equal(offers.photoRadar.priceCents, 7900);
});

Deno.test("only a readable Alberta class1/2/4 matching holder qualifies", () => {
  for (const licenceClass of ["1","2","4"]) {
    equal(evaluateProLicence({ ...licence, licenceClass }, officer, licenceClass, "2026-08-31").verified, true);
  }
  for (const declared of ["3","5","6","7","unknown","commercial"]) {
    equal(evaluateProLicence({ ...licence, licenceClass: declared }, officer, declared).verified, false);
  }
  for (const badRead of [
    { licenceClass: "2" }, { classReadable: false }, { province: "Ontario" },
    { driversLicense: "OTHER999" }, { firstName: "Other" }, { lastName: "Person" },
    { documentType: "other" }, { expiryDate: "2025-01-01" }, { expiryDate: null },
    { expiryDate: "2030-02-31" },
  ]) equal(evaluateProLicence({ ...licence, ...badRead }, officer, "1", "2026-08-31").verified, false);
});

Deno.test("camera, report and legacy assessment orders cannot become pro-verified", () => {
  for (const order of [
    { ...officer, ticket_type: "photo_radar" }, { ...officer, service_type: "ticket_insurance_assessment" },
    { ...officer, service_type: "standalone" }, { ...officer, ticket_type: "unexpected" },
  ]) {
    equal(isOfficerOrder(order), false);
    equal(evaluateProLicence(licence, order, "1").verified, false);
  }
});

Deno.test("paid webhook accepts exactly reserved coupon, service subtotal, tax and discounted report allocation", () => {
  for (const bundle of [false, true]) for (const pro of [false, true]) {
    const { session, snapshot } = paid(bundle, pro);
    const result = validateProPayment(session, snapshot, bundle);
    equal(result.verified, pro);
    equal(result.isNew, true);
    equal(result.netAddonCents, bundle ? pro ? 2480 : 3100 : 0);
  }
});

Deno.test("forged proof, removed version, wrong discount and tax or total changes are rejected", () => {
  const { session, snapshot } = paid(true, true);
  for (const invalid of [
    { ...snapshot, pro_verification_id: null },
    { ...snapshot, pro_verification_id: "wrong-proof" },
    { ...snapshot, pro_coupon: null },
    { ...snapshot, pro_coupon: "OTHER20" },
    { ...snapshot, pro_discount_cents: 3960 },
    { ...snapshot, pro_subtotal_cents: 19800 },
  ]) rejects(() => validateProPayment(session, invalid, true));
  for (const invalid of [
    { ...session, metadata: {} },
    { ...session, metadata: { ...session.metadata, pro_coupon: "" } },
    { ...session, amount_subtotal: 18320 },
    { ...session, amount_total: 0 },
    { ...session, total_details: { ...session.total_details, amount_discount: 0 } },
    { ...session, total_details: { ...session.total_details, amount_discount: 9160 } },
    { ...session, total_details: { ...session.total_details, amount_tax: -1 } },
    { ...session, total_details: { ...session.total_details, amount_shipping: 100 } },
  ]) rejects(() => validateProPayment(invalid, snapshot, true));
});

Deno.test("unverified new sessions cannot use a generic promo code or forged frontend flag", () => {
  const { session, snapshot } = paid(false, false);
  const altered = { ...session, amount_total: 16632, total_details: { amount_discount: 3960, amount_tax: 792 } };
  rejects(() => validateProPayment(altered, snapshot, false));
  rejects(() => validateProPayment({ ...session, metadata: { ...session.metadata, pro_coupon: "PRO20", pro_verified: "true" } }, snapshot, false));
});

Deno.test("legacy compatibility cannot smuggle in a PRO20 reservation", () => {
  equal(validateProPayment({ amount_subtotal: 48800, amount_total: 51240, metadata: {} }, {}, false).isNew, false);
  rejects(() => validateProPayment({ amount_subtotal: 48800, amount_total: 39040, metadata: { pro_coupon: "PRO20" } }, {}, false));
});

Deno.test("later officer verification refunds service discount plus proportional GST, never twice", () => {
  equal(proRefundAmount(paid(false, false).session, false), { amountCents: 4158, discountCents: 3960, taxCents: 198 });
  equal(proRefundAmount(paid(true, false).session, true), { amountCents: 4809, discountCents: 4580, taxCents: 229 });
  rejects(() => proRefundAmount(paid(false, true).session, false));
  rejects(() => proRefundAmount(paid(true, true).session, true));
  rejects(() => proRefundAmount({ amount_subtotal: 7900, amount_total: 8295, total_details: { amount_tax: 395 } }, false));
  rejects(() => proRefundAmount({ amount_subtotal: 48800, amount_total: 51240, total_details: { amount_tax: 2440 } }, false));
});

Deno.test("licence reader accepts inline images only, rejects URL fetches, MIME mismatch and nonimages", () => {
  rejects(() => decodeLicenceImage("https://example.test/private-licence.jpg", "image/jpeg"));
  rejects(() => decodeLicenceImage("data:image/png;base64,iVBORw0KGgo=", "image/jpeg"));
  rejects(() => decodeLicenceImage("data:text/html;base64,PGgxPk5vdCBhIGxpY2VuY2U8L2gxPg==", "text/html"));
  rejects(() => decodeLicenceImage("PGgxPk5vdCBhIGxpY2VuY2U8L2gxPg==", "image/jpeg"));
  equal(decodeLicenceImage("data:image/png;base64,iVBORw0KGgo=", "image/png").extension, "png");
});
