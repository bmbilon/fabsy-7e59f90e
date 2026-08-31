#!/usr/bin/env node

const assert = require('node:assert/strict');
const {
  CANONICAL_PRICING_COPY,
  RAPID_RESOLUTION_ACTION_COMMITMENT,
  RAPID_RESOLUTION_SPEED_DISCLAIMER,
  faqJsonLd,
  normalizePageObject,
} = require('./normalize-rapid-resolution-content.cjs');
const { curatedPageIssues } = require('./curated-content-guardrails.cjs');

const unsafeLegacy = {
  slug: 'speeding-ticket-calgary',
  city: 'Calgary',
  violation: 'Speeding',
  meta_title: '94% Success Rate',
  meta_description: 'Zero-risk guarantee. Only pay if we win.',
  content: 'We know the local Crown and handle all court appearances for $488 plus 30%.',
  local_info: 'Strong relationships with Crown prosecutors.',
  stats: { successRate: 94 },
  faqs: [{ q: 'Will I win?', a: 'Yes, guaranteed.' }],
};

const normalizedLegacy = normalizePageObject(unsafeLegacy, { curated: false });
const legacyText = JSON.stringify(normalizedLegacy);
assert.doesNotMatch(
  legacyText,
  /94%|zero[ -]?risk|guarantee|only pay|strong relationships|\$488|30%|all court appearances/i
);
assert.match(normalizedLegacy.next, /Rapid Resolution costs \$198 CAD/);
assert.ok(normalizedLegacy.next.includes(CANONICAL_PRICING_COPY));
assert.ok(normalizedLegacy.how.includes(RAPID_RESOLUTION_ACTION_COMMITMENT));
assert.ok(normalizedLegacy.next.includes(RAPID_RESOLUTION_SPEED_DISCLAIMER));
assert.deepEqual(JSON.parse(normalizedLegacy.jsonld), faqJsonLd(normalizedLegacy.faqs));
assert.deepEqual(curatedPageIssues(normalizedLegacy), []);

const curated = {
  slug: 'fight-speeding-ticket-calgary',
  meta_title: 'Fight a Speeding Ticket in Calgary | Fabsy',
  meta_description: 'Review a Calgary speeding ticket, the disclosure and available response options.',
  h1: 'Fight a Speeding Ticket in Calgary',
  hook: 'Use the response deadline printed on the ticket.',
  bullets: ['Keep a readable copy of the ticket.'],
  what: '<h2>Review the notice</h2><p>Read the allegation and printed deadline.</p>',
  how: '<h2>Review disclosure</h2><p>The available evidence depends on the matter.</p>',
  next: '<p>Representation uses a $488 base representation fee plus 30% of any fine reduction achieved; there is no success fee if the fine is not reduced.</p>',
  faqs: [{ q: 'How much does it cost?', a: 'A flat $488 plus 30%.' }],
};
const normalizedCurated = normalizePageObject(curated, { curated: true });
const normalizedAgain = normalizePageObject(normalizedCurated, { curated: true });
assert.deepEqual(normalizedAgain, normalizedCurated, 'normalization must be idempotent');
assert.match(normalizedCurated.how, /Review disclosure/);
assert.equal(
  (normalizedCurated.how.match(/<h2>How Rapid Resolution works<\/h2>/g) || []).length,
  1
);
assert.deepEqual(curatedPageIssues(normalizedCurated), []);

require('./test-photo-radar-pricing-compatibility.cjs');

console.log('Rapid Resolution content normalizer tests passed.');
