#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

import { parseCsv } from './score-content-consolidation.mjs';

const policies = JSON.parse(fs.readFileSync('src/config/seoRoutePolicies.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('public/prerendered/content-manifest.json', 'utf8'));
const rows = parseCsv(fs.readFileSync('docs/seo-research/content-consolidation-next-review.csv', 'utf8')).records;
const publishedPaths = new Set(manifest.dbSlugs.map(slug => `/content/${slug}`));
const sitemap = fs.readFileSync('public/sitemaps/sitemap-content.xml', 'utf8')
  + fs.readFileSync('public/sitemaps/sitemap-content-2.xml', 'utf8');
const counts = new Map();

assert.equal(rows.length, 34, 'the second review must stay at 34 exact URLs');
assert.equal(new Set(rows.map(row => row.url)).size, rows.length, 'review URLs must be unique');

for (const row of rows) {
  const source = new URL(row.url).pathname;
  assert.ok(publishedPaths.has(source), `source missing from manifest: ${source}`);
  assert.ok(publishedPaths.has(row.possible_merge_target), `target missing from manifest: ${row.possible_merge_target}`);
  assert.equal(row.gsc_clicks, '0', `clicked page must receive another review: ${source}`);
  assert.equal(row.review_conversions.includes('historical conversions unknown'), true);
  assert.equal(row.review_backlinks.includes('unverified'), true);
  counts.set(row.final_decision, (counts.get(row.final_decision) || 0) + 1);

  if (row.final_decision === 'WITHDRAW_410_IMPLEMENTED_LOCAL') {
    assert.ok(policies.gone.includes(source), `missing 410 policy: ${source}`);
    assert.ok(!sitemap.includes(row.url), `withdrawn URL remains in sitemap: ${source}`);
    assert.ok(!policies.redirects[source], `withdrawn URL also has a redirect: ${source}`);
  } else {
    assert.ok(!policies.gone.includes(source), `held URL was withdrawn: ${source}`);
    assert.ok(!policies.redirects[source], `held URL was redirected: ${source}`);
  }
}

assert.equal(counts.get('WITHDRAW_410_IMPLEMENTED_LOCAL'), 2);
assert.equal(counts.get('301_CANDIDATE_AFTER_PILOT_AND_QUALIFIED_REVIEW'), 26);
assert.equal(counts.get('HOLD_UNTIL_COMMERCIAL_DRIVER_TARGET_COVERS_INTENT'), 4);
assert.equal(counts.get('HOLD_UNTIL_OUT_OF_PROVINCE_TARGET_COVERS_INTENT'), 2);
console.log('34-URL review decisions, 410 policies and sitemap exclusion passed.');
