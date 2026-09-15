import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Run against an enabled Vite build. Every request is fulfilled locally or
// aborted: no visitor records, vendor events, uploads or payments are created.
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, process.env.MEASUREMENT_TEST_DIST || 'dist');
const output = process.env.MEASUREMENT_TEST_OUTPUT;
const browser = await chromium.launch({ headless: true });
const results = [];
const contentTypes = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };
const campaign = '?utm_source=meta&utm_medium=paid_social&utm_campaign=rr_ab_multilingual_20260906&utm_content=pa_rr_v1&fbclid=SYNTHETIC_ONLY';

async function fixture() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const events = [];
  const vendorLoads = [];
  await context.route('**/*', async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname === 'connect.facebook.net') {
      vendorLoads.push({ provider: 'meta', page: req.frame().url() });
      return route.fulfill({ contentType: 'application/javascript', body: 'window.__metaEvents=[];window.fbq.callMethod=(...args)=>window.__metaEvents.push(args);' });
    }
    if (url.hostname === 'www.googletagmanager.com') {
      vendorLoads.push({ provider: 'google', page: req.frame().url() });
      return route.fulfill({ contentType: 'application/javascript', body: '/* inert Google fixture */' });
    }
    if (url.pathname === '/functions/v1/record-funnel-event') {
      events.push(JSON.parse(req.postData()));
      return route.fulfill({ status: 202, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"accepted":true}' });
    }
    if (url.origin === 'https://fabsy.ca') {
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      const relative = req.isNavigationRequest() ? 'index.html' : url.pathname.slice(1);
      const filename = path.resolve(dist, relative);
      if (!filename.startsWith(dist + path.sep)) return route.abort();
      try { return await route.fulfill({ body: await fs.readFile(filename), contentType: contentTypes[path.extname(filename)] || 'application/octet-stream' }); }
      catch { return route.fulfill({ status: 404, body: '' }); }
    }
    return route.abort();
  });
  return { context, page: await context.newPage(), events, vendorLoads };
}

try {
  for (const landingPath of ['/about/comparison', '/content/speeding-ticket-edmonton', '/content/speeding-ticket-calgary']) {
    const f = await fixture();
    try {
      await f.page.goto(`https://fabsy.ca${landingPath}?utm_source=chatgpt.com`);
      await f.page.locator('[data-google-consent-choice="accepted"]').waitFor();
      assert.equal(f.vendorLoads.length, 0, 'AI landing is untagged before consent');
      await f.page.locator('[data-google-consent-choice="accepted"]').click();
      await f.page.waitForFunction(() => (window.dataLayer || []).some(c => c[0] === 'event' && c[1] === 'page_view'));
      const google = await f.page.evaluate(() => (window.dataLayer || []).map(c => Array.from(c)));
      const view = google.find(c => c[0] === 'event' && c[1] === 'page_view')[2];
      assert.equal(view.campaign_source, 'chatgpt.com');
      assert.equal(view.campaign_medium, 'referral');
      assert.equal(view.page_location, 'https://fabsy.ca' + landingPath);
      assert.equal(google.filter(c => c[0] === 'config' && c[1].startsWith('AW-')).length, 0);
      assert.equal(f.vendorLoads.filter(v => v.provider === 'meta').length, 0);
      await f.page.locator('a[href="/rapid-resolution"]:visible').first().click();
      await f.page.waitForURL('https://fabsy.ca/rapid-resolution');
      for (let i = 0; i < 50 && !f.events.some(e => e.eventName === 'landing_view'); i++) await new Promise(r => setTimeout(r, 20));
      const landing = f.events.find(e => e.eventName === 'landing_view');
      assert.equal(landing?.attribution.utm_source, 'chatgpt.com', 'First-party source survives public navigation');
      const loadsBeforePrivate = f.vendorLoads.length;
      await f.page.locator('main [data-funnel-action="primary_cta"][data-funnel-position="hero"]').first().click();
      await f.page.waitForURL('https://fabsy.ca/submit-ticket');
      await f.page.locator('main').waitFor();
      assert.equal(f.vendorLoads.length, loadsBeforePrivate);
      assert.equal(await f.page.locator('#fabsy-google-tag, #fabsy-meta-pixel').count(), 0);
      const retained = await f.page.evaluate(() => JSON.parse(localStorage.getItem('fabsy_marketing_v3')));
      assert.equal(retained.attribution.utm_source, 'chatgpt.com');
      assert.equal(retained.attribution.landing_page, landingPath);
      assert.ok(f.events.every(e => e.attribution?.utm_source === 'chatgpt.com'));
      assert.ok(f.events.every(e => e.sessionId === landing.sessionId));
      results.push({ scenario: 'ChatGPT guide to isolated intake', landingPath, status: 'pass' });
      console.log(landingPath + ': ChatGPT attribution, consent, GA4-only landing and private intake pass');
    } finally { await f.context.close(); }
  }

  // An Ads tag that loaded on a previously approved page must be retired when
  // opening a newly measured guide, even though both URLs are public to GA4.
  const boundary = await fixture();
  try {
    await boundary.page.goto('https://fabsy.ca/');
    await boundary.page.locator('[data-google-consent-choice="accepted"]').click();
    await boundary.page.waitForFunction(() => window.fabsyGoogleAdsInitialized === true);
    await boundary.page.locator('a[href="/content/speeding-ticket-edmonton"]').first().click();
    await boundary.page.waitForURL('https://fabsy.ca/content/speeding-ticket-edmonton');
    await boundary.page.waitForFunction(() => window.fabsyAnalyticsInitialized === true);
    assert.equal(await boundary.page.evaluate(() => Boolean(window.fabsyGoogleAdsInitialized)), false);
    const google = await boundary.page.evaluate(() => (window.dataLayer || []).map(c => Array.from(c)));
    assert.equal(google.filter(c => c[0] === 'config' && c[1].startsWith('AW-')).length, 0);
    results.push({ scenario: 'Ads document retired before GA4-only guide', status: 'pass' });
  } finally { await boundary.context.close(); }

  for (const locale of ['en', 'pa', 'tl', 'zh-hans', 'zh-hant', 'ar', 'es', 'hi']) {
    const f = await fixture();
    try {
      const prefix = locale === 'en' ? '' : '/' + locale;
      await f.page.goto('https://fabsy.ca' + prefix + '/rapid-resolution' + campaign);
      await f.page.locator('[data-google-consent-choice="accepted"]').waitFor();
      assert.equal(f.vendorLoads.length, 0, locale + ': no vendor before consent');
      assert.equal(f.events.length, 0, locale + ': no funnel event before consent');
      await f.page.locator('[data-google-consent-choice="accepted"]').click();
      await f.page.waitForFunction(() => window.__metaEvents?.some(e => e[2] === 'PageView'));
      const hero = f.page.locator('main [data-funnel-action="primary_cta"][data-funnel-position="hero"]').first();
      await hero.scrollIntoViewIfNeeded();
      await f.page.waitForFunction(() => document.querySelector('main [data-funnel-action="primary_cta"][data-funnel-position="hero"]'));
      // Poll the locally intercepted receipt, not an assumed dispatch attempt.
      for (let i = 0; i < 50 && !f.events.some(e => e.eventName === 'primary_cta_viewed' && e.position === 'hero'); i++) await new Promise(r => setTimeout(r, 20));
      assert.ok(f.events.some(e => e.eventName === 'primary_cta_viewed' && e.position === 'hero'), locale + ': lazy hero visibility');
      const landing = f.events.find(e => e.eventName === 'landing_view');
      assert.ok(landing, locale + ': landing recorded');
      assert.equal(landing.attribution.utm_content, 'pa_rr_v1');
      const queues = await f.page.evaluate(() => ({ google: (window.dataLayer || []).map(x => Array.from(x)), meta: window.__metaEvents }));
      assert.equal(queues.meta.filter(e => e[2] === 'PageView').length, 1);
      assert.equal(queues.google.find(e => e[0] === 'event' && e[1] === 'page_view')[2].campaign_content, 'pa_rr_v1');
      const loadsBeforePrivate = f.vendorLoads.length;
      await hero.click();
      await f.page.waitForURL('**/' + (prefix ? prefix.slice(1) + '/' : '') + 'submit-ticket');
      await f.page.locator('main').waitFor();
      assert.ok(f.events.some(e => e.eventName === 'primary_cta_click' && e.position === 'hero'), locale + ': CTA recorded before navigation');
      assert.equal(f.vendorLoads.length, loadsBeforePrivate, locale + ': no vendor loader in private intake');
      assert.equal(await f.page.locator('#fabsy-meta-pixel, #fabsy-google-tag').count(), 0);
      assert.equal(await f.page.evaluate(() => sessionStorage.getItem('fabsy:funnel-session:v1')), landing.sessionId);
      assert.ok(f.events.every(e => e.sessionId === landing.sessionId), locale + ': one journey across documents');
      assert.ok(f.events.every(e => e.attribution?.utm_content === 'pa_rr_v1'), locale + ': campaign survives intake');
      results.push({ locale, status: 'pass', eventNames: [...new Set(f.events.map(e => e.eventName))] });
      console.log(locale + ': consent, landing, hero view/click, GA4 campaign and isolated intake pass');
    } finally { await f.context.close(); }
  }
  const f = await fixture();
  try {
    await f.page.goto('https://fabsy.ca/pa/rapid-resolution' + campaign);
    await f.page.locator('[data-google-consent-choice="declined"]').click();
    await f.page.reload();
    await f.page.locator('main').waitFor();
    assert.equal(f.vendorLoads.length, 0);
    assert.equal(f.events.length, 0);
    results.push({ scenario: 'Punjabi refusal persists on reload', status: 'pass' });
  } finally { await f.context.close(); }
  if (output) await fs.writeFile(output, JSON.stringify({ fixture: 'inert vendors and intercepted backend; no external events', results }, null, 2) + '\n');
} finally { await browser.close(); }
