import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// A standalone loopback-only fixture: actual React Router, Chromium documents,
// File/History APIs and the receipt hook; no Supabase, Stripe, or Google calls.
const root = fileURLToPath(new URL('../', import.meta.url));
const built = await build({
  absWorkingDir: root,
  stdin: {
    resolveDir: root, loader: 'tsx',
    contents: `
      import React, { useEffect, useLayoutEffect } from 'react';
      import { createRoot } from 'react-dom/client';
      import { Link, useLocation, useNavigate } from 'react-router-dom';
      import MeasurementRouter from './src/components/MeasurementRouter';
      import { googleTagMayLoadInDocument, markGoogleTagPending } from './src/lib/measurementNavigation';
      import { getGoogleConsentChoice, setGoogleConsentChoice } from './src/lib/googleConsent';
      import { usePaidPurchaseTracking } from './src/hooks/usePaidPurchaseTracking';
      import LanguageMessages from './src/components/LanguageMessages';
      import LanguageSelector from './src/components/LanguageSelector';
      import { I18nextProvider } from 'react-i18next';
      import { LocaleContext } from './src/i18n/locale-context';
      import { locales, getLocaleInstance } from '@/i18n/config';
      const documentId = crypto.randomUUID();
      const record = value => void window.recordFixture({ documentId, ...value });
      let tagged = false;
      const fixture = window.navigationFixture = { documentId, ready: false, tagged: false, retainedSession: null };
      window.addEventListener('pageshow', event => record({ kind: 'early-pageshow', persisted: event.persisted }), true);
      function tag() {
        if (tagged || getGoogleConsentChoice() !== 'accepted' || !markGoogleTagPending(window)) return false;
        tagged = fixture.tagged = true;
        // Inert marker only. Never request or execute a Google script.
        const marker = document.createElement('script');
        marker.id = 'fabsy-google-tag'; marker.type = 'application/json'; marker.textContent = '{}';
        document.head.appendChild(marker);
        for (const method of ['pushState', 'replaceState']) {
          const original = history[method].bind(history);
          history[method] = (...args) => {
            record({ kind: 'wrapped-history', method, url: String(args[2] ?? '') });
            return original(...args);
          };
        }
        window.addEventListener('pageshow', event => record({ kind: 'google-pageshow', persisted: event.persisted, choice: getGoogleConsentChoice() }), true);
        record({ kind: 'tag-requested' });
        return true;
      }
      function Probe() {
        const location = useLocation();
        const navigate = useNavigate();
        const session = /\\/thank-you\\/?$/.test(location.pathname) ? new URLSearchParams(location.search).get('session_id') : null;
        const locale = location.pathname.startsWith('/pa/') ? 'pa' : 'en';
        const localeContext = { locale, basePath: '/thank-you', isReleased: true,
          direction: 'ltr', availableLocales: locales, intakeHandoff: null,
          setIntakeHandoff: () => {}, href: path => locale === 'en' ? path : '/pa' + path };
        usePaidPurchaseTracking(null, session);
        const privateForm = /(?:submit-ticket|free-ticket-check|fleet|portal)/.test(location.pathname);
        if (privateForm && tagged) record({ kind: 'PRIVATE-RENDER-IN-TAGGED-DOCUMENT' });
        useLayoutEffect(() => {
          fixture.navigate = navigate;
          fixture.retainedSession = session;
          fixture.state = location.state;
          fixture.ready = true;
          fixture.mayLoad = () => googleTagMayLoadInDocument(window);
          fixture.accept = () => { setGoogleConsentChoice('accepted'); return tag(); };
          fixture.decline = () => setGoogleConsentChoice('declined');
          fixture.choice = getGoogleConsentChoice;
          record({ kind: 'render', pathname: location.pathname, privateForm });
        }, [location]);
        useEffect(() => { tag(); }, [location.pathname, location.search]);
        return <main>
          <p data-testid="fixture-route">{location.pathname}</p>
          {privateForm ? <input aria-label="Synthetic private field" defaultValue="SYNTHETIC ONLY" /> : <p>Public fixture</p>}
          {session ? <I18nextProvider i18n={getLocaleInstance(locale)}><LocaleContext.Provider value={localeContext}>
            <div id="language-messages"><LanguageMessages /><LanguageSelector /></div>
          </LocaleContext.Provider></I18nextProvider> : null}
          <Link id="private-link" to="/submit-ticket">Private form</Link>
          <Link id="public-link" to="/rapid-resolution">Public page</Link>
          <a id="plain-fragment" href="#SYNTHETIC-private">Fragment</a>
        </main>;
      }
      createRoot(document.getElementById('root')).render(<MeasurementRouter><Probe /></MeasurementRouter>);
    `,
  },
  bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', logLevel: 'silent',
  define: { 'import.meta.env': JSON.stringify({ PROD: false }), 'process.env.NODE_ENV': '"production"' },
  // Only replace Vite's import.meta.glob loader. The actual language switch
  // components, locale policy, English/Punjabi strings and Router are exercised.
  plugins: [{ name: 'fixture-locale-loader', setup(builder) {
    builder.onResolve({ filter: /^@\/i18n\/config$/ }, () => ({ path: 'fixture-locales', namespace: 'fixture-locales' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture-locales' }, () => ({ resolveDir: root, contents: `
      import english from './src/i18n/locales/en.json';
      import punjabi from './src/i18n/locales/pa.json';
      import registry from './src/i18n/locales.json';
      import review from './src/i18n/review-status.json';
      import { createLocaleInstance } from './src/i18n/instance';
      export { registry, review };
      export const locales = registry.locales.filter(item => ['en', 'pa'].includes(item.code));
      const instances = new Map(locales.map(item => [item.code, createLocaleInstance(item.code, english,
        item.code === 'pa' ? punjabi : english, ['en', 'pa'], {})]));
      export const getLocaleInstance = locale => instances.get(locale);
      export const loadLocale = async locale => instances.get(locale);
    ` }));
  } }],
});
const documentRequests = [];
const server = createServer((req, res) => {
  if (req.url === '/api/language') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"locale":"pa"}');
    return;
  }
  if (req.url === '/fixture.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(built.outputFiles[0].text);
    return;
  }
  documentRequests.push({ url: req.url, referrer: req.headers.referer || '' });
  // No referrer response header here: verify the navigation boundary's fallback
  // meta policy independently of the production Pages/header protection.
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--disable-back-forward-cache'] });
  const context = await browser.newContext();
  const unexpectedRequests = [];
  const audit = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    unexpectedRequests.push(route.request().url());
    return route.abort();
  });
  await context.exposeBinding('recordFixture', (_source, entry) => { audit.push(entry); });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  async function ready(previousId) {
    try {
      await page.waitForFunction(id => window.navigationFixture?.ready &&
        (!id || window.navigationFixture.documentId !== id), previousId);
    } catch (error) {
      error.message += '\nSynthetic fixture diagnostics: ' + JSON.stringify({ errors, url: page.url() });
      throw error;
    }
    return page.evaluate(() => ({
      id: window.navigationFixture.documentId,
      tagged: window.navigationFixture.tagged,
      eligible: window.navigationFixture.mayLoad(),
      session: window.navigationFixture.retainedSession,
      href: location.href,
    }));
  }
  async function move(target, expectedPath) {
    const previous = await page.evaluate(() => window.navigationFixture.documentId);
    await page.evaluate(to => window.navigationFixture.navigate(to), target);
    const next = await ready(previous);
    if (expectedPath) assert.equal(new URL(next.href).pathname, expectedPath);
    return next;
  }

  await page.goto(origin + '/');
  const initial = await ready();
  await page.evaluate(() => window.navigationFixture.accept());
  const privatePage = await move('/submit-ticket', '/submit-ticket');
  assert.notEqual(privatePage.id, initial.id);
  assert.equal(privatePage.tagged, false);
  assert.equal(privatePage.eligible, false);
  assert.equal(audit.some(e => e.documentId === initial.id && e.kind === 'wrapped-history' && /submit-ticket/.test(e.url)), false);

  const fileResult = await page.evaluate(async () => {
    const id = window.navigationFixture.documentId;
    const image = new File(['SYNTHETIC FILE CONTENT'], 'synthetic-ticket.png', { type: 'image/png' });
    window.navigationFixture.navigate('/pa/submit-ticket', { state: { ticketImage: image, driverAccount: 'حساب تجريبي' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    const state = window.navigationFixture.state;
    return { oldId: id, id: window.navigationFixture.documentId, isFile: state.ticketImage instanceof File,
      text: await state.ticketImage.text(), name: state.ticketImage.name, account: state.driverAccount };
  });
  assert.equal(fileResult.id, fileResult.oldId);
  assert.equal(fileResult.isFile, true);
  assert.equal(fileResult.text, 'SYNTHETIC FILE CONTENT');
  assert.equal(fileResult.name, 'synthetic-ticket.png');
  assert.equal(fileResult.account, 'حساب تجريبي');
  await page.goBack();
  await page.waitForURL(origin + '/submit-ticket');
  assert.equal((await ready()).id, privatePage.id);

  const publicPage = await move('/rapid-resolution', '/rapid-resolution');
  assert.notEqual(publicPage.id, privatePage.id);
  assert.equal(documentRequests.findLast(r => r.url === '/rapid-resolution')?.referrer, '');
  await page.waitForFunction(() => window.navigationFixture.tagged);
  const fragmentPage = await move('/rapid-resolution#SYNTHETIC-private', '/rapid-resolution');
  assert.equal(fragmentPage.href, origin + '/rapid-resolution#SYNTHETIC-private');
  assert.equal(fragmentPage.tagged, false);
  assert.equal(fragmentPage.eligible, false);
  assert.ok(documentRequests.some(r => r.url === '/rapid-resolution?__fabsy_document=1'));
  assert.equal(audit.some(e => e.documentId === publicPage.id && e.kind === 'wrapped-history' && /SYNTHETIC-private/.test(e.url)), false);
  await move('/rapid-resolution', '/rapid-resolution');
  await page.waitForFunction(() => window.navigationFixture.tagged);
  const beforeAnchor = await page.evaluate(() => window.navigationFixture.documentId);
  await page.locator('#plain-fragment').click();
  const anchorPage = await ready(beforeAnchor);
  assert.equal(anchorPage.href, origin + '/rapid-resolution#SYNTHETIC-private');
  assert.equal(anchorPage.tagged, false);

  await page.goto(origin + '/thank-you?session_id=cs_live_SYNTHETICfirst');
  await page.waitForURL(origin + '/thank-you');
  const receipt = await ready();
  await page.locator('#language-messages p button').waitFor();
  assert.equal(receipt.session, 'cs_live_SYNTHETICfirst');
  assert.equal(await page.evaluate(() => Array.from(document.querySelectorAll('*')).some(element =>
    Array.from(element.attributes).some(attribute => attribute.value.includes('cs_live_SYNTHETICfirst')))), false);
  assert.equal(await page.evaluate(() => document.body.textContent.includes('cs_live_SYNTHETICfirst')), false);
  assert.equal(await page.evaluate(() => JSON.stringify(history.state).includes('cs_live_SYNTHETICfirst')), false);
  await page.evaluate(() => window.navigationFixture.accept());
  assert.equal((await ready()).id, receipt.id);
  assert.equal((await ready()).session, receipt.session);
  await page.locator('#language-messages p button').click();
  const localizedReceipt = await ready(receipt.id);
  await page.waitForURL(origin + '/pa/thank-you');
  assert.equal(localizedReceipt.session, receipt.session);
  assert.equal(await page.evaluate(() => Array.from(document.querySelectorAll('*')).some(element =>
    Array.from(element.attributes).some(attribute => attribute.value.includes('cs_live_SYNTHETICfirst')))), false);
  assert.equal(audit.some(e => e.documentId === receipt.id && e.kind === 'wrapped-history' && /SYNTHETICfirst/.test(e.url)), false);
  const secondReceipt = await move('/thank-you?session_id=cs_live_SYNTHETICsecond', '/thank-you');
  await page.waitForURL(origin + '/thank-you');
  assert.equal(secondReceipt.session, 'cs_live_SYNTHETICsecond');
  assert.notEqual(secondReceipt.id, localizedReceipt.id);
  assert.equal(audit.some(e => e.documentId === localizedReceipt.id && e.kind === 'wrapped-history' && /SYNTHETICsecond/.test(e.url)), false);

  await page.goto(origin + '/rapid-resolution');
  await ready();
  await page.waitForFunction(() => window.navigationFixture.tagged);
  const taggedBeforeBack = await page.evaluate(() => window.navigationFixture.documentId);
  await move('/submit-ticket', '/submit-ticket');
  await page.evaluate(() => window.navigationFixture.decline());
  await page.goBack();
  await page.waitForURL(origin + '/rapid-resolution');
  await ready();
  assert.equal(await page.evaluate(() => window.navigationFixture.choice()), 'declined');
  assert.equal(await page.evaluate(() => window.navigationFixture.tagged), false);
  assert.equal(audit.some(e => e.documentId === taggedBeforeBack && e.kind === 'google-pageshow' && e.choice !== 'accepted'), false);

  assert.equal(audit.some(e => e.kind === 'PRIVATE-RENDER-IN-TAGGED-DOCUMENT'), false);
  assert.deepEqual(unexpectedRequests, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({
    passed: true, realDocumentNavigations: documentRequests.filter(r => r.url !== '/favicon.ico').length,
    privateFileHandoff: true, receiptMemoryAfterScrub: true, receiptLanguageBannerHasNoTokenAttributes: true,
    receiptLanguageSwitchRetainsSession: true, wrappedHistoryLeak: false,
    privateRenderInTaggedDocument: false, externalRequests: unexpectedRequests.length,
    bfcacheObserved: audit.some(e => e.kind === 'early-pageshow' && e.persisted),
  }, null, 2));
  await context.close();
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
