#!/usr/bin/env node

import assert from 'node:assert/strict';
import { normalizeGeneratedArticle, validateArticle } from './generate-post.mjs';
import { EXACT_FABSY_PRICING } from '../../src/lib/published-content-guardrails-core.js';

const filler = Array.from({ length: 910 }, () => 'guidance').join(' ');

function article(overrides = {}) {
  return {
    title: 'Responding to an Alberta Traffic Ticket',
    slug: 'responding-to-an-alberta-traffic-ticket',
    meta_description: 'General information about reviewing an Alberta traffic ticket and considering available response options.',
    content: `Review the notice and use current official information. ${filler}\n\nSubmit a ticket at https://fabsy.ca/submit-ticket.`,
    ...overrides,
  };
}

assert.deepEqual(validateArticle(article()), [], 'a structurally valid, guarded article should pass');

const hiddenOutcomeErrors = validateArticle(article({
  title: 'Fabsy Resolves More Than **95%** of Tickets Favourably',
}));
assert.ok(
  hiddenOutcomeErrors.some((error) => error.includes('semantic outcome rate exceeds 95%')),
  'markdown must not hide an over-cap outcome claim in generated metadata'
);

const splitPricingErrors = validateArticle(article({
  meta_description: 'Fabsy **pricing** is outcome-**based** for Alberta traffic ticket services.',
}));
assert.ok(
  splitPricingErrors.some((error) => error.includes('pricing claim does not use the exact formula')),
  'markdown must not split an inexact pricing claim in generated metadata'
);

const bodyPricingErrors = validateArticle(article({
  content: `Our **fee**\n\nis outcome-**based**. ${filler}\n\nSubmit a ticket at https://fabsy.ca/submit-ticket.`,
}));
assert.ok(
  bodyPricingErrors.some((error) => error.includes('pricing claim does not use the exact formula')),
  'rendered-equivalent markdown body checks must reject split inexact pricing'
);

const normalizedGeneratedDraft = normalizeGeneratedArticle(article({
  content: `Fabsy reports a success rate of more than 95% across past matters.

Fabsy's pricing is $488 plus a 30% contingency fee on fines saved.

${filler}

Submit a ticket at https://fabsy.ca/submit-ticket.`,
}));
assert.deepEqual(
  validateArticle(normalizedGeneratedDraft),
  [],
  'generated drafts should deterministically normalize outcome-rate and pricing wording before validation'
);
assert.ok(
  normalizedGeneratedDraft.content.includes('95%+ historical success rate'),
  'semantic outcome-rate wording should normalize to the approved historical wording'
);
assert.equal(
  normalizedGeneratedDraft.content.split(EXACT_FABSY_PRICING).length - 1,
  1,
  'inexact pricing should normalize to one exact Fabsy pricing statement'
);

const prohibitedPricingDraft = normalizeGeneratedArticle(article({
  content: `Fabsy offers no win, no fee pricing.

${filler}

Submit a ticket at https://fabsy.ca/submit-ticket.`,
}));
assert.deepEqual(
  validateArticle(prohibitedPricingDraft),
  [],
  'prohibited pricing wording should normalize before marketing-text sanitization'
);
assert.equal(
  prohibitedPricingDraft.content.split(EXACT_FABSY_PRICING).length - 1,
  1,
  'prohibited pricing wording should become the exact Fabsy pricing statement'
);

console.log('Content-engine publication validation tests passed.');
