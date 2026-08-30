#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const offers = require('../src/config/offers.json');
const { textGuardrailIssues } = require('./curated-content-guardrails.cjs');
const {
  browserTextGuardrailIssues,
  containsDisallowedOfferPricing,
} = require('./validate-snapshot-guardrails.cjs');

function page(body, { tax = true, clock = true } = {}) {
  return `<main>${body}${tax ? '<p>All prices are CAD plus applicable GST.</p>' : ''}${clock ? `<p>${offers.rapidResolution.speedDisclaimer}</p>` : ''}</main>`;
}

for (const copy of [
  'Rapid Resolution $198 CAD + GST',
  'Rapid Resolution ($198)',
  'Rapid Resolution costs $198.00 CAD plus applicable GST.',
  'Rapid Resolution | Alberta Traffic Ticket Help | $198 CAD',
  'Rapid Resolution One flat pre-trial service fee $198 CAD + GST',
  'Start · $198',
  'Start Rapid Resolution · $198',
  'Insurance Impact Report $49 CAD + GST',
  'Insurance Impact &amp; Renewal Planning Report costs $49 CAD plus GST.',
  'Standalone report $49 CAD',
  'Get the report for $49',
  'Rapid Resolution Bundle $229 CAD + GST',
  'Rapid Resolution + Insurance Planning $229',
  'Rapid Resolution + Insurance Planning bundle costs $229 CAD plus GST.',
  'Choose both the report and Rapid Resolution for $229.',
  'Rapid Resolution is $198 CAD, the Insurance Impact Report is $49 CAD, and both are $229 CAD, plus applicable GST.',
  '48-hour Fabsy action commitment',
  'When does the 48-hour commitment begin?',
  'The 48-hour commitment Complete disclosure in. Fabsy\'s next action within 48 hours.',
  'Fabsy acts within 48 hours of complete disclosure',
  offers.canonicalPricingCopy,
  offers.rapidResolution.actionCommitment,
  offers.rapidResolution.oneLineDescription,
]) {
  assert.deepEqual(browserTextGuardrailIssues(page(copy), 'index'), [], copy);
}

assert.deepEqual(browserTextGuardrailIssues(page(
  'For $49 CAD plus applicable GST, Fabsy prepares a personalized, source-backed planning report. Get started for $49. Upload your commercial 5-year Alberta driver\'s abstract.'
), 'insurance-damage-report'), []);
assert.deepEqual(browserTextGuardrailIssues(page(
  'Upload your ticket and continue to the transparent $198 CAD plus GST checkout.'
), 'submit-ticket'), []);

for (const copy of [
  'Rapid Resolution $149 CAD plus GST.',
  'Rapid Resolution costs $488 CAD plus GST.',
  'Our success fee is 30% of the reduction.',
  'Insurance Impact Report $129 CAD plus GST.',
  'The report add-on is $99 CAD plus GST.',
  'Rapid Resolution Bundle $247 CAD plus GST.',
  'Rapid Resolution $49 CAD plus GST.',
  'Rapid Resolution for $229 CAD plus GST.',
  'Insurance Impact Report $198 CAD plus GST.',
  'Rapid Resolution costs $198.01 CAD plus GST.',
  'Rapid Resolution costs $198,000 CAD plus GST.',
  'The government fine is $198.',
  'Rapid Resolution lowers the fine by $198.',
  'Your premium will fall by $49.',
  'Fabsy guarantees a reduction.',
  'Fabsy wins 100% of tickets.',
  'The Crown resolves your ticket within 48 hours.',
  'Fabsy completes its review within 15 minutes.',
  'Every conviction disappears after three years.',
  'You face a 5-year insurance surcharge.',
]) {
  assert.ok(browserTextGuardrailIssues(page(copy), 'index').length > 0, copy);
  // Having canonical approved copy elsewhere never licenses an extra claim.
  assert.ok(browserTextGuardrailIssues(page(`${offers.canonicalPricingCopy} ${copy}`), 'index').length > 0, copy);
}

assert.ok(browserTextGuardrailIssues(page('Rapid Resolution $198', { tax: false }), 'index')
  .includes('Fabsy pricing must disclose applicable GST separately'));
assert.ok(browserTextGuardrailIssues(page('48-hour Fabsy action commitment', { clock: false }), 'index')
  .includes('unsupported duration or deadline claim'));
assert.ok(browserTextGuardrailIssues(page('Upload your commercial 5-year Alberta driver\'s abstract.'), 'index')
  .includes('unsupported duration or deadline claim'));
assert.deepEqual(browserTextGuardrailIssues(page('Start · $198 Insurance Impact Report ($49)'), 'blog', { numeric: false }), []);
assert.ok(browserTextGuardrailIssues(page('Start · $149'), 'blog', { numeric: false })
  .includes('unsupported monetary legal claim'));
assert.ok(textGuardrailIssues('Rapid Resolution costs $198 CAD plus GST.')
  .includes('partial or inexact Fabsy pricing'), 'generated and curated article rules must remain strict');

function service(name, price, offerChanges = {}) {
  return {
    '@type': 'Service', name,
    offers: { '@type': 'Offer', price, priceCurrency: 'CAD', ...offerChanges },
  };
}
for (const product of [offers.rapidResolution, offers.insuranceReport, offers.bundle]) {
  assert.equal(containsDisallowedOfferPricing(service(product.name, product.priceCad)), false);
  assert.equal(containsDisallowedOfferPricing(service(product.name, product.priceCad + 1)), true);
  assert.equal(containsDisallowedOfferPricing(service(product.name, product.priceCad, { priceCurrency: 'USD' })), true);
  assert.equal(containsDisallowedOfferPricing(service(product.name, product.priceCad, {
    priceSpecification: { price: product.priceCad, valueAddedTaxIncluded: true },
  })), true);
  assert.equal(containsDisallowedOfferPricing(service(product.name, product.priceCad, {
    priceSpecification: { price: product.priceCad + 1, valueAddedTaxIncluded: false },
  })), true);
}
assert.equal(containsDisallowedOfferPricing(service(undefined, 198)), true, 'anonymous fixed-price offers must fail');
assert.equal(containsDisallowedOfferPricing(service('Rapid Resolution', 49)), true, 'prices must match their named product');

const shell = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
for (const match of shell.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
  assert.equal(containsDisallowedOfferPricing(JSON.parse(match[1])), false, 'base-shell offer schemas must be named and correctly priced');
}
const description = /<meta name="description" content="([^"]*)"/.exec(shell)?.[1];
assert.ok(description && description.length <= 155, 'base-shell description must fit the production gate');

console.log('Snapshot offer guardrail tests passed.');
