export type IsoDate = string;
export type ConvictionClass = "minor" | "major" | "serious";
export type GridConvictionClass = "minor" | "major" | "criminal";
export type VerificationSeverity = "info" | "review" | "blocking";
export type InsurerBehavior = "no_surcharge" | "surcharge" | "decline";

export interface SourceReference {
  publisher: string;
  title: string;
  url: string;
  accessedDate: IsoDate;
}

export interface ConvictionDiscrepancyFlag {
  code: string;
  detail: string;
  field?: "offence" | "section" | "convictionDate" | "convictionClass" | "other";
  severity: VerificationSeverity;
}

export interface ParsedConviction {
  id: string;
  offence: string;
  section?: string;
  convictionDate: IsoDate;
  convictionClass: ConvictionClass;
  discrepancyFlags: readonly ConvictionDiscrepancyFlag[];
  /**
   * Supply this only when a sourced rule uses a window other than three years.
   * The report always retains the product's three-year exit date separately.
   */
  applicableLookbackYears?: number;
  applicableLookbackSource?: SourceReference;
}

export interface TicketParticulars {
  ticketNumber?: string;
  offence: string;
  section?: string;
  occurrenceDate?: IsoDate;
  issueDate?: IsoDate;
  location?: string;
}

export interface TicketScenarioInput {
  mode: "listed" | "projected";
  convictionClass?: ConvictionClass;
}

export interface PercentRange {
  minimum: number;
  maximum: number;
}

export interface MoneyRange {
  currency: "CAD";
  minimumCents: number;
  maximumCents: number;
}

export interface PremiumBaseline {
  annualPremiumCents: number;
  currency: "CAD";
  basis: "current-policy" | "verified-grid-benchmark";
  source?: SourceReference;
}

export interface InsurerRule {
  /** Database row identifier. Rows are grouped into carriers by normalized name. */
  carrierId: string;
  carrierName: string;
  convictionClass: ConvictionClass;
  /** Exact active-conviction count for which this published posture applies. */
  thresholdCount: number;
  behavior: InsurerBehavior;
  surchargeNote?: string;
  forgivenessProduct: boolean;
  forgivenessNote?: string;
  researchSource: SourceReference;
  phone?: string;
  quoteUrl?: string;
  /**
   * Sourced incremental annual impact for this exact class and threshold row.
   * Multiple active classes are added only when every selected row is sourced.
   */
  estimatedAnnualImpactPercentRange?: PercentRange;
  estimateSource?: SourceReference;
}

export interface GridFactorBand {
  minimum: number;
  maximum: number;
  factor: number;
}

export interface GridOverflowRule {
  from: number;
  operation: "add-to-previous" | "multiply-previous";
  value: number;
}

export interface GridFactorSchedule {
  bands: readonly GridFactorBand[];
  overflow?: GridOverflowRule;
}

export interface AlbertaGridDataset {
  schemaVersion: string;
  datasetId: string;
  datasetVersion: string;
  jurisdiction: "Alberta";
  currency: "CAD";
  status: "verified" | "metadata-only";
  effectiveFrom: IsoDate | null;
  effectiveThrough: IsoDate | null;
  source: SourceReference;
  provenance: {
    premiumValuesPresent: boolean;
    notes: string;
  };
  scope: {
    includedCoverage: readonly string[];
    excludedComponents: readonly string[];
  };
  basePremium: {
    gridStep: number;
    amountCents: number | null;
  };
  gridStepDifferentials: GridFactorSchedule;
  territoryDifferentials: readonly {
    code: string;
    label: string;
    factor: number;
  }[];
  liabilityLimitDifferentials: readonly {
    limitCents: number;
    factor: number;
  }[];
  convictionDifferentials: Record<GridConvictionClass, GridFactorSchedule & { lookbackYears: number }>;
  atFaultClaimDifferentials: GridFactorSchedule & { lookbackYears: number };
}

export interface AlbertaGridProfile {
  gridStep: number;
  territoryCode: string;
  liabilityLimitCents: number;
  minorConvictions: number;
  majorConvictions: number;
  criminalConvictions: number;
  atFaultClaims: number;
}

export interface AlbertaGridContext {
  gridStep: number;
  territoryCode: string;
  liabilityLimitCents: number;
  criminalConvictions: number;
  atFaultClaims: number;
}

export interface IdrReportInput {
  asOfDate: IsoDate;
  convictions: readonly ParsedConviction[];
  ticket: TicketParticulars;
  ticketScenario?: TicketScenarioInput;
  insurerRules: readonly InsurerRule[];
  gridDataset: AlbertaGridDataset;
  gridProfile?: AlbertaGridContext;
  premiumBaseline?: PremiumBaseline;
  policyRenewalDate?: IsoDate;
  reminderLeadDays?: readonly number[];
}

export interface TicketScenarioSummary {
  label: "Current-ticket conviction scenario";
  mode: "listed" | "projected";
  status: "projected" | "already-reflected" | "review-required";
  convictionClass?: ConvictionClass;
  assumedConvictionDate?: IsoDate;
  appliedAsAdditionalConviction: boolean;
  matchedAbstractConvictionId?: string;
  basis: string;
}

export interface ConvictionTimelineItem {
  convictionId: string;
  offence: string;
  section?: string;
  convictionClass: ConvictionClass;
  convictionDate: IsoDate;
  threeYearExitDate: IsoDate;
  applicableExitDate: IsoDate;
  applicableLookbackYears: number;
  applicableWindowLabel: "Product three-year timeline" | "Configured sourced lookback";
  applicableLookbackSource?: SourceReference;
  activeAsOfReportDate: boolean;
  discrepancyFlags: readonly ConvictionDiscrepancyFlag[];
}

export interface RenewalScheduleItem {
  renewalDate: IsoDate;
  reminderDates: readonly {
    leadDays: number;
    reminderDate: IsoDate;
  }[];
}

export interface CarrierCallListItem {
  rank: number;
  carrierId: string;
  carrierName: string;
  reason: string;
  phone?: string;
  quoteUrl?: string;
  rankingScore: number;
  researchSources: readonly SourceReference[];
  evaluatedPostures: readonly {
    convictionClass: ConvictionClass;
    activeConvictionCount: number;
    thresholdCount: number;
    behavior: Exclude<InsurerBehavior, "decline">;
  }[];
}

export interface PremiumImpactEstimate {
  status: "estimated" | "unavailable";
  range: MoneyRange | null;
  carrierEstimateCount: number;
  basis: string;
  baseline: PremiumBaseline | null;
  sources: readonly SourceReference[];
}

export interface GridBenchmark {
  status: "calculated" | "unavailable" | "out-of-date";
  annualPremiumCents: number | null;
  currency: "CAD";
  datasetVersion: string;
  source: SourceReference;
  basis: string;
  limitations: readonly string[];
}

export interface IdrReport {
  reportVersion: string;
  asOfDate: IsoDate;
  verification: {
    status: "verified" | "review-required";
    ticketMatch: "matched" | "partial" | "not-matched" | "not-checked" | "projected";
    checkedConvictions: number;
    discrepancyFlags: readonly ConvictionDiscrepancyFlag[];
    issues: readonly string[];
    blockers: readonly string[];
    deliveryReady: boolean;
  };
  convictions: readonly ConvictionTimelineItem[];
  ticketScenario?: TicketScenarioSummary;
  estimatedThreeYearPremiumImpact: PremiumImpactEstimate;
  gridBenchmark: GridBenchmark;
  carrierCallList: {
    heading: "Carriers worth calling";
    status: "ready" | "incomplete";
    framing: string;
    entries: readonly CarrierCallListItem[];
  };
  renewalSchedule: readonly RenewalScheduleItem[];
  disclaimer: string;
}
