import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Run against an enabled Vite build. Every request is fulfilled locally or
// aborted: no visitor records, vendor events, uploads or payments are created.
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.resolve(root, process.env.MEASUREMENT_TEST_DIST || 'dist');
const output = process.env.MEASUREMENT_TEST_OUTPUT;
const browser = await chromium.launch({ headless: true });
const results = [];
const contentTypes = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };
const campaign = '?utm_source=meta&utm_medium=paid_social&utm_campaign=rr_ab_multilingual_20260906&utm_content=pa_rr_v1&fbclid=SYNTHETIC_ONLY';

async function fixture(reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion });
  const events = [];
  const vendorLoads = [];
  const ticketTransfers = [];
  await context.route('**/*', async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === '/functions/v1/ocr-ticket' || url.pathname.startsWith('/storage/v1/')) ticketTransfers.push(url.pathname);
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
  return { context, page: await context.newPage(), events, vendorLoads, ticketTransfers };
}

try {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const f = await fixture(reducedMotion);
    try {
      await f.page.goto('https://fabsy.ca/');
      const marquee = f.page.locator('.client-reviews');
      await marquee.waitFor();
      // The lazy route can commit before its stylesheet finishes loading.
      await f.page.waitForFunction(() => {
        const track = document.querySelector('.client-reviews-track');
        return track && getComputedStyle(track).display === 'flex';
      });
      const original = marquee.locator('.client-reviews-group:not([aria-hidden])');
      assert.equal(await original.locator('li').count(), 3, 'Three original client reviews are exposed to assistive technology');
      assert.equal(await marquee.locator('.client-reviews-group[aria-hidden="true"] li').count(), 3, 'Animation duplicates are hidden from assistive technology');
      const track = marquee.locator('.client-reviews-track');
      if (reducedMotion === 'reduce') {
        assert.equal(await track.evaluate(el => getComputedStyle(el).animationName), 'none');
        assert.equal(await marquee.getByRole('button', { name: 'Pause reviews' }).count(), 0);
        for (const review of await original.locator('li').all()) {
          assert.ok(await review.isVisible());
          const box = await review.boundingBox();
          assert.ok(box.x >= 0 && box.x + box.width <= 391, 'Every reduced-motion review fits the mobile viewport');
        }
      } else {
        await marquee.getByRole('button', { name: 'Pause reviews' }).click();
        assert.equal(await marquee.getAttribute('data-paused'), 'true');
        assert.equal(await track.evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
        await marquee.getByRole('button', { name: 'Play reviews' }).click();
        assert.equal(await marquee.getAttribute('data-paused'), 'false');
        await f.page.mouse.move(0, 0);
        await f.page.evaluate(() => document.activeElement?.blur());
        assert.equal(await track.evaluate(el => getComputedStyle(el).animationPlayState), 'running');
      }
      assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Reviews do not cause mobile horizontal overflow');
      results.push({ scenario: 'Client reviews mobile accessibility', reducedMotion, status: 'pass' });
      console.log(`Client reviews ${reducedMotion}: accessible reviews, motion control and mobile width pass`);
    } finally { await f.context.close(); }
  }
  for (const choice of ['accepted', 'declined']) {
    const f = await fixture();
    try {
      const photoCampaign = '?utm_source=google&utm_medium=cpc&utm_campaign=rr_google_profit_20260913&utm_content=en_rsa_v1&utm_term=photo_radar';
      await f.page.goto('https://fabsy.ca/photo-radar' + photoCampaign);
      await f.page.locator('[data-google-consent-choice="accepted"]').waitFor();
      assert.equal(f.events.length, 0, 'Photo Radar sends no consented funnel events before a choice');
      assert.equal(f.vendorLoads.length, 0, 'Photo Radar loads no vendors before a choice');
      if (choice === 'accepted') await f.page.goto('https://fabsy.ca/rapid-resolution' + photoCampaign);
      await f.page.locator(`[data-google-consent-choice="${choice}"]`).click();
      if (choice === 'accepted') {
        const rrHero = f.page.locator('main [data-funnel-action="primary_cta"][data-funnel-position="hero"]').first();
        await rrHero.scrollIntoViewIfNeeded();
        for (let i = 0; i < 50 && !f.events.some(e => e.eventName === 'primary_cta_viewed' && e.pageKey === 'rapid_resolution' && e.position === 'hero'); i++) await new Promise(r => setTimeout(r, 20));
        assert.ok(f.events.some(e => e.eventName === 'landing_view' && e.pageKey === 'rapid_resolution'));
        assert.ok(f.events.some(e => e.eventName === 'primary_cta_viewed' && e.pageKey === 'rapid_resolution' && e.position === 'hero'));
        await f.page.goto('https://fabsy.ca/photo-radar');
      }
      const hero = f.page.locator('main [data-funnel-action="primary_cta"][data-funnel-position="hero"]');
      await hero.scrollIntoViewIfNeeded();
      if (choice === 'accepted') {
        for (let i = 0; i < 50 && !f.events.some(e => e.eventName === 'primary_cta_viewed' && e.pageKey === 'photo_radar' && e.position === 'hero'); i++) await new Promise(r => setTimeout(r, 20));
        assert.ok(f.events.some(e => e.eventName === 'primary_cta_viewed' && e.pageKey === 'photo_radar' && e.position === 'hero'));
        // Use the actual visible-time timer; this fixture never sends real events.
        for (let i = 0; i < 240 && !f.events.some(e => e.eventName === 'engaged_10s' && e.pageKey === 'photo_radar'); i++) await new Promise(r => setTimeout(r, 50));
        assert.ok(f.events.some(e => e.eventName === 'engaged_10s' && e.pageKey === 'photo_radar'));
        const footer = f.page.locator('main [data-funnel-action="primary_cta"][data-funnel-position="footer"]');
        await footer.scrollIntoViewIfNeeded();
        for (let i = 0; i < 50 && !f.events.some(e => e.eventName === 'scroll_75' && e.pageKey === 'photo_radar'); i++) await new Promise(r => setTimeout(r, 20));
        assert.ok(f.events.some(e => e.eventName === 'scroll_75' && e.pageKey === 'photo_radar'));
        const firstLanding = f.events.find(e => e.eventName === 'landing_view' && e.pageKey === 'photo_radar');
        assert.equal(firstLanding?.pageKey, 'photo_radar');
        assert.equal(firstLanding.attribution.utm_campaign, 'rr_google_profit_20260913');
        // The same journey can review both offers without losing either landing.
        await f.page.goto('https://fabsy.ca/rapid-resolution');
        await f.page.locator('main [data-funnel-action="primary_cta"][data-funnel-position="hero"]').first().waitFor();
        for (let i = 0; i < 50 && !f.events.some(e => e.eventName === 'landing_view' && e.pageKey === 'rapid_resolution'); i++) await new Promise(r => setTimeout(r, 20));
        assert.ok(f.events.some(e => e.eventName === 'landing_view' && e.pageKey === 'rapid_resolution' && e.sessionId === firstLanding.sessionId));
        assert.equal(f.events.filter(e => e.eventName === 'landing_view' && e.pageKey === 'rapid_resolution').length, 1, 'RR return is deduplicated');
        await f.page.goto('https://fabsy.ca/photo-radar');
        await hero.waitFor();
        assert.equal(f.events.filter(e => e.eventName === 'landing_view' && e.pageKey === 'photo_radar').length, 1, 'Photo Radar reload is deduplicated');
      }
      const loadsBeforePrivate = f.vendorLoads.length;
      await hero.click();
      await f.page.waitForURL('https://fabsy.ca/submit-ticket?ticket_type=photo_radar');
      const localTicket = f.page.locator('input[type="file"][accept*="application/pdf"]');
      await localTicket.waitFor({ state: 'attached' });
      assert.equal(await f.page.locator('#lead-email').count(), 0, 'Camera intake starts with local ticket selection');
      await localTicket.setInputFiles({ name: 'synthetic-camera.png', mimeType: 'image/png', buffer: Buffer.from('SYNTHETIC OFFLINE TICKET') });
      await f.page.locator('#quick-consent').waitFor();
      assert.equal(await f.page.locator('#lead-email, #updates-email').count(), 0, 'Contact is requested after receipt');
      assert.equal(f.ticketTransfers.length, 0, 'Local ticket selection does not send bytes before affirmative consent and submission');
      assert.equal(f.vendorLoads.length, loadsBeforePrivate, 'No new vendor loads in private camera intake');
      assert.equal(await f.page.locator('#fabsy-google-tag, #fabsy-meta-pixel').count(), 0);
      if (choice === 'accepted') {
        const landing = f.events.find(e => e.eventName === 'landing_view');
        assert.equal(f.events.filter(e => e.eventName === 'primary_cta_click' && e.pageKey === 'photo_radar' && e.position === 'hero').length, 1, 'Pointer and click share one CTA receipt');
        assert.ok(f.events.every(e => e.sessionId === landing.sessionId));
        assert.ok(f.events.every(e => e.attribution?.utm_campaign === 'rr_google_profit_20260913'));
      } else {
        assert.equal(f.events.length, 0, 'Refused camera journey sends no consented events');
        assert.equal(f.vendorLoads.length, 0);
        assert.equal(await f.page.evaluate(() => sessionStorage.getItem('fabsy:funnel-session:v1')), null);
      }
      results.push({ scenario: `Photo Radar consent ${choice}`, status: 'pass', eventNames: [...new Set(f.events.map(e => e.eventName))] });
      console.log(`Photo Radar ${choice}: landing, engagement, CTA, consent and isolated intake pass`);
    } finally { await f.context.close(); }
  }

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

  for (const kind of ['gclid', 'gbraid', 'wbraid', 'fbclid']) {
    const f = await fixture();
    try {
      const expectedSource = kind === 'fbclid' ? 'meta' : 'google';
      const expectedMedium = kind === 'fbclid' ? undefined : 'cpc';
      await f.page.goto(`https://fabsy.ca/rapid-resolution?${kind}=SYNTHETIC_CLICK_ONLY`);
      await f.page.locator('[data-google-consent-choice="accepted"]').waitFor();
      assert.equal(f.events.length, 0, kind + ': no first-party events before consent');
      assert.equal(await f.page.evaluate(() => localStorage.getItem('fabsy_marketing_v3')), null);
      await f.page.locator('[data-google-consent-choice="accepted"]').click();
      for (let i = 0; i < 50 && !f.events.some(e => e.eventName === 'landing_view'); i++) await new Promise(r => setTimeout(r, 20));
      const landing = f.events.find(e => e.eventName === 'landing_view');
      assert.ok(landing, kind + ': landing recorded');
      assert.equal(landing.attribution?.utm_source, expectedSource);
      assert.equal(landing.attribution?.utm_medium, expectedMedium);
      assert.equal(landing.attribution?.utm_campaign, undefined, 'click IDs cannot identify a campaign label');
      assert.deepEqual(landing.clickId, { kind, value: 'SYNTHETIC_CLICK_ONLY' });
      // The funnel receipt can arrive before the consented public tag request.
      // Await that request before checking the private-document load boundary.
      for (let i = 0; i < 50 && !f.vendorLoads.some(v => v.provider === 'google'); i++) await new Promise(r => setTimeout(r, 20));
      assert.ok(f.vendorLoads.some(v => v.provider === 'google' && new URL(v.page).pathname === '/rapid-resolution'), kind + ': Google loaded on the public landing');
      const loadsBeforePrivate = f.vendorLoads.length;
      await f.page.locator('main [data-funnel-action="primary_cta"][data-funnel-position="hero"]').first().click();
      await f.page.waitForURL('https://fabsy.ca/submit-ticket');
      await f.page.locator('main').waitFor();
      const retained = await f.page.evaluate(() => JSON.parse(localStorage.getItem('fabsy_marketing_v3')));
      assert.equal(retained.attribution.utm_source, expectedSource);
      assert.equal(retained.attribution.utm_medium, expectedMedium);
      assert.equal(retained.attribution[kind], 'SYNTHETIC_CLICK_ONLY');
      assert.ok(f.events.every(e => e.sessionId === landing.sessionId));
      assert.ok(f.events.every(e => e.attribution?.utm_source === expectedSource));
      assert.equal(f.vendorLoads.length, loadsBeforePrivate, kind + ': no new vendor in private intake');
      assert.equal(await f.page.locator('#fabsy-meta-pixel, #fabsy-google-tag').count(), 0);
      if (kind === 'fbclid') assert.equal(f.vendorLoads.filter(v => v.provider === 'meta').length, 0, 'source inference cannot widen Meta tag eligibility');
      results.push({ scenario: 'Click-only landing to isolated intake', kind, source: expectedSource, medium: expectedMedium ?? null, status: 'pass' });
      console.log(kind + ': consent, inferred source, retained click and isolated intake pass');
    } finally { await f.context.close(); }
  }

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
