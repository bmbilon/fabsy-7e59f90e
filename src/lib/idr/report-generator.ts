import {
  IDR_CONVICTION_AGING_YEARS,
  IDR_DISCLAIMER,
  IDR_INSURER_RULE_MAX_AGE_DAYS,
  IDR_MAX_CARRIERS_TO_CALL,
  IDR_MIN_CARRIERS_TO_CALL,
  IDR_REPORT_VERSION,
} from "../../config/idr.ts";
import type {
  AlbertaGridDataset,
  AlbertaGridProfile,
  CarrierCallListItem,
  ConvictionClass,
  ConvictionTimelineItem,
  GridBenchmark,
  GridFactorSchedule,
  IdrReport,
  IdrReportInput,
  InsurerRule,
  InsurerBehavior,
  IsoDate,
  ParsedConviction,
  PremiumBaseline,
  PremiumImpactEstimate,
  RenewalScheduleItem,
  SourceReference,
  TicketScenarioSummary,
} from "./types.ts";

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function parseIsoDate(value: IsoDate, label: string): DateParts {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) {
    throw new RangeError(`${label} must use YYYY-MM-DD format.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`${label} is not a valid calendar date.`);
  }

  return { year, month, day };
}

function formatIsoDate(parts: DateParts): IsoDate {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addCalendarYears(value: IsoDate, years: number): IsoDate {
  const parts = parseIsoDate(value, "Date");
  if (!Number.isInteger(years) || years < 0) {
    throw new RangeError("Calendar years must be a non-negative integer.");
  }

  const year = parts.year + years;
  return formatIsoDate({
    year,
    month: parts.month,
    day: Math.min(parts.day, daysInMonth(year, parts.month)),
  });
}

function addDays(value: IsoDate, days: number): IsoDate {
  const parts = parseIsoDate(value, "Date");
  if (!Number.isInteger(days)) {
    throw new RangeError("Days must be an integer.");
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

function compareDates(left: IsoDate, right: IsoDate): number {
  parseIsoDate(left, "Date");
  parseIsoDate(right, "Date");
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeText(value: string | undefined): string {
  return (value ?? "").toLocaleLowerCase("en-CA").replace(/[^a-z0-9]/g, "");
}

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) {
    throw new RangeError(`${label} must not be empty.`);
  }
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer.`);
  }
}

function assertSourceReference(source: SourceReference, label: string): void {
  assertNonEmpty(source?.publisher || "", `${label} publisher`);
  assertNonEmpty(source?.title || "", `${label} title`);
  assertNonEmpty(source?.url || "", `${label} URL`);
  parseIsoDate(source?.accessedDate || "", `${label} accessed date`);
  assertHttpsUrl(source.url, `${label} URL`);
}

function assertHttpsUrl(value: string, label: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new RangeError(`${label} must be a valid URL.`);
  }
  if (parsed.protocol !== "https:") {
    throw new RangeError(`${label} must use HTTPS.`);
  }
  if (parsed.username || parsed.password) {
    throw new RangeError(`${label} must not contain URL credentials.`);
  }
  const hostname = parsed.hostname.toLocaleLowerCase("en-CA");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  ) {
    throw new RangeError(`${label} must use a public HTTPS URL.`);
  }
}

function isoDateToEpoch(value: IsoDate): number {
  const parts = parseIsoDate(value, "Date");
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function sourceAgeDays(source: SourceReference, asOfDate: IsoDate): number {
  return Math.floor((isoDateToEpoch(asOfDate) - isoDateToEpoch(source.accessedDate)) / 86_400_000);
}

function sourceIsCurrent(source: SourceReference, asOfDate: IsoDate): boolean {
  const age = sourceAgeDays(source, asOfDate);
  return age >= 0 && age <= IDR_INSURER_RULE_MAX_AGE_DAYS;
}

function sourceKey(source: SourceReference): string {
  return `${source.url}\u0000${source.accessedDate}\u0000${source.title}\u0000${source.publisher}`;
}

function uniqueSources(sources: readonly SourceReference[]): SourceReference[] {
  const byKey = new Map<string, SourceReference>();
  for (const source of sources) {
    byKey.set(sourceKey(source), source);
  }
  return [...byKey.values()].sort(
    (left, right) =>
      compareStrings(left.publisher, right.publisher) ||
      compareStrings(left.title, right.title) ||
      compareStrings(left.url, right.url) ||
      compareStrings(left.accessedDate, right.accessedDate),
  );
}

function compareStrings(left: string, right: string): number {
  const normalizedLeft = left.toLocaleLowerCase("en-CA");
  const normalizedRight = right.toLocaleLowerCase("en-CA");
  return normalizedLeft < normalizedRight ? -1 : normalizedLeft > normalizedRight ? 1 : 0;
}

function buildConvictionTimeline(
  convictions: readonly ParsedConviction[],
  asOfDate: IsoDate,
  issues: string[],
  blockers: string[],
): ConvictionTimelineItem[] {
  const ids = new Set<string>();

  return convictions.map((conviction) => {
    assertNonEmpty(conviction.id, "Conviction id");
    assertNonEmpty(conviction.offence, `Offence for conviction ${conviction.id}`);
    if (ids.has(conviction.id)) {
      throw new RangeError(`Duplicate conviction id: ${conviction.id}.`);
    }
    ids.add(conviction.id);

    parseIsoDate(conviction.convictionDate, `Conviction date for ${conviction.id}`);
    if (compareDates(conviction.convictionDate, asOfDate) > 0) {
      const issue = `Conviction ${conviction.id} has a conviction date after the report date.`;
      issues.push(issue);
      blockers.push(issue);
    }

    const requestedLookbackYears =
      conviction.applicableLookbackYears ?? IDR_CONVICTION_AGING_YEARS;
    if (!Number.isInteger(requestedLookbackYears) || requestedLookbackYears < 1) {
      throw new RangeError(`Applicable lookback for conviction ${conviction.id} must be a positive integer.`);
    }
    let applicableLookbackYears: number = IDR_CONVICTION_AGING_YEARS;
    let applicableLookbackSource: SourceReference | undefined;
    if (requestedLookbackYears !== IDR_CONVICTION_AGING_YEARS) {
      if (!conviction.applicableLookbackSource) {
        const issue = `Conviction ${conviction.id} uses a non-standard lookback without a source.`;
        issues.push(issue);
        blockers.push(issue);
      } else {
        assertSourceReference(
          conviction.applicableLookbackSource,
          `Applicable lookback source for ${conviction.id}`,
        );
        if (!sourceIsCurrent(conviction.applicableLookbackSource, asOfDate)) {
          const issue = `Conviction ${conviction.id} uses an out-of-date or future-dated lookback source.`;
          issues.push(issue);
          blockers.push(issue);
        } else {
          applicableLookbackYears = requestedLookbackYears;
          applicableLookbackSource = conviction.applicableLookbackSource;
        }
      }
    }
    if (
      conviction.convictionClass === "serious" &&
      conviction.applicableLookbackYears === undefined
    ) {
      const issue = `Serious conviction ${conviction.id} needs a sourced insurer-specific lookback review.`;
      issues.push(issue);
      blockers.push(issue);
    }

    const threeYearExitDate = addCalendarYears(
      conviction.convictionDate,
      IDR_CONVICTION_AGING_YEARS,
    );
    const applicableExitDate = addCalendarYears(
      conviction.convictionDate,
      applicableLookbackYears,
    );

    return {
      convictionId: conviction.id,
      offence: conviction.offence,
      ...(conviction.section ? { section: conviction.section } : {}),
      convictionClass: conviction.convictionClass,
      convictionDate: conviction.convictionDate,
      threeYearExitDate,
      applicableExitDate,
      applicableLookbackYears,
      applicableWindowLabel:
        applicableLookbackSource ? "Configured sourced lookback" : "Product three-year timeline",
      ...(applicableLookbackSource ? { applicableLookbackSource } : {}),
      activeAsOfReportDate:
        compareDates(conviction.convictionDate, asOfDate) <= 0 &&
        compareDates(asOfDate, applicableExitDate) < 0,
      discrepancyFlags: [...conviction.discrepancyFlags],
    };
  });
}

interface TicketMatchResult {
  status: Exclude<IdrReport["verification"]["ticketMatch"], "projected">;
  matchedConvictionId?: string;
}

function determineTicketMatch(input: IdrReportInput): TicketMatchResult {
  if (input.convictions.length === 0) {
    return { status: "not-checked" };
  }

  const ticketOffence = normalizeText(input.ticket.offence);
  const ticketSection = normalizeText(input.ticket.section);
  let hasPartialMatch = false;

  for (const conviction of input.convictions) {
    const offenceMatches = ticketOffence === normalizeText(conviction.offence);
    const sectionsWereProvided = Boolean(ticketSection && normalizeText(conviction.section));
    const sectionMatches =
      sectionsWereProvided && ticketSection === normalizeText(conviction.section);

    if (offenceMatches && (!sectionsWereProvided || sectionMatches)) {
      return { status: "matched", matchedConvictionId: conviction.id };
    }
    if (offenceMatches || sectionMatches) {
      hasPartialMatch = true;
    }
  }

  return { status: hasPartialMatch ? "partial" : "not-matched" };
}

interface TicketScenarioBuildResult {
  scenario?: TicketScenarioSummary;
  evaluationConvictions: readonly ConvictionTimelineItem[];
  ticketMatch: IdrReport["verification"]["ticketMatch"];
}

function buildTicketScenario(
  input: IdrReportInput,
  abstractConvictions: readonly ConvictionTimelineItem[],
  ticketMatch: TicketMatchResult,
  issues: string[],
  blockers: string[],
): TicketScenarioBuildResult {
  const requested = input.ticketScenario;
  if (!requested) {
    return {
      evaluationConvictions: abstractConvictions,
      ticketMatch: ticketMatch.status,
    };
  }
  if (requested.mode !== "listed" && requested.mode !== "projected") {
    throw new RangeError("Ticket scenario mode must be listed or projected.");
  }
  if (
    requested.convictionClass !== undefined &&
    !(CONVICTION_CLASSES as readonly string[]).includes(requested.convictionClass)
  ) {
    throw new RangeError("Ticket scenario conviction class is invalid.");
  }
  if (requested.mode === "projected" && !requested.convictionClass) {
    throw new RangeError("Projected ticket scenario requires a conviction class.");
  }

  const common = {
    label: "Current-ticket conviction scenario" as const,
    mode: requested.mode,
  };

  if (ticketMatch.status === "matched" && ticketMatch.matchedConvictionId) {
    const matched = abstractConvictions.find(
      (conviction) => conviction.convictionId === ticketMatch.matchedConvictionId,
    );
    if (
      matched &&
      requested.convictionClass &&
      matched.convictionClass !== requested.convictionClass
    ) {
      const issue =
        `The current-ticket scenario class ${requested.convictionClass} does not match abstract conviction ${matched.convictionId}, which is classified as ${matched.convictionClass}.`;
      appendUnique(issues, issue);
      appendUnique(blockers, issue);
      return {
        scenario: {
          ...common,
          status: "review-required",
          convictionClass: requested.convictionClass,
          assumedConvictionDate: matched.convictionDate,
          appliedAsAdditionalConviction: false,
          matchedAbstractConvictionId: matched.convictionId,
          basis:
            "The ticket matched a transcribed abstract conviction, but the classes differ. No additional conviction was added while staff review is required.",
        },
        evaluationConvictions: abstractConvictions,
        ticketMatch: "matched",
      };
    }
    return {
      scenario: {
        ...common,
        status: "already-reflected",
        ...(matched ? {
          convictionClass: matched.convictionClass,
          assumedConvictionDate: matched.convictionDate,
        } : {}),
        appliedAsAdditionalConviction: false,
        matchedAbstractConvictionId: ticketMatch.matchedConvictionId,
        basis:
          "The ticket matched a transcribed abstract conviction. That conviction is already included in the Grid, carrier, and estimate counts, so the scenario was not added again.",
      },
      evaluationConvictions: abstractConvictions,
      ticketMatch: "matched",
    };
  }

  if (requested.mode === "listed") {
    const issue = ticketMatch.status === "partial"
      ? "The listed current ticket only partially matches a transcribed abstract conviction, so staff must resolve the match before delivery."
      : "The listed current ticket does not match a transcribed abstract conviction, so staff must resolve the match before delivery.";
    appendUnique(issues, issue);
    appendUnique(blockers, issue);
    return {
      scenario: {
        ...common,
        status: "review-required",
        ...(requested.convictionClass ? { convictionClass: requested.convictionClass } : {}),
        appliedAsAdditionalConviction: false,
        basis:
          "Listed mode uses only a matching conviction transcribed from the abstract. No synthetic conviction was added while staff review is required.",
      },
      evaluationConvictions: abstractConvictions,
      ticketMatch: ticketMatch.status,
    };
  }

  if (ticketMatch.status === "partial") {
    const issue =
      "The projected current ticket partially matches an abstract conviction, so staff must resolve possible double-counting.";
    appendUnique(issues, issue);
    appendUnique(blockers, issue);
    return {
      scenario: {
        ...common,
        status: "review-required",
        convictionClass: requested.convictionClass,
        assumedConvictionDate: input.asOfDate,
        appliedAsAdditionalConviction: false,
        basis:
          "A partial abstract match could represent the same ticket. No additional projected conviction was added while staff review is required.",
      },
      evaluationConvictions: abstractConvictions,
      ticketMatch: "partial",
    };
  }

  const assumedConvictionDate = input.asOfDate;
  const projectedExitDate = addCalendarYears(
    assumedConvictionDate,
    IDR_CONVICTION_AGING_YEARS,
  );
  const projectedConviction: ConvictionTimelineItem = {
    convictionId: "projected-current-ticket",
    offence: input.ticket.offence,
    ...(input.ticket.section ? { section: input.ticket.section } : {}),
    convictionClass: requested.convictionClass,
    convictionDate: assumedConvictionDate,
    threeYearExitDate: projectedExitDate,
    applicableExitDate: projectedExitDate,
    applicableLookbackYears: IDR_CONVICTION_AGING_YEARS,
    applicableWindowLabel: "Product three-year timeline",
    activeAsOfReportDate: true,
    discrepancyFlags: [],
  };
  return {
    scenario: {
      ...common,
      status: "projected",
      convictionClass: requested.convictionClass,
      assumedConvictionDate,
      appliedAsAdditionalConviction: true,
      basis:
        "This what-if scenario assumes the current ticket results in one additional conviction. It is included in the Grid, carrier, and estimate calculations, but it is not listed as an abstract conviction.",
    },
    evaluationConvictions: [...abstractConvictions, projectedConviction],
    ticketMatch: "projected",
  };
}

function resolveScheduleFactor(schedule: GridFactorSchedule, input: number, label: string): number {
  if (!Number.isInteger(input)) {
    throw new RangeError(`${label} must be an integer.`);
  }

  const matchingBand = schedule.bands.find(
    (band) => input >= band.minimum && input <= band.maximum,
  );
  if (matchingBand) {
    return matchingBand.factor;
  }

  if (schedule.overflow && input >= schedule.overflow.from) {
    const previousFactor = resolveScheduleFactor(
      { bands: schedule.bands },
      schedule.overflow.from - 1,
      label,
    );
    const increments = input - schedule.overflow.from + 1;
    return schedule.overflow.operation === "add-to-previous"
      ? previousFactor + schedule.overflow.value * increments
      : previousFactor * schedule.overflow.value ** increments;
  }

  throw new RangeError(`${label} is outside the supplied Grid schedule.`);
}

export function calculateAlbertaGridPremiumCents(
  dataset: AlbertaGridDataset,
  profile: AlbertaGridProfile,
  asOfDate: IsoDate,
): number {
  parseIsoDate(asOfDate, "Grid calculation date");
  assertSourceReference(dataset.source, "Alberta Grid source");
  if (
    dataset.status !== "verified" ||
    !dataset.provenance.premiumValuesPresent ||
    dataset.basePremium.amountCents === null ||
    !dataset.effectiveFrom ||
    !dataset.effectiveThrough ||
    compareDates(asOfDate, dataset.effectiveFrom) < 0 ||
    compareDates(asOfDate, dataset.effectiveThrough) > 0 ||
    !sourceIsCurrent(dataset.source, asOfDate)
  ) {
    throw new RangeError("Current verified Alberta Grid premium values are required.");
  }
  assertNonNegativeInteger(profile.minorConvictions, "Minor conviction count");
  assertNonNegativeInteger(profile.majorConvictions, "Major conviction count");
  assertNonNegativeInteger(profile.criminalConvictions, "Criminal conviction count");
  assertNonNegativeInteger(profile.atFaultClaims, "At-fault claim count");

  const territory = dataset.territoryDifferentials.find(
    (entry) => entry.code === profile.territoryCode,
  );
  if (!territory) {
    throw new RangeError(`Unknown Alberta Grid territory: ${profile.territoryCode}.`);
  }
  const liabilityLimit = dataset.liabilityLimitDifferentials.find(
    (entry) => entry.limitCents === profile.liabilityLimitCents,
  );
  if (!liabilityLimit) {
    throw new RangeError(`Unsupported liability limit: ${profile.liabilityLimitCents}.`);
  }

  const gridStepFactor = resolveScheduleFactor(
    dataset.gridStepDifferentials,
    profile.gridStep,
    "Grid step",
  );
  const minorFactor = resolveScheduleFactor(
    dataset.convictionDifferentials.minor,
    profile.minorConvictions,
    "Minor conviction count",
  );
  const majorFactor = resolveScheduleFactor(
    dataset.convictionDifferentials.major,
    profile.majorConvictions,
    "Major conviction count",
  );
  const criminalFactor = resolveScheduleFactor(
    dataset.convictionDifferentials.criminal,
    profile.criminalConvictions,
    "Criminal conviction count",
  );
  const atFaultClaimFactor = resolveScheduleFactor(
    dataset.atFaultClaimDifferentials,
    profile.atFaultClaims,
    "At-fault claim count",
  );

  // AIRB Grid Guidance section 7 adds the amount above 1.00 for each
  // conviction and claims differential, then applies that sum to the Grid step.
  const combinedDriverFactor = gridStepFactor * (
    1 +
    (atFaultClaimFactor - 1) +
    (minorFactor - 1) +
    (majorFactor - 1) +
    (criminalFactor - 1)
  );

  return Math.round(
    dataset.basePremium.amountCents *
      territory.factor *
      liabilityLimit.factor *
      combinedDriverFactor,
  );
}

function buildGridBenchmark(
  input: IdrReportInput,
  convictions: readonly ConvictionTimelineItem[],
  ticketScenario: TicketScenarioSummary | undefined,
  issues: string[],
  blockers: string[],
): GridBenchmark {
  const dataset = input.gridDataset;
  assertSourceReference(dataset.source, "Alberta Grid source");
  const limitations = [
    `The AIRB Grid benchmark includes only ${dataset.scope.includedCoverage.join(", ")}.`,
    `It excludes ${dataset.scope.excludedComponents.join(", ")}.`,
    "It is a public basic-coverage benchmark, not a carrier quote or a full-policy premium.",
  ];
  const common = {
    currency: "CAD" as const,
    datasetVersion: dataset.datasetVersion,
    source: dataset.source,
    limitations,
  };

  if (
    dataset.status !== "verified" ||
    !dataset.provenance.premiumValuesPresent ||
    dataset.basePremium.amountCents === null ||
    !sourceIsCurrent(dataset.source, input.asOfDate)
  ) {
    const issue = "The Alberta Grid dataset or its source is not currently verified.";
    issues.push(issue);
    blockers.push(issue);
    return {
      ...common,
      status: "unavailable",
      annualPremiumCents: null,
      basis: "No Grid premium was calculated.",
    };
  }

  if (
    !dataset.effectiveFrom ||
    !dataset.effectiveThrough ||
    compareDates(input.asOfDate, dataset.effectiveFrom) < 0 ||
    compareDates(input.asOfDate, dataset.effectiveThrough) > 0
  ) {
    const issue = `Alberta Grid dataset ${dataset.datasetVersion} is not current on ${input.asOfDate}.`;
    issues.push(issue);
    blockers.push(issue);
    return {
      ...common,
      status: "out-of-date",
      annualPremiumCents: null,
      basis: "The supplied Grid dataset is outside its verified effective dates.",
    };
  }

  if (!input.gridProfile) {
    const issue = "A complete driver Grid context is required for the public Grid benchmark.";
    issues.push(issue);
    blockers.push(issue);
    return {
      ...common,
      status: "unavailable",
      annualPremiumCents: null,
      basis: "No driver Grid context was supplied.",
    };
  }

  const profile: AlbertaGridProfile = {
    ...input.gridProfile,
    minorConvictions: convictions.filter(
      (conviction) => conviction.activeAsOfReportDate && conviction.convictionClass === "minor",
    ).length,
    majorConvictions: convictions.filter(
      (conviction) => conviction.activeAsOfReportDate && conviction.convictionClass === "major",
    ).length,
    criminalConvictions:
      input.gridProfile.criminalConvictions +
      (ticketScenario?.status === "projected" &&
      ticketScenario.convictionClass === "serious"
        ? 1
        : 0),
  };

  const projectionBasis = ticketScenario?.status === "projected"
    ? " Counts include the separately labelled projected current-ticket conviction scenario."
    : ticketScenario?.status === "already-reflected"
      ? " The current ticket matched an abstract conviction and was not counted again."
      : "";

  return {
    ...common,
    status: "calculated",
    annualPremiumCents: calculateAlbertaGridPremiumCents(dataset, profile, input.asOfDate),
    basis:
      `AIRB basic-coverage Grid benchmark using verified driver context and minor and major counts derived from the abstract.${projectionBasis} It is not a full-policy premium.`,
  };
}

function buildRenewalSchedule(input: IdrReportInput): RenewalScheduleItem[] {
  if (!input.policyRenewalDate) {
    return [];
  }
  parseIsoDate(input.policyRenewalDate, "Policy renewal date");

  const reminderLeadDays = [...new Set([45, ...(input.reminderLeadDays ?? [])])].sort(
    (a, b) => b - a,
  );
  for (const leadDays of reminderLeadDays) {
    assertNonNegativeInteger(leadDays, "Reminder lead days");
  }

  let renewalDate = input.policyRenewalDate;
  while (compareDates(renewalDate, input.asOfDate) < 0) {
    renewalDate = addCalendarYears(renewalDate, 1);
  }

  const horizonEnd = addCalendarYears(input.asOfDate, IDR_CONVICTION_AGING_YEARS);
  const schedule: RenewalScheduleItem[] = [];
  while (compareDates(renewalDate, horizonEnd) < 0) {
    schedule.push({
      renewalDate,
      reminderDates: reminderLeadDays
        .map((leadDays) => ({
          leadDays,
          reminderDate: addDays(renewalDate, -leadDays),
        }))
        .filter((reminder) => compareDates(reminder.reminderDate, input.asOfDate) >= 0),
    });
    renewalDate = addCalendarYears(renewalDate, 1);
  }

  return schedule;
}

const CONVICTION_CLASSES: readonly ConvictionClass[] = ["minor", "major", "serious"];
const INSURER_BEHAVIORS: readonly InsurerBehavior[] = [
  "no_surcharge",
  "surcharge",
  "decline",
];
const BEHAVIOR_SEVERITY: Record<InsurerBehavior, number> = {
  no_surcharge: 0,
  surcharge: 1,
  decline: 2,
};

interface CarrierRuleGroup {
  carrierId: string;
  carrierName: string;
  rules: readonly InsurerRule[];
}

interface EvaluatedPosture {
  convictionClass: ConvictionClass;
  activeConvictionCount: number;
  thresholdCount: number;
  behavior: Exclude<InsurerBehavior, "decline">;
  matchedRules: readonly InsurerRule[];
  selectedRules: readonly InsurerRule[];
}

interface EvaluatedCarrier {
  group: CarrierRuleGroup;
  phone?: string;
  quoteUrl?: string;
  researchSources: readonly SourceReference[];
  postures: readonly EvaluatedPosture[];
}

interface CarrierCallListBuildResult {
  status: "ready" | "incomplete";
  entries: CarrierCallListItem[];
  candidates: readonly EvaluatedCarrier[];
}

function appendUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function assertPhone(value: string, label: string): void {
  if (!/^\+?[0-9][0-9().\s-]{6,24}(?:\s*(?:x|ext\.?)\s*\d{1,6})?$/i.test(value.trim())) {
    throw new RangeError(`${label} is not a valid phone number.`);
  }
}

function validateInsurerRules(
  rules: readonly InsurerRule[],
  asOfDate: IsoDate,
  issues: string[],
): InsurerRule[] {
  const ids = new Set<string>();
  const currentRules: InsurerRule[] = [];

  for (const rule of rules) {
    assertNonEmpty(rule.carrierId, "Carrier rule id");
    assertNonEmpty(rule.carrierName, `Carrier name for rule ${rule.carrierId}`);
    if (ids.has(rule.carrierId)) {
      throw new RangeError(`Duplicate carrier rule id: ${rule.carrierId}.`);
    }
    ids.add(rule.carrierId);
    if (!CONVICTION_CLASSES.includes(rule.convictionClass)) {
      throw new RangeError(`Carrier rule ${rule.carrierId} has an invalid conviction class.`);
    }
    assertNonNegativeInteger(rule.thresholdCount, `Threshold count for rule ${rule.carrierId}`);
    if (!INSURER_BEHAVIORS.includes(rule.behavior)) {
      throw new RangeError(`Carrier rule ${rule.carrierId} has an invalid behavior.`);
    }
    if (typeof rule.forgivenessProduct !== "boolean") {
      throw new RangeError(`Forgiveness product for rule ${rule.carrierId} must be boolean.`);
    }
    assertSourceReference(rule.researchSource, `Research source for rule ${rule.carrierId}`);
    if (rule.phone) {
      assertPhone(rule.phone, `Phone for rule ${rule.carrierId}`);
    }
    if (rule.quoteUrl) {
      assertHttpsUrl(rule.quoteUrl, `Public information URL for rule ${rule.carrierId}`);
    }

    const percentRange = rule.estimatedAnnualImpactPercentRange;
    if (percentRange) {
      const { minimum, maximum } = percentRange;
      if (
        !Number.isFinite(minimum) ||
        !Number.isFinite(maximum) ||
        minimum < 0 ||
        maximum < minimum
      ) {
        throw new RangeError(`Premium impact range for rule ${rule.carrierId} is invalid.`);
      }
      if (!rule.estimateSource) {
        throw new RangeError(`Premium impact range for rule ${rule.carrierId} requires a source.`);
      }
    } else if (rule.estimateSource) {
      throw new RangeError(`Estimate source for rule ${rule.carrierId} requires a premium range.`);
    }
    if (rule.estimateSource) {
      assertSourceReference(rule.estimateSource, `Estimate source for rule ${rule.carrierId}`);
    }

    if (!sourceIsCurrent(rule.researchSource, asOfDate)) {
      appendUnique(
        issues,
        `Carrier ${rule.carrierName} rule ${rule.carrierId} was excluded because its research source is out of date or future-dated.`,
      );
      continue;
    }
    currentRules.push(rule);
  }

  return currentRules;
}

function groupInsurerRules(rules: readonly InsurerRule[]): CarrierRuleGroup[] {
  const grouped = new Map<string, InsurerRule[]>();
  for (const rule of rules) {
    const key = normalizeText(rule.carrierName);
    const group = grouped.get(key) ?? [];
    group.push(rule);
    grouped.set(key, group);
  }

  return [...grouped.entries()]
    .map(([, unsortedRules]) => {
      const sortedRules = [...unsortedRules].sort(
        (left, right) =>
          compareStrings(left.carrierName, right.carrierName) ||
          compareStrings(left.carrierId, right.carrierId),
      );
      return {
        carrierId: sortedRules[0].carrierId,
        carrierName: sortedRules[0].carrierName,
        rules: sortedRules,
      };
    })
    .sort(
      (left, right) =>
        compareStrings(left.carrierName, right.carrierName) ||
        compareStrings(left.carrierId, right.carrierId),
    );
}

function activeClassCounts(
  convictions: readonly ConvictionTimelineItem[],
  onDate: IsoDate,
): Map<ConvictionClass, number> {
  const counts = new Map<ConvictionClass, number>();
  for (const conviction of convictions) {
    if (
      compareDates(conviction.convictionDate, onDate) <= 0 &&
      compareDates(onDate, conviction.applicableExitDate) < 0
    ) {
      counts.set(conviction.convictionClass, (counts.get(conviction.convictionClass) ?? 0) + 1);
    }
  }
  return counts;
}

function evaluateCarrier(
  group: CarrierRuleGroup,
  convictions: readonly ConvictionTimelineItem[],
  onDate: IsoDate,
): EvaluatedCarrier | null {
  const counts = activeClassCounts(convictions, onDate);
  const classesToEvaluate = counts.size === 0
    ? CONVICTION_CLASSES.filter((convictionClass) =>
        group.rules.some(
          (rule) => rule.convictionClass === convictionClass && rule.thresholdCount === 0,
        ),
      )
    : CONVICTION_CLASSES.filter(
        (convictionClass) => (counts.get(convictionClass) ?? 0) > 0,
      );
  if (classesToEvaluate.length === 0) {
    return null;
  }

  const postures: EvaluatedPosture[] = [];
  for (const convictionClass of classesToEvaluate) {
    const activeConvictionCount = counts.get(convictionClass) ?? 0;
    const exactRules = group.rules.filter(
      (rule) =>
        rule.convictionClass === convictionClass &&
        rule.thresholdCount === activeConvictionCount,
    );
    if (exactRules.length === 0) {
      return null;
    }
    const worstSeverity = Math.max(...exactRules.map((rule) => BEHAVIOR_SEVERITY[rule.behavior]));
    const worstBehavior = INSURER_BEHAVIORS.find(
      (behavior) => BEHAVIOR_SEVERITY[behavior] === worstSeverity,
    );
    if (!worstBehavior || worstBehavior === "decline") {
      return null;
    }
    postures.push({
      convictionClass,
      activeConvictionCount,
      thresholdCount: activeConvictionCount,
      behavior: worstBehavior,
      matchedRules: exactRules,
      selectedRules: exactRules.filter((rule) => rule.behavior === worstBehavior),
    });
  }

  const matchedRules = postures.flatMap((posture) => posture.matchedRules);
  const phone = matchedRules.find((rule) => rule.phone)?.phone;
  const quoteUrl = matchedRules.find((rule) => rule.quoteUrl)?.quoteUrl;

  return {
    group,
    ...(phone ? { phone } : {}),
    ...(quoteUrl ? { quoteUrl } : {}),
    researchSources: uniqueSources(matchedRules.map((rule) => rule.researchSource)),
    postures,
  };
}

function buildCarrierCallList(
  groups: readonly CarrierRuleGroup[],
  convictions: readonly ConvictionTimelineItem[],
  asOfDate: IsoDate,
  issues: string[],
  blockers: string[],
): CarrierCallListBuildResult {
  const candidates: EvaluatedCarrier[] = [];
  for (const group of groups) {
    const evaluated = evaluateCarrier(group, convictions, asOfDate);
    if (!evaluated) {
      appendUnique(
        issues,
        `Carrier ${group.carrierName} was excluded because an exact current rule was missing or conservative evaluation reached decline.`,
      );
      continue;
    }
    candidates.push(evaluated);
  }

  candidates.sort(
    (left, right) =>
      compareStrings(left.group.carrierName, right.group.carrierName) ||
      compareStrings(left.group.carrierId, right.group.carrierId),
  );
  const selected = candidates.slice(0, IDR_MAX_CARRIERS_TO_CALL);
  const entries = selected.map((candidate): CarrierCallListItem => ({
    carrierId: candidate.group.carrierId,
    carrierName: candidate.group.carrierName,
    ...(candidate.phone ? { phone: candidate.phone } : {}),
    ...(candidate.quoteUrl ? { quoteUrl: candidate.quoteUrl } : {}),
    researchSources: candidate.researchSources,
    evaluatedPostures: candidate.postures.map((posture) => ({
      convictionClass: posture.convictionClass,
      activeConvictionCount: posture.activeConvictionCount,
      thresholdCount: posture.thresholdCount,
      behavior: posture.behavior,
    })),
  }));

  const status = entries.length >= IDR_MIN_CARRIERS_TO_CALL ? "ready" : "incomplete";
  if (status === "incomplete") {
    const issue = `Only ${entries.length} unique insurers have current public research data; ${IDR_MIN_CARRIERS_TO_CALL} are required.`;
    appendUnique(issues, issue);
    appendUnique(blockers, issue);
  }

  return { status, entries, candidates: selected };
}

function resolveEstimateBaseline(
  input: IdrReportInput,
  gridBenchmark: GridBenchmark,
  issues: string[],
): PremiumBaseline | null {
  const supplied = input.premiumBaseline;
  if (supplied) {
    if (supplied.currency !== "CAD") {
      throw new RangeError("Annual premium baseline must use CAD.");
    }
    assertNonNegativeInteger(supplied.annualPremiumCents, "Annual premium baseline");
    if (supplied.annualPremiumCents === 0) {
      throw new RangeError("Annual premium baseline must be greater than zero.");
    }
    if (supplied.source) {
      assertSourceReference(supplied.source, "Annual premium baseline source");
    }
    if (
      supplied.basis === "current-policy" &&
      (!supplied.source || sourceIsCurrent(supplied.source, input.asOfDate))
    ) {
      return supplied;
    }
    if (supplied.basis === "current-policy") {
      appendUnique(
        issues,
        "The supplied current-policy baseline source is out of date or future-dated, so the calculated Grid benchmark was used instead.",
      );
    }
  }

  if (gridBenchmark.status !== "calculated" || gridBenchmark.annualPremiumCents === null) {
    return null;
  }
  return {
    annualPremiumCents: gridBenchmark.annualPremiumCents,
    currency: "CAD",
    basis: "verified-grid-benchmark",
    source: gridBenchmark.source,
  };
}

function buildPremiumImpactEstimate(
  input: IdrReportInput,
  convictions: readonly ConvictionTimelineItem[],
  ticketScenario: TicketScenarioSummary | undefined,
  groups: readonly EvaluatedCarrier[],
  gridBenchmark: GridBenchmark,
  renewalSchedule: readonly RenewalScheduleItem[],
  issues: string[],
  blockers: string[],
): PremiumImpactEstimate {
  if (gridBenchmark.status !== "calculated" || gridBenchmark.annualPremiumCents === null) {
    const issue = "A current verified Alberta Grid benchmark is required before any premium impact estimate can be created.";
    appendUnique(issues, issue);
    appendUnique(blockers, issue);
    return {
      status: "unavailable",
      range: null,
      carrierEstimateCount: 0,
      basis: "No estimate was created because the current public Grid benchmark is unavailable.",
      baseline: null,
      sources: uniqueSources([gridBenchmark.source]),
    };
  }
  const baseline = resolveEstimateBaseline(input, gridBenchmark, issues);
  if (!baseline) {
    const issue = "A current policy premium or calculated Grid baseline is required for the three-year impact estimate.";
    appendUnique(issues, issue);
    appendUnique(blockers, issue);
    return {
      status: "unavailable",
      range: null,
      carrierEstimateCount: 0,
      basis: "No current premium baseline was available, so no impact value was created.",
      baseline: null,
      sources: uniqueSources([gridBenchmark.source]),
    };
  }
  if (renewalSchedule.length === 0) {
    const issue = "A policy renewal date is required for the three-year impact estimate.";
    appendUnique(issues, issue);
    appendUnique(blockers, issue);
    return {
      status: "unavailable",
      range: null,
      carrierEstimateCount: 0,
      basis: "No renewal schedule was available, so no impact value was created.",
      baseline,
      sources: uniqueSources([gridBenchmark.source, ...(baseline.source ? [baseline.source] : [])]),
    };
  }

  const estimateSources: SourceReference[] = [
    gridBenchmark.source,
    ...(baseline.source ? [baseline.source] : []),
  ];
  const carrierRanges: { minimumCents: number; maximumCents: number }[] = [];

  for (const candidate of groups) {
    let minimumCents = 0;
    let maximumCents = 0;
    let carrierIsComplete = true;

    for (const renewal of renewalSchedule) {
      const counts = activeClassCounts(convictions, renewal.renewalDate);
      const evaluated = evaluateCarrier(candidate.group, convictions, renewal.renewalDate);
      if (!evaluated) {
        if (counts.size === 0) {
          continue;
        }
        carrierIsComplete = false;
        appendUnique(
          issues,
          `Carrier ${candidate.group.carrierName} was excluded from the estimate because an exact renewal-date rule was missing or evaluated to decline.`,
        );
        break;
      }

      let annualMinimumPercent = 0;
      let annualMaximumPercent = 0;
      for (const posture of evaluated.postures) {
        estimateSources.push(...posture.selectedRules.map((rule) => rule.researchSource));
        if (posture.behavior === "no_surcharge") {
          continue;
        }
        const sourcedRanges = posture.selectedRules.map((rule) => {
          const range = rule.estimatedAnnualImpactPercentRange;
          const source = rule.estimateSource;
          if (!range || !source || !sourceIsCurrent(source, input.asOfDate)) {
            return null;
          }
          return { range, source };
        });
        if (sourcedRanges.some((range) => range === null)) {
          carrierIsComplete = false;
          appendUnique(
            issues,
            `Carrier ${candidate.group.carrierName} was excluded from the estimate because a surcharge row lacks a current sourced percentage range.`,
          );
          break;
        }
        const completeRanges = sourcedRanges.filter(
          (entry): entry is NonNullable<typeof entry> => entry !== null,
        );
        annualMinimumPercent += Math.min(...completeRanges.map((entry) => entry.range.minimum));
        annualMaximumPercent += Math.max(...completeRanges.map((entry) => entry.range.maximum));
        estimateSources.push(...completeRanges.map((entry) => entry.source));
      }
      if (!carrierIsComplete) {
        break;
      }
      minimumCents += Math.round(baseline.annualPremiumCents * (annualMinimumPercent / 100));
      maximumCents += Math.round(baseline.annualPremiumCents * (annualMaximumPercent / 100));
    }

    if (carrierIsComplete) {
      carrierRanges.push({ minimumCents, maximumCents });
    }
  }

  if (carrierRanges.length < IDR_MIN_CARRIERS_TO_CALL) {
    const issue = `Only ${carrierRanges.length} unique carriers have complete current sources for the three-year estimate; ${IDR_MIN_CARRIERS_TO_CALL} are required.`;
    appendUnique(issues, issue);
    appendUnique(blockers, issue);
    return {
      status: "unavailable",
      range: null,
      carrierEstimateCount: carrierRanges.length,
      basis: "No estimate was published because fewer than three call-list carriers had complete current ranges for every applicable renewal.",
      baseline,
      sources: uniqueSources(estimateSources),
    };
  }

  return {
    status: "estimated",
    range: {
      currency: "CAD",
      minimumCents: Math.min(...carrierRanges.map((range) => range.minimumCents)),
      maximumCents: Math.max(...carrierRanges.map((range) => range.maximumCents)),
    },
    carrierEstimateCount: carrierRanges.length,
    basis:
      `Estimated range, not a quote. Calculated across renewals in the next three years using the ${baseline.basis === "current-policy" ? "staff-supplied current-policy premium" : "current AIRB Grid benchmark"} and current sourced percentage ranges for exact conviction class and count rows.${ticketScenario?.status === "projected" ? " The calculation includes the separately labelled projected current-ticket conviction scenario." : ticketScenario?.status === "already-reflected" ? " The matched current ticket was already represented in the abstract and was not counted again." : ""} Class percentages are added only when every selected row is sourced.`,
    baseline,
    sources: uniqueSources(estimateSources),
  };
}

export function generateIdrReport(input: IdrReportInput): IdrReport {
  parseIsoDate(input.asOfDate, "Report date");
  assertNonEmpty(input.ticket.offence, "Ticket offence");
  if (input.ticket.occurrenceDate) {
    parseIsoDate(input.ticket.occurrenceDate, "Ticket occurrence date");
  }
  if (input.ticket.issueDate) {
    parseIsoDate(input.ticket.issueDate, "Ticket issue date");
  }
  const issues: string[] = [];
  const blockers: string[] = [];
  const currentRules = validateInsurerRules(input.insurerRules, input.asOfDate, issues);
  const groups = groupInsurerRules(currentRules);
  const convictions = buildConvictionTimeline(
    input.convictions,
    input.asOfDate,
    issues,
    blockers,
  );
  const rawTicketMatch = determineTicketMatch(input);
  const scenarioResult = buildTicketScenario(
    input,
    convictions,
    rawTicketMatch,
    issues,
    blockers,
  );
  const ticketMatch = scenarioResult.ticketMatch;
  if (ticketMatch === "partial") {
    const issue = "Ticket particulars only partially match the parsed conviction record.";
    appendUnique(issues, issue);
    appendUnique(blockers, issue);
  } else if (ticketMatch === "not-matched") {
    const issue = "Ticket particulars do not match the parsed conviction record.";
    appendUnique(issues, issue);
    appendUnique(blockers, issue);
  }

  const renewalSchedule = buildRenewalSchedule(input);
  const gridBenchmark = buildGridBenchmark(
    input,
    scenarioResult.evaluationConvictions,
    scenarioResult.scenario,
    issues,
    blockers,
  );
  const carrierCallList = buildCarrierCallList(
    groups,
    scenarioResult.evaluationConvictions,
    input.asOfDate,
    issues,
    blockers,
  );
  const estimatedThreeYearPremiumImpact = buildPremiumImpactEstimate(
    input,
    scenarioResult.evaluationConvictions,
    scenarioResult.scenario,
    carrierCallList.candidates,
    gridBenchmark,
    renewalSchedule,
    issues,
    blockers,
  );
  const discrepancyFlags = convictions.flatMap((conviction) => conviction.discrepancyFlags);
  for (const flag of discrepancyFlags.filter((entry) => entry.severity === "blocking")) {
    appendUnique(blockers, `Blocking abstract discrepancy ${flag.code}: ${flag.detail}`);
  }
  const hasReviewDiscrepancy = discrepancyFlags.some(
    (flag) => flag.severity === "review" || flag.severity === "blocking",
  );
  const callListIsReady =
    carrierCallList.status === "ready" &&
    carrierCallList.entries.length >= IDR_MIN_CARRIERS_TO_CALL &&
    carrierCallList.entries.length <= IDR_MAX_CARRIERS_TO_CALL;
  const estimateIsReady =
    estimatedThreeYearPremiumImpact.status === "estimated" &&
    estimatedThreeYearPremiumImpact.range !== null &&
    estimatedThreeYearPremiumImpact.carrierEstimateCount >= IDR_MIN_CARRIERS_TO_CALL;
  const deliveryReady =
    blockers.length === 0 &&
    !hasReviewDiscrepancy &&
    (ticketMatch === "matched" || ticketMatch === "not-checked" || ticketMatch === "projected") &&
    gridBenchmark.status === "calculated" &&
    callListIsReady &&
    estimateIsReady;
  const needsReview = blockers.length > 0 || hasReviewDiscrepancy;

  return {
    reportVersion: IDR_REPORT_VERSION,
    asOfDate: input.asOfDate,
    verification: {
      status: needsReview ? "review-required" : "verified",
      ticketMatch,
      checkedConvictions: convictions.length,
      discrepancyFlags,
      issues,
      blockers,
      deliveryReady,
    },
    convictions,
    ...(scenarioResult.scenario ? { ticketScenario: scenarioResult.scenario } : {}),
    estimatedThreeYearPremiumImpact,
    gridBenchmark,
    carrierCallList: {
      heading: "Public insurer research directory",
      status: carrierCallList.status,
      framing:
        "Entries are listed alphabetically from current public sources. They are not ranked or recommended, and inclusion does not predict eligibility, pricing or coverage. Use the public links for independent research and ask a licensed broker for insurer-specific advice or quotes.",
      entries: carrierCallList.entries,
    },
    renewalSchedule,
    disclaimer: IDR_DISCLAIMER,
  };
}
