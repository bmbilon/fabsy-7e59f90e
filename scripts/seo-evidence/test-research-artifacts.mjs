#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

import { parseCsv } from "./score-content-consolidation.mjs";

function load(path) {
  return parseCsv(fs.readFileSync(path, "utf8"));
}

const queryMap = load("docs/seo-research/alberta-traffic-ticket-query-map.csv");
assert.ok(queryMap.records.length >= 75, "query map must contain at least 75 rows");
assert.equal(new Set(queryMap.records.map((row) => row.query_id)).size, queryMap.records.length);
assert.ok(
  queryMap.records.every((row) => row.evidence_status === "planned_not_observed"),
  "query-map planning rows must not masquerade as observed demand",
);
assert.ok(
  queryMap.records.every((row) => row.volume_status === "unmeasured"),
  "query-map rows must not invent search volume",
);
const manifest = JSON.parse(
  fs.readFileSync("public/prerendered/content-manifest.json", "utf8"),
);
const manifestSlugs = new Set(manifest.dbSlugs);
for (const row of queryMap.records.filter(
  (candidate) =>
    candidate.target_status === "existing" &&
    candidate.recommended_url.startsWith("/content/"),
)) {
  assert.ok(
    manifestSlugs.has(row.recommended_url.slice("/content/".length)),
    `existing content target is missing from manifest: ${row.recommended_url}`,
  );
}

const benchmark = load("docs/seo-research/citation-benchmark-queries.csv");
assert.equal(benchmark.records.length, 30);
assert.equal(new Set(benchmark.records.map((row) => row.benchmark_id)).size, 30);
assert.ok(benchmark.records.every((row) => row.row_status === "fixed_prompt"));
assert.ok(benchmark.records.every((row) => row.observed_result === ""));

const template = load(
  "docs/seo-research/citation-benchmark-observations-template.csv",
);
assert.equal(template.records.length, 0, "future observation template must remain empty");

const observed = load(
  "docs/seo-research/citation-benchmark-observed-perplexity-2026-08-31.csv",
);
assert.equal(observed.records.length, 30);
assert.deepEqual(
  observed.records.map((row) => row.benchmark_id),
  benchmark.records.map((row) => row.benchmark_id),
);
assert.ok(
  observed.records.every((row) => row.observation_status === "observed_single_run"),
);
const citations = observed.records.filter((row) => row.fabsy_cited === "yes");
assert.deepEqual(
  citations.map((row) => row.benchmark_id),
  ["B016", "B028"],
);
assert.deepEqual(
  citations.map((row) => row.first_fabsy_url),
  [
    "https://fabsy.ca/content/red-light-ticket-calgary-new-driver",
    "https://fabsy.ca/blog/alberta-traffic-ticket-comparison-guide",
  ],
);
assert.ok(
  observed.records.slice(0, 26).every((row) =>
    row.result_url.startsWith("https://www.perplexity.ai/search/"),
  ),
);
assert.ok(
  observed.records.slice(26).every((row) => row.result_url === "direct-query-unavailable"),
);

const aggregates = load("docs/seo-research/gsc-aggregate-baseline.csv");
const overall = aggregates.records.find((row) => row.record_id === "GSC-WEB-OVERALL");
const content = aggregates.records.find((row) => row.record_id === "GSC-WEB-CONTENT");
const aiChart = aggregates.records.find((row) => row.record_id === "GSC-AI-CHART");
const aiPageRows = aggregates.records.find(
  (row) => row.record_id === "GSC-AI-PAGE-ROWS",
);
assert.deepEqual(
  [overall.clicks, overall.impressions, overall.ctr_percent, overall.average_position],
  ["645", "70457", "0.9", "15.8"],
);
assert.deepEqual(
  [content.table_rows, content.clicks, content.impressions],
  ["623", "497", "62780"],
);
assert.equal(aiChart.impressions, "2023");
assert.equal(aiPageRows.impressions, "2252");

const backlinkProspects = load("docs/seo-research/backlink-prospects.csv");
assert.equal(backlinkProspects.records.length, 20);
assert.equal(
  new Set(backlinkProspects.records.map((row) => row.id)).size,
  backlinkProspects.records.length,
);
assert.equal(
  backlinkProspects.records.filter((row) => row.use_class === "outreach_candidate").length,
  12,
);
assert.equal(
  backlinkProspects.records.filter((row) => row.use_class === "cite_only_authority").length,
  8,
);
assert.ok(
  backlinkProspects.records.every(
    (row) =>
      row.url.startsWith("https://") &&
      row.contact_or_resource_path &&
      row.priority &&
      row.risk_fit_notes &&
      row.source_verified_date === "2026-09-01",
  ),
  "every backlink prospect must retain its verified source, handling path, and risk notes",
);

const outreachDrafts = fs.readFileSync(
  "docs/seo-research/backlink-outreach-drafts.md",
  "utf8",
);
assert.match(outreachDrafts, /Status:\*\* Drafts only — no email was sent/);
assert.match(outreachDrafts, /Do not send any draft yet/);
assert.match(outreachDrafts, /qualified human has reviewed the complete page/);
assert.match(outreachDrafts, /cite_only_authority/);

const legalReviewPacket = fs.readFileSync(
  "docs/seo-research/alberta-legal-editorial-review-packet.md",
  "utf8",
);
assert.match(legalReviewPacket, /Review status:\*\* \*\*PENDING/);
assert.match(legalReviewPacket, /no Alberta legal approval is recorded/);
assert.match(
  legalReviewPacket,
  /e91a79d6e321e71370266b64e3f87ce73fe37ca14b81b7b7c012c5961406fa8a/,
);
assert.match(legalReviewPacket, /No name, date, checkbox, or approval state may be populated/);

process.stdout.write(
  `research artifact tests passed (${queryMap.records.length} mapped queries; 30 benchmark prompts; 30 observed Perplexity rows; 20 backlink prospects)\n`,
);
