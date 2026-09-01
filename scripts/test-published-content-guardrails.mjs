#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  EXACT_FABSY_ACTION_COMMITMENT,
  EXACT_FABSY_ONE_LINE,
  EXACT_FABSY_OFFICER_PRICING,
  EXACT_FABSY_PRICING,
  EXACT_FABSY_SPEED_DISCLAIMER,
  SAFE_BLOG_FALLBACK_TITLE,
  articleViolations,
  guardPublishedBlogFields,
} from '../src/lib/published-content-guardrails-core.js';

function post(overrides = {}) {
  return {
    slug: 'sample-alberta-ticket-guide',
    title: 'Alberta Traffic Ticket Guide',
    meta_description: 'General information about responding to an Alberta traffic ticket.',
    content: 'Read the ticket and follow the response deadline printed on it.',
    ...overrides,
  };
}

function guard(overrides) {
  const guarded = guardPublishedBlogFields(post(overrides));
  assert.deepEqual(articleViolations(guarded), [], 'guarded output must pass the publication audit');
  return guarded;
}

assert.deepEqual(articleViolations(post({ content: EXACT_FABSY_OFFICER_PRICING })), []);
assert.equal(guard({ content: EXACT_FABSY_OFFICER_PRICING }).content, EXACT_FABSY_OFFICER_PRICING,
  'Accurate complete officer-ticket pricing remains valid without inserting a Photo Radar offer');
assert.equal(guard({ content: EXACT_FABSY_PRICING }).content, EXACT_FABSY_PRICING,
  'Explicit full-catalog content retains the current precise ladder');

for (const claim of [
  'Fabsy reports more than 95% success rate.',
  'Fabsy has a success rate above 95%.',
  'Fabsy wins over 95% of cases.',
  'Fabsy reports a 99% success rate.',
]) {
  const guarded = guard({ content: claim });
  assert.match(guarded.content, /Results vary and no outcome is promised/i);
  assert.doesNotMatch(guarded.content, /more than 95%|above 95%|over 95%|99%/i);
}

for (const pricing of [
  'Our fee is $399 and you only pay if we reduce the fine.',
  'Rapid Resolution costs $198.',
  'The insurance report is $49.',
  'The bundle costs $229.',
  'Fabsy offers no win no fee pricing.',
  'Pricing is 30% of the amount saved.',
  'You only pay when we are successful.',
  'Our fee is outcome-based.',
  'We charge 20% of the fine reduction.',
]) {
  const guarded = guard({ content: pricing });
  assert.equal(guarded.content, EXACT_FABSY_PRICING);
}

const titlePricing = guard({ title: 'Fabsy Fee: $488', content: 'Review your ticket.' });
assert.equal(titlePricing.title, SAFE_BLOG_FALLBACK_TITLE);
assert.match(titlePricing.content, new RegExp(EXACT_FABSY_PRICING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

for (const unsupportedClaim of [
  'The fine is $500.',
  'A conviction adds 3 demerit points.',
  'A conviction adds six demerits.',
  'The penalty is 500 CAD.',
  'The penalty is CAD 500.',
  'The fine is three hundred dollars.',
  'The maximum fine is 500.',
  'Penalties range from five hundred dollars.',
  'You must dispute the ticket within 30 days.',
  'You must dispute the ticket within thirty days.',
  'The response deadline is August 15, 2026.',
  'You must respond by 2026-08-15.',
  'Insurance premiums can rise 25 percent.',
  'Insurance premiums can rise twenty five percent.',
  'The conviction can affect insurance for three years.',
  'Fabsy completes its review within 24 hours.',
  `${EXACT_FABSY_PRICING} The fine is $500.`,
  `${EXACT_FABSY_OFFICER_PRICING} The fine is $500.`,
]) {
  const guarded = guard({ content: unsupportedClaim });
  assert.equal(guarded.title, 'Alberta Traffic Ticket Guide');
  assert.doesNotMatch(guarded.content, /\$500|3 demerit|six demerit|500 CAD|three hundred dollars|30 days|thirty days|August 15|25 percent|twenty five percent/i);
}

const unsafeTitle = guard({ title: 'Alberta Ticket Fine Is $500', content: 'Review the notice.' });
assert.equal(unsafeTitle.title, SAFE_BLOG_FALLBACK_TITLE);

const speedOnly = guard({ content: 'A report described a vehicle travelling at 182 km/h.' });
assert.match(speedOnly.content, /182 km\/h/);

for (const approvedActionCopy of [
  EXACT_FABSY_ONE_LINE,
  EXACT_FABSY_ACTION_COMMITMENT,
  EXACT_FABSY_SPEED_DISCLAIMER,
]) {
  const guarded = guard({ content: approvedActionCopy });
  assert.match(guarded.content, /48[- ]hour|48 hours/i);
}

assert.ok(articleViolations(post({ content: 'Fabsy wins more than 95% of cases.' })).length > 0);
assert.ok(
  articleViolations(post({ content: 'Fabsy resolved more than **95% of tickets favourably**.' })).length > 0,
  'markdown formatting must not hide an over-cap outcome claim'
);
assert.ok(articleViolations(post({ content: 'Our fee is $399.' })).length > 0);
assert.ok(articleViolations(post({ content: 'The ticket carries 4 demerit points.' })).length > 0);

const markdownHiddenClaim = guard({
  content: `How Fabsy works\n\n- ${EXACT_FABSY_PRICING}\n- Fabsy resolved more than **95% of tickets favourably**.`,
});
assert.doesNotMatch(markdownHiddenClaim.content, /more than\s+\*\*95%|more than\s+95%/i);

const comparison = guardPublishedBlogFields(post({
  slug: 'alberta-traffic-ticket-comparison-guide',
  content: 'Unsafe legacy comparison content with a $900 fine.',
}));
assert.deepEqual(articleViolations(comparison), []);

const evidenceArticle = guardPublishedBlogFields(post({
  slug: 'alberta-traffic-trial-evidence-self-represented',
  content: `## 2. Disclosure must be requested and interpreted without legal advice from the Crown or police

Disclosure may contain officer notes, witness statements, photographs, videos, certificates and other records. It helps you understand the prosecution’s case and prepare a response. The Crown prosecutor cannot give you legal advice or procedural tips; although a court clerk may be able to explain the process, the clerk cannot give legal advice either. You are responsible for working out what the materials mean for your defence.`,
}));
assert.match(evidenceArticle.content, /Disclosure must be requested and reviewed before trial/);
assert.match(evidenceArticle.content, /Court staff may provide general process information/);
assert.match(evidenceArticle.content, /Additional device or maintenance records are not automatic/);
assert.match(evidenceArticle.content, /1991canlii45/);
assert.match(evidenceArticle.content, /Independent help and court information/);
assert.match(evidenceArticle.content, /Legal Aid Alberta.*traffic tickets generally do not qualify/s);
assert.doesNotMatch(evidenceArticle.content, /procedural tips|interpreted without legal advice/);

const successfulDispute = guard({
  slug: 'vehicle-enforcement-stop-speeding-ticket-alberta',
  content: 'A successful dispute means no conviction, no demerits, and no insurance impact from that ticket.',
});
assert.match(successfulDispute.content, /insurer's own practices; no insurance outcome is promised/);
assert.doesNotMatch(successfulDispute.content, /no insurance impact/i);

console.log('Published blog guardrail tests passed.');
