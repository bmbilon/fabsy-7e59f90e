#!/usr/bin/env node
/**
 * Isolated browser regression, never a customer/purchase test.
 * Default --offline serves an inert gtag fixture. --live-google is an explicit
 * permission to contact only the listed Google tag/collection endpoints.
 * Both modes serve unchanged application GET bytes from --dist at the real
 * production origin; all APIs, Supabase, payments and other hosts are blocked.
 * No analytics events, paid receipts, consent storage or router calls are
 * injected. Test actions use existing UI controls, synthetic text and a local
 * synthetic PDF attachment; no file or form is submitted to a service.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = fileURLToPath(new URL('../', import.meta.url));
const origin = 'https://fabsy.ca';
const defaults = { ga4: 'G-26G8CMWTKY', ads: 'AW-18419256057' };
const purchaseLabels = new Set(['MyAbCPiLj-scEPmV_s5E', 'TEo-CJH0kescEPmV_s5E']);
const consentStorageKey = 'fabsy:google-measurement-consent:v1';
// Deliberately narrower than the production policy: these are the only public
// documents this harness visits. Forms are never accepted as page context.
const testPublicPaths = new Set(['/', '/rapid-resolution', '/thank-you', '/pa/thank-you']);
const options = { live: false, dist: path.join(repo, 'dist'), artifacts: null, ...defaults, selfTest: false, pendingNavigationGuardian: false };
const args = process.argv.slice(2);
let mode;
for (let index = 0; index < args.length; index += 1) {
  const flag = args[index];
  if (flag === '--help') {
    console.log(`Usage: node scripts/test-google-measurement-network.mjs [--offline | --live-google]
  --dist DIR          Exact candidate production build (default: ./dist)
  --artifact-dir DIR  Output outside the repository (default: fresh OS temp dir)
  --expected-ga4 ID   Default ${defaults.ga4}
  --expected-ads ID   Default ${defaults.ads}
  --self-test         Offline safety-helper fixtures only; no browser or network
  --pending-navigation-guardian
                     Also hold an app navigation while another tab withdraws;
                     enable after building the persistent-consent guardian

The candidate must already be built with VITE_GOOGLE_MEASUREMENT_ENABLED=true.
The harness never builds, edits gates, submits a form, or sends a purchase.
Review artifacts before running --live-google: real anonymous Google page visits
are then expected, while service/customer/payment requests remain blocked.`);
    process.exit(0);
  } else if (flag === '--offline' || flag === '--live-google') {
    if (mode && mode !== flag) throw new Error('Choose either --offline or --live-google.');
    mode = flag; options.live = flag === '--live-google';
  } else if (flag === '--self-test') options.selfTest = true;
  else if (flag === '--pending-navigation-guardian') options.pendingNavigationGuardian = true;
  else if (['--dist', '--artifact-dir', '--expected-ga4', '--expected-ads'].includes(flag)) {
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    options[({ '--dist': 'dist', '--artifact-dir': 'artifacts', '--expected-ga4': 'ga4', '--expected-ads': 'ads' })[flag]] = value;
  } else throw new Error(`Unknown option: ${flag}`);
}
if (!/^G-[A-Z0-9]+$/.test(options.ga4) || !/^AW-\d+$/.test(options.ads)) throw new Error('Expected tag IDs are malformed.');
if (options.live && options.selfTest) throw new Error('--self-test never permits live requests.');

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const inside = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};
async function prospectiveRealpath(candidate) {
  try { return await fs.realpath(candidate); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return path.join(await prospectiveRealpath(path.dirname(candidate)), path.basename(candidate));
  }
}

function googleEndpoint(url) {
  if (url.protocol !== 'https:') return null;
  if (url.hostname === 'www.googletagmanager.com' && /^\/gtag\/(?:js|destination)$/.test(url.pathname)) return 'tag';
  if (/^(?:(?:www|region\d+)\.)?google-analytics\.com$/.test(url.hostname) && /^\/(?:g\/|j\/)?collect$/.test(url.pathname)) return 'collection';
  if (url.hostname === 'analytics.google.com' && /^\/g\/collect$/.test(url.pathname)) return 'collection';
  // Additional first-party Google transports observed in the real tag capture.
  if (url.hostname === 'www.google.com' && url.pathname === '/g/collect') return 'collection';
  if (url.hostname === 'ad.doubleclick.net' && url.pathname === '/ccm/s/collect') return 'ads';
  if (url.hostname === 'stats.g.doubleclick.net' && /^\/(?:g\/|j\/)?collect$/.test(url.pathname)) return 'collection';
  if (['www.googleadservices.com', 'googleads.g.doubleclick.net', 'www.google.com'].includes(url.hostname) && /^\/(?:pagead\/(?:1p-conversion|conversion|viewthroughconversion|1p-user-list)|ccm\/collect)(?:\/|$)/.test(url.pathname)) return 'ads';
  if (url.hostname === 'td.doubleclick.net' && /^\/td\/rul$/.test(url.pathname)) return 'ads';
  return null;
}
const googleHost = host => /(?:^|\.)(?:google(?:-analytics|adservices|tagmanager)?\.com|doubleclick\.net)$/.test(host);
const sensitiveRoute = pathname => /^\/(?:en\/|pa\/|tl\/|zh-hans\/|zh-hant\/|ar\/|hi\/|es\/)?(?:contact|submit-ticket|ticket-form|fleet|representation-consent|portal|admin)(?:\/|$)/.test(pathname);

function fieldsFrom(url, body = '') {
  const fields = {};
  const add = parameters => {
    for (const [key, value] of parameters) (fields[key] ||= []).push(value);
  };
  add(new URL(url).searchParams);
  for (const line of body.split(/\r?\n/)) if (line.includes('=')) add(new URLSearchParams(line));
  return fields;
}
function purchaseOrUserData(fields, url) {
  if ((fields.en || []).some(name => ['purchase', 'conversion', 'refund'].includes(name))) return 'purchase/conversion event';
  if ((fields.label || []).some(label => purchaseLabels.has(label))) return 'purchase conversion label';
  if (Object.keys(fields).some(key => /(?:^|\.)(?:transaction_id|user_id|email|phone_number|sha256_email_address|sha256_phone_number)$/.test(key))) return 'transaction or user-provided field';
  if ((fields.npa || []).some(value => value === '0')) return 'personalized advertising flag npa=0';
  // Enhanced-conversion payloads are not part of this test or this release.
  if ((fields.em || []).some(value => value && value !== 'tv.1')) return 'enhanced/user-provided data';
  if (/\/pagead\/(?:1p-conversion|conversion)\//.test(new URL(url).pathname) && (fields.label || []).length) return 'labelled Ads conversion';
  return null;
}
function permittedContextUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === origin && !url.username && !url.password && !url.search && !url.hash && testPublicPaths.has(url.pathname.replace(/\/$/, '') || '/');
  } catch { return false; }
}
function unsafePageContext(fields, referrer) {
  for (const key of ['dl', 'url', 'page_location']) {
    if ((fields[key] || []).some(value => !permittedContextUrl(value))) return `${key} is not a queryless permitted public Fabsy URL`;
  }
  for (const key of ['dr', 'referrer', 'page_referrer']) {
    if ((fields[key] || []).some(value => value && !permittedContextUrl(value))) return `${key} is not empty or a safe public URL`;
  }
  if (referrer && !permittedContextUrl(referrer)) return 'HTTP referrer is not empty or a safe public URL';
  for (const key of ['dt', 'page_title', 'tiba']) {
    if ((fields[key] || []).some(value => /cs_(?:test_|live_)|[\w.+-]+@[\w.-]+\.[a-z]{2,}|contact fabsy|contact us|fleet|representation.consent|ticket submission|ticket form/i.test(value))) return `${key} contains private page context or data`;
  }
  return null;
}
function decodedForms(value) {
  const values = new Set([String(value || '')]);
  let current = String(value || '');
  for (let round = 0; round < 4; round += 1) {
    try { current = decodeURIComponent(current.replaceAll('+', ' ')); values.add(current); } catch { break; }
  }
  for (const item of [...values]) {
    values.add(item.replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))));
    values.add(item.replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex, number) => String.fromCodePoint(parseInt(hex || number, hex ? 16 : 10))));
  }
  return [...values].map(item => item.toLowerCase());
}
function leakedValues(payload, needles) {
  const decoded = decodedForms(payload);
  return needles.filter(value => {
    const variants = [value, Buffer.from(value).toString('base64'), Buffer.from(value).toString('base64url'), sha256(value), sha256(value.trim().toLowerCase())].map(item => item.toLowerCase());
    return variants.some(variant => decoded.some(text => text.includes(variant)));
  });
}

function syntheticTicketPdf() {
  // A valid, blank one-page PDF exercises the supported manual-review path.
  // It contains no client data and never needs an OCR/backend request.
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\nendstream',
  ];
  let pdf = '%PDF-1.4\n% Synthetic offline fixture; never submit.\n';
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(pdf);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return { name: 'synthetic-measurement-ticket.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) };
}

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
async function applicationFile(dist, pathname, documentRequest) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').some(part => part.startsWith('.')) || /^\/(?:api|functions|rest|auth|storage|graphql)(?:\/|$)/i.test(decoded)) return null;
  let candidate = path.resolve(dist, `.${decoded}`);
  if (!inside(dist, candidate)) return null;
  try {
    const stat = await fs.stat(candidate);
    if (stat.isDirectory()) candidate = path.join(candidate, 'index.html');
    if (!(await fs.stat(candidate)).isFile()) return null;
    candidate = await fs.realpath(candidate);
    if (!inside(dist, candidate)) return null;
    return candidate;
  } catch {
    if (!documentRequest || path.extname(decoded)) return null;
    const index = await fs.realpath(path.join(dist, 'index.html'));
    return inside(dist, index) ? index : null;
  }
}
function productionHeaders(text, pathname) {
  const headers = {};
  let matches = false;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const escaped = line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
      matches = new RegExp(`^${escaped}$`).test(pathname);
    } else if (matches) {
      const split = line.indexOf(':');
      if (split > 0) headers[line.slice(0, split).trim().toLowerCase()] = line.slice(split + 1).trim();
    }
  }
  return headers;
}

if (options.selfTest) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'fabsy-network-helper-'));
  try {
    const directory = path.join(temporary, 'dist'); await fs.mkdir(directory);
    const dist = await fs.realpath(directory);
    await fs.writeFile(path.join(dist, 'index.html'), '<main>Fixture only</main>');
    await fs.writeFile(path.join(temporary, 'outside.txt'), 'Never serve');
    await fs.symlink(path.join(temporary, 'outside.txt'), path.join(dist, 'escape.txt'));
    assert.equal(await applicationFile(dist, '/contact', true), path.join(dist, 'index.html'));
    for (const target of ['/%2e%2e/outside.txt', '/escape.txt', '/%5coutside.txt', '/api/language', '/.env']) assert.equal(await applicationFile(dist, target, true), null);
    assert.equal(await applicationFile(dist, '/missing.js', false), null);
    assert.equal(googleEndpoint(new URL('https://www.googletagmanager.com/gtag/js?id=' + defaults.ga4)), 'tag');
    for (const host of ['www.googletagmanager.com.evil.invalid', 'accounts.google.com', 'docs.google.com', 'api.stripe.com']) assert.equal(googleEndpoint(new URL('https://' + host + '/gtag/js')), null);
    const secret = 'SYNTHETIC_PRIVATE_ABC@example.invalid';
    for (const value of [secret, encodeURIComponent(secret), encodeURIComponent(encodeURIComponent(secret)), Buffer.from(secret).toString('base64'), sha256(secret)]) assert.deepEqual(leakedValues(value, [secret]), [secret]);
    assert.equal(purchaseOrUserData(fieldsFrom('https://www.google-analytics.com/g/collect?en=purchase', ''), 'https://www.google-analytics.com/g/collect'), 'purchase/conversion event');
    assert.equal(purchaseOrUserData(fieldsFrom('https://www.google.com/pagead/viewthroughconversion/18419256057/?npa=1', ''), 'https://www.google.com/pagead/viewthroughconversion/18419256057/'), null);
    assert.equal(unsafePageContext({ dl: [origin + '/'], dr: [''], dt: ['Fabsy'] }, ''), null);
    for (const url of [origin + '/contact', origin + '/?gclid=test', origin + '/thank-you?session_id=cs_test_fixture', 'https://other.invalid/']) assert.ok(unsafePageContext({ dl: [url] }, ''));
    assert.ok(unsafePageContext({ dr: [origin + '/fleet'] }, ''));
    assert.ok(unsafePageContext({ tiba: ['Contact Fabsy'] }, ''));
    assert.deepEqual(productionHeaders('/*\n  Referrer-Policy: no-referrer\n/faq\n  X-Robots-Tag: index, follow', '/contact'), { 'referrer-policy': 'no-referrer' });
    console.log(JSON.stringify({ status: 'passed', mode: 'offline-helper-fixtures', browserLaunched: false, externalRequests: 0 }));
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
  process.exit(0);
}

const dist = await fs.realpath(path.resolve(options.dist)).catch(() => { throw new Error('Build the candidate first, or supply --dist. This harness never builds or enables a source gate.'); });
await fs.access(path.join(dist, 'index.html'));
const artifactCandidate = options.artifacts ? path.resolve(options.artifacts) : await fs.mkdtemp(path.join(os.tmpdir(), 'fabsy-google-network-'));
const artifacts = await prospectiveRealpath(artifactCandidate);
if (inside(await fs.realpath(repo), artifacts)) throw new Error('--artifact-dir must be outside the repository.');
await fs.mkdir(artifacts, { recursive: true });
const headersText = await fs.readFile(path.join(dist, '_headers'), 'utf8').catch(() => '');
const indexHtml = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
const assetHashes = [];
async function inventory(directory) {
  for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) await inventory(candidate);
    else if (entry.isFile()) assetHashes.push({ path: path.relative(dist, candidate), sha256: sha256(await fs.readFile(candidate)) });
  }
}
await inventory(dist);
const buildIdentity = { dist, fileCount: assetHashes.length, treeSha256: sha256(JSON.stringify(assetHashes)), indexSha256: sha256(indexHtml), headersSha256: sha256(headersText) };
await fs.writeFile(path.join(artifacts, 'build-files.json'), JSON.stringify(assetHashes, null, 2));

const nonce = crypto.randomBytes(5).toString('hex');
const privateValues = [
  `FabsyPrivate${nonce}`,
  `fabsy.private.${nonce}@example.invalid`,
  `PRIVATE-NOTES-${nonce}`,
  `FT${nonce}`,
  `403555${String(parseInt(nonce, 16) % 10000).padStart(4, '0')}`,
];
const receiptToken = `cs_test_FabsyNetworkFixture${nonce}`;
const requests = []; const documentEvents = []; const checks = []; const failures = []; const contexts = [];
let activeScenario = 'setup'; let sequence = 0; let browser;
const requestMap = new WeakMap();
const pageInfo = new WeakMap();
const frameDocumentIds = new WeakMap();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, description, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { if (await predicate()) return; }
    catch (error) {
      // Withdrawal deliberately destroys the old JavaScript context. A read
      // racing that transition is not an application assertion failure.
      if (!/Execution context was destroyed|Cannot find context|Frame was detached/i.test(error.message)) throw error;
    }
    await pause(100);
  }
  throw new Error(`Timed out: ${description}`);
}
const collection = row => ['collection', 'ads'].includes(row.endpoint);
const pageView = row => row.fields?.tid?.includes(options.ga4) && row.fields?.en?.includes('page_view');

function attachPage(page, scope) {
  if (pageInfo.has(page)) return pageInfo.get(page);
  const info = { id: `page-${++sequence}`, documentId: null, scope };
  pageInfo.set(page, info);
  page.on('pageerror', error => documentEvents.push({ kind: 'pageerror', page: info.id, scenario: activeScenario, message: error.message }));
  return info;
}
async function isolatedContext({ holdLoader = false, locale = 'en-CA' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale, serviceWorkers: 'block', acceptDownloads: false });
  context.setDefaultTimeout(15000);
  context.setDefaultNavigationTimeout(20000);
  const scope = { context, holdLoader, pendingRoutes: [], pendingDocuments: [], holdDocumentPaths: new Set(), optedIn: false };
  contexts.push(scope);
  context.on('page', page => attachPage(page, scope));
  await context.exposeBinding('__fabsyNetworkObserve', ({ page, frame }, event) => {
    const info = attachPage(page, scope);
    const mainFrame = frame === page.mainFrame();
    if (event.kind === 'document') {
      frameDocumentIds.set(frame, event.documentId);
      if (mainFrame) info.documentId = event.documentId;
    }
    documentEvents.push({ ...event, page: info.id, mainFrame, scenario: activeScenario, observedAt: Date.now() });
  });
  await context.addInitScript(() => {
    const documentId = crypto.randomUUID();
    Object.defineProperty(window, '__fabsyNetworkDocumentId', { value: documentId });
    const record = event => { void window.__fabsyNetworkObserve({ ...event, documentId, href: location.href, time: Date.now() }).catch(() => {}); };
    record({ kind: 'document' });
    for (const method of ['pushState', 'replaceState']) {
      const original = history[method];
      history[method] = function (...args) {
        let state; try { state = JSON.stringify(args[0]); } catch { state = '[unserializable]'; }
        record({ kind: 'native-history', method, url: args[2] == null ? null : String(args[2]), state });
        return original.apply(this, args);
      };
    }
    addEventListener('pageshow', event => record({ kind: 'pageshow', persisted: event.persisted }), true);
    addEventListener('pagehide', event => record({ kind: 'pagehide', persisted: event.persisted }), true);
    addEventListener('submit', event => { event.preventDefault(); event.stopImmediatePropagation(); record({ kind: 'blocked-form-submit' }); }, true);
    for (const method of ['submit', 'requestSubmit']) HTMLFormElement.prototype[method] = function () { record({ kind: 'blocked-form-submit', method }); throw Error('Harness prohibits form submission'); };
    let recordedPrivate = false;
    let recordedBlocked = false;
    const observer = new MutationObserver(() => {
      if (!recordedBlocked && document.querySelector('main[aria-busy="true"]')) {
        recordedBlocked = true; record({ kind: 'blocked-dom' });
      }
      if (!recordedPrivate && document.querySelector('#lead-email, #lead-phone, #ticketNumber, #firstName, #fleet-company, form #message, form input[type="file"][accept*="application/pdf"]')) {
        recordedPrivate = true; record({ kind: 'private-dom', tagPresent: Boolean(document.getElementById('fabsy-google-tag')) });
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  context.on('request', request => {
    let info; let frame;
    try { frame = request.frame(); info = attachPage(frame.page(), scope); } catch { /* Worker/service requests are still blocked below. */ }
    const headers = request.headers();
    const row = { id: ++sequence, scenario: activeScenario, startedAt: Date.now(), page: info?.id || null, documentId: info?.documentId || null, frameDocumentId: frame ? frameDocumentIds.get(frame) || null : null, url: request.url(), method: request.method(), resourceType: request.resourceType(), navigation: request.isNavigationRequest(), postData: request.postData() || '', referrer: headers.referer || '', responseStatus: null, forwarded: false };
    row.fields = fieldsFrom(row.url, row.postData);
    requestMap.set(request, row); requests.push(row);
  });
  context.on('response', response => { const row = requestMap.get(response.request()); if (row) row.responseStatus = response.status(); });
  context.on('requestfailed', request => { const row = requestMap.get(request); if (row) row.failure = request.failure()?.errorText || 'failed'; });
  await context.route('**/*', async route => {
    const request = route.request(); const row = requestMap.get(request); const url = new URL(request.url());
    const endpoint = googleEndpoint(url); if (row) row.endpoint = endpoint;
    const payload = `${request.url()}\n${request.postData() || ''}\n${request.headers().referer || ''}`;
    const privateLeaks = leakedValues(payload, privateValues);
    const reject = async reason => {
      if (row) row.disposition = reason;
      await route.fulfill({ status: 503, headers: { 'content-type': 'application/json', 'access-control-allow-origin': origin, 'access-control-allow-headers': '*' }, body: JSON.stringify({ success: false, error: 'Blocked by isolated measurement harness' }) }).catch(() => {});
    };
    if (privateLeaks.length) { if (row) row.privateLeaks = privateLeaks; return reject('blocked-private-data'); }
    if (url.origin === origin && request.method() === 'GET') {
      const file = await applicationFile(dist, url.pathname, request.isNavigationRequest());
      if (!file) return reject('blocked-app-api-or-missing-asset');
      const fulfillApplication = async () => route.fulfill({ status: 200, headers: { 'content-type': mime[path.extname(file)] || 'application/octet-stream', ...productionHeaders(headersText, url.pathname) }, body: await fs.readFile(file) });
      if (request.isNavigationRequest() && scope.holdDocumentPaths.has(url.pathname)) {
        if (row) row.disposition = 'held-app-document';
        return new Promise(resolve => scope.pendingDocuments.push(async (release = false) => {
          if (release) {
            if (row) row.disposition = 'held-app-document-released-local-dist';
            await fulfillApplication().catch(() => {});
          } else await route.abort('aborted').catch(() => {});
          resolve();
        }));
      }
      if (row) row.disposition = 'local-dist';
      return fulfillApplication();
    }
    if (!endpoint || !['GET', 'POST', 'OPTIONS'].includes(request.method())) return reject(googleHost(url.hostname) ? 'blocked-unlisted-google-endpoint' : 'blocked-external-service');
    if (leakedValues(payload, [receiptToken]).length || /cs_(?:test_|live_)[A-Za-z0-9]+/.test(decodedForms(payload).join('\n'))) return reject('blocked-google-receipt-token');
    const unsafe = purchaseOrUserData(row.fields, request.url());
    if (unsafe) { if (row) row.safetyReason = unsafe; return reject('blocked-google-purchase-or-personal-data'); }
    const unsafeContext = unsafePageContext(row.fields, row.referrer);
    if (unsafeContext) { if (row) row.safetyReason = unsafeContext; return reject('blocked-google-unsafe-page-context'); }
    if (!scope.optedIn) return reject('blocked-google-before-explicit-choice');
    if (endpoint === 'tag' && ![options.ga4, options.ads].includes(url.searchParams.get('id'))) return reject('blocked-unexpected-tag-id');
    if (endpoint === 'tag' && scope.holdLoader) {
      if (row) row.disposition = 'held-loader';
      return new Promise(resolve => scope.pendingRoutes.push(async () => { await route.abort('aborted').catch(() => {}); resolve(); }));
    }
    if (!options.live) {
      if (row) row.disposition = 'offline-inert-google-fixture';
      return route.fulfill({ status: endpoint === 'tag' ? 200 : 204, contentType: endpoint === 'tag' ? 'text/javascript' : 'text/plain', body: endpoint === 'tag' ? '/* Inert offline fixture: no Google code, no event injections. */' : '' });
    }
    if (row) { row.disposition = 'live-google-only'; row.forwarded = true; }
    return route.continue();
  });
  if (typeof context.routeWebSocket === 'function') await context.routeWebSocket('**', socket => { documentEvents.push({ kind: 'blocked-websocket', url: socket.url(), scenario: activeScenario }); socket.close(); });
  return scope;
}

async function ready(page, pathname) {
  await page.waitForURL(url => url.origin === origin && url.pathname === pathname, { timeout: 20000 });
  await page.locator('[data-google-consent-controls]').waitFor({ state: 'attached' });
  return page.evaluate(() => ({ id: window.__fabsyNetworkDocumentId, href: location.href, referrer: document.referrer, tag: Boolean(document.getElementById('fabsy-google-tag')) }));
}
async function go(page, pathname) { await page.goto(origin + pathname, { waitUntil: 'domcontentloaded', timeout: 20000 }); return ready(page, new URL(origin + pathname).pathname); }
async function actualLink(page, pathname) {
  const links = page.locator(`a[href="${pathname}"]`);
  assert.ok(await links.count(), `Expected an existing app link to ${pathname}; the harness never injects navigation links`);
  for (const link of await links.all()) {
    if (await link.isVisible()) { await link.click(); return ready(page, pathname); }
  }
  throw new Error(`No visible app link to ${pathname}`);
}
async function choose(page, scope, choice) {
  if (!(await page.locator('[data-google-consent-panel]').count())) await page.getByRole('button', { name: 'Privacy choices', exact: true }).click();
  if (choice === 'accepted') scope.optedIn = true;
  else scope.optedIn = false;
  await page.locator(`[data-google-consent-choice="${choice}"]`).click();
}
async function tagged(page) {
  await page.locator('#fabsy-google-tag').waitFor({ state: 'attached', timeout: 20000 });
  await until(() => page.evaluate(ga4 => (window.dataLayer || []).some(item => item?.[0] === 'event' && item?.[1] === 'page_view' && item?.[2]?.send_to === ga4), options.ga4), 'real app queued page_view after tag load');
  const details = await page.evaluate(() => ({ id: window.__fabsyNetworkDocumentId, href: location.href, commands: (window.dataLayer || []).filter(item => item?.[0] === 'config' || item?.[0] === 'consent').map(item => Array.from(item)) }));
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null')?.choice, consentStorageKey), 'accepted', 'A tag must follow a real durable UI opt-in');
  for (const id of [options.ga4, options.ads]) assert.ok(details.commands.some(command => command[0] === 'config' && command[1] === id), `Candidate must configure expected ${id}; check its built gate/config, do not patch the harness origin`);
  const consentKeys = ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'];
  const defaultsAt = details.commands.findIndex(command => command[0] === 'consent' && command[1] === 'default' && consentKeys.every(key => command[2]?.[key] === 'denied'));
  const acceptedAt = details.commands.findIndex(command => command[0] === 'consent' && command[1] === 'update' && consentKeys.every(key => command[2]?.[key] === (key === 'ad_personalization' ? 'denied' : 'granted')));
  assert.ok(defaultsAt >= 0 && acceptedAt > defaultsAt, 'All four consent defaults must be denied before three measurement grants, with personalization still denied');
  if (options.live) await until(() => requests.some(row => row.documentId === details.id && row.forwarded && [200, 204].includes(row.responseStatus) && pageView(row)), 'successful actual Google page_view response (200/204) with expected GA4 ID');
  return details;
}
async function untagged(page, documentId, observationMs = 1000) {
  await pause(observationMs);
  assert.equal(await page.locator('#fabsy-google-tag').count(), 0, 'Private/declined document must have no Google tag');
  assert.equal(requests.filter(row => row.documentId === documentId && row.endpoint).length, 0, 'Private/declined document made a Google request');
}
async function fillPrivate(page, pathname) {
  if (pathname === '/contact') { await page.locator('#name').fill(privateValues[0]); await page.locator('#email').fill(privateValues[1]); await page.locator('#message').fill(privateValues[2]); }
  else if (pathname === '/submit-ticket') {
    // Exercise the supported upload and current early lead-capture UI while all
    // service requests stay blocked. Never cross the lead-save boundary.
    await page.locator('form input[type="file"][accept*="application/pdf"]').setInputFiles(syntheticTicketPdf());
    await page.locator('#lead-email').waitFor({ state: 'visible' });
    await page.locator('#lead-email').fill(privateValues[1]);
    await page.locator('#lead-phone').fill(privateValues[4]);
  }
  else if (pathname === '/fleet') { await page.locator('#fleet-company').fill(privateValues[0]); await page.locator('#fleet-email').fill(privateValues[1]); await page.locator('#fleet-notes').fill(privateValues[2]); }
}
function safeOldDocument(documentId, target) {
  assert.equal(documentEvents.filter(event => event.documentId === documentId && event.kind === 'private-dom').length, 0, 'Private form DOM reached the old Google-touched document');
  const exposed = documentEvents.filter(event => event.documentId === documentId && event.kind === 'native-history' && event.url && sensitiveRoute(new URL(event.url, origin).pathname));
  assert.deepEqual(exposed, [], `Private ${target} target reached native history in the old document`);
}
async function checkpoint(name, action) {
  activeScenario = name; const startedAt = Date.now();
  try { const details = await action(); checks.push({ name, status: 'passed', elapsedMs: Date.now() - startedAt, ...details }); console.log(JSON.stringify({ scenario: name, status: 'passed' })); }
  catch (error) { checks.push({ name, status: 'failed', elapsedMs: Date.now() - startedAt, error: error.message }); throw error; }
}

try {
  browser = await chromium.launch({ headless: true });
  await checkpoint('unknown-decline-and-explicit-opt-in', async () => {
    const scope = await isolatedContext(); const page = await scope.context.newPage();
    await go(page, '/'); await pause(1200);
    assert.equal(requests.filter(row => row.endpoint).length, 0, 'Unknown consent must make zero Google requests');
    await choose(page, scope, 'declined'); await pause(1200);
    assert.equal(requests.filter(row => row.endpoint).length, 0, 'No thanks must make zero Google requests');
    await choose(page, scope, 'accepted'); const initial = await tagged(page);
    if (options.live) { await page.bringToFront(); await pause(11000); }
    scope.page = page; scope.initial = initial;
    return { documentId: initial.id, livePageViewRequired: options.live };
  });
  const main = contexts[0]; const page = main.page;
  for (const target of ['/contact', '/submit-ticket', '/fleet']) {
    await checkpoint(`loaded-public-to-${target.slice(1)}-and-back`, async () => {
      const previous = await tagged(page); const privateDoc = await actualLink(page, target);
      assert.notEqual(privateDoc.id, previous.id, 'Public to private must create a new document');
      await fillPrivate(page, target); await untagged(page, privateDoc.id);
      safeOldDocument(previous.id, target);
      const returned = await actualLink(page, '/');
      assert.notEqual(returned.id, privateDoc.id, 'Private to public must create a new document');
      await tagged(page);
      return { oldDocumentId: previous.id, privateDocumentId: privateDoc.id, returnedDocumentId: returned.id };
    });
  }
  await checkpoint('invalid-test-receipt-scrubbed-before-google-no-purchase', async () => {
    await go(page, '/thank-you?session_id=' + receiptToken);
    await page.waitForURL(url => url.pathname === '/thank-you' && url.search === '' && url.hash === '');
    const receipt = await tagged(page);
    await page.getByText('We could not confirm a paid order from this page.', { exact: false }).waitFor();
    assert.deepEqual(leakedValues(await page.content(), [receiptToken]), [], 'Receipt token appeared in DOM text or attributes after scrub');
    const saved = await page.evaluate(() => JSON.stringify({ history: history.state, local: { ...localStorage }, session: { ...sessionStorage } }));
    assert.deepEqual(leakedValues(saved, [receiptToken]), [], 'Receipt token persisted in storage/history');
    assert.ok(requests.some(row => row.url.includes('/get-checkout-session') && row.disposition === 'blocked-external-service'), 'Receipt must use only a blocked invalid lookup fixture');
    assert.equal(requests.filter(row => row.endpoint && purchaseOrUserData(row.fields, row.url)).length, 0, 'Invalid receipt must not emit a paid event');
    await actualLink(page, '/'); await tagged(page);
    return { documentId: receipt.id, receiptLookup: 'blocked-invalid503', purchaseEvents: 0 };
  });
  await checkpoint('punjabi-receipt-suggestion-and-selector-keep-token-out-of-dom', async () => {
    const scope = await isolatedContext({ locale: 'pa-IN' });
    const localized = await scope.context.newPage();
    await go(localized, '/'); await choose(localized, scope, 'accepted'); await tagged(localized);
    await go(localized, '/thank-you?session_id=' + receiptToken);
    await localized.waitForURL(url => url.pathname === '/thank-you' && url.search === '');
    const englishReceipt = await tagged(localized);
    const pa = JSON.parse(await fs.readFile(path.join(repo, 'src/i18n/locales/pa.json'), 'utf8'));
    const offer = pa.language.offer.replace('{{language}}', 'ਪੰਜਾਬੀ');
    const switchLabel = pa.language.switch.replace('{{language}}', 'ਪੰਜਾਬੀ');
    await localized.getByText(offer, { exact: false }).waitFor();
    assert.deepEqual(leakedValues(await localized.content(), [receiptToken]), [], 'Delayed language suggestion exposed the receipt token in DOM text or attributes');
    await localized.getByRole('button', { name: switchLabel, exact: true }).click();
    await localized.waitForURL(url => url.pathname === '/pa/thank-you' && url.search === '');
    const punjabiReceipt = await tagged(localized);
    assert.notEqual(punjabiReceipt.id, englishReceipt.id, 'Receipt language suggestion must use a fresh document boundary');
    assert.deepEqual(leakedValues(await localized.content(), [receiptToken]), [], 'Punjabi receipt DOM exposed the receipt token');
    await localized.locator('header select').first().selectOption('en');
    await localized.waitForURL(url => url.pathname === '/thank-you' && url.search === '');
    const switchedReceipt = await tagged(localized);
    assert.notEqual(switchedReceipt.id, punjabiReceipt.id, 'Receipt language selector must use a fresh document boundary');
    assert.deepEqual(leakedValues(await localized.content(), [receiptToken]), [], 'Selector handoff exposed the receipt token in DOM');
    await localized.close();
    return { browserLocale: 'pa-IN', documentIds: [englishReceipt.id, punjabiReceipt.id, switchedReceipt.id], tokenInDom: false, receiptLookup: 'blocked-invalid503' };
  });
  await checkpoint('withdrawal-retires-google-touched-document', async () => {
    const previous = await tagged(page); await choose(page, main, 'declined');
    await until(async () => (await ready(page, '/')).id !== previous.id, 'withdrawal replacement document');
    const current = await ready(page, '/'); await untagged(page, current.id);
    return { oldDocumentId: previous.id, newDocumentId: current.id };
  });
  await checkpoint('cross-tab-withdrawal-reloads-both-tagged-documents', async () => {
    await choose(page, main, 'accepted'); const previousA = await tagged(page);
    const other = await main.context.newPage(); await go(other, '/rapid-resolution'); const previousB = await tagged(other);
    await choose(other, main, 'declined');
    await until(async () => (await ready(page, '/')).id !== previousA.id && (await ready(other, '/rapid-resolution')).id !== previousB.id, 'cross-tab replacement documents');
    const currentA = await ready(page, '/'); const currentB = await ready(other, '/rapid-resolution');
    await untagged(page, currentA.id); await untagged(other, currentB.id);
    await other.close();
    return { newDocumentIds: [currentA.id, currentB.id] };
  });
  if (options.pendingNavigationGuardian) await checkpoint('cross-tab-withdrawal-during-held-app-document-navigation', async () => {
    const scope = await isolatedContext(); const waiting = await scope.context.newPage();
    await go(waiting, '/'); await choose(waiting, scope, 'accepted'); const previous = await tagged(waiting);
    const controller = await scope.context.newPage(); await go(controller, '/rapid-resolution'); await tagged(controller);
    const cdp = await scope.context.newCDPSession(waiting);
    const mainFrameId = (await cdp.send('Page.getFrameTree')).frameTree.frame.id;
    let oldExecutionContext; let oldContextRetired = false; let navigationStarted = false;
    cdp.on('Runtime.executionContextCreated', ({ context }) => {
      if (!navigationStarted && context.auxData?.isDefault && context.auxData.frameId === mainFrameId) oldExecutionContext = context.id;
    });
    const retired = () => {
      if (!navigationStarted || oldContextRetired) return;
      oldContextRetired = true;
      documentEvents.push({ kind: 'held-navigation-old-context-retired', scenario: activeScenario, documentId: previous.id, observedAt: Date.now() });
    };
    cdp.on('Runtime.executionContextDestroyed', event => { if (event.executionContextId === oldExecutionContext) retired(); });
    cdp.on('Runtime.executionContextsCleared', retired);
    await cdp.send('Runtime.enable');
    assert.ok(oldExecutionContext, 'Expected the owned Chromium main-frame execution context');
    scope.holdDocumentPaths.add('/submit-ticket');
    try {
      navigationStarted = true;
      await waiting.locator('a[href="/submit-ticket"]').first().click({ noWaitAfter: true });
      await until(() => scope.pendingDocuments.length === 1, 'held /submit-ticket document GET');
      // Playwright locators/evaluate wait for a pending document navigation.
      // The existing read-only observer reports the retained DOM without that
      // auto-wait or any change to the app's real navigation behavior.
      const blocked = () => documentEvents.some(event => event.documentId === previous.id && event.mainFrame && event.kind === 'blocked-dom');
      await until(() => blocked() || oldContextRetired, 'old public DOM is blocked or its execution context has already retired', 10000);
      const retiredBeforeWithdrawal = oldContextRetired;
      safeOldDocument(previous.id, '/submit-ticket');
      // Existing held request stays held; a guardian-triggered reload is now
      // allowed to obtain its new untagged document from the exact dist.
      scope.holdDocumentPaths.clear();
      await choose(controller, scope, 'declined');
      // Chromium can retire the old execution context before receiving the
      // held document. That is already isolation, not a retained React tree.
      // Release only the exact local GET after withdrawal, then prove the new
      // private document is untagged; do not pretend this exercised the seam.
      if (retiredBeforeWithdrawal) for (const release of scope.pendingDocuments.splice(0)) await release(true);
      await until(() => pageInfo.get(waiting)?.documentId !== previous.id, 'persistent guardian retires the blocked Google-touched document');
      await waiting.locator('[data-google-consent-controls]').waitFor();
      const current = await waiting.evaluate(() => ({ id: window.__fabsyNetworkDocumentId, href: location.href }));
      if (new URL(current.href).pathname === '/submit-ticket') await fillPrivate(waiting, '/submit-ticket');
      await untagged(waiting, current.id);
      safeOldDocument(previous.id, '/submit-ticket');
      return { oldDocumentId: previous.id, replacementDocumentId: current.id, replacementUrl: current.href, blockedDomObserved: blocked(), retiredBeforeWithdrawal, originalNavigation: retiredBeforeWithdrawal ? 'old context retired before response; exact local GET released after withdrawal' : 'retained blocked DOM; guardian replacement; original GET aborted', retainedGuardianSeam: retiredBeforeWithdrawal ? 'covered separately by unit/browser controls; this Chromium retired its old context first' : 'observed' };
    } finally {
      for (const release of scope.pendingDocuments.splice(0)) await release();
      await cdp.detach().catch(() => {});
      await waiting.close(); await controller.close();
    }
  });
  await checkpoint('pending-loader-cannot-expose-private-dom-or-native-history', async () => {
    const scope = await isolatedContext({ holdLoader: true }); const pending = await scope.context.newPage();
    const previous = await go(pending, '/'); await choose(pending, scope, 'accepted');
    await until(() => scope.pendingRoutes.length === 1, 'held gtag request');
    const privateDoc = await actualLink(pending, '/contact');
    assert.notEqual(previous.id, privateDoc.id);
    await fillPrivate(pending, '/contact'); await untagged(pending, privateDoc.id);
    safeOldDocument(previous.id, '/contact');
    for (const release of scope.pendingRoutes.splice(0)) await release();
    await pending.close();
    return { pendingDocumentId: previous.id, privateDocumentId: privateDoc.id, loader: 'locally held then aborted; never forwarded' };
  });
  await checkpoint('back-forward-after-private-page-withdrawal', async () => {
    const scope = await isolatedContext(); const traversal = await scope.context.newPage();
    await go(traversal, '/'); await choose(traversal, scope, 'accepted'); const oldPublic = await tagged(traversal);
    const privateDoc = await actualLink(traversal, '/contact'); await fillPrivate(traversal, '/contact');
    await choose(traversal, scope, 'declined');
    assert.equal((await ready(traversal, '/contact')).id, privateDoc.id, 'Untouched private document must keep its in-memory form on withdrawal');
    await traversal.goBack({ waitUntil: 'domcontentloaded' }); const restored = await ready(traversal, '/');
    assert.notEqual(restored.id, oldPublic.id, 'Stale accepted public document must not remain restored');
    await untagged(traversal, restored.id);
    await traversal.goForward({ waitUntil: 'domcontentloaded' }); const forward = await ready(traversal, '/contact'); await untagged(traversal, forward.id);
    await traversal.close();
    return { oldPublicDocumentId: oldPublic.id, restoredDocumentId: restored.id, bfcacheObserved: documentEvents.some(event => event.kind === 'pageshow' && event.mainFrame && event.persisted) };
  });
  await pause(500);
  assert.equal(documentEvents.filter(event => event.kind === 'blocked-form-submit').length, 0, 'A form submission was attempted');
  const dataLeaks = requests.filter(row => leakedValues(`${row.url}\n${row.postData}\n${row.referrer}`, privateValues).length);
  assert.deepEqual(dataLeaks, [], 'Synthetic private values appeared in request URL/body/referrer, including encoded/hashed forms');
  assert.equal(requests.filter(row => (row.endpoint || googleHost(new URL(row.url).hostname)) && /cs_(?:test_|live_)[a-z0-9]+/i.test(decodedForms(`${row.url}\n${row.postData}\n${row.referrer}`).join('\n'))).length, 0, 'Receipt capability reached Google');
  assert.equal(requests.filter(row => row.disposition === 'blocked-google-purchase-or-personal-data').length, 0, 'A purchase or personalized/user-provided payload was attempted');
  assert.equal(requests.filter(row => row.disposition === 'blocked-google-unsafe-page-context').length, 0, 'Google attempted a private or unsanitized page URL, title or referrer');
} catch (error) {
  failures.push({ scenario: activeScenario, message: error.message, stack: error.stack });
  for (const scope of contexts) for (const page of scope.context.pages()) {
    await page.screenshot({ path: path.join(artifacts, `failure-${pageInfo.get(page)?.id || 'page'}.png`), fullPage: false }).catch(() => {});
  }
} finally {
  for (const scope of contexts) for (const release of scope.pendingRoutes.splice(0)) await release();
  for (const scope of contexts) for (const release of scope.pendingDocuments.splice(0)) await release();
  await browser?.close();
  const google = requests.filter(row => row.endpoint || googleHost(new URL(row.url).hostname));
  const automatic = google.filter(row => row.fields.en?.some(name => ['session_start', 'user_engagement'].includes(name)) || row.fields._ss?.includes('1') || row.fields._et?.some(value => Number(value) > 0));
  const unlistedGoogle = google.filter(row => row.disposition === 'blocked-unlisted-google-endpoint');
  const receipt = {
    completedAt: new Date().toISOString(), mode: options.live ? 'live-google' : 'offline-inert', origin, expectedIds: { ga4: options.ga4, ads: options.ads }, buildIdentity,
    isolation: { freshChromium: true, savedProfileOrAuth: false, serviceWorkers: 'blocked', applicationNetworkForwarded: 0, customerPaymentNetworkForwarded: 0, googleNetworkForwarded: google.filter(row => row.forwarded).length },
    checks, failures, actualGooglePageViews: google.filter(row => row.forwarded && [200, 204].includes(row.responseStatus) && pageView(row)).length,
    automaticGoogleSessionEngagement: options.live ? automatic.map(row => ({ requestId: row.id, event: row.fields.en, sessionStart: row.fields._ss, engagementMilliseconds: row.fields._et, sessionId: row.fields.sid, sessionCount: row.fields.sct, responseStatus: row.responseStatus })) : { skipped: 'Offline gtag fixture is inert; no automatic Google events are fabricated.' },
    limitations: ['No purchase/conversion is generated or validated by this test.', 'Private-to-private File retention is covered by the separate unit/browser suite.', 'Back/forward caching is reported as observed; request interception can affect browser caching.', 'Automatic session_start can be represented by the _ss=1 parameter on page_view rather than a separate event.', 'Live mode records anonymous test page visits in the configured real Google properties.'],
    blockedUnlistedGoogleEndpoints: unlistedGoogle.map(row => ({ requestId: row.id, url: row.url })),
    materialLimitations: unlistedGoogle.length ? ['Unlisted Google endpoints were blocked. Successful GA4 page views do not establish that these additional Google features initialized; inspect the recorded requests before launch.'] : [],
    pendingNavigationGuardianScenario: options.pendingNavigationGuardian ? 'enabled' : 'not enabled; rerun with --pending-navigation-guardian after building the persistent guardian',
    blockedRequestCount: requests.filter(row => row.disposition?.startsWith('blocked')).length,
  };
  await Promise.all([
    fs.writeFile(path.join(artifacts, 'receipt.json'), JSON.stringify(receipt, null, 2)),
    fs.writeFile(path.join(artifacts, 'requests.json'), JSON.stringify(requests, null, 2)),
    fs.writeFile(path.join(artifacts, 'google-requests.json'), JSON.stringify(google, null, 2)),
    fs.writeFile(path.join(artifacts, 'document-events.json'), JSON.stringify(documentEvents, null, 2)),
  ]);
  console.log(JSON.stringify({ status: failures.length ? 'failed' : 'passed', mode: receipt.mode, checks: checks.length, failureCount: failures.length, googleNetworkForwarded: receipt.isolation.googleNetworkForwarded, actualGooglePageViews: receipt.actualGooglePageViews, automaticFieldsObserved: options.live ? automatic.length : 0, artifacts }));
  if (failures.length) { console.error(failures[0].message); process.exitCode = 1; }
}
