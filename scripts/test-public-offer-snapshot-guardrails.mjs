import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const { publicSnapshotGuardrailIssues, browserTextGuardrailIssues } = require('./validate-snapshot-guardrails.cjs');
const { PHOTO_RADAR_PRICING_COPY } = require('./normalize-rapid-resolution-content.cjs');
const browserFragments = require('./fixtures/public-offer-browser-fragments.json');
const { redactPublicOfferSnapshot, assertPublicOfferSources } = require('./public-offer-snapshot-guardrail.cjs');
const { renderProDrivers, renderRefer, publicContent } = require('./generate-pro-referral-snapshots.cjs');
const { renderPhotoRadar, renderFleet, renderFreeCheck, generatePhotoRadarSnapshots } = require('./generate-photo-radar-snapshots.cjs');
const feeRefund = require('../src/config/feeRefund.json');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'fabsy-public-offer-guards-'));
const compact = value => String(value ?? '').replace(/\s+/g, '');
const routes = new Map([['/pro-drivers', renderProDrivers], ['/refer', renderRefer], ['/photo-radar', renderPhotoRadar], ['/fleet', renderFleet], ['/free-ticket-check', renderFreeCheck]]);
let checks = 0;
function accepted(html, route, label) {
  assert.deepEqual(publicSnapshotGuardrailIssues(html, route), [], label);
  checks += 1;
}
function rejected(html, route, label) {
  assert.ok(publicSnapshotGuardrailIssues(html, route).length > 0, label);
  checks += 1;
}
function edit(html, operation) {
  const dom = new JSDOM(html);
  operation(dom.window.document);
  const changed = dom.serialize();
  dom.window.close();
  return changed;
}

try {
  assertPublicOfferSources();
  const photoControls = renderPhotoRadar().replace('<main', `<header>${browserFragments.photoHeaderCta}</header><main`)
    .replace('</body>', `${browserFragments.photoCallBar}</body>`);
  accepted(photoControls, '/photo-radar', 'Actual captured header and mobile CTAs retain the complete owner-notice offer context');
  for (const [from, to] of [['Start · $79 + GST', 'Start · $80 + GST'], ['Start · $79 + GST', 'Start · $79 including GST'],
    ['Start Photo Radar · $79 + GST', 'Start Photo Radar · $49 + GST'], ['bottom-0', 'top-0'],
    ['Start · $79 + GST', 'Start · $79 + GST. The statutory fine is $79.']]) {
    rejected(photoControls.replace(from, to), '/photo-radar', `Captured navigation mutation ${from} -> ${to}`);
  }
  const servicesCard = `<main><section aria-labelledby="ticket-types-heading">${browserFragments.servicesPhotoCard}</section></main>`;
  accepted(servicesCard, '/services', 'Actual registered-owner service card is source-bound and contextual');
  for (const [from, to] of [['$79', '$198'], ['ticket-types-heading', 'unrelated-section'],
    ['Photo radar and red-light cameras', 'Officer-issued speeding tickets'], ['no success fee.', 'no success fee. The statutory fine is $79.']]) {
    rejected(servicesCard.replace(from, to), '/services', 'Service card amount, product, section and full clause must remain exact');
  }
  rejected(servicesCard, '/rapid-resolution', 'The service-card price cannot migrate to an unrelated route');
  for (const slug of ['photo-radar-ticket-alberta', 'photo-radar-ticket-edmonton', 'fight-photo-radar-ticket-calgary']) {
    const html = `<main><p>${PHOTO_RADAR_PRICING_COPY}</p></main>`;
    assert.deepEqual(browserTextGuardrailIssues(html, slug), [], 'The exact owner-notice paragraph explicitly discloses 5% GST');
    checks += 1;
    for (const changed of [html.replace('plus 5% GST', 'including GST'), html.replace('plus 5% GST', 'plus 10% GST'), html.replace('$79', '$80')]) {
      assert.ok(browserTextGuardrailIssues(changed, slug).length, 'Wrong tax, rate or amount is not admitted');
      checks += 1;
    }
  }
  for (const [route, render] of routes) {
    const html = render();
    accepted(html, route, `${route}: deterministic exact public copy`);
    for (const claim of ['The statutory fine is $999.', 'Your ticket will be resolved within 24 hours.', 'We guarantee a withdrawal.']) {
      rejected(html.replace('</main>', `<p>${claim}</p></main>`), route, `${route}: unknown claim ${claim}`);
    }
    rejected(html.replace('</main>', '<p>Our additional fee is $79 CAD plus GST.</p></main>'), route, `${route}: a correct new amount is not globally approved`);
    rejected(html.replace('</main>', '<p data-guard-approved-price="true">The statutory fine is $999.</p></main>'), route, `${route}: injected trust markers do not grant admission`);
  }
  const pro = renderProDrivers();
  for (const [from, to] of [['158.40', '158.41'], ['183.20', '49'], ['CAD + GST', 'USD + GST'], ['CAD + GST', 'CAD including GST']]) {
    rejected(pro.replaceAll(from, to), '/pro-drivers', `Pro wrong amount/currency/tax: ${from} -> ${to}`);
  }
  rejected(pro.replaceAll('158.40', '__SWAP__').replaceAll('183.20', '158.40').replaceAll('__SWAP__', '183.20'), '/pro-drivers', 'Discounted products cannot be swapped');
  for (const copy of [publicContent.pro.scope, publicContent.pro.exclusions, publicContent.pro.unverifiedText]) {
    rejected(edit(pro, doc => {
      const paragraph = [...doc.querySelectorAll('main p')].find(node => compact(node.textContent) === compact(copy));
      assert(paragraph);
      paragraph.remove();
    }), '/pro-drivers', 'Removing required eligibility/scope blocks every discount admission');
  }
  rejected(edit(pro, doc => {
    const paragraph = [...doc.querySelectorAll('main p')].find(node => node.textContent.includes('Eligible, verified officer-ticket clients pay'));
    paragraph.append(' These amounts are statutory fines.');
  }), '/pro-drivers', 'An appended claim cannot inherit an exact FAQ admission');
  rejected(pro, '/rapid-resolution', 'Pro page prices/schema are not approved on the standard service route');
  rejected(pro.replace('"valueAddedTaxIncluded":false', '"valueAddedTaxIncluded":true'), '/pro-drivers', 'Discount schema cannot claim GST is included');
  rejected(pro.replace('"priceCurrency":"CAD"', '"priceCurrency":"USD"'), '/pro-drivers', 'Discount schema currency is exact');
  for (const route of ['/photo-radar', '/fleet']) {
    const html = routes.get(route)();
    rejected(html.replaceAll('$79', '$198'), route, `${route}: the officer price cannot replace owner pricing`);
    rejected(html.replace('"price":"79"', '"price":"49"'), route, `${route}: named Offer schema must retain its exact SKU`);
    rejected(html, '/insurance-damage-report', `${route}: $79 Service cannot migrate to report route`);
  }
  rejected(renderRefer().replaceAll('$50', '$51'), '/refer', 'Wrong officer referral reward');
  rejected(renderRefer().replaceAll('30 days', '90 days'), '/refer', 'Attribution window cannot change');
  rejected(renderRefer().replaceAll('August 31, 2026', 'August 31, 2099'), '/refer', 'Referral effective date is exact');
  const globalCatalog = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match => JSON.parse(match[1])).find(value => value['@type'] === 'ProfessionalService');
  const schemaHtml = value => `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
  assert(globalCatalog?.hasOfferCatalog?.itemListElement.some(item => item.itemOffered?.name === 'Rapid Resolution: Photo Radar'));
  accepted(schemaHtml(globalCatalog), '/about', 'Actual source ProfessionalService catalog keeps the exact named Photo Radar Offer');
  for (const mutate of [
    item => { item.price = '49'; },
    item => { item.priceCurrency = 'USD'; },
    item => { item.url = 'https://fabsy.ca/rapid-resolution'; },
    item => { item.priceSpecification.valueAddedTaxIncluded = true; },
    item => { item.itemOffered.description += ' The outcome is guaranteed.'; },
  ]) {
    const changed = structuredClone(globalCatalog);
    mutate(changed.hasOfferCatalog.itemListElement[0]);
    rejected(schemaHtml(changed), '/about', 'The global Photo Radar catalog exception is an exact named object');
  }
  const outsideCatalog = globalCatalog.hasOfferCatalog.itemListElement[0];
  rejected(schemaHtml(outsideCatalog), '/about', 'The catalog Offer is not an unscoped global price exemption');
  const duplicate = structuredClone(globalCatalog);
  duplicate.hasOfferCatalog.itemListElement.push(structuredClone(outsideCatalog));
  rejected(schemaHtml(duplicate), '/about', 'Duplicate Photo Radar catalog entries are not admitted');
  for (const invalid of [['photo-radar', '../private'], ['fleet', 'fleet'], ['portal/referrals'], []]) {
    const target = path.join(temporary, `invalid-${checks}`);
    assert.throws(() => generatePhotoRadarSnapshots(target, invalid), /Only unique public/);
    assert(!fs.existsSync(target), 'Invalid photo route batches must write nothing');
    checks += 1;
  }

  const bundle = path.join(temporary, 'actual-pages.cjs');
  await build({
    absWorkingDir: ROOT,
    stdin: { sourcefile: 'public-offer-render-check.tsx', resolveDir: ROOT, loader: 'tsx', contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { StaticRouter } from 'react-router-dom/server';
      import PhotoRadar from './src/pages/PhotoRadar';
      import Fleet from './src/pages/Fleet';
      import FreeTicketCheck from './src/pages/FreeTicketCheck';
      import ProDrivers from './src/pages/ProDrivers';
      import Refer from './src/pages/Refer';
      import Terms from './src/pages/TermsOfService';
      import TermsOfPurchase from './src/pages/TermsOfPurchase';
      import RapidResolution from './src/pages/RapidResolution';
      import FAQ from './src/pages/FAQ';
      import FeeRefundNotice from './src/components/FeeRefundNotice';
      import Footer from './src/components/Footer';
      import { faqAnswerHtml } from './src/lib/faq-format';
      import PricingLadder from './src/components/PricingLadder';
      import PhotoRadarOfferStrip from './src/components/PhotoRadarOfferStrip';
      import { createInstance } from 'i18next';
      import { I18nextProvider } from 'react-i18next';
      import en from './src/i18n/locales/en.json';
      const i18n = createInstance();
      i18n.init({ lng: 'en', fallbackLng: 'en', initImmediate: false, resources: { en: { translation: en } } });
      const pages = { '/photo-radar': PhotoRadar, '/fleet': Fleet, '/free-ticket-check': FreeTicketCheck, '/pro-drivers': ProDrivers, '/refer': Refer, '/terms-of-service': Terms, '/terms-of-purchase': TermsOfPurchase, '/rapid-resolution': RapidResolution, '/faq': FAQ, '/footer': Footer, '/ladder': PricingLadder, '/strip': PhotoRadarOfferStrip,
        '/refund-notice': FeeRefundNotice, '/photo-refund-notice': () => <FeeRefundNotice photoRadar /> };
      export function render(route) { const Page = pages[route]; return renderToStaticMarkup(<I18nextProvider i18n={i18n}><StaticRouter location={route}><Page /></StaticRouter></I18nextProvider>); }
      export function formatFaqAnswer(answer) { return faqAnswerHtml(answer); }
    ` },
    bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', outfile: bundle, logLevel: 'silent',
    plugins: [{ name: 'offline-public-pages', setup(builder) {
      builder.onResolve({ filter: /^@\/components\/(?:Header|Footer)$/ }, args => ({ path: args.path, namespace: 'navigation' }));
      builder.onLoad({ filter: /.*/, namespace: 'navigation' }, () => ({ contents: 'export default function Navigation() { return null; }', loader: 'js' }));
      // Render the real English Footer while keeping its unused localized
      // branch (which requires Vite's locale loader) outside this Node test.
      builder.onResolve({ filter: /^\.\/LocalizedNavigation$/ }, args => args.importer === path.join(ROOT, 'src/components/Footer.tsx')
        ? { path: args.path, namespace: 'unused-localized-footer' } : null);
      builder.onLoad({ filter: /.*/, namespace: 'unused-localized-footer' }, () => ({ contents: 'export function LocalizedFooter() { throw new Error("This regression must render the real English Footer"); }', loader: 'js' }));
      builder.onResolve({ filter: /^@\/integrations\/supabase\/client$/ }, args => ({ path: args.path, namespace: 'no-network' }));
      builder.onLoad({ filter: /.*/, namespace: 'no-network' }, () => ({ contents: 'export const supabase = new Proxy({}, { get() { throw new Error("Network access is forbidden in public-page tests"); } });', loader: 'js' }));
    } }],
  });
  const actual = require(bundle);
  for (const route of routes.keys()) accepted(actual.render(route), route, `${route}: actual React output`);
  const footer = actual.render('/footer');
  accepted(footer, '/about', 'Actual Footer admits only its exact Legal navigation entry');
  accepted(`<main>${footer}</main>`, '/about', 'Exact footer navigation works when the page main encloses the footer');
  for (const [label, change] of [
    ['wrong destination', html => html.replace(feeRefund.termsPath, '/submit-ticket')],
    ['wrong heading', html => html.replace('>Legal</h3>', '>Services</h3>')],
    ['appended claim', html => html.replace('Fee-refund guarantee</a>', 'Fee-refund guarantee. We guarantee a withdrawal.</a>')],
    ['hidden child', html => html.replace('Fee-refund guarantee</a>', 'Fee-refund guarantee<span hidden>We guarantee a withdrawal.</span></a>')],
    ['hidden sibling', html => html.replace('Fee-refund guarantee</a></li>', 'Fee-refund guarantee</a><span hidden>We guarantee a withdrawal.</span></li>')],
    ['accessibility claim', html => html.replace(`href="${feeRefund.termsPath}"`, `aria-label="We guarantee a withdrawal" href="${feeRefund.termsPath}"`)],
  ]) {
    const changed = change(footer);
    assert.notEqual(changed, footer, `Footer ${label}: mutation applies`);
    rejected(changed, '/about', `Footer ${label} cannot inherit the navigation exception`);
  }
  rejected(footer.replace(/<footer\b/g, '<section').replace(/<\/footer>/g, '</section>'), '/about', 'The exact link is not an exception outside the footer');
  rejected(footer, '/pa/', 'English footer exception does not bypass localized source checks');
  const visibleFaqDom = new JSDOM(actual.render('/faq'));
  const refundQuestion = [...visibleFaqDom.window.document.querySelectorAll('h3')].find(node => node.textContent === 'Does Fabsy promise a particular result?');
  assert(refundQuestion);
  const faqSchema = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: refundQuestion.textContent,
    acceptedAnswer: { '@type': 'Answer', text: actual.formatFaqAnswer(refundQuestion.nextElementSibling.textContent) } }] };
  visibleFaqDom.window.close();
  const schemaMarkup = value => `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
  accepted(schemaMarkup(faqSchema), '/faq', 'Actual FAQ answer HTML is the exact paragraph serialization emitted by FAQSchema');
  for (const [from, to] of [['30 days', '60 days'], ['of receiving the rejection', 'after payment'], ['of receiving the rejection', 'of receiving a preliminary Crown offer'], ['<p>', '<p hidden>'], ['</p>', '</p><p>We guarantee a withdrawal.</p>']]) {
    const changed = structuredClone(faqSchema);
    changed.mainEntity[0].acceptedAnswer.text = changed.mainEntity[0].acceptedAnswer.text.replace(from, to);
    rejected(schemaMarkup(changed), '/faq', 'Changed or extended HTML cannot inherit the exact FAQ paragraph admission');
  }
  const notice = `<main>${actual.render('/refund-notice')}</main>`;
  for (const route of ['/', '/rapid-resolution', '/faq', '/terms-of-service', '/terms-of-purchase']) {
    accepted(notice, route, `${route}: exact component keeps Crown rejection, upfront payment and details together`);
  }
  for (const [label, mutate] of [
    ['wrong refund window', html => html.replace('30 days', '60 days')],
    ['payment clock start', html => html.replace('of receiving the rejection', 'after checkout')],
    ['preliminary offer clock start', html => html.replace('of receiving the rejection', 'of receiving a preliminary Crown offer')],
    ['omitted upfront disclosure', html => html.replace(feeRefund.payment, '')],
    ['legal result guarantee', html => html.replace(feeRefund.payment, 'Your withdrawal is guaranteed.')],
    ['wrong terms destination', html => html.replace(feeRefund.termsPath, '/submit-ticket')],
    ['wrong service marker', html => html.replace('data-fee-refund-notice="ticket-representation"', 'data-fee-refund-notice="photo-radar"')],
    ['missing marker', html => html.replace('data-fee-refund-notice=', 'data-other-notice=')],
    ['hidden qualification', html => html.replace(`<p class=`, `<p hidden class=`)],
    ['added legal amount', html => html.replace('</aside>', '<p>The statutory fine is $79.</p></aside>')],
    ['added outcome claim', html => html.replace('</aside>', '<p>We guarantee a withdrawal.</p></aside>')],
    ['accessibility outcome claim', html => html.replace('<aside ', '<aside aria-label="We guarantee a withdrawal" ')],
  ]) {
    const changed = mutate(notice);
    assert.notEqual(changed, notice, `${label}: mutation applied`);
    rejected(changed, '/rapid-resolution', `Refund component rejects ${label}`);
  }
  rejected(notice.replace('</main>', notice + '</main>'), '/rapid-resolution', 'Duplicate notices do not inherit admission');
  rejected(notice, '/insurance-damage-report', 'Ticket-refund promise cannot migrate to the standalone report');
  rejected(notice, '/pa/', 'English component exception does not bypass localized copy checks');
  for (const route of ['/rapid-resolution', '/faq', '/terms-of-purchase']) accepted(actual.render(route), route, `${route}: actual updated refund page`);
  const photoRefundPage = actual.render('/photo-radar');
  rejected(edit(photoRefundPage, document => {
    const condition = [...document.querySelectorAll('aside[data-fee-refund-notice="photo-radar"] p')].find(node => node.textContent === feeRefund.photoCondition);
    assert(condition, 'The actual Photo Radar rejection trigger is present');
    condition.textContent = feeRefund.condition;
  }), '/photo-radar', 'Photo Radar must retain its fine-or-withdrawal-only refund trigger');
  rejected(photoRefundPage.replace(feeRefund.photoHeadline, feeRefund.headline), '/photo-radar', 'Photo Radar must retain its owner-notice headline');
  // These pages emit JSON-LD during SSR. FAQSection installs its schema in a
  // browser effect, so its actual rendered copy is checked above instead.
  for (const route of ['/photo-radar', '/rapid-resolution']) {
    const html = actual.render(route);
    for (const mutation of ['window', 'added']) {
      const changed = edit(html, document => {
        const script = [...document.querySelectorAll('script[type="application/ld+json"]')].find(node => JSON.parse(node.textContent)['@type'] === 'FAQPage');
        assert(script, `${route}: source FAQ schema exists`);
        const schema = JSON.parse(script.textContent);
        const question = schema.mainEntity.find(entry => entry.acceptedAnswer.text.includes('30 days'));
        assert(question, `${route}: refund FAQ exists`);
        if (mutation === 'window') question.acceptedAnswer.text = question.acceptedAnswer.text.replace('30 days', '60 days');
        else question.acceptedAnswer.extraClaim = 'We guarantee a withdrawal.';
        script.textContent = JSON.stringify(schema);
      });
      rejected(changed, route, `${route}: ${mutation} schema claim cannot inherit the exact refund answer`);
    }
  }
  const ladder = `<footer>${actual.render('/ladder')}</footer>`;
  accepted(ladder, '/rapid-resolution', 'Actual fully qualified officer navigation/pricing ladder');
  rejected(ladder.replace('Verified Alberta licence. Officer-issued tickets only.', ''), '/rapid-resolution', 'Bare footer discount cannot pass');
  rejected(ladder.replace('href="/pro-drivers"', 'href="/submit-ticket"'), '/rapid-resolution', 'Pro navigation must open the verified program');
  rejected(ladder.replace('20% off', '30% off'), '/rapid-resolution', 'Unknown footer discount is rejected');

  const strip = actual.render('/strip');
  for (const [route, heading] of [['/', 'homepage-pricing-heading'], ['/services', 'service-options-heading'], ['/ai-info', 'products-heading']]) {
    const block = `<main><section aria-labelledby="${heading}">${strip}${actual.render('/ladder')}</section></main>`;
    accepted(block, route, `${route}: actual source-qualified banner and ladder in their correct section`);
    rejected(block.replace('$79', '$80'), route, `${route}: banner amount remains exact`);
    rejected(block.replace('No demerits.', ''), route, `${route}: banner requires complete owner-notice scope`);
    rejected(block.replace('href="/photo-radar"', 'href="/submit-ticket"'), route, `${route}: banner must open owner-notice details`);
    rejected(block.replace(heading, 'unrelated-section'), route, `${route}: source-specific main context is required`);
    rejected(block.replace('20% off', '30% off'), route, `${route}: shared ladder cannot change the officer discount`);
    rejected(block.replace('no success fee.', 'no success fee. The statutory fine is $79.'), route, `${route}: appended numeric claim is never admitted`);
  }
  for (const slug of ['photo-radar-ticket-alberta', 'photo-radar-ticket-edmonton', 'fight-photo-radar-ticket-calgary']) {
    accepted(`<main>${strip}</main>`, `/content/${slug}`, 'Only the three reviewed Photo Radar guides use the exact strip');
  }
  rejected(`<main>${strip}</main>`, '/rapid-resolution', 'The Photo Radar banner is not approved on unrelated service pages');
  rejected(`<main>${strip}</main>`, '/pa/', 'The English Photo Radar banner is not a translated-page exemption');

  const termsDom = new JSDOM(actual.render('/terms-of-service'));
  const termsDocument = termsDom.window.document;
  const retained = [...termsDocument.querySelectorAll('section')].filter(section =>
    ['photo-radar-terms', 'pro-driver-terms', 'referral-terms', 'fee-refund-guarantee'].includes(section.id) || section.querySelector('h2')?.textContent === '5. Fees and Payment');
  // Existing ordinary prices and the four original terms clauses retain the
  // independent legacy regression suite. This fixture tests the additions.
  const priceSection = retained.find(section => section.querySelector('h2')?.textContent === '5. Fees and Payment');
  if (priceSection) for (const li of [...priceSection.querySelectorAll('li')]) if (!li.textContent.startsWith('Rapid Resolution: Photo Radar')) li.remove();
  const newTerms = `<main><h1>Terms of Service</h1><p>Last updated: August 31, 2026</p>${retained.map(section => section.outerHTML).join('')}</main>`;
  termsDom.window.close();
  accepted(newTerms, '/terms-of-service', 'Actual new Terms sections match complete original clauses and headings');
  for (const [from, to] of [['$158.40', '$158.41'], ['$183.20', '$229'], ['$50', '$500'], ['30 days', '90 days'], ['20%', '25%'], ['plus applicable GST', 'including GST'], ['August 31, 2026', 'August 31, 2099']]) {
    rejected(newTerms.replaceAll(from, to), '/terms-of-service', `Terms mutation ${from} -> ${to}`);
  }
  rejected(newTerms.replace('pro-driver-terms', 'unrelated-terms'), '/terms-of-service', 'Exact source paragraph requires its correct section');
  rejected(newTerms.replace('id="fee-refund-guarantee"', 'id="unrelated-terms"'), '/terms-of-service', 'Refund clauses require the correct source section');
  rejected(newTerms.replace(feeRefund.payment, ''), '/terms-of-service', 'Refund terms cannot omit the upfront-payment and no-outcome disclosure');
  rejected(newTerms.replace('Payment or checkout does not start this clock.', 'Payment or checkout starts this clock.'), '/terms-of-service', 'Payment cannot start the refund clock');
  rejected(newTerms.replace('does not start it either.', 'starts the refund clock.'), '/terms-of-service', 'A preliminary or unchanged offer cannot start the refund clock');
  rejected(newTerms.replace('does not postpone the refund deadline.', 'postpones the refund deadline.'), '/terms-of-service', 'Negotiation after a qualifying rejection cannot postpone the refund deadline');
  rejected(newTerms.replace('Work performed and payment-processing costs do not reduce', 'Work performed and payment-processing costs reduce'), '/terms-of-service', 'The promised fee cannot acquire an unapproved processing/work deduction');
  rejected(newTerms.replace('You do not have to accept a Crown offer or plead guilty', 'You have to accept a Crown offer or plead guilty'), '/terms-of-service', 'Refund cannot silently require accepting the Crown offer');
  rejected(newTerms.replace('service discount and corresponding GST to the original payment method.', 'service discount and corresponding GST to the original payment method. This is also an insurance saving.'), '/terms-of-service', 'Appended legal meaning cannot inherit a source clause');
  rejected(newTerms.replace('</main>', '<p>Your response deadline is August 31, 2026.</p></main>'), '/terms-of-service', 'The metadata date is not admitted as a court deadline');
  rejected(newTerms, '/about', 'Terms exemptions cannot migrate to another route');
  assert.ok(!redactPublicOfferSnapshot(newTerms, { route: '/terms-of-service' }).html.includes('$158.40'));
  console.log(`Public-offer guardrails passed ${checks} deterministic, actual-React and mutation checks; no network calls or source writes.`);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
