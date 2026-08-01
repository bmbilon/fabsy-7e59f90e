#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  EXACT_FABSY_PRICING,
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

for (const claim of [
  'Fabsy reports more than 95% success rate.',
  'Fabsy has a success rate above 95%.',
  'Fabsy wins over 95% of cases.',
  'Fabsy reports a 99% success rate.',
]) {
  const guarded = guard({ content: claim });
  assert.match(guarded.content, /95%\+ historical success rate/);
  assert.doesNotMatch(guarded.content, /more than 95%|above 95%|over 95%|99%/i);
}

for (const pricing of [
  'Our fee is $399 and you only pay if we reduce the fine.',
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
  `${EXACT_FABSY_PRICING} The fine is $500.`,
]) {
  const guarded = guard({ content: unsupportedClaim });
  assert.equal(guarded.title, 'Alberta Traffic Ticket Guide');
  assert.doesNotMatch(guarded.content, /\$500|3 demerit|six demerit|500 CAD|three hundred dollars|30 days|thirty days|August 15|25 percent|twenty five percent/i);
}

const unsafeTitle = guard({ title: 'Alberta Ticket Fine Is $500', content: 'Review the notice.' });
assert.equal(unsafeTitle.title, SAFE_BLOG_FALLBACK_TITLE);

const speedOnly = guard({ content: 'A report described a vehicle travelling at 182 km/h.' });
assert.match(speedOnly.content, /182 km\/h/);

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

console.log('Published blog guardrail tests passed.');
