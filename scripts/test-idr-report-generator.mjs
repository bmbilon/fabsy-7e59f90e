import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ABSTRACT_SELF_ORDER,
  IDR_DISCLAIMER,
  IDR_PRICE_ADDON,
  IDR_PRICE_STANDALONE,
} from "../src/config/idr.ts";
import {
  addCalendarYears,
  calculateAlbertaGridPremiumCents,
  generateIdrReport,
} from "../src/lib/idr/index.ts";

const gridDataset = JSON.parse(
  readFileSync(new URL("../src/data/alberta-grid/2026.v1.json", import.meta.url), "utf8"),
);

function source(suffix = "base", accessedDate = "2026-08-01") {
  return {
    publisher: `Test publisher ${suffix}`,
    title: `Test source ${suffix}`,
    url: `https://example.test/${suffix}`,
    accessedDate,
  };
}

function insurerRule(overrides = {}) {
  const carrierName = overrides.carrierName ?? "Carrier Alpha";
  const carrierId = overrides.carrierId ?? "alpha-minor-1";
  return {
    carrierId,
    carrierName,
    convictionClass: "minor",
    thresholdCount: 1,
    behavior: "surcharge",
    surchargeNote: "Published exact-count test posture.",
    forgivenessProduct: false,
    researchSource: source(`research-${carrierId}`),
    phone: "1-800-555-0100",
    estimatedAnnualImpactPercentRange: { minimum: 10, maximum: 20 },
    estimateSource: source(`estimate-${carrierId}`),
    ...overrides,
  };
}

function threeCarrierRules(overrides = {}) {
  return [
    insurerRule({
      carrierId: "alpha-minor-1",
      carrierName: "Carrier Alpha",
      phone: "1-800-555-0101",
      ...overrides,
    }),
    insurerRule({
      carrierId: "beta-minor-1",
      carrierName: "Carrier Beta",
      phone: undefined,
      quoteUrl: "https://example.test/quote-beta",
      estimatedAnnualImpactPercentRange: { minimum: 5, maximum: 10 },
      ...overrides,
    }),
    insurerRule({
      carrierId: "gamma-minor-1",
      carrierName: "Carrier Gamma",
      phone: "1-800-555-0103",
      estimatedAnnualImpactPercentRange: { minimum: 7.5, maximum: 7.5 },
      ...overrides,
    }),
  ];
}

function completeInput() {
  return {
    asOfDate: "2026-08-01",
    convictions: [
      {
        id: "conviction-1",
        offence: "Test offence",
        section: "TSA 1(1)",
        convictionDate: "2024-06-10",
        convictionClass: "minor",
        discrepancyFlags: [],
      },
    ],
    ticket: {
      ticketNumber: "TEST-1",
      offence: "Test offence",
      section: "TSA 1(1)",
      occurrenceDate: "2024-05-01",
    },
    insurerRules: threeCarrierRules(),
    gridDataset,
    gridProfile: {
      gridStep: 0,
      territoryCode: "rest-of-alberta",
      liabilityLimitCents: 100000000,
      criminalConvictions: 0,
      atFaultClaims: 0,
    },
    premiumBaseline: {
      annualPremiumCents: 200000,
      currency: "CAD",
      basis: "current-policy",
    },
    policyRenewalDate: "2026-10-01",
    reminderLeadDays: [30, 60, 30],
  };
}

test("exports the exact IDR product constants and disclaimer", () => {
  assert.equal(IDR_PRICE_STANDALONE, 49);
  assert.equal(IDR_PRICE_ADDON, 31);
  assert.equal(ABSTRACT_SELF_ORDER, true);
  assert.equal(
    IDR_DISCLAIMER,
    "This report provides consumer research and planning information, not an insurer quote, licensed broker recommendation or promise of eligibility, premium savings or a particular insurance outcome. Fabsy is not an insurance agent or broker and does not sell, quote or place insurance.",
  );
});

test("calculates exact three-calendar-year dates using date-only leap-day clamping", () => {
  assert.equal(addCalendarYears("2024-02-29", 3), "2027-02-28");
  assert.equal(addCalendarYears("2024-02-29", 4), "2028-02-29");
  assert.throws(() => addCalendarYears("2026-02-30", 3), /valid calendar date/);
});

test("creates a deterministic delivery-ready report with the required 45-day reminder", () => {
  const input = completeInput();
  const first = generateIdrReport(input);
  const second = generateIdrReport(input);

  assert.deepEqual(first, second);
  assert.equal(first.verification.status, "verified");
  assert.equal(first.verification.deliveryReady, true);
  assert.deepEqual(first.verification.blockers, []);
  assert.equal(first.verification.ticketMatch, "matched");
  assert.equal(first.convictions[0].threeYearExitDate, "2027-06-10");
  assert.equal(first.gridBenchmark.annualPremiumCents, 284300);
  assert.deepEqual(first.estimatedThreeYearPremiumImpact.range, {
    currency: "CAD",
    minimumCents: 10000,
    maximumCents: 40000,
  });
  assert.equal(first.estimatedThreeYearPremiumImpact.carrierEstimateCount, 3);
  assert.deepEqual(
    first.carrierCallList.entries.map((entry) => entry.carrierName),
    ["Carrier Alpha", "Carrier Beta", "Carrier Gamma"],
  );
  assert.equal(first.carrierCallList.status, "ready");
  assert.equal(first.carrierCallList.heading, "Public insurer research directory");
  assert.ok(first.carrierCallList.framing.includes("not ranked or recommended"));
  assert.deepEqual(first.renewalSchedule[0], {
    renewalDate: "2026-10-01",
    reminderDates: [
      { leadDays: 60, reminderDate: "2026-08-02" },
      { leadDays: 45, reminderDate: "2026-08-17" },
      { leadDays: 30, reminderDate: "2026-09-01" },
    ],
  });
  assert.equal(first.disclaimer, IDR_DISCLAIMER);
});

test("evaluates sourced threshold-zero carrier rules for a clean abstract", () => {
  const input = completeInput();
  input.convictions = [];
  input.ticket = { offence: "Pending test ticket" };
  input.insurerRules = threeCarrierRules({
    thresholdCount: 0,
    behavior: "no_surcharge",
    estimatedAnnualImpactPercentRange: undefined,
    estimateSource: undefined,
  });

  const report = generateIdrReport(input);

  assert.equal(report.verification.ticketMatch, "not-checked");
  assert.equal(report.verification.deliveryReady, true);
  assert.equal(report.convictions.length, 0);
  assert.equal(report.ticketScenario, undefined);
  assert.equal(report.carrierCallList.entries.length, 3);
  for (const carrier of report.carrierCallList.entries) {
    assert.deepEqual(carrier.evaluatedPostures, [
      {
        convictionClass: "minor",
        activeConvictionCount: 0,
        thresholdCount: 0,
        behavior: "no_surcharge",
      },
    ]);
  }
  assert.deepEqual(report.estimatedThreeYearPremiumImpact.range, {
    currency: "CAD",
    minimumCents: 0,
    maximumCents: 0,
  });
  assert.equal(report.estimatedThreeYearPremiumImpact.carrierEstimateCount, 3);
});

test("uses a projected current-ticket conviction without listing it on the abstract", () => {
  const input = completeInput();
  input.convictions = [];
  input.ticket = { offence: "Pending major offence" };
  input.ticketScenario = { mode: "projected", convictionClass: "major" };
  input.insurerRules = threeCarrierRules({ convictionClass: "major" });

  const report = generateIdrReport(input);

  assert.equal(report.verification.ticketMatch, "projected");
  assert.equal(report.verification.checkedConvictions, 0);
  assert.equal(report.verification.deliveryReady, true);
  assert.equal(report.convictions.length, 0);
  assert.deepEqual(report.ticketScenario, {
    label: "Current-ticket conviction scenario",
    mode: "projected",
    status: "projected",
    convictionClass: "major",
    assumedConvictionDate: "2026-08-01",
    appliedAsAdditionalConviction: true,
    basis:
      "This what-if scenario assumes the current ticket results in one additional conviction. It is included in the Grid, carrier, and estimate calculations, but it is not listed as an abstract conviction.",
  });
  assert.equal(report.gridBenchmark.annualPremiumCents, 355375);
  assert.ok(report.gridBenchmark.basis.includes("projected current-ticket conviction scenario"));
  assert.ok(report.carrierCallList.framing.includes("not ranked or recommended"));
  assert.ok(report.estimatedThreeYearPremiumImpact.basis.includes("projected current-ticket conviction scenario"));
  for (const carrier of report.carrierCallList.entries) {
    assert.equal(carrier.evaluatedPostures[0].activeConvictionCount, 1);
    assert.equal(carrier.evaluatedPostures[0].convictionClass, "major");
  }
  assert.deepEqual(report.estimatedThreeYearPremiumImpact.range, {
    currency: "CAD",
    minimumCents: 30000,
    maximumCents: 120000,
  });
});

test("does not double-count a projected scenario that matches the abstract", () => {
  const input = completeInput();
  input.ticketScenario = { mode: "projected", convictionClass: "minor" };

  const report = generateIdrReport(input);

  assert.equal(report.verification.ticketMatch, "matched");
  assert.equal(report.verification.deliveryReady, true);
  assert.equal(report.convictions.length, 1);
  assert.equal(report.ticketScenario.status, "already-reflected");
  assert.equal(report.ticketScenario.appliedAsAdditionalConviction, false);
  assert.equal(report.ticketScenario.matchedAbstractConvictionId, "conviction-1");
  assert.equal(report.gridBenchmark.annualPremiumCents, 284300);
  for (const carrier of report.carrierCallList.entries) {
    assert.equal(carrier.evaluatedPostures[0].activeConvictionCount, 1);
  }
  assert.deepEqual(report.estimatedThreeYearPremiumImpact.range, {
    currency: "CAD",
    minimumCents: 10000,
    maximumCents: 40000,
  });
});

test("listed mode uses only a matching abstract conviction", () => {
  const matchedInput = completeInput();
  matchedInput.ticketScenario = { mode: "listed" };
  const matched = generateIdrReport(matchedInput);

  assert.equal(matched.verification.deliveryReady, true);
  assert.equal(matched.ticketScenario.mode, "listed");
  assert.equal(matched.ticketScenario.status, "already-reflected");
  assert.equal(matched.ticketScenario.convictionClass, "minor");
  assert.equal(matched.ticketScenario.appliedAsAdditionalConviction, false);
  assert.equal(matched.carrierCallList.entries[0].evaluatedPostures[0].activeConvictionCount, 1);

  const unmatchedInput = completeInput();
  unmatchedInput.convictions = [];
  unmatchedInput.ticket = { offence: "Unlisted ticket" };
  unmatchedInput.ticketScenario = { mode: "listed", convictionClass: "minor" };
  unmatchedInput.insurerRules = threeCarrierRules({
    thresholdCount: 0,
    behavior: "no_surcharge",
    estimatedAnnualImpactPercentRange: undefined,
    estimateSource: undefined,
  });
  const unmatched = generateIdrReport(unmatchedInput);

  assert.equal(unmatched.convictions.length, 0);
  assert.equal(unmatched.ticketScenario.status, "review-required");
  assert.equal(unmatched.ticketScenario.appliedAsAdditionalConviction, false);
  assert.equal(unmatched.carrierCallList.entries[0].evaluatedPostures[0].activeConvictionCount, 0);
  assert.equal(unmatched.verification.deliveryReady, false);
  assert.ok(unmatched.verification.blockers.some((item) => item.includes("does not match")));
});

test("requires a conviction class for projected ticket scenarios", () => {
  const input = completeInput();
  input.ticketScenario = { mode: "projected" };
  assert.throws(
    () => generateIdrReport(input),
    /requires a conviction class/,
  );
});

test("retains the three-year date beside a current sourced longer lookback", () => {
  const input = completeInput();
  const lookbackSource = source("serious-lookback");
  input.convictions = [
    {
      id: "serious-1",
      offence: "Serious test offence",
      convictionDate: "2024-02-29",
      convictionClass: "serious",
      discrepancyFlags: [],
      applicableLookbackYears: 4,
      applicableLookbackSource: lookbackSource,
    },
  ];
  input.ticket = { offence: "Serious test offence" };
  input.insurerRules = ["Alpha", "Beta", "Gamma"].map((name) =>
    insurerRule({
      carrierId: `${name.toLocaleLowerCase()}-serious-1`,
      carrierName: `Carrier ${name}`,
      convictionClass: "serious",
      behavior: "no_surcharge",
      estimatedAnnualImpactPercentRange: undefined,
      estimateSource: undefined,
    }),
  );

  const report = generateIdrReport(input);
  assert.equal(report.convictions[0].threeYearExitDate, "2027-02-28");
  assert.equal(report.convictions[0].applicableExitDate, "2028-02-29");
  assert.equal(report.convictions[0].applicableLookbackYears, 4);
  assert.equal(report.convictions[0].applicableWindowLabel, "Configured sourced lookback");
  assert.deepEqual(report.convictions[0].applicableLookbackSource, lookbackSource);
});

test("applies simultaneous Grid differentials additively and derives abstract counts", () => {
  const profile = {
    gridStep: 2,
    territoryCode: "calgary-edmonton",
    liabilityLimitCents: 200000000,
    minorConvictions: 2,
    majorConvictions: 1,
    criminalConvictions: 1,
    atFaultClaims: 2,
  };
  const combinedDriverFactor = 1.11 * (1 + 0.3 + 0.25 + 0.25 + 3);
  assert.equal(
    calculateAlbertaGridPremiumCents(gridDataset, profile, "2026-08-01"),
    Math.round(284300 * 1.4 * 1.09 * combinedDriverFactor),
  );

  const input = completeInput();
  input.convictions = [
    ...input.convictions,
    {
      id: "conviction-2",
      offence: "Second minor offence",
      convictionDate: "2025-01-10",
      convictionClass: "minor",
      discrepancyFlags: [],
    },
    {
      id: "conviction-3",
      offence: "Major offence",
      convictionDate: "2025-03-10",
      convictionClass: "major",
      discrepancyFlags: [],
    },
  ];
  input.ticket = { offence: "Test offence", section: "TSA 1(1)" };
  input.gridProfile = {
    gridStep: 2,
    territoryCode: "calgary-edmonton",
    liabilityLimitCents: 200000000,
    criminalConvictions: 1,
    atFaultClaims: 2,
  };
  input.insurerRules = [];

  const report = generateIdrReport(input);
  assert.equal(
    report.gridBenchmark.annualPremiumCents,
    Math.round(284300 * 1.4 * 1.09 * combinedDriverFactor),
  );
  assert.ok(report.gridBenchmark.limitations.some((item) => item.includes("direct compensation")));
});

test("groups duplicate and mixed-class rows into unique conservative carriers", () => {
  const input = completeInput();
  input.convictions = [
    {
      id: "minor-1",
      offence: "Minor offence",
      convictionDate: "2025-10-15",
      convictionClass: "minor",
      discrepancyFlags: [],
    },
    {
      id: "major-1",
      offence: "Major offence",
      convictionDate: "2025-10-15",
      convictionClass: "major",
      discrepancyFlags: [],
    },
  ];
  input.ticket = { offence: "Minor offence" };
  const exactNoSurcharge = (carrierName, prefix) => [
    insurerRule({
      carrierId: `${prefix}-minor`,
      carrierName,
      convictionClass: "minor",
      behavior: "no_surcharge",
      estimatedAnnualImpactPercentRange: undefined,
      estimateSource: undefined,
    }),
    insurerRule({
      carrierId: `${prefix}-major`,
      carrierName,
      convictionClass: "major",
      behavior: "no_surcharge",
      estimatedAnnualImpactPercentRange: undefined,
      estimateSource: undefined,
    }),
  ];
  input.insurerRules = [
    insurerRule({
      carrierId: "alpha-minor-no",
      carrierName: "Carrier Alpha",
      behavior: "no_surcharge",
      estimatedAnnualImpactPercentRange: undefined,
      estimateSource: undefined,
      researchSource: source("alpha-minor-no"),
    }),
    insurerRule({
      carrierId: "alpha-minor-surcharge",
      carrierName: "Carrier-Alpha",
      behavior: "surcharge",
      estimatedAnnualImpactPercentRange: { minimum: 8, maximum: 12 },
      estimateSource: source("alpha-minor-estimate"),
      researchSource: source("alpha-minor-surcharge"),
    }),
    insurerRule({
      carrierId: "alpha-major-no",
      carrierName: "Carrier Alpha",
      convictionClass: "major",
      behavior: "no_surcharge",
      estimatedAnnualImpactPercentRange: undefined,
      estimateSource: undefined,
      researchSource: source("alpha-major-no"),
    }),
    ...exactNoSurcharge("Carrier Beta", "beta"),
    ...exactNoSurcharge("Carrier Gamma", "gamma"),
    insurerRule({
      carrierId: "decline-minor",
      carrierName: "Carrier Decline",
      behavior: "no_surcharge",
      estimatedAnnualImpactPercentRange: undefined,
      estimateSource: undefined,
    }),
    insurerRule({
      carrierId: "decline-major",
      carrierName: "Carrier Decline",
      convictionClass: "major",
      behavior: "decline",
      estimatedAnnualImpactPercentRange: undefined,
      estimateSource: undefined,
    }),
  ];

  const report = generateIdrReport(input);
  assert.equal(report.carrierCallList.entries.length, 3);
  assert.equal(new Set(report.carrierCallList.entries.map((entry) => entry.carrierName.replace(/[^a-z]/gi, "").toLowerCase())).size, 3);
  assert.ok(!report.carrierCallList.entries.some((entry) => entry.carrierName === "Carrier Decline"));
  const alpha = report.carrierCallList.entries.find((entry) => entry.carrierName.includes("Alpha"));
  assert.ok(alpha);
  assert.deepEqual(
    alpha.evaluatedPostures.map((posture) => [posture.convictionClass, posture.behavior]),
    [["minor", "surcharge"], ["major", "no_surcharge"]],
  );
  assert.equal(alpha.researchSources.length, 3);
  assert.equal(report.estimatedThreeYearPremiumImpact.carrierEstimateCount, 3);
});

test("blocks an estimate when sourced carrier ranges are stale", () => {
  const input = completeInput();
  input.insurerRules = threeCarrierRules({
    estimateSource: source("stale-estimate", "2025-07-31"),
  });

  const report = generateIdrReport(input);
  assert.equal(report.gridBenchmark.status, "calculated");
  assert.equal(report.carrierCallList.status, "ready");
  assert.equal(report.estimatedThreeYearPremiumImpact.status, "unavailable");
  assert.equal(report.estimatedThreeYearPremiumImpact.range, null);
  assert.equal(report.verification.deliveryReady, false);
  assert.ok(report.verification.blockers.some((item) => item.includes("complete current sources")));
});

test("blocks an estimate when Grid is stale even with a current-policy baseline", () => {
  const input = completeInput();
  input.gridDataset = {
    ...gridDataset,
    effectiveThrough: "2026-07-31",
  };

  const report = generateIdrReport(input);
  assert.equal(report.gridBenchmark.status, "out-of-date");
  assert.equal(report.estimatedThreeYearPremiumImpact.status, "unavailable");
  assert.equal(report.estimatedThreeYearPremiumImpact.baseline, null);
  assert.equal(report.verification.deliveryReady, false);
});

test("uses the calculated current Grid as the estimate baseline when policy premium is absent", () => {
  const input = completeInput();
  delete input.premiumBaseline;

  const report = generateIdrReport(input);
  assert.equal(report.estimatedThreeYearPremiumImpact.status, "estimated");
  assert.equal(report.estimatedThreeYearPremiumImpact.baseline.basis, "verified-grid-benchmark");
  assert.equal(report.estimatedThreeYearPremiumImpact.baseline.annualPremiumCents, 284300);
  assert.ok(report.estimatedThreeYearPremiumImpact.sources.some((item) => item.url === gridDataset.source.url));
});

test("enforces three to five unique carriers at delivery-ready level", () => {
  const tooFew = completeInput();
  tooFew.insurerRules = tooFew.insurerRules.slice(0, 2);
  const incomplete = generateIdrReport(tooFew);
  assert.equal(incomplete.carrierCallList.status, "incomplete");
  assert.equal(incomplete.verification.deliveryReady, false);

  const capped = completeInput();
  capped.insurerRules = Array.from({ length: 7 }, (_, index) =>
    insurerRule({
      carrierId: `carrier-${index}-minor-1`,
      carrierName: `Carrier ${index}`,
      phone: `1-800-555-01${String(index).padStart(2, "0")}`,
    }),
  );
  const ready = generateIdrReport(capped);
  assert.equal(ready.carrierCallList.entries.length, 5);
  assert.equal(ready.verification.deliveryReady, true);
});

test("rejects non-HTTPS research and quote links", () => {
  const badSource = completeInput();
  badSource.insurerRules[0] = insurerRule({
    researchSource: { ...source("bad"), url: "http://example.test/research" },
  });
  assert.throws(() => generateIdrReport(badSource), /must use HTTPS/);

  const badQuote = completeInput();
  badQuote.insurerRules[0] = insurerRule({ quoteUrl: "http://example.test/quote" });
  assert.throws(() => generateIdrReport(badQuote), /must use HTTPS/);
});
