#!/usr/bin/env node

import assert from 'node:assert/strict';
import { validateArticle } from './generate-post.mjs';

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

console.log('Content-engine publication validation tests passed.');
