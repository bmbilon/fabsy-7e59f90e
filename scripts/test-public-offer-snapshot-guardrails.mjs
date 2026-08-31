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
      import PricingLadder from './src/components/PricingLadder';
      import PhotoRadarOfferStrip from './src/components/PhotoRadarOfferStrip';
      const pages = { '/photo-radar': PhotoRadar, '/fleet': Fleet, '/free-ticket-check': FreeTicketCheck, '/pro-drivers': ProDrivers, '/refer': Refer, '/terms-of-service': Terms, '/ladder': PricingLadder, '/strip': PhotoRadarOfferStrip };
      export function render(route) { const Page = pages[route]; return renderToStaticMarkup(<StaticRouter location={route}><Page /></StaticRouter>); }
    ` },
    bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', outfile: bundle, logLevel: 'silent',
    plugins: [{ name: 'offline-public-pages', setup(builder) {
      builder.onResolve({ filter: /^@\/components\/(?:Header|Footer)$/ }, args => ({ path: args.path, namespace: 'navigation' }));
      builder.onLoad({ filter: /.*/, namespace: 'navigation' }, () => ({ contents: 'export default function Navigation() { return null; }', loader: 'js' }));
      builder.onResolve({ filter: /^@\/integrations\/supabase\/client$/ }, args => ({ path: args.path, namespace: 'no-network' }));
      builder.onLoad({ filter: /.*/, namespace: 'no-network' }, () => ({ contents: 'export const supabase = new Proxy({}, { get() { throw new Error("Network access is forbidden in public-page tests"); } });', loader: 'js' }));
    } }],
  });
  const actual = require(bundle);
  for (const route of routes.keys()) accepted(actual.render(route), route, `${route}: actual React output`);
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
    ['photo-radar-terms', 'pro-driver-terms', 'referral-terms'].includes(section.id) || section.querySelector('h2')?.textContent === '5. Fees and Payment');
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
  rejected(newTerms.replace('service discount and corresponding GST to the original payment method.', 'service discount and corresponding GST to the original payment method. This is also an insurance saving.'), '/terms-of-service', 'Appended legal meaning cannot inherit a source clause');
  rejected(newTerms.replace('</main>', '<p>Your response deadline is August 31, 2026.</p></main>'), '/terms-of-service', 'The metadata date is not admitted as a court deadline');
  rejected(newTerms, '/about', 'Terms exemptions cannot migrate to another route');
  assert.ok(!redactPublicOfferSnapshot(newTerms, { route: '/terms-of-service' }).html.includes('$158.40'));
  console.log(`Public-offer guardrails passed ${checks} deterministic, actual-React and mutation checks; no network calls or source writes.`);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
