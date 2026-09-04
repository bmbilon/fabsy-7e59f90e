#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const offers = require('../src/config/offers.json');
const { textGuardrailIssues } = require('./curated-content-guardrails.cjs');
const { proDriverPromotionValues, renderProDriverSnapshot, redactProDriverPromotion } = require('./pro-driver-promotion-guardrail.cjs');
const { withoutExactPhotoCatalogOffer } = require('./public-offer-snapshot-guardrail.cjs');
const {
  browserTextGuardrailIssues,
  containsDisallowedOfferPricing,
  hasPlaceholderTelephoneNumber,
} = require('./validate-snapshot-guardrails.cjs');

const promotion = proDriverPromotionValues(offers);
assert.equal(promotion.priceCents, 15840, 'The discount is $158.40 before GST');
assert.equal(promotion.savingsCents, 3960, 'The 20% discount saves $39.60 before GST');
assert.equal(promotion.bundlePriceCents, 18320, 'The verified bundle is $183.20 before GST');
assert.equal(promotion.regularPrice, '$198');
assert.equal(promotion.taxTreatment, 'CAD plus applicable GST');
assert.deepEqual([offers.rapidResolution.priceCad, offers.insuranceReport.priceCad, offers.bundle.priceCad], [198, 49, 229], 'The promotion never replaces ordinary product prices');
for (const mutation of [
  { percentOff: 21 }, { percentOff: 100 }, { percentOff: '20' },
  { id: 'all-drivers' }, { appliesTo: ['insurance_report'] }, { appliesTo: ['rapid_resolution'] },
  { verificationRequired: false }, { combinable: true }, { includesTrial: true },
  { licenceProvince: 'BC' }, { eligibleTicketType: 'camera' }, { detailsPath: '/submit-ticket' },
  { eligibleLicenceClasses: ['1', '2', '4', '5'] }, { eligibleLicenceClasses: ['1', '2', '2'] },
]) {
  assert.throws(() => proDriverPromotionValues({ ...offers, proDriverPromotion: { ...offers.proDriverPromotion, ...mutation } }), /authorized verified/, JSON.stringify(mutation));
}
for (const mutation of [{ priceCad: 49 }, { priceCents: 22900 }, { currency: 'USD' }, { taxTreatment: 'including GST' }, { intakePath: '/insurance-damage-report' }]) {
  assert.throws(() => proDriverPromotionValues({ ...offers, rapidResolution: { ...offers.rapidResolution, ...mutation } }), /authorized verified/, JSON.stringify(mutation));
}

function page(body, { tax = true, clock = true } = {}) {
  return `<main>${body}${tax ? '<p>All prices are CAD plus applicable GST.</p>' : ''}${clock ? `<p>${offers.rapidResolution.speedDisclaimer}</p>` : ''}</main>`;
}

const english = require('../src/i18n/locales/en.json');
const promotionTranslate = key => key.split('.').reduce((value, part) => value[part], english)
  .replace(/\{\{(\w+)\}\}/g, (_, variable) => ({ price: '$198', ...promotion.translationValues })[variable]);
const promotionHtml = renderProDriverSnapshot(offers, promotionTranslate, 'en');
// Captured from the actual ProDriverSection React component with the current
// public source. This exercises the browser's wrappers/SVGs, not only our
// minimal deterministic renderer.
const capturedPromotionHtml = fs.readFileSync(path.join(__dirname, 'fixtures/pro-driver-section.html'), 'utf8').trim();
const promotionOptions = { offers, translate: promotionTranslate, code: 'en', route: '/' };
const promotionIssues = (html, route = '/') => {
  const candidate = redactProDriverPromotion(html, { ...promotionOptions, route });
  return [...candidate.issues, ...browserTextGuardrailIssues(page(candidate.html), route === '/' ? 'index' : route.slice(1))];
};
assert.deepEqual(promotionIssues(promotionHtml), [], 'A complete exact-source promotion retains all its conditions');
assert.deepEqual(promotionIssues(capturedPromotionHtml), [], 'Actual React promotion markup must meet the same exact source contract');
const bidiPromotion = promotionHtml.replace(/<\/?bdi\b[^>]*>/g, '').replace(/\$(?:39\.60|183\.20)/g, amount => `<bdi dir="ltr">${amount}</bdi>`);
assert.deepEqual(promotionIssues(bidiPromotion), [], 'Inline bidi isolation must not add artificial spacing before punctuation');
assert.ok(promotionIssues(bidiPromotion.replace('$39.60', '$60.00')).length > 0, 'Bidi markup never licenses a changed amount');
assert.ok(promotionIssues(bidiPromotion.replace('<bdi dir="ltr">', '<bdi dir="rtl">')).length > 0, 'Price isolation must preserve left-to-right currency order');
assert.ok(browserTextGuardrailIssues(page(promotionHtml), 'index').length > 0, 'The ordinary commercial guard must not acquire a global discount exception');
for (const [label, mutate] of [
  ['missing marker', html => html.replace('data-promotion=', 'data-unapproved-promotion=')],
  ['different marker', html => html.replace('data-promotion="pro-driver-20"', 'data-promotion="all-drivers"')],
  ['duplicated section', html => html + html],
  ['wrong percentage', html => html.replace('20%', '25%')],
  ['wrong discounted price', html => html.replace('$158.40', '$150.40')],
  ['wrong bundle price', html => html.replace('$183.20', '$183.21')],
  ['wrong savings', html => html.replace('$39.60', '$60.00')],
  ['wrong regular price', html => html.replace('$198 CAD', '$49 CAD')],
  ['wrong currency', html => html.replace('CAD + GST', 'USD + GST')],
  ['tax included', html => html.replace('CAD + GST', 'CAD including GST')],
  ['missing tax', html => html.replace('CAD + GST', 'CAD')],
  ['missing eligibility', html => html.replace(promotionTranslate('proDriver.description'), '')],
  ['missing exclusions', html => html.replace(promotionTranslate('proDriver.scope'), '')],
  ['missing claim instructions', html => html.replace(promotionTranslate('proDriver.claimHint'), '')],
  ['skipped verification route', html => html.replace('href="/pro-drivers', 'href="/submit-ticket')],
  ['invented localized details', html => html.replace('href="/pro-drivers', 'href="/pa/pro-drivers')],
  ['additional link', html => html.replace('</section>', '<a href="/submit-ticket">Other checkout</a></section>')],
  ['appended fine claim', html => html.replace('</section>', '<p>The government fine is $158.40.</p></section>')],
  ['appended outcome clock', html => html.replace('</section>', '<p>The court resolves your ticket within 48 hours.</p></section>')],
  ['hidden script', html => html.replace('</section>', '<script>"$158.40"</script></section>')],
  ['raw marketing claim in an attribute', html => html.replace('<section ', '<section aria-description="Fabsy guarantees a reduction" ')],
]) {
  for (const original of [promotionHtml, capturedPromotionHtml]) {
    const candidate = mutate(original);
    assert.notEqual(candidate, original, `The ${label} mutation must apply`);
    assert.ok(promotionIssues(candidate).length > 0, label);
  }
}
for (const route of ['/rapid-resolution', '/insurance-damage-report', '/submit-ticket', '/terms-of-service', '/pa/']) {
  assert.ok(promotionIssues(promotionHtml, route).length > 0, `A complete promotion is not admitted on ${route}`);
}
for (const extraClaim of ['<p>Rapid Resolution $158.40 CAD + GST</p>', '<p>Rapid Resolution Bundle $183.20 CAD + GST</p>', '<p>Save 20% on your government fine.</p>', '<p>Fabsy guarantees a withdrawal.</p>']) {
  assert.ok(promotionIssues(promotionHtml + extraClaim).length > 0, 'A valid promotion cannot license an extra claim outside its section');
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
for (const slug of ['index', 'rapid-resolution']) {
  assert.deepEqual(
    browserTextGuardrailIssues(page('Start online · $198 CAD + GST'), slug),
    [],
    `${slug} admits the exact Rapid Resolution sticky CTA`,
  );
}
assert.ok(
  browserTextGuardrailIssues(page('Start online · $198 CAD + GST'), 'contact')
    .includes('unsupported monetary legal claim'),
  'the short sticky CTA does not license an unnamed amount on unrelated routes',
);
assert.ok(
  browserTextGuardrailIssues(page('Start online · $199 CAD + GST'), 'index')
    .includes('unsupported monetary legal claim'),
  'the sticky CTA admission remains pinned to the approved amount',
);
const leadPhoneInput = '<input autocomplete="tel" id="lead-phone" inputmode="tel" placeholder="403-555-0123" type="tel">';
assert.equal(
  hasPlaceholderTelephoneNumber(leadPhoneInput),
  false,
  'the exact phone-format example on the private-data input is not treated as published contact information',
);
for (const html of [
  '<p>Call 403-555-0123</p>',
  '<input id="other-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="403-555-0123">',
  leadPhoneInput.replace('>', ' aria-label="Call 403-555-0123">'),
]) {
  assert.equal(hasPlaceholderTelephoneNumber(html), true, 'all other telephone-shaped fixtures remain blocked');
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
assert.equal(containsDisallowedOfferPricing(service('Rapid Resolution', 158.40)), true, 'The verified promotion does not replace the standard public Offer schema');
assert.equal(containsDisallowedOfferPricing(service('Rapid Resolution Bundle', 183.20)), true, 'The verified bundle promotion does not replace the standard public Offer schema');

const shell = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
for (const match of shell.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
  assert.equal(containsDisallowedOfferPricing(withoutExactPhotoCatalogOffer(JSON.parse(match[1]))), false,
    'base-shell offers must use the original named prices or the exact source-bound Photo Radar catalog entry');
}
const description = /<meta name="description" content="([^"]*)"/.exec(shell)?.[1];
assert.ok(description && description.length <= 155, 'base-shell description must fit the production gate');

console.log('Snapshot offer guardrail tests passed.');
