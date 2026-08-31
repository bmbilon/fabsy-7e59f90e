import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { assertSnapshotHead, loadLocaleSeoContext } from './locale-seo.mjs';

const require = createRequire(import.meta.url);
const { ROUTES, publicContent, renderProDrivers, renderRefer, generateProReferralSnapshots } = require('./generate-pro-referral-snapshots.cjs');
const { publicSnapshotGuardrailIssues } = require('./validate-snapshot-guardrails.cjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fabsy-pro-referral-snapshots-'));
const compact = value => String(value || '').replace(/\s/g, '');
const schemas = document => Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(node => JSON.parse(node.textContent));

try {
  // Render the real page components without mounting browser effects. Shared
  // navigation is outside this contract and is omitted, preventing any auth
  // or backend initialization from these public-copy checks.
  const bundle = path.join(directory, 'public-pages.cjs');
  await build({
    absWorkingDir: ROOT,
    stdin: {
      sourcefile: 'public-program-render-check.tsx', resolveDir: ROOT, loader: 'tsx',
      contents: `
        import React from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import { StaticRouter } from 'react-router-dom/server';
        import ProDrivers from './src/pages/ProDrivers';
        import Refer from './src/pages/Refer';
        export { PRO_DRIVER_PUBLIC_CONTENT, REFERRAL_PUBLIC_CONTENT } from './src/config/pro-referral-public';
        export function renderPage(route) {
          return renderToStaticMarkup(<StaticRouter location={'/' + route}>{route === 'pro-drivers' ? <ProDrivers /> : <Refer />}</StaticRouter>);
        }
      `,
    },
    bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', outfile: bundle, logLevel: 'silent',
    plugins: [{ name: 'omit-global-navigation', setup(builder) {
      builder.onResolve({ filter: /^@\/components\/(?:Header|Footer)$/ }, args => ({ path: args.path, namespace: 'omitted-navigation' }));
      builder.onLoad({ filter: /.*/, namespace: 'omitted-navigation' }, () => ({ contents: 'export default function Navigation() { return null; }', loader: 'js' }));
    } }],
  });
  const frontend = require(bundle);
  assert.deepEqual(frontend.PRO_DRIVER_PUBLIC_CONTENT, publicContent.pro, 'Pro copy and computed pricing agree with the real frontend constants');
  assert.deepEqual(frontend.REFERRAL_PUBLIC_CONTENT, publicContent.referral, 'Referral terms share the exact frontend source');

  const localeContext = loadLocaleSeoContext();
  const claimChecks = [];
  for (const [route, render, copy] of [
    ['pro-drivers', renderProDrivers, publicContent.pro],
    ['refer', renderRefer, publicContent.referral],
  ]) {
    const html = render();
    const document = new JSDOM(html).window.document;
    const live = new JSDOM(frontend.renderPage(route)).window.document;
    assertSnapshotHead(html, `/${route}`, localeContext);
    assert.equal(document.title, copy.title);
    assert.ok(document.title.length <= 60);
    assert.equal(document.querySelector('meta[name="description"]').content, copy.description);
    assert.ok(copy.description.length <= 155);
    assert.equal(document.querySelectorAll('title').length, 1);
    assert.equal(document.querySelectorAll('h1').length, 1);
    assert.equal(document.querySelector('h1').textContent, live.querySelector('h1').textContent);
    assert.equal(document.querySelector('meta[property="og:url"]').content, `https://fabsy.ca/${route}`);
    assert.equal(document.querySelector('meta[name="twitter:description"]').content, copy.description);
    assert.deepEqual(schemas(document), schemas(live), `${route}: all structured data matches the actual React page`);
    const faq = schemas(document).find(schema => schema['@type'] === 'FAQPage');
    const visible = Array.from(document.querySelectorAll('main details')).map(node => ({ question: node.querySelector('summary h3').textContent, answer: node.querySelector('p').textContent }));
    assert.deepEqual(visible, copy.faqs, `${route}: every FAQ is visible and complete`);
    assert.deepEqual(faq.mainEntity.map(item => ({ question: item.name, answer: item.acceptedAnswer.text })), visible, `${route}: FAQ schema has exact visible-copy parity`);
    for (const node of live.querySelectorAll('main h1, main h2, main h3, main p')) {
      assert.ok(compact(document.querySelector('main').textContent).includes(compact(node.textContent)), `${route}: snapshot omitted or changed live copy: ${node.textContent}`);
    }
    assert.equal(document.querySelectorAll('form, input, table').length, 0, `${route}: no portal controls or data in public snapshots`);
    assert.doesNotMatch(html, /access_token|refresh_token|order_id|licence_number|payout_email|\{(?:rapidPrice|bundlePrice|discountPercent)\}/);
    assert.equal(document.querySelectorAll('[hidden], [aria-hidden="true"]').length, 0, 'Snapshot FAQs are not hidden from readers');
    claimChecks.push({ route, issues: publicSnapshotGuardrailIssues(html, `/${route}`) });
    claimChecks.push({ route: `${route} actual React`, issues: publicSnapshotGuardrailIssues(frontend.renderPage(route), `/${route}`) });
  }

  const pro = new JSDOM(renderProDrivers()).window.document;
  const proText = pro.querySelector('main').textContent;
  const service = schemas(pro).find(schema => schema['@type'] === 'Service');
  assert.deepEqual(service.offers.map(offer => offer.price), ['158.40', '183.20']);
  assert.ok(service.offers.every(offer => offer.priceCurrency === 'CAD' && offer.priceSpecification.valueAddedTaxIncluded === false && /Class 1, 2 or 4/.test(offer.description) && /Officer-issued tickets only/.test(offer.description)));
  assert.match(proText, /Class 3 and Class 5 licences do not qualify/);
  assert.match(proText, /Photo radar and red-light camera owner notices are excluded/);
  assert.match(proText, /standalone insurance report is not discounted/);
  assert.match(proText, /Checkout stays at the full price/);
  assert.match(proText, /corresponding GST to your original payment method/);
  assert.match(proText, /No clean abstract, employment, demerit or insurance outcome is promised/);
  assert.equal(pro.querySelector('a.cta').getAttribute('href'), '/submit-ticket?ticket_type=officer_issued');
  assert.ok(pro.querySelector('a[href="/terms-of-service#pro-driver-terms"]'));

  const referral = new JSDOM(renderRefer()).window.document;
  const referralText = referral.querySelector('main').textContent;
  assert.match(referralText, /\$50 CAD for an eligible officer-ticket referral or \$20 CAD for an eligible camera-ticket referral/);
  assert.match(referralText, /referred driver receives no referral discount/);
  assert.match(referralText, /seven days after both the referred Stripe payment has settled and the Alberta file has been accepted/);
  assert.match(referralText, /30-day window/);
  assert.match(referralText, /email, phone, address, plate or Stripe customer/);
  assert.match(referralText, /legal name and address are required before the second payout/);
  assert.match(referralText, /manual Interac e-transfer/);
  assert.ok(referral.querySelector('a[href="/terms-of-service#referral-terms"]'));
  assert.ok(!schemas(referral).some(schema => schema['@type'] === 'Offer'), 'Referral rewards are not customer prices');

  const output = path.join(directory, 'targeted');
  fs.mkdirSync(path.join(output, 'photo-radar'), { recursive: true });
  fs.writeFileSync(path.join(output, 'photo-radar/index.html'), 'Existing camera snapshot stays untouched.');
  assert.equal(generateProReferralSnapshots(output), 2);
  const before = ROUTES.map(route => fs.readFileSync(path.join(output, route, 'index.html'), 'utf8'));
  generateProReferralSnapshots(output);
  assert.deepEqual(ROUTES.map(route => fs.readFileSync(path.join(output, route, 'index.html'), 'utf8')), before, 'Repeated generation is byte-for-byte deterministic');
  for (const invalid of [['portal/referrals'], ['../refer'], ['pro-drivers', 'portal/referrals'], ['refer', 'refer']]) {
    assert.throws(() => generateProReferralSnapshots(path.join(directory, 'invalid'), invalid), /Only unique public snapshot routes/);
  }
  assert.ok(!fs.existsSync(path.join(directory, 'invalid')), 'Invalid route batches write nothing');
  assert.equal(fs.readFileSync(path.join(output, 'photo-radar/index.html'), 'utf8'), 'Existing camera snapshot stays untouched.');

  const dispatched = path.join(directory, 'dispatcher');
  const selected = spawnSync(process.execPath, [path.join(ROOT, 'scripts/generate-static-snapshots.cjs'), 'pro-drivers', 'refer'], {
    cwd: ROOT, env: { ...process.env, SNAPSHOT_OUT_DIR: path.join(dispatched, 'content'), PAGE_CONTENT_DIR: path.join(directory, 'missing-cache') }, encoding: 'utf8',
  });
  assert.equal(selected.status, 0, selected.stderr);
  assert.deepEqual(fs.readdirSync(dispatched).sort(), [...ROUTES].sort(), 'Selected program routes neither fetch content nor generate unrelated snapshots');

  const sitemapPublic = path.join(directory, 'sitemap-public');
  fs.mkdirSync(path.join(sitemapPublic, 'sitemaps'), { recursive: true });
  fs.writeFileSync(path.join(sitemapPublic, 'sitemaps/sitemap-pages.xml'), '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://fabsy.ca/</loc></url><url><loc>https://fabsy.ca/blog/example-existing-post</loc><lastmod>2026-08-01</lastmod></url></urlset>');
  fs.writeFileSync(path.join(sitemapPublic, 'sitemap.xml'), 'Existing index must not change.');
  const sitemapRun = spawnSync(process.execPath, [path.join(ROOT, 'scripts/update-static-sitemap-offline.mjs')], { cwd: ROOT, env: { ...process.env, SITEMAP_PUBLIC_DIR: sitemapPublic }, encoding: 'utf8' });
  assert.equal(sitemapRun.status, 0, sitemapRun.stderr);
  const sitemap = new JSDOM(fs.readFileSync(path.join(sitemapPublic, 'sitemaps/sitemap-pages.xml'), 'utf8'), { contentType: 'text/xml' }).window.document;
  const locations = Array.from(sitemap.getElementsByTagNameNS('*', 'loc')).map(node => node.textContent);
  for (const route of ['pro-drivers', 'refer', 'photo-radar', 'fleet', 'free-ticket-check', 'terms-of-service']) assert.ok(locations.includes(`https://fabsy.ca/${route}`), `Offline sitemap includes ${route}`);
  assert.ok(locations.includes('https://fabsy.ca/blog/example-existing-post'));
  assert.equal(sitemap.getElementsByTagNameNS('*', 'lastmod')[0].textContent, '2026-08-01');
  assert.ok(!locations.some(loc => /\/(?:portal|admin|r)\//.test(loc)), 'No private or attribution routes in sitemap');
  assert.equal(fs.readFileSync(path.join(sitemapPublic, 'sitemap.xml'), 'utf8'), 'Existing index must not change.');
  const unchanged = spawnSync(process.execPath, [path.join(ROOT, 'scripts/update-static-sitemap-offline.mjs'), '--check'], { cwd: ROOT, env: { ...process.env, SITEMAP_PUBLIC_DIR: sitemapPublic }, encoding: 'utf8' });
  assert.equal(unchanged.status, 0, unchanged.stderr);
  console.log('React copy/schema/FAQ parity, metadata, program rules, private-route rejection, targeted generation and offline sitemap checks passed; checking publishing admission.');
  for (const { route, issues } of claimChecks) assert.deepEqual(issues, [], `${route}: approved public claims still pass the publishing guard`);
  console.log('Pro/referral snapshots: React copy/schema/FAQ parity, pricing/eligibility, guarded claims, private-route rejection, deterministic targeted generation and offline sitemap preservation passed.');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
