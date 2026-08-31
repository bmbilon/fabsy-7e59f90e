export type AteCheckStatus = "pending" | "pass" | "issue" | "missing" | "not_applicable";
export type AteNoticeKind = "unknown" | "speed" | "red_light";
export type AteEvidenceStatus = "unknown" | "supported" | "concern" | "missing" | "not_applicable";
export interface AteEvidenceEntry { status: AteEvidenceStatus; reference: string; }
export interface AteCheck { key: string; label: string; status: AteCheckStatus; evidence: string; crownAsk: string | null; }

export const ATE_CHECKS = [
  { key: "plate_match", label: "Plate and image match", question: "Compare the notice's plate and vehicle details against the legible enforcement image.", ask: "Please provide a legible image and reconcile the plate or vehicle discrepancy before reviewing the fine." },
  { key: "site_permission", label: "Permitted speed site or documented exception", question: "For speed enforcement on or after April 1, 2025, confirm school, playground or construction site eligibility, or the approval effective on the offence date. Red-light enforcement is separate; approved speed-on-green exceptions may exist.", ask: "Please identify the permitted speed-enforcement site category or provide the applicable approval and its effective dates." },
  { key: "zone_hours", label: "Zone hours at the recorded time", question: "For school or playground speed enforcement, compare the offence timestamp with the signs, dates and municipal hours that apply to that site. Do not assume one province-wide schedule.", ask: "Please provide the zone signs and hours in force at the recorded offence time and reconcile the applicable speed limit." },
  { key: "construction_workers", label: "Workers for a doubled construction fine", question: "If a doubled construction-zone fine was applied, check evidence that the conditions required for that fine, including workers, were present. Otherwise mark not applicable with a reference.", ask: "Please provide the basis for the doubled construction fine, including evidence of workers at the relevant time, or review the fine at the supported level." },
  { key: "five_minute_rule", label: "Five-minute duplicate-notice policy", question: "Check same vehicle, municipality and offence timestamps. Edmonton publishes a five-minute policy. For Calgary, obtain the applicable contemporaneous policy before treating a duplicate as an error.", ask: "Please review these timestamps under the municipality's applicable duplicate-notice policy; for Calgary, please confirm the policy effective on the offence date." },
  { key: "mailing_service", label: "Certificate mailing date and applicable service", question: "Check the certificate and mailing record, including the 2025 guideline's 21 working-day mailing target where applicable. Verify the actual legal service rules, authorized courier/reissue and postal-disruption exceptions; late receipt alone is not a defence.", ask: "Please provide the certificate, mailing/service record and any reissue or authorized-service basis so the applicable timing can be reviewed." },
  { key: "ownership", label: "Registered ownership on the offence date", question: "Compare the registered owner on the offence date. Sold-before and stolen answers require supporting records and human review; they are not automatic withdrawals.", ask: "Please review the offence-date ownership record against the supplied sale or theft evidence and confirm the basis for owner liability." },
  { key: "operator_calibration", label: "Operator and device disclosure", question: "Check operator logs, device identification, testing and calibration records applicable to this device and date. Do not invent a universal calibration-expiry period.", ask: "Please provide the operator log and applicable device testing/calibration records for the enforcement session." },
] as const;

export type AteCheckKey = typeof ATE_CHECKS[number]["key"];
export type AteEvidence = Partial<Record<AteCheckKey, AteEvidenceEntry>>;

/** Deterministic triage of documented evidence. It never asserts a legal defence. */
export function buildAteChecklist(input: { noticeKind: AteNoticeKind; jurisdiction: string; offenceDate?: string | null; ownership?: string | null; evidence: AteEvidence }): AteCheck[] {
  return ATE_CHECKS.map((check) => {
    const entry = input.evidence[check.key];
    const reference = entry?.reference?.trim() || "";
    let status: AteCheckStatus = "pending";
    if (entry?.status === "missing") status = "missing";
    else if (entry?.status === "concern") status = reference ? "issue" : "pending";
    else if (entry?.status === "supported") status = reference ? "pass" : "pending";
    else if (entry?.status === "not_applicable") status = reference ? "not_applicable" : "pending";

    // Speed-specific rules cannot invalidate a red-light offence.
    if (input.noticeKind === "red_light" && ["site_permission", "zone_hours", "construction_workers"].includes(check.key)) {
      status = "not_applicable";
    }
    if (check.key === "site_permission" && input.noticeKind === "speed" &&
        (!input.offenceDate || input.offenceDate.slice(0, 10) < "2025-04-01") && status !== "missing") {
      status = "pending"; // Earlier rules need a date-specific manual review.
    }
    if (input.noticeKind === "unknown" && ["site_permission", "zone_hours", "construction_workers"].includes(check.key)) status = "pending";
    if (check.key === "five_minute_rule" && !input.jurisdiction.trim()) status = "pending";
    // A mere Calgary duplicate is not enough. A source-backed policy review is required.
    if (check.key === "five_minute_rule" && /calgary/i.test(input.jurisdiction) && !reference) status = "pending";
    if (check.key === "ownership" && input.ownership !== "yes" && status === "pending") status = "missing";
    const crownAsk = ["issue", "missing", "pending"].includes(status) ? check.ask : null;
    return { key: check.key, label: check.label, status, evidence: reference, crownAsk };
  });
}

export function ateActionDueAt(completeDisclosureAt: string | null): string | null {
  if (!completeDisclosureAt) return null;
  const timestamp = Date.parse(completeDisclosureAt);
  if (!Number.isFinite(timestamp)) throw new Error("Complete disclosure timestamp is invalid.");
  return new Date(timestamp + 48 * 60 * 60 * 1000).toISOString();
}

export function summarizeAteReductions(files: { paidAt: string; id: string; originalFineCents: number | null; finalFineCents: number | null; resolvedAt: string | null }[]) {
  const cohort = [...files].sort((a, b) => a.paidAt.localeCompare(b.paidAt) || a.id.localeCompare(b.id)).slice(0, 20);
  const reductions = cohort.filter((file) => file.resolvedAt && Number.isSafeInteger(file.originalFineCents) && Number.isSafeInteger(file.finalFineCents))
    .map((file) => Math.max(0, file.originalFineCents! - file.finalFineCents!) / 100).sort((a, b) => a - b);
  const middle = Math.floor(reductions.length / 2);
  const median = !reductions.length ? null : reductions.length % 2 ? reductions[middle] : (reductions[middle - 1] + reductions[middle]) / 2;
  return { cohortCount: cohort.length, resolvedCount: reductions.length, pendingCount: cohort.length - reductions.length, medianReductionCad: median, below40: median === null ? null : median < 40, cohortComplete: cohort.length === 20 && reductions.length === 20 };
}
