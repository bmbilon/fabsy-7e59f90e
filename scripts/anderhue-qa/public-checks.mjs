// Browser checks for the static anderhue.ca public pages: console errors
// (including Content-Security-Policy violations), layout at phone and desktop
// widths, links, the mobile menu, the N4 calculator, copy rules and metadata.
// Network access is limited to the local server; Google Fonts requests get
// an empty stylesheet so results never depend on the internet.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const PUBLIC_PAGES = [
  ['home', '/'],
  ['landlords', '/landlords'],
  ['traffic', '/traffic-tickets'],
  ['other', '/other-matters'],
  ['privacy', '/privacy'],
];

const DISCLAIMER = 'Information on this site is general and does not create a paralegal-client relationship. Representation begins only after a written retainer.';
const FABSY_CREDIT = 'Case preparation software by Fabsy, which provides no legal services and holds no client funds.';

async function publicContext(browser, origin, options = {}) {
  const context = await browser.newContext({ deviceScaleFactor: 1, serviceWorkers: 'block', ...options });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.hostname === 'fonts.googleapis.com') {
      return route.fulfill({ status: 200, contentType: 'text/css', body: '', headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    return route.abort();
  });
  return context;
}

async function open(context, url) {
  const page = await context.newPage();
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  return { page, errors };
}

export async function runPublicChecks({ browser, origin, buildDir, screenshotDir = null, log = () => {} }) {
  if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });

  // Every page at phone and desktop widths: no console or CSP errors, one h1,
  // landmarks, images with alt text, nothing wider than the viewport.
  for (const width of [360, 390, 1440]) {
    const context = await publicContext(browser, origin, { viewport: { width, height: 900 } });
    for (const [name, route] of PUBLIC_PAGES) {
      const { page, errors } = await open(context, origin + route);
      const facts = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
        h1: document.querySelectorAll('h1').length,
        main: Boolean(document.querySelector('main')),
        lang: document.documentElement.lang,
        missingAlt: [...document.images].filter(image => !image.hasAttribute('alt')).length,
        crest: [...document.querySelectorAll('header img')].some(image => image.complete && image.naturalWidth > 0),
      }));
      assert.ok(facts.scroll <= facts.inner, `${route} at ${width}px scrolls sideways (${facts.scroll} > ${facts.inner})`);
      assert.equal(facts.h1, 1, `${route} must have exactly one h1`);
      assert.ok(facts.main && facts.lang === 'en-CA' && facts.missingAlt === 0, `${route} structure ${JSON.stringify(facts)}`);
      assert.ok(facts.crest, `${route} header crest must load`);
      assert.deepEqual(errors, [], `${route} at ${width}px console errors`);
      if (screenshotDir && width !== 360) await page.screenshot({ path: path.join(screenshotDir, `public-${name}-${width}.png`), fullPage: true });
      await page.close();
    }
    await context.close();
  }
  log('public pages: layout, structure and console at 360, 390 and 1440 px');

  // Calls to action and links.
  {
    const context = await publicContext(browser, origin, { viewport: { width: 1440, height: 900 } });
    const seen = new Map();
    const ids = {};
    for (const [, route] of PUBLIC_PAGES) {
      const { page } = await open(context, origin + route);
      const data = await page.evaluate(() => ({
        links: [...document.querySelectorAll('a[href]')].map(link => link.getAttribute('href')),
        ids: [...document.querySelectorAll('[id]')].map(element => element.id),
        unnamed: [...document.querySelectorAll('a[href], button')]
          .filter(element => !(element.innerText.trim() || element.getAttribute('aria-label'))).length,
      }));
      ids[route] = new Set(data.ids);
      for (const href of data.links) if (!seen.has(href)) seen.set(href, route);
      assert.equal(data.unnamed, 0, `${route} has links or buttons without an accessible name`);
      await page.close();
    }
    for (const required of ['/start?area=landlord', '/start?area=traffic', '/start?area=other', '/files', '/sign-in', '/privacy']) {
      assert.ok(seen.has(required), `no page links to ${required}`);
    }
    for (const [href, from] of seen) {
      if (/^(tel:|mailto:)/.test(href)) {
        assert.match(href, /^tel:\+12899850166$|^mailto:hello@anderhue\.ca(\?.*)?$/, `unexpected contact link ${href} on ${from}`);
        continue;
      }
      if (href.startsWith('#')) {
        assert.ok(ids[from].has(href.slice(1)), `${from} anchor ${href} has no target`);
        continue;
      }
      assert.ok(href.startsWith('/'), `external or relative link ${href} on ${from}`);
      const url = new URL(href, origin);
      const response = await fetch(url);
      const body = await response.text();
      assert.equal(response.status, 200, `${href} (from ${from})`);
      if (/^\/(start|files|sign-in)/.test(url.pathname)) assert.ok(body.includes('id="root"'), `${href} must load an app shell`);
      if (url.hash && ids[url.pathname]) assert.ok(ids[url.pathname].has(url.hash.slice(1)), `${href} anchor missing on target`);
    }
    for (const asset of ['/robots.txt', '/sitemap.xml', '/og-image.png', '/site.js', '/public.css', '/favicon-32.png',
      '/apple-touch-icon.png', '/crest-mark.png', '/crest-mark.webp', '/crest-mark-gold.webp', '/crest-email.png']) {
      assert.equal((await fetch(origin + asset)).status, 200, `${asset} must be deployed`);
    }
    await context.close();
    log(`public pages: ${seen.size} links and the deployed assets resolve`);
  }

  // Mobile menu: opens, moves focus inside, closes on Escape and returns focus.
  {
    const context = await publicContext(browser, origin, { viewport: { width: 390, height: 844 } });
    const { page, errors } = await open(context, `${origin}/landlords`);
    const toggle = page.locator('.menu-toggle');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await toggle.click();
    await page.waitForFunction(() => document.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'true');
    await page.waitForFunction(() => Boolean(document.activeElement && document.activeElement.closest('#site-menu')));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'false');
    assert.ok(await page.evaluate(() => document.activeElement === document.querySelector('.menu-toggle')), 'focus returns to the menu button');
    assert.deepEqual(errors, []);
    await context.close();
    log('public pages: mobile menu');
  }

  // N4 calculator: same dates as the original landlords page for known cases.
  {
    const context = await publicContext(browser, origin, { viewport: { width: 1440, height: 900 } });
    const { page } = await open(context, `${origin}/landlords`);
    const read = ([date, period, method]) => page.evaluate(([d, p, m]) => {
      const radio = document.querySelector(`input[name="method"][value="${m}"]`);
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      const select = document.getElementById('period');
      select.value = p;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      const input = document.getElementById('svc-date');
      input.value = d;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return ['o-deem', 'o-term', 'o-file'].map(id => document.getElementById(id).textContent);
    }, [date, period, method]);
    assert.deepEqual(await read(['2026-09-15', 'month', 'hand']), ['Tue, Sep 15', 'Tue, Sep 29  (14 days)', 'Wed, Sep 30']);
    assert.deepEqual(await read(['2026-10-01', 'month', 'mail']), ['Tue, Oct 6  (+5, mail)', 'Tue, Oct 13  (7 days)', 'Wed, Oct 14']);
    assert.deepEqual(await read(['2026-09-20', 'week', 'box']), ['Sun, Sep 20', 'Sun, Sep 27  (7 days)', 'Mon, Sep 28']);
    await context.close();
    log('public pages: N4 calculator dates');
  }

  // Copy rules and metadata in the deployed files.
  const files = readdirSync(buildDir).filter(file => /\.(html|css|js|txt|xml)$/.test(file) && !/^(client|portal)\.html$/.test(file));
  for (const file of files) {
    const text = readFileSync(path.join(buildDir, file), 'utf8');
    assert.ok(!text.includes('—'), `${file} contains an em dash`);
    assert.ok(!/info@onlineparalegals\.ca/.test(text), `${file} still mentions info@onlineparalegals.ca`);
    assert.ok(!/P#####|licence number pending|LSO #/i.test(text), `${file} mentions a licence number placeholder`);
    if (!['landlords.html', 'privacy.html'].includes(file)) assert.ok(!/fabsy/i.test(text), `${file} mentions Fabsy`);
  }
  for (const file of ['landlords.html', 'privacy.html']) {
    assert.ok(readFileSync(path.join(buildDir, file), 'utf8').includes(FABSY_CREDIT), `${file} keeps the software credit`);
  }
  const titles = new Set();
  for (const file of ['index.html', 'landlords.html', 'traffic-tickets.html', 'other-matters.html', 'privacy.html']) {
    const text = readFileSync(path.join(buildDir, file), 'utf8');
    for (const needed of [DISCLAIMER, '© 2026 AnderHue Paralegal Professional Corporation', 'rel="canonical"', 'og:image', 'favicon-32.png']) {
      assert.ok(text.includes(needed), `${file} is missing ${needed}`);
    }
    titles.add(text.match(/<title>([^<]+)<\/title>/)[1]);
  }
  assert.equal(titles.size, 5, 'page titles must be unique');
  const home = readFileSync(path.join(buildDir, 'index.html'), 'utf8');
  const jsonLd = JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(jsonLd['@type'], 'LegalService');
  assert.ok(!jsonLd.address && !jsonLd.aggregateRating, 'no address or ratings in structured data');
  const robots = readFileSync(path.join(buildDir, 'robots.txt'), 'utf8');
  for (const blocked of ['/sign-in', '/admin/', '/files', '/start']) assert.ok(robots.includes(`Disallow: ${blocked}`), `robots.txt blocks ${blocked}`);
  log('public pages: copy rules, metadata and robots');
}
