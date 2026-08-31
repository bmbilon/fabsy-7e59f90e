import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDetectedTicketType,
  applyTicketType,
  assessmentStepsForTicket,
  detectTicketType,
  resetTicketTypeForUpload,
  ticketCheckoutSelection,
  ticketDateAsLocalDate,
  ticketDateFromExtraction,
  ticketTypeFromSearch,
  type TicketTypeState,
} from "./ticketType.ts";

const draft = (): TicketTypeState & {
  insuranceCompany: string; priorTickets: string; pleaType: string; consentGiven: boolean; digitalSignature: string; vehicleSeized: boolean;
} => ({
  ticketType: "officer_issued",
  ticketTypeSource: "default",
  registeredOwnerOnOffenceDate: "",
  insuranceCompany: "Example insurer",
  priorTickets: "2-3",
  pleaType: "guilty_explanation",
  consentGiven: true,
  digitalSignature: "Example Owner",
  vehicleSeized: true,
});

test("detects actual owner-notice evidence from both OCR response formats", () => {
  const ownerNotices = [
    { offenceDescription: "Owner of Motor Vehicle Involved in an offence" },
    { success: true, data: { offenceSection: "160", offenceSubSection: "(1)" } },
    { section: "TSA s.160(1)" },
    { raw_text: "Notice to registered owner: Red-light camera, Calgary" },
    { ticket_type: "photo_radar", ticket_type_evidence: ["mailed notice format"] },
    { ticket_type: null, ticket_type_evidence: ["Traffic Safety Act 160(1)"] },
    { owner_notice: true, mailed_notice_format: true },
    { documentType: "Photo radar speed notice" },
  ];
  for (const notice of ownerNotices) assert.equal(detectTicketType(notice), "photo_radar", JSON.stringify(notice));
});

test("a red-light offence alone, an unrelated section and failed extraction do not imply a camera notice", () => {
  for (const value of [
    null,
    { offenceDescription: "Fail to stop at red light", officer: "Example Officer" },
    { offenceSection: "160", offenceSubSection: "(2)" },
    { offenceSection: "1160(1)" },
    { raw_text: "A notice was mailed" },
    { offenceDescription: "Officer-issued speeding ticket. Is the fine different from photo radar?" },
    { offenceDescription: "I was stopped by an officer near a red-light camera" },
    { offenceDescription: "Speeding", raw_text: "An officer measured my speed with radar. I have received photo radar before." },
    { success: false, data: { ticket_type: "photo_radar" } },
    { error: "Unreadable" },
  ]) assert.equal(detectTicketType(value), null, JSON.stringify(value));
  assert.equal(detectTicketType({ ticket_type: "officer_issued", offenceDescription: "Red light violation" }), "officer_issued");
  assert.equal(detectTicketType({ ticket_type: "officer_issued", offenceDescription: "Speeding", raw_text: "Photo radar notice comparison" }), "officer_issued");
});

test("manual correction wins against a late upload response and survives an intake handoff", () => {
  const manual = applyTicketType(draft(), "officer_issued", "manual");
  const lateOcr = applyDetectedTicketType(manual, { ticket_type: "photo_radar" });
  assert.equal(lateOcr.ticketType, "officer_issued");
  assert.equal(lateOcr.ticketTypeSource, "manual");
  const handedOff = applyDetectedTicketType(manual, { ...manual, offenceDescription: "Owner of Motor Vehicle Involved" });
  assert.equal(handedOff.ticketType, "officer_issued");
});

test("switching to Photo Radar clears insurance data and requires fresh scope consent and ownership", () => {
  const selected = applyTicketType(draft(), "photo_radar", "manual");
  assert.equal(selected.insuranceCompany, "");
  assert.equal(selected.priorTickets, "");
  assert.equal(selected.pleaType, "not_guilty");
  assert.equal(selected.consentGiven, false);
  assert.equal(selected.digitalSignature, "");
  assert.equal(selected.registeredOwnerOnOffenceDate, "");
  assert.equal(selected.vehicleSeized, false);
  const restored = applyDetectedTicketType({ ...selected, insuranceCompany: "stale cache" }, { ticket_type: "officer_issued" });
  assert.equal(restored.ticketType, "photo_radar");
  assert.equal(restored.insuranceCompany, "");
});

test("changing uploaded tickets clears old ownership, inferred type and signed consent", () => {
  const inferred = applyDetectedTicketType(draft(), { ticket_type: "photo_radar" });
  const answered = { ...inferred, registeredOwnerOnOffenceDate: "yes" as const, consentGiven: true, digitalSignature: "Example Owner" };
  const next = resetTicketTypeForUpload(answered);
  assert.equal(next.ticketType, "officer_issued");
  assert.equal(next.registeredOwnerOnOffenceDate, "");
  assert.equal(next.consentGiven, false);
  assert.equal(next.digitalSignature, "");
  const manual = resetTicketTypeForUpload(applyTicketType(answered, "photo_radar", "manual"));
  assert.equal(manual.ticketType, "photo_radar");
  assert.equal(manual.ticketTypeSource, "manual");
});

test("photo notices never select an insurance add-on and officer checkout retains its existing option", () => {
  for (const locale of ["en", "fr", "ar"]) {
    assert.deepEqual(ticketCheckoutSelection("photo_radar", true, locale), { orderType: "photo_radar", includeIdrAddon: false });
  }
  assert.deepEqual(ticketCheckoutSelection("officer_issued", true), { orderType: "rapid_resolution", includeIdrAddon: true });
  assert.equal(ticketCheckoutSelection("officer_issued", true, "fr").includeIdrAddon, false);
});

test("the assessment photo path skips insurance while retaining contact, consent and review", () => {
  assert.deepEqual(assessmentStepsForTicket("photo_radar"), [1, 3, 4]);
  assert.deepEqual(assessmentStepsForTicket("officer_issued"), [1, 2, 3, 4]);
});

test("both supported sales-page query links initialize the photo product", () => {
  assert.equal(ticketTypeFromSearch("?product=photo-radar"), "photo_radar");
  assert.equal(ticketTypeFromSearch("?ticket_type=photo_radar&utm_source=test"), "photo_radar");
  assert.equal(ticketTypeFromSearch("?product=trial"), null);
  assert.equal(ticketTypeFromSearch(""), null);
});

test("the Pro Driver officer link explicitly selects officer intake over a stale product hint", () => {
  assert.equal(ticketTypeFromSearch("?ticket_type=officer_issued"), "officer_issued");
  assert.equal(ticketTypeFromSearch("?ticket_type=officer_issued&product=photo-radar"), "officer_issued");
  assert.equal(ticketTypeFromSearch("?ticket_type=unknown"), null);
});

test("an owner notice keeps its actual offence date across a rule-change boundary", () => {
  const notice = { success: true, data: { ticket_type: "photo_radar", offenceDate: "2025-03-31", issueDate: "2025-04-14" } };
  assert.equal(ticketDateFromExtraction(notice, "photo_radar"), "2025-03-31");
  assert.equal(ticketDateFromExtraction(notice, "officer_issued"), "2025-04-14");
  assert.equal(ticketDateFromExtraction({ offense_date: "2026-08-01" }, "photo_radar"), "2026-08-01");
});

test("a camera notice with only issue, mailing or legacy ticket date requires manual correction", () => {
  for (const notice of [
    { issueDate: "2026-08-12" },
    { ticketDate: "2026-08-12", mailingDate: "2026-08-13" },
    { offenceDate: null, issueDate: "2026-08-12" },
    { success: false, data: { offenceDate: "2026-08-01" } },
    { offenceDate: "2026-02-30", issueDate: "2026-03-05" },
  ]) assert.equal(ticketDateFromExtraction(notice, "photo_radar"), "", JSON.stringify(notice));
});

test("a manual offence date or deliberate clearing survives missing and late OCR", () => {
  const notice = { offenceDate: "2026-08-02", issueDate: "2026-08-12" };
  assert.equal(ticketDateFromExtraction({ issueDate: "2026-08-12" }, "photo_radar", "2026-08-01"), "2026-08-01");
  assert.equal(ticketDateFromExtraction(notice, "photo_radar", new Date(2026, 7, 1, 12)), "2026-08-01");
  assert.equal(ticketDateFromExtraction(notice, "photo_radar", ""), "");
});

test("date-only conversion retains the printed local calendar day and rejects invalid dates", () => {
  const date = ticketDateAsLocalDate("2025-03-31");
  assert.ok(date);
  assert.deepEqual([date.getFullYear(), date.getMonth(), date.getDate()], [2025, 2, 31]);
  assert.equal(ticketDateFromExtraction({ offenceDate: date }, "photo_radar"), "2025-03-31");
  assert.equal(ticketDateAsLocalDate("2026-02-30"), undefined);
  assert.equal(ticketDateAsLocalDate(""), undefined);
  assert.equal(ticketDateAsLocalDate("03/04/2026"), undefined);
});
