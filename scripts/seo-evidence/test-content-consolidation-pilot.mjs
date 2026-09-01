#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

import { parseCsv } from './score-content-consolidation.mjs';

const policies = JSON.parse(fs.readFileSync('src/config/seoRoutePolicies.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('public/prerendered/content-manifest.json', 'utf8'));
const redirectsFile = fs.readFileSync('public/_redirects', 'utf8');
const pilot = parseCsv(fs.readFileSync('docs/seo-research/content-consolidation-pilot.csv', 'utf8')).records;
const manifestPaths = new Set(manifest.dbSlugs.map(slug => `/content/${slug}`));

assert.equal(pilot.length, 20, 'the first consolidation cohort must remain bounded to 20 URLs');
assert.equal(new Set(pilot.map(row => row.source_url)).size, pilot.length, 'pilot sources must be unique');

for (const row of pilot) {
  assert.ok(manifestPaths.has(row.source_url), `pilot source is missing from the scored manifest: ${row.source_url}`);
  assert.ok(manifestPaths.has(row.target_url), `pilot target is missing from the scored manifest: ${row.target_url}`);
  assert.equal(policies.redirects[row.source_url], row.target_url, `missing policy redirect for ${row.source_url}`);
  assert.ok(!policies.redirects[row.target_url], `pilot target must not create a redirect chain: ${row.target_url}`);
  assert.equal(row.decision, '301_pilot');
  assert.equal(row.manual_content_review, 'generic_fallback_no_unique_scenario_detail');
  assert.equal(row.gsc_ai_evidence_status, 'not_present_in_ai_export');
  assert.equal(row.gsc_ai_impressions, '');
  if (row.gsc_evidence_status === 'observed_page_row') {
    assert.equal(row.gsc_clicks, '0', `clicked URL must not enter the pilot: ${row.source_url}`);
    assert.ok(Number(row.gsc_impressions) <= 3, `pilot impression cap exceeded: ${row.source_url}`);
  } else {
    assert.equal(row.gsc_evidence_status, 'not_present_in_export');
    assert.equal(row.gsc_clicks, '', 'missing export rows must stay unknown, not zero');
    assert.equal(row.gsc_impressions, '', 'missing export rows must stay unknown, not zero');
  }
  const escapedSource = row.source_url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedTarget = row.target_url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(redirectsFile, new RegExp(`^${escapedSource}\\s+${escapedTarget}\\s+301$`, 'm'));
}

console.log('Bounded 20-URL content consolidation pilot checks passed.');
