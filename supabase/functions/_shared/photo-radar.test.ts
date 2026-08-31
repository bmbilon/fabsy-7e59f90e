import { deepStrictEqual, equal, throws } from "node:assert/strict";
import offerData from "../../../src/config/offers.json" with { type: "json" };
import { detectOwnerNotice, parseTicketClassification, PHOTO_RADAR_PRODUCT, ticketCheckoutProduct, validatePhotoRadarPaidSession, type PhotoRadarPaidSession } from "./photo-radar.ts";
import { ateActionDueAt, buildAteChecklist, summarizeAteReductions } from "../../../src/lib/ate-review.ts";

const paid = (): PhotoRadarPaidSession => ({ mode: "payment", payment_status: "paid", currency: "cad", amount_subtotal: 7900, amount_total: 8295,
  total_details: { amount_tax: 395, amount_discount: 0 }, metadata: {
    fabsy_checkout_kind: "photo_radar", fabsy_product: "photo_radar", ticket_type: "photo_radar", order_type: "photo_radar", review_path: "ate",
    ticket_base_cents: "7900", gst_cents: "395", total_cents: "8295", representation_includes_assessment: "false",
  } });

Deno.test("canonical offer and verified payment agree to the cent", () => {
  equal(offerData.photoRadar.name, PHOTO_RADAR_PRODUCT.name);
  equal(offerData.photoRadar.priceCents, PHOTO_RADAR_PRODUCT.priceCents);
  equal(offerData.photoRadar.gstCents, 395); equal(offerData.photoRadar.totalCents, 8295);
  equal(Math.round(offerData.photoRadar.priceCents * offerData.photoRadar.gstRate), 395);
  validatePhotoRadarPaidSession(paid());
});
Deno.test("legacy officer intake stays at $198/$229 and accepts missing type", () => {
  equal(parseTicketClassification({}).ticket_type, "officer_issued");
  equal(ticketCheckoutProduct({}, false).baseCents, 19800);
  equal(ticketCheckoutProduct({ ticket_type: "officer_issued" }, true).expectedAmountCents, 3100);
});
Deno.test("checkout cannot be made cheap by passing a browser product flag", () => {
  const stored = { ticket_type: "officer_issued", product: "photo_radar", amount: 7900 };
  equal(ticketCheckoutProduct(stored, false).baseCents, 19800);
  throws(() => ticketCheckoutProduct({ ticket_type: "forged" }, false));
});
Deno.test("owner answer required, sold/stolen are review flags not denials", () => {
  throws(() => parseTicketClassification({ ticket_type: "photo_radar" }));
  for (const answer of ["yes", "sold_before", "stolen"]) {
    const selected = parseTicketClassification({ ticket_type: "photo_radar", registered_owner_on_offence_date: answer });
    equal(selected.review_path, "ate"); equal(selected.order_type, "photo_radar");
    equal(ticketCheckoutProduct(selected, false).baseCents, 7900);
  }
  throws(() => parseTicketClassification({ ticket_type: "photo_radar", registered_owner_on_offence_date: "no" }));
});
Deno.test("manual correction to officer drops unrelated owner answer", () => {
  const corrected = parseTicketClassification({ ticket_type: "officer_issued", ticket_type_source: "manual", registered_owner_on_offence_date: "stolen" });
  equal(corrected.registered_owner_on_offence_date, null); equal(corrected.review_path, "standard");
});
Deno.test("photo insurance add-on is rejected even in a forged request", () => {
  throws(() => ticketCheckoutProduct({ ticket_type: "photo_radar", registered_owner_on_offence_date: "yes" }, true));
});
Deno.test("detect owner wording, s160(1), and mailed automated format", () => {
  equal(detectOwnerNotice({ offenceDescription: "Owner of Motor Vehicle Involved in a red light offence" }).ticket_type, "photo_radar");
  equal(detectOwnerNotice({ offenceSection: "160", offenceSubSection: "(1)" }).ticket_type, "photo_radar");
  equal(detectOwnerNotice({ mailedNoticeFormat: true, automatedEnforcementNotice: true }).ticket_type, "photo_radar");
});
Deno.test("a red-light allegation, empty OCR or postal appearance alone is ambiguous", () => {
  equal(detectOwnerNotice({ violation: "Red Light Violation" }).ticket_type, null);
  equal(detectOwnerNotice({ mailedNoticeFormat: true }).ticket_type, null);
  equal(detectOwnerNotice({}).ticket_type, null);
});
for (const [field, value] of [["amount_total", 7900], ["amount_subtotal", 19800], ["currency", "usd"], ["payment_status", "unpaid"], ["mode", "subscription"]] as const) {
  Deno.test(`paid verification rejects forged ${field}`, () => { throws(() => validatePhotoRadarPaidSession({ ...paid(), [field]: value })); });
}
Deno.test("GST must be exactly $3.95 and discounts are rejected", () => {
  throws(() => validatePhotoRadarPaidSession({ ...paid(), total_details: { amount_tax: 0, amount_discount: 0 } }));
  throws(() => validatePhotoRadarPaidSession({ ...paid(), total_details: { amount_tax: 395, amount_discount: 100 } }));
});
Deno.test("webhook rejects cross-product and insurance metadata", () => {
  for (const patch of [{ fabsy_product: "rapid_resolution" }, { review_path: "standard" }, { ticket_base_cents: "19800" }, { idr_order_id: "forged" }, { representation_includes_assessment: "true" }] as Record<string, string>[]) {
    throws(() => validatePhotoRadarPaidSession({ ...paid(), metadata: { ...paid().metadata, ...patch } }));
  }
});
Deno.test("unknown disclosure creates questions, never an adverse factual finding", () => {
  const checks = buildAteChecklist({ noticeKind: "unknown", jurisdiction: "", ownership: "yes", evidence: {} });
  equal(checks.length, 8); equal(checks.filter(item => item.status === "issue").length, 0);
  equal(checks.filter(item => item.crownAsk).length, 8);
});
Deno.test("red-light notices never inherit speed site/hours/construction rules", () => {
  const checks = buildAteChecklist({ noticeKind: "red_light", jurisdiction: "Edmonton", ownership: "yes", evidence: { site_permission: { status: "concern", reference: "Outside school zone" } } });
  for (const key of ["site_permission", "zone_hours", "construction_workers"]) equal(checks.find(item => item.key === key)?.status, "not_applicable");
});
Deno.test("approved Calgary speed exception is allowed only with documented evidence", () => {
  const input = { noticeKind: "speed" as const, jurisdiction: "Calgary", offenceDate: "2026-04-02", evidence: { site_permission: { status: "supported" as const, reference: "Approval on file; effective dates and site match" } } };
  equal(buildAteChecklist(input).find(item => item.key === "site_permission")?.status, "pass");
  input.evidence.site_permission.reference = "";
  equal(buildAteChecklist(input).find(item => item.key === "site_permission")?.status, "pending");
});
Deno.test("no automatic Calgary duplicate failure or guessed pre2025 eligibility", () => {
  const checks = buildAteChecklist({ noticeKind: "speed", jurisdiction: "Calgary", offenceDate: "2024-12-01", evidence: { site_permission: { status: "concern", reference: "Unrestricted road" }, five_minute_rule: { status: "concern", reference: "" } } });
  equal(checks.find(item => item.key === "site_permission")?.status, "pending");
  equal(checks.find(item => item.key === "five_minute_rule")?.status, "pending");
});
Deno.test("48 hours starts at complete disclosure, crosses DST as elapsed time", () => {
  equal(ateActionDueAt(null), null);
  equal(ateActionDueAt("2026-10-31T12:00:00-06:00"), "2026-11-02T18:00:00.000Z");
  throws(() => ateActionDueAt("not-a-date"));
});
Deno.test("first20 median includes zero outcomes and excludes pending without hiding them", () => {
  const files = Array.from({ length: 21 }, (_, index) => ({ id: String(index).padStart(2, "0"), paidAt: `2026-08-${String(index + 1).padStart(2, "0")}`, originalFineCents: 20000, finalFineCents: index < 10 ? 20000 : 14000, resolvedAt: index === 19 ? null : "2026-08-31" }));
  const stats = summarizeAteReductions(files);
  deepStrictEqual(stats, { cohortCount: 20, resolvedCount: 19, pendingCount: 1, medianReductionCad: 0, below40: true, cohortComplete: false });
  equal(summarizeAteReductions([]).medianReductionCad, null);
});
