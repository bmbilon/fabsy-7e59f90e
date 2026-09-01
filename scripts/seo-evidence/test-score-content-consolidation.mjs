#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  classifySlug,
  parseCsv,
  readGscAiPageExport,
  readGscPageExport,
  rowsToCsv,
  scoreManifest,
} from "./score-content-consolidation.mjs";

const sampleManifest = {
  version: 2,
  dbSourceCount: 6,
  dbSlugs: [
    "speeding-ticket-alberta",
    "careless-driving-ticket-alberta",
    "careless-driving-ticket-calgary",
    "careless-driving-ticket-calgary-photo-radar",
    "stop-sign-ticket-edmonton",
    "unmapped-topic",
  ],
  curatedSlugs: ["speeding-ticket-alberta"],
};

function bySlug(rows, slug) {
  const row = rows.find((candidate) => candidate.slug === slug);
  assert.ok(row, `expected row for ${slug}`);
  return row;
}

{
  const parsed = parseCsv(
    'Top pages,Clicks,Impressions,CTR,Position\n"https://fabsy.ca/content/example,quoted",1,2,50%,3\n',
  );
  assert.equal(parsed.records.length, 1);
  assert.equal(
    parsed.records[0]["Top pages"],
    "https://fabsy.ca/content/example,quoted",
  );
}

{
  assert.deepEqual(classifySlug("careless-driving-ticket-calgary-photo-radar"), {
    contentShape: "scenario_variant",
    offenseFamily: "careless-driving-ticket",
    city: "calgary",
    modifier: "photo-radar",
    provinceBase: false,
  });
  assert.equal(
    classifySlug("careless-driving-ticket-alberta").contentShape,
    "province_base",
  );
}

const gsc = readGscPageExport(
  [
    "Top pages,Clicks,Impressions,CTR,Position",
    "https://fabsy.ca/content/careless-driving-ticket-calgary,1,20,5%,7.5",
    "https://fabsy.ca/content/careless-driving-ticket-calgary-photo-radar,0,3,0%,22",
    "https://fabsy.ca/content/stop-sign-ticket-edmonton,0,15,0%,31",
    "https://other.example/content/unmapped-topic,99,999,9.9%,1",
    "https://fabsy.ca/blog/not-content,5,100,5%,4",
  ].join("\n"),
);

const ai = readGscAiPageExport(
  [
    "Top pages,Impressions",
    "https://fabsy.ca/content/careless-driving-ticket-calgary-photo-radar,4",
    "https://fabsy.ca/blog/not-content,20",
  ].join("\n"),
);

{
  const rows = scoreManifest(sampleManifest, {
    gscBySlug: gsc.bySlug,
    aiBySlug: ai.bySlug,
  });
  assert.equal(rows.length, sampleManifest.dbSlugs.length);
  assert.equal(bySlug(rows, "speeding-ticket-alberta").recommendation, "KEEP");
  assert.equal(
    bySlug(rows, "careless-driving-ticket-alberta").recommendation,
    "ENRICH",
  );
  assert.equal(
    bySlug(rows, "careless-driving-ticket-calgary").recommendation,
    "KEEP",
  );
  assert.equal(
    bySlug(rows, "careless-driving-ticket-calgary-photo-radar").recommendation,
    "KEEP",
    "AI-visible URLs must be protected even when ordinary GSC clicks are zero",
  );
  assert.equal(bySlug(rows, "stop-sign-ticket-edmonton").recommendation, "ENRICH");
  assert.equal(bySlug(rows, "unmapped-topic").recommendation, "REVIEW");
  assert.equal(
    rows.filter((row) => row.recommendation === "MERGE_CANDIDATE").length,
    0,
  );

  const reparsed = parseCsv(rowsToCsv(rows));
  assert.equal(reparsed.records.length, rows.length);
  assert.ok(reparsed.headers.includes("gsc_ai_impressions"));
}

{
  const rows = scoreManifest(sampleManifest, { gscBySlug: gsc.bySlug });
  const variant = bySlug(
    rows,
    "careless-driving-ticket-calgary-photo-radar",
  );
  assert.equal(variant.recommendation, "MERGE_CANDIDATE");
  assert.equal(
    variant.possible_merge_target,
    "/content/careless-driving-ticket-alberta",
  );
  assert.equal(variant.manual_review_required, "yes");
}

{
  const clickedVariantGsc = readGscPageExport(
    [
      "Page,Clicks,Impressions,CTR,Average position",
      "https://fabsy.ca/content/careless-driving-ticket-calgary-photo-radar,1,1,100%,1",
    ].join("\n"),
  );
  const rows = scoreManifest(sampleManifest, {
    gscBySlug: clickedVariantGsc.bySlug,
  });
  assert.equal(
    bySlug(rows, "careless-driving-ticket-calgary-photo-radar").recommendation,
    "KEEP",
    "Any observed click must block a merge recommendation",
  );
}

assert.throws(
  () => readGscPageExport("Top queries,Clicks,Impressions\nquery,1,2\n"),
  /Pages export/,
);

process.stdout.write("content consolidation scorer tests passed\n");
