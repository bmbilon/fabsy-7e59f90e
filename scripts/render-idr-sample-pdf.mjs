#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildIdrPdf } from "../supabase/functions/_shared/idr-pdf.ts";

const outputPath = resolve(process.argv[2] || "/private/tmp/fabsy-idr-sample.pdf");
const source = {
  publisher: "Example public source",
  title: "Example carrier underwriting page",
  url: "https://example.com/underwriting",
  accessedDate: "2026-08-01",
};
const report = {
  reportVersion: "1.0.0",
  asOfDate: "2026-08-01",
  verification: {
    status: "verified",
    ticketMatch: "matched",
    checkedConvictions: 2,
    discrepancyFlags: [],
    issues: [],
    blockers: [],
    deliveryReady: true,
  },
  ticketScenario: {
    label: "Current-ticket conviction scenario",
    mode: "projected",
    status: "projected",
    convictionClass: "minor",
    assumedConvictionDate: "2026-08-01",
    appliedAsAdditionalConviction: true,
    basis: "This clearly labelled what-if scenario is separate from the verified abstract convictions.",
  },
  convictions: [
    {
      convictionId: "sample-1",
      offence: "Speeding",
      section: "115(2)(p)",
      convictionClass: "minor",
      convictionDate: "2024-02-29",
      threeYearExitDate: "2027-02-28",
      applicableExitDate: "2027-02-28",
      applicableLookbackYears: 3,
      applicableWindowLabel: "Product three-year timeline",
      activeAsOfReportDate: true,
      discrepancyFlags: [],
    },
    {
      convictionId: "sample-2",
      offence: "Fail to obey traffic control device",
      section: "57",
      convictionClass: "minor",
      convictionDate: "2025-05-20",
      threeYearExitDate: "2028-05-20",
      applicableExitDate: "2028-05-20",
      applicableLookbackYears: 3,
      applicableWindowLabel: "Product three-year timeline",
      activeAsOfReportDate: true,
      discrepancyFlags: [],
    },
  ],
  estimatedThreeYearPremiumImpact: {
    status: "estimated",
    range: { currency: "CAD", minimumCents: 48000, maximumCents: 126000 },
    carrierEstimateCount: 3,
    basis: "Estimated from a verified Grid benchmark and sourced carrier percentage ranges.",
    baseline: {
      annualPremiumCents: 284300,
      currency: "CAD",
      basis: "verified-grid-benchmark",
      source,
    },
    sources: [source],
  },
  gridBenchmark: {
    status: "calculated",
    annualPremiumCents: 284300,
    currency: "CAD",
    datasetVersion: "2026.v1",
    source,
    basis: "Public AIRB Grid benchmark. DCPD and occasional-driver amounts may be additional.",
    limitations: [
      "The benchmark excludes insurer direct compensation property damage premium.",
      "The benchmark excludes additional occasional-driver premium.",
    ],
  },
  carrierCallList: {
    heading: "Carriers worth calling",
    status: "ready",
    framing: "This ranked call list is a research starting point. Confirm eligibility and pricing directly.",
    entries: ["Alpha Mutual", "Prairie Insurance", "Northern Direct"].map((carrierName, index) => ({
      rank: index + 1,
      carrierId: `sample-${index + 1}`,
      carrierName,
      reason: "The sourced rule indicates this record is worth discussing directly with the carrier.",
      phone: `1-800-555-010${index}`,
      rankingScore: 100 - index,
      researchSources: [source],
      evaluatedPostures: [{
        convictionClass: "minor",
        activeConvictionCount: 2,
        thresholdCount: 2,
        behavior: "surcharge",
      }],
    })),
  },
  renewalSchedule: [
    {
      renewalDate: "2026-11-15",
      reminderDates: [{ leadDays: 45, reminderDate: "2026-10-01" }],
    },
  ],
  disclaimer: "This report is consumer research based on publicly available information. Fabsy is not an insurance agent or broker and does not sell, quote, or place insurance.",
};

writeFileSync(outputPath, buildIdrPdf(report, "Sample Client"));
console.log(outputPath);
