#!/usr/bin/env node

import assert from 'node:assert/strict';
import { classifyReview } from './build-content-review-queue.mjs';

const candidate = {
  is_curated: 'no', gsc_clicks: 0, gsc_impressions: 4,
  gsc_ai_impressions: '', gsc_evidence_status: 'observed_page_row',
  recommendation: 'MERGE_CANDIDATE', possible_merge_target: '/content/example-alberta',
};
const excluded = { status: 'crawled_not_indexed' };
const bucket = (row, index = excluded, pilot = '', overlap = 72, words = 162) =>
  classifyReview(row, index, pilot, overlap, words).bucket;

assert.equal(bucket(candidate), 'RETIRE_REVIEW');
assert.equal(bucket({ ...candidate, gsc_clicks: 1 }), 'PROTECT');
assert.equal(bucket({ ...candidate, gsc_ai_impressions: 1 }), 'PROTECT');
assert.equal(bucket(candidate, { status: 'indexed' }), 'PROTECT');
assert.equal(bucket({ ...candidate, gsc_evidence_status: 'not_present_in_export' }), 'EVIDENCE_GAP');
assert.equal(bucket(candidate, null), 'EVIDENCE_GAP');
assert.equal(bucket(candidate, excluded, '301_pilot'), 'ALREADY_IN_PILOT');
assert.equal(bucket(candidate, excluded, '', 20), 'MANUAL_REVIEW');
assert.equal(bucket(candidate, excluded, '', 72, 300), 'MANUAL_REVIEW');
assert.equal(bucket({ ...candidate, gsc_impressions: 10 }), 'IMPROVE');

process.stdout.write('content review queue guardrails passed\n');
