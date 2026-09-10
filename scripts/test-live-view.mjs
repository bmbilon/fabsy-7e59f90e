import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { JSDOM } from 'jsdom';

const bundle = async (file) => (await build({ entryPoints: [file], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' })).outputFiles[0].text;
const coreModule = { exports: {} };
runInNewContext(await bundle('src/lib/live-view/core.ts'), { module: coreModule, URL });
const core = coreModule.exports;
const endpointCode = await bundle('functions/api/live-view.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const id = '20000000-0000-4000-8000-000000000001';

test('public paths never accept private routes, tokens or identifiers', () => {
  for (const path of ['/admin', '/admin/live', '/portal/cases/secret', '/pa/portal', '/representation-consent', '/representation-payment', '/thank-you', '/submit-ticket?email=private', '/blog/private%40email', '/content/12345', '/blog/20000000-0000-4000-8000-000000000001', '//admin', '/unknown']) assert.equal(core.livePage(path), null, path);
  for (const path of ['/', '/submit-ticket', '/hi/submit-ticket', '/blog/traffic-ticket-alberta', '/blog/speeding-182-kmh-alberta-extreme-penalties', '/content/distracted-driving-ticket-alberta']) assert.equal(core.livePage(path), path);
  assert.equal(core.pageStage('/', 'review'), 'browsing');
  assert.equal(core.pageStage('/pa/submit-ticket', 'review'), 'review');
});
test('source classification returns a fixed category, never a raw referrer', () => {
  assert.equal(core.visitorSource('https://www.google.ca/search?q=private'), 'Google');
  assert.equal(core.visitorSource('https://chatgpt.com/c/private'), 'ChatGPT');
  assert.equal(core.visitorSource('https://google.ca.evil.test/private'), 'Other referral');
  assert.equal(core.visitorSource('https://fabsy.ca/portal/private'), 'Direct');
});
test('session reuse, expiry, corrupted storage and future dates', () => {
  const old = { id, lastSeen: 1_000, source: 'Google' };
  assert.deepEqual(plain(core.nextSession(JSON.stringify(old), 2_000, 'Direct', () => 'new')), { ...old, lastSeen: 2_000 });
  assert.equal(core.nextSession(JSON.stringify(old), 1_801_000, 'Direct', () => 'new').id, 'new');
  assert.equal(core.nextSession('broken', 2_000, 'Direct', () => 'new').id, 'new');
  assert.equal(core.nextSession(JSON.stringify(old), 500, 'Direct', () => 'new').id, 'new');
});

function endpoint(response = () => new Response('true')) {
  const calls = [];
  const module = { exports: {} };
  runInNewContext(endpointCode, { module, Request, Response, URL, TextEncoder, TextDecoder, Uint8Array, AbortSignal, crypto: webcrypto, fetch: async (url, init) => { calls.push({ url, ...init }); return response(); } });
  const request = (options = {}) => {
    const method = options.method || 'POST';
    const req = new Request(`https://${options.host || 'fabsy.ca'}/api/live-view`, {
      method, headers: { Origin: 'https://fabsy.ca', 'User-Agent': 'Mozilla/5.0 iPhone Mobile', 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', ...options.headers },
      ...(method === 'POST' ? { body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body || { session_id: id, page: '/submit-ticket', stage: 'intake', source: 'Direct', consent: true }) } : {}),
    });
    req.cf = options.cf || { city: 'Calgary', region: 'Alberta', country: 'CA', latitude: '51.0447', longitude: '-114.0719' };
    return module.exports.onRequest({ request: req, env: options.env || { SUPABASE_SERVICE_ROLE_KEY: 'server-secret' } });
  };
  return { calls, request };
}
test('ingestion enriches only trusted coarse metadata and keeps secrets private', async () => {
  const { request, calls } = endpoint();
  const res = await request();
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
  const body = JSON.parse(calls[0].body);
  assert.equal(body.p_latitude, 51);
  assert.equal(body.p_longitude, -114.1);
  assert.equal(body.p_device, 'mobile');
  assert.match(body.p_network_hash, /^[a-f0-9]{64}$/);
  assert.ok(!calls[0].body.includes('192.0.2.1'));
  assert.ok(!calls[0].body.includes('Mozilla'));
  assert.ok(!(await res.text()).includes('server-secret'));
});
test('invalid payload, private page, spoofed origin and oversized bodies never write', async () => {
  const { request, calls } = endpoint();
  const valid = { session_id: id, page: '/', stage: 'browsing', source: 'Direct', consent: true };
  for (const body of [{ ...valid, page: '/portal/cases/x' }, { ...valid, email: 'private@test' }, { ...valid, source: 'private@test' }, { ...valid, session_id: 'x' }]) assert.equal((await request({ body })).status, 400);
  assert.equal((await request({ body: 'x'.repeat(1025) })).status, 400);
  assert.equal((await request({ headers: { Origin: 'https://evil.test' } })).status, 403);
  assert.equal((await request({ headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal(calls.length, 0);
});
test('bots and browser privacy signals do not collect; previews do not collect', async () => {
  const { request, calls } = endpoint();
  for (const headers of [{ DNT: '1' }, { 'Sec-GPC': '1' }, { 'User-Agent': 'Googlebot' }]) assert.equal((await request({ headers })).status, 204);
  assert.equal((await request({ host: 'preview.pages.dev', headers: { Origin: 'https://preview.pages.dev' } })).status, 204);
  assert.equal(calls.length, 0);
});
test('absent coordinates remain null and rate limiting is visible to client', async () => {
  const { request, calls } = endpoint(() => new Response('false'));
  assert.equal((await request({ cf: { latitude: '', longitude: 'not a coordinate' } })).status, 429);
  assert.equal(JSON.parse(calls[0].body).p_latitude, null);
  assert.equal(JSON.parse(calls[0].body).p_longitude, null);
});
test('snapshot uses caller token and never elevates it to the ingestion key', async () => {
  const { request, calls } = endpoint(() => new Response('{}', { status: 403 }));
  assert.equal((await request({ method: 'GET' })).status, 401);
  assert.equal(calls.length, 0);
  assert.equal((await request({ method: 'GET', headers: { Authorization: 'Bearer visitor-token' } })).status, 403);
  assert.equal(calls[0].headers.Authorization, 'Bearer visitor-token');
  assert.notEqual(calls[0].headers.apikey, 'server-secret');
});
test('missing credentials and upstream outages show unavailable, not empty data', async () => {
  assert.equal((await endpoint().request({ env: {} })).status, 503);
  assert.equal((await endpoint(() => new Response('{}', { status: 500 })).request()).status, 503);
});

const trackerCode = (await build({
  stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { flushSync } from 'react-dom'; import { MemoryRouter } from 'react-router-dom'; import Tracker from './src/components/LiveVisitorTracker'; window.mountTracker = () => { const root = createRoot(document.getElementById('root')); flushSync(() => root.render(<MemoryRouter initialEntries={[location.pathname + location.search]}><Tracker /></MemoryRouter>)); return () => flushSync(() => root.unmount()); };`, loader: 'tsx', resolveDir: process.cwd() },
  bundle: true, platform: 'browser', format: 'iife', write: false, logLevel: 'silent', define: { 'import.meta.env': JSON.stringify({ PROD: true }) },
})).outputFiles[0].text;

async function browser(path = '/', options = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: `https://fabsy.ca${path}`, runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window;
  const calls = [], intervals = new Map();
  let visibility = 'visible';
  Object.defineProperty(win.document, 'visibilityState', { get: () => visibility });
  Object.defineProperty(win.navigator, 'doNotTrack', { value: options.dnt || null });
  Object.defineProperty(win.navigator, 'globalPrivacyControl', { value: options.gpc || false });
  win.AbortSignal = AbortSignal;
  win.AbortController = AbortController;
  win.fetch = async (url, init) => { calls.push({ url, ...init }); return new Response(null, { status: 204 }); };
  win.setInterval = (callback, duration) => { intervals.set(duration, callback); return duration; };
  win.clearInterval = duration => intervals.delete(duration);
  if (options.consent !== 'unknown') win.localStorage.setItem('fabsy:first-party-funnel-consent:v1', JSON.stringify({ version: 1, choice: options.consent || 'accepted', savedAt: Date.now() }));
  if (options.raw) win.localStorage.setItem(core.SESSION_KEY, options.raw);
  win.eval(trackerCode);
  const unmount = win.mountTracker();
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await settle();
  return { win, calls, intervals, settle, hide: () => { visibility = 'hidden'; win.document.dispatchEvent(new win.Event('visibilitychange')); }, close: () => { unmount(); dom.window.close(); } };
}
test('visible-page heartbeats reuse sessions, never include query secrets, and stop on unmount', async () => {
  const b = await browser('/submit-ticket?private=NEVER_SEND');
  try {
    assert.equal(b.calls.length, 1);
    const first = JSON.parse(b.calls[0].body);
    assert.deepEqual(Object.keys(first).sort(), ['consent', 'page', 'session_id', 'source', 'stage']);
    assert.equal(first.page, '/submit-ticket');
    assert.ok(!b.calls[0].body.includes('NEVER_SEND'));
    b.intervals.get(30_000)(); await b.settle();
    assert.equal(JSON.parse(b.calls[1].body).session_id, first.session_id);
    b.win.dispatchEvent(new b.win.CustomEvent(core.LIVE_STAGE_EVENT, { detail: 'review' })); await b.settle();
    assert.equal(JSON.parse(b.calls[2].body).stage, 'review');
    b.hide(); b.intervals.get(30_000)(); await b.settle();
    assert.equal(b.calls.length, 3);
  } finally { b.close(); }
  assert.equal(b.intervals.size, 0);
});
test('private navigation, non-consent, DNT and GPC mount no collector', async () => {
  for (const [path, options] of [['/admin/live', {}], ['/portal/cases/secret', {}], ['/', { dnt: '1' }], ['/', { gpc: true }], ['/', { consent: 'unknown' }], ['/', { consent: 'declined' }]]) {
    const b = await browser(path, options);
    try { assert.equal(b.calls.length, 0); assert.equal(b.intervals.size, 0); } finally { b.close(); }
  }
});

test('consent acceptance starts collection and withdrawal stops it and clears session state', async () => {
  const b = await browser('/', { consent: 'unknown' });
  try {
    assert.equal(b.calls.length, 0);
    b.win.localStorage.setItem('fabsy:first-party-funnel-consent:v1', JSON.stringify({ version: 1, choice: 'accepted', savedAt: Date.now() }));
    b.win.dispatchEvent(new b.win.Event('fabsy:funnel-consent-changed')); await b.settle(); await b.settle();
    assert.equal(b.calls.length, 1);
    b.win.localStorage.setItem('fabsy:first-party-funnel-consent:v1', JSON.stringify({ version: 1, choice: 'declined', savedAt: Date.now() }));
    b.win.dispatchEvent(new b.win.Event('fabsy:funnel-consent-changed')); await b.settle(); await b.settle();
    assert.equal(b.intervals.size, 0);
    assert.equal(b.win.localStorage.getItem(core.SESSION_KEY), null);
  } finally { b.close(); }
});
