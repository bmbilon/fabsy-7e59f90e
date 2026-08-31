#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  CANONICAL_PRICING_COPY,
  OFFICER_PRICING_COPY,
  canonicalFaqs,
  faqJsonLd,
  normalizePageObject,
} = require('./normalize-rapid-resolution-content.cjs');
const {
  PHOTO_RADAR_COMPLETE_PRICE,
  curatedPageIssues,
  hasCompleteFabsyPricing,
  textGuardrailIssues,
} = require('./curated-content-guardrails.cjs');

const root = path.resolve(__dirname, '..');
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const officerSlug = 'speeding-ticket-calgary';
const photoSlugs = read('src/config/photoRadarPages.json');

const reviewedOfficerCopy = 'Rapid Resolution costs $198 CAD plus applicable GST for eligible Alberta pre-trial matters. The Insurance Impact & Renewal Planning Report costs $49 CAD plus applicable GST, or both products cost $229 CAD plus applicable GST. Trial representation, government fines and out-of-scope matters are separate.';
assert.equal(OFFICER_PRICING_COPY, reviewedOfficerCopy, 'compatibility covers the exact reviewed officer statement');
assert.notEqual(OFFICER_PRICING_COPY, CANONICAL_PRICING_COPY);
assert.match(CANONICAL_PRICING_COPY, /Rapid Resolution: Photo Radar costs \$79 CAD/);

for (const pricing of [OFFICER_PRICING_COPY, CANONICAL_PRICING_COPY]) {
  assert.equal(hasCompleteFabsyPricing(pricing, officerSlug), true);
  assert.deepEqual(textGuardrailIssues(pricing, officerSlug), []);
  for (const unsafe of [
    'The fine is $999.',
    'You have 19 days to respond.',
    'A ticket adds 7 demerits.',
    'A withdrawal is guaranteed.',
  ]) {
    assert.ok(textGuardrailIssues(`${pricing} ${unsafe}`, officerSlug).length, unsafe);
  }
}

for (const changed of [
  OFFICER_PRICING_COPY.replace('$198', '$199'),
  OFFICER_PRICING_COPY.replace('$49', '$50'),
  OFFICER_PRICING_COPY.replace('$229', '$230'),
  OFFICER_PRICING_COPY.replace(' plus applicable GST', ''),
  'Rapid Resolution costs $198 CAD.',
]) {
  assert.equal(hasCompleteFabsyPricing(changed, officerSlug), false);
  assert.ok(textGuardrailIssues(changed, officerSlug).includes('partial or inexact Fabsy pricing'));
}

const officer = read(`ssg-pages/${officerSlug}.json`);
assert.deepEqual(curatedPageIssues(officer), [], 'current officer evidence and content remain admitted');
const upgraded = normalizePageObject(officer, { curated: true });
assert.ok(upgraded.next.includes(CANONICAL_PRICING_COPY), 'new normalized copy emits the full ladder');
assert.ok(canonicalFaqs().some((faq) => faq.a === CANONICAL_PRICING_COPY));
assert.deepEqual(curatedPageIssues(upgraded), []);

for (const slug of photoSlugs) {
  const page = read(`ssg-pages/${slug}.json`);
  assert.deepEqual(curatedPageIssues(page), []);
  assert.equal(hasCompleteFabsyPricing(OFFICER_PRICING_COPY, slug), false);
  assert.ok(textGuardrailIssues(OFFICER_PRICING_COPY, slug).includes('unsupported monetary legal claim'));

  const replaced = { ...page, next: `<p>${OFFICER_PRICING_COPY}</p>` };
  assert.ok(curatedPageIssues(replaced).includes('next: complete Photo Radar pricing is required'));
  const removed = { ...page, next: page.next.replace(PHOTO_RADAR_COMPLETE_PRICE, '') };
  assert.ok(curatedPageIssues(removed).includes('next: complete Photo Radar pricing is required'));
  const wrongPrice = { ...page, next: page.next.replace('$79', '$198') };
  assert.ok(curatedPageIssues(wrongPrice).includes('next: complete Photo Radar pricing is required'));

  for (const otherPricing of [OFFICER_PRICING_COPY, CANONICAL_PRICING_COPY]) {
    const mixed = { ...page, next: `${page.next}<p>${otherPricing}</p>` };
    assert.ok(curatedPageIssues(mixed).some((issue) => issue.includes('must use their own offer')));
    const faqs = page.faqs.map((faq, index) => index === page.faqs.length - 1 ? { ...faq, a: otherPricing } : faq);
    const wrongFaq = { ...page, faqs, jsonld: JSON.stringify(faqJsonLd(faqs)) };
    assert.ok(curatedPageIssues(wrongFaq).some((issue) => issue.includes('must use their own offer')));
  }

  const badSource = { ...page, sources: [{ title: 'Unverified source', url: 'https://www.calgary.ca.example.org/claims' }] };
  assert.ok(curatedPageIssues(badSource).some((issue) => issue.includes('official Alberta source')));
}

console.log('Officer pricing compatibility and strict Photo Radar pricing checks passed.');
