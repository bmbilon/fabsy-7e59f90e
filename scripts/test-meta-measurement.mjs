#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runInContext } from 'node:vm';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = fileURLToPath(new URL('../', import.meta.url));
const expectedPixelId = '2917050565322500';
const enabledEnv = {
  PROD: true,
  VITE_META_MEASUREMENT_ENABLED: 'true',
  VITE_META_PIXEL_ID: expectedPixelId,
};
const campaign = content => `?utm_source=meta&utm_medium=paid_social&utm_campaign=rr_ab_en_creative_20260831&utm_content=${content}`;
const landing = `https://fabsy.ca/rapid-resolution${campaign('rr_relief_v1')}`;
const plain = value => JSON.parse(JSON.stringify(value));
const compiled = new Map();

async function bundle(env = enabledEnv) {
  const key = JSON.stringify(env);
  if (!compiled.has(key)) compiled.set(key, build({
    absWorkingDir: root,
    stdin: {
      resolveDir: root,
      sourcefile: 'meta-measurement-fixture.ts',
      loader: 'ts',
      contents: `
        export * from './src/lib/googleConsent';
        export * from './src/lib/googleMeasurement';
        export * from './src/lib/metaMeasurement';
        export * from './src/lib/publicMeasurementUrl';
        export * from './src/lib/measurementNavigation';
        export * from './src/lib/metaCheckoutWithdrawal';
      `,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'cjs',
    logLevel: 'silent',
    define: { 'import.meta.env': key },
  }).then(result => result.outputFiles[0].text));
  return compiled.get(key);
}

async function runtime(href = landing, env = enabledEnv, referrer = '') {
  const virtualConsole = new VirtualConsole();
  const domErrors = [];
  virtualConsole.on('jsdomError', error => domErrors.push(error.message));
  const dom = new JSDOM('<!doctype html><html><head><title>Reviewed public page</title></head><body></body></html>', {
    url: href,
    referrer: referrer || undefined,
    runScripts: 'outside-only',
    virtualConsole,
  });
  const network = [];
  const forbidNetwork = () => { network.push('blocked'); throw new Error('Meta test forbids network'); };
  dom.window.fetch = forbidNetwork;
  dom.window.XMLHttpRequest = class { constructor() { forbidNetwork(); } };
  dom.window.navigator.sendBeacon = forbidNetwork;
  const context = dom.getInternalVMContext();
  context.module = { exports: {} };
  context.exports = context.module.exports;
  Object.defineProperty(context, 'crypto', { configurable: true, value: webcrypto });
  context.TextEncoder = TextEncoder;
  runInContext(await bundle(env), context);
  const api = context.module.exports;
  api.registerMeasurementDocument(
    dom.window,
    api.publicMeasurementDocumentUrl,
    api.publicProviderMeasurementUrl,
  );
  return {
    api,
    dom,
    win: dom.window,
    domErrors,
    network,
    close: () => dom.window.close(),
  };
}

test('Meta consent is a separate strict v1 record; a legacy Google acceptance leaves it unknown', async () => {
  const r = await runtime();
  try {
    const now = Date.now();
    for (const value of [null, '', 'true', '{', '[]',
      JSON.stringify({ version: 1, choice: 'accepted' }),
      JSON.stringify({ version: 2, choice: 'accepted', savedAt: now }),
      JSON.stringify({ version: 1, choice: 'accepted', savedAt: now + 1 }),
      JSON.stringify({ version: 1, choice: 'accepted', savedAt: now - r.api.META_CONSENT_MAX_AGE_MS }),
      JSON.stringify({ version: 1, choice: 'granted', savedAt: now })]) {
      assert.equal(r.api.parseMetaConsent(value, now), 'unknown');
    }
    r.api.setGoogleConsentChoice('accepted');
    assert.equal(r.api.getGoogleConsentChoice(), 'accepted');
    assert.equal(r.api.getMetaConsentChoice(), 'unknown');
    r.api.initializeMetaMeasurement();
    assert.equal(r.win.document.querySelector('#fabsy-meta-pixel'), null);
    assert.equal(r.win.fbq, undefined);
    assert.deepEqual(r.network, []);
  } finally { r.close(); }
});

test('Meta production gate requires the exact flag, Pixel ID and production origin', async () => {
  const r = await runtime();
  try {
    for (const origin of ['https://fabsy.ca', 'https://www.fabsy.ca']) {
      assert.deepEqual(plain(r.api.metaMeasurementConfig(enabledEnv, origin)), { pixelId: expectedPixelId });
    }
    for (const origin of ['http://fabsy.ca', 'https://fabsy.ca:8443', 'https://preview.fabsy.ca', 'https://fabsy.ca.evil.invalid', 'http://localhost:5173']) {
      assert.deepEqual(plain(r.api.metaMeasurementConfig(enabledEnv, origin)), {});
    }
    for (const env of [
      { ...enabledEnv, PROD: false },
      { ...enabledEnv, VITE_META_MEASUREMENT_ENABLED: 'false' },
      { ...enabledEnv, VITE_META_MEASUREMENT_ENABLED: 'TRUE' },
      { ...enabledEnv, VITE_META_PIXEL_ID: undefined },
      { ...enabledEnv, VITE_META_PIXEL_ID: '2917050565322501' },
      { PROD: true, VITE_META_PIXEL_ID: expectedPixelId },
    ]) assert.deepEqual(plain(r.api.metaMeasurementConfig(env, 'https://fabsy.ca')), {});
  } finally { r.close(); }
});

test('Meta URL policy admits safe English RR campaigns without a hard-coded campaign name; receipts require verification', async () => {
  const r = await runtime();
  try {
    for (const content of ['rr_relief_v1', 'rr_flat_fee_v1', 'rr_client_control_v1']) {
      for (const extra of ['', '&fbclid=IwZXh0bgNhZW0_SYNTHETIC-123']) {
        const url = new URL(`https://fabsy.ca/rapid-resolution${campaign(content)}${extra}`);
        assert.equal(r.api.publicMetaMeasurementUrl(url), true, url.href);
        assert.equal(r.api.publicMeasurementDocumentUrl(url), true, url.href);
        assert.equal(r.api.publicGoogleMeasurementUrl(url), true, 'consented GA4 may measure approved Meta landing traffic');
      }
    }
    for (const suffix of [
      '?utm_source=meta&utm_medium=paid_social&utm_campaign=rr_creative_v2&utm_content=rr_easy_v2',
      '?utm_source=meta&utm_medium=paid_social&utm_campaign=rr_creative_v3&utm_content=rr_price_v2&utm_term=alberta_ticket&fbclid=SYNTHETIC_META',
    ]) assert.equal(r.api.publicMetaMeasurementUrl(new URL(`https://fabsy.ca/rapid-resolution${suffix}`)), true, suffix);
    for (const path of ['/thank-you', '/thank-you/', '/en/thank-you', '/pa/thank-you/', '/tl/thank-you', '/zh-hans/thank-you', '/zh-hant/thank-you', '/ar/thank-you', '/hi/thank-you', '/es/thank-you/']) {
      const url = new URL(`https://fabsy.ca${path}`);
      assert.equal(r.api.publicMetaMeasurementUrl(url), false, path);
      assert.equal(r.api.publicMeasurementDocumentUrl(url), true,
        'the shared receipt document remains available to the existing Google verifier');
    }
    for (const href of [
      'https://fabsy.ca/rapid-resolution',
      `https://fabsy.ca/es/rapid-resolution${campaign('rr_relief_v1')}`,
      `https://fabsy.ca/rapid-resolution/${campaign('rr_relief_v1')}`,
      `https://fabsy.ca/rapid-resolution${campaign('rr_relief_v1')}&fbclid=ONE&fbclid=TWO`,
      `https://fabsy.ca/rapid-resolution${campaign('rr_relief_v1')}#private`,
      `https://fabsy.ca/rapid-resolution${campaign('rr_relief_v1')}&email=person%40example.invalid`,
      'https://fabsy.ca/rapid-resolution?utm_source=meta&utm_medium=paid_social&utm_campaign=person%40example.invalid&utm_content=rr',
      'https://fabsy.ca/rapid-resolution?utm_source=meta&utm_medium=paid_social&utm_campaign=rr&utm_content=contains%20spaces',
      'https://fabsy.ca/rapid-resolution?utm_source=meta&utm_medium=paid_social&utm_campaign=rr',
      'https://fabsy.ca/thank-you?session_id=cs_live_SYNTHETIC',
      'https://fabsy.ca/es/thank-you?gclid=SYNTHETIC',
    ]) assert.equal(r.api.publicMetaMeasurementUrl(new URL(href)), false, href);
  } finally { r.close(); }
});

test('loader is consent gated, manual only, and queues no advanced matching or automatic event', async () => {
  const r = await runtime();
  try {
    r.api.setMetaConsentChoice('accepted');
    r.api.initializeMetaMeasurement();
    const script = r.win.document.getElementById('fabsy-meta-pixel');
    assert.ok(script);
    assert.equal(script.src, 'https://connect.facebook.net/en_US/fbevents.js');
    assert.equal(script.async, true);
    assert.equal(script.referrerPolicy, 'no-referrer');
    assert.equal(r.win.document.querySelector('noscript'), null);
    const queue = r.win.fbq.queue;
    assert.deepEqual(plain(queue), [
      ['consent', 'grant'],
      ['set', 'autoConfig', false, expectedPixelId],
      ['init', expectedPixelId],
    ]);
    assert.equal(queue[2].length, 2, 'init must not contain advanced matching data');
    assert.equal(r.win.fbq.loaded, true);
    assert.equal(r.win.fbq.disablePushState, true);
    script.onload();
    assert.deepEqual(plain(queue.at(-1)), ['trackSingle', expectedPixelId, 'PageView']);
    assert.equal(queue.filter(command => command[2] === 'PageView').length, 1);
    r.api.initializeMetaMeasurement();
    assert.equal(queue.filter(command => command[2] === 'PageView').length, 1);
    assert.equal(r.api.dispatchMetaMeasurement('Lead', {}), false);
    assert.equal(r.api.dispatchMetaMeasurement('PageView', { email: 'person@example.invalid' }), false);
    assert.equal(r.api.dispatchMetaMeasurement('Purchase', { value: 198 }), false);
    assert.equal(queue.some(command => command.includes('Lead')), false);
    assert.deepEqual(r.network, []);
  } finally { r.close(); }
});

test('Photo Radar and direct clean receipts cannot authorize a Meta tag or PageView', async () => {
  const photoId = 'cs_live_SYNTHETICPhotoReceipt1';
  const r = await runtime(`https://fabsy.ca/thank-you?session_id=${photoId}`);
  try {
    r.api.setMetaConsentChoice('accepted');
    assert.equal(r.api.scrubCheckoutReceiptUrl(photoId, r.win), true);
    r.api.initializeMetaMeasurement();
    assert.equal(r.win.document.getElementById('fabsy-meta-pixel'), null);
    const photo = {
      id: photoId,
      livemode: true,
      mode: 'payment',
      payment_status: 'paid',
      currency: 'cad',
      amount_subtotal: 7900,
      amount_total: 8295,
      total_details: { amount_tax: 395, amount_discount: 0 },
      order_type: 'photo_radar',
    };
    assert.equal(await r.api.reportMetaPurchase(photo, photoId, r.win.sessionStorage), null);
    assert.equal(r.win.document.getElementById('fabsy-meta-pixel'), null);
    assert.equal(r.win.fbq, undefined);
  } finally { r.close(); }

  const clean = await runtime('https://fabsy.ca/thank-you');
  try {
    clean.api.setMetaConsentChoice('accepted');
    clean.api.initializeMetaMeasurement();
    assert.equal(clean.win.document.getElementById('fabsy-meta-pixel'), null);
    assert.equal(clean.api.authorizeMeasurementProviderOnVerifiedReceipt('meta', clean.win), false);
  } finally { clean.close(); }
});

test('verified RR Purchase authorizes receipt PageView and uses bare SHA-256 session eventID', async () => {
  const id = 'cs_live_SYNTHETICMetaReceipt1';
  const r = await runtime(`https://fabsy.ca/thank-you?session_id=${id}`);
  try {
    r.api.setMetaConsentChoice('accepted');
    assert.equal(r.api.scrubCheckoutReceiptUrl(id, r.win), true);
    const receipt = {
      id,
      livemode: true,
      mode: 'payment',
      payment_status: 'paid',
      currency: 'cad',
      amount_subtotal: 19800,
      amount_total: 20790,
      total_details: { amount_tax: 990, amount_discount: 0 },
      order_type: 'rapid_resolution',
    };
    assert.equal(await r.api.reportMetaPurchase(receipt, id, r.win.sessionStorage), null,
      'verification authorizes and starts the tag, but cannot report before its load event');
    const script = r.win.document.getElementById('fabsy-meta-pixel');
    assert.ok(script);
    const queue = r.win.fbq.queue;
    assert.equal(queue.some(command => command[2] === 'PageView'), false);
    script.onload();
    assert.equal(queue.filter(command => command[2] === 'PageView').length, 1);
    const eventId = await r.api.reportMetaPurchase(receipt, id, r.win.sessionStorage);
    const expected = Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(id))).toString('hex');
    assert.equal(eventId, expected);
    assert.match(eventId, /^[a-f0-9]{64}$/);
    const purchase = plain(queue.find(command => command[2] === 'Purchase'));
    assert.deepEqual(purchase, ['trackSingle', expectedPixelId, 'Purchase', {
      value: 198,
      currency: 'CAD',
      content_type: 'product',
      content_ids: ['rapid_resolution'],
      num_items: 1,
    }, { eventID: expected }]);
    assert.equal(JSON.stringify(purchase).includes('cs_live_'), false);
    const before = queue.length;
    assert.equal(await r.api.reportMetaPurchase(receipt, id, r.win.sessionStorage), null);
    assert.equal(queue.length, before, 'purchase must deduplicate');

    for (const mismatched of [
      {
        ...receipt,
        id: 'cs_live_SYNTHETICMetaMismatchRR1',
        order_type: 'rapid_resolution',
        amount_subtotal: 22900,
        amount_total: 24045,
        total_details: { amount_tax: 1145, amount_discount: 0 },
      },
      {
        ...receipt,
        id: 'cs_live_SYNTHETICMetaMismatchBundle1',
        order_type: 'rapid_resolution_bundle',
        amount_subtotal: 19800,
        amount_total: 20790,
        total_details: { amount_tax: 990, amount_discount: 0 },
      },
    ]) {
      assert.equal(await r.api.reportMetaPurchase(mismatched, mismatched.id, r.win.sessionStorage), null,
        'content ID and exact current value must be an approved pair');
    }

  } finally { r.close(); }
});

test('checkout handoff returns only approved consent and Meta browser identifiers', async () => {
  const old = await runtime();
  try {
    old.api.setGoogleConsentChoice('accepted');
    old.win.document.cookie = '_fbp=fb.1.1788300000000.SYNTHETIC123; Path=/';
    assert.equal(old.api.currentMetaCheckoutContext(), null, 'Google v1 cannot authorize a Meta handoff');
  } finally { old.close(); }

  const r = await runtime();
  try {
    r.api.setMetaConsentChoice('accepted');
    r.win.document.cookie = '_fbp=fb.1.1788300000000.SYNTHETIC123; Path=/';
    r.win.document.cookie = '_fbc=fb.1.1788300000000.IwZXh0_SYNTHETIC-123; Path=/';
    const context = plain(r.api.currentMetaCheckoutContext());
    assert.deepEqual(Object.keys(context).sort(), ['consentVersion', 'consentedAt', 'fbc', 'fbp']);
    assert.equal(context.consentVersion, 'meta-measurement-v1');
    assert.ok(Number.isFinite(Date.parse(context.consentedAt)));
    assert.match(context.fbp, /^fb\./);
    assert.match(context.fbc, /^fb\./);
    assert.equal(JSON.stringify(context).includes('utm_'), false);
    assert.equal(JSON.stringify(context).includes('/rapid-resolution'), false);
    assert.equal(JSON.stringify(context).includes('email'), false);
    assert.equal(JSON.stringify(context).includes(r.win.navigator.userAgent), false,
      'the server must derive User-Agent from the request header');

    r.win.document.cookie = '_fbp=invalid; Path=/rapid-resolution';
    const ambiguous = plain(r.api.currentMetaCheckoutContext());
    assert.equal(ambiguous.fbp, undefined, 'duplicate path cookies must fail closed');
    assert.ok(ambiguous.fbc);
    Object.defineProperty(r.win.navigator, 'userAgent', { configurable: true, value: 'x'.repeat(513) });
    assert.ok(r.api.currentMetaCheckoutContext(),
      'browser JSON does not carry User-Agent; the server validates the request header');
  } finally { r.close(); }
});

test('opaque checkout handles persist until acknowledged and withdraw without exposing a Stripe session', async () => {
  const r = await runtime();
  try {
    const requests = [];
    r.win.fetch = async (url, init) => {
      requests.push({ url, init });
      return { ok: true };
    };
    const handle = 'a'.repeat(64);
    assert.equal(r.api.rememberMetaCheckoutAttributionHandle(handle, r.win), true);
    const storedBefore = Array.from({ length: r.win.localStorage.length }, (_, index) =>
      r.win.localStorage.getItem(r.win.localStorage.key(index))).join('');
    assert.equal(storedBefore.includes('cs_live_'), false);
    assert.equal(await r.api.flushMetaCheckoutAttributionWithdrawals(r.win), true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url,
      'https://gcasbisxfrssonllpqrw.supabase.co/functions/v1/withdraw-meta-measurement');
    assert.deepEqual(JSON.parse(requests[0].init.body), { handles: [handle] });
    assert.equal(requests[0].init.keepalive, true);
    assert.equal(requests[0].init.credentials, 'omit');
    assert.equal(requests[0].init.referrerPolicy, 'no-referrer');
    assert.equal(r.win.localStorage.length, 0);

    r.win.fetch = async () => ({ ok: false });
    assert.equal(r.api.rememberMetaCheckoutAttributionHandle('b'.repeat(64), r.win), true);
    assert.equal(await r.api.flushMetaCheckoutAttributionWithdrawals(r.win), false);
    assert.equal(r.win.localStorage.length, 1, 'a failed withdrawal remains retryable');
  } finally { r.close(); }
});

test('revocation storage never evicts a live handle and fails closed at capacity', async () => {
  const r = await runtime();
  try {
    const handles = Array.from({ length: r.api.META_CHECKOUT_WITHDRAWAL_MAX_HANDLES },
      (_, index) => index.toString(16).padStart(64, '0'));
    for (const handle of handles) {
      assert.equal(r.api.rememberMetaCheckoutAttributionHandle(handle, r.win), true);
    }
    const extra = 'f'.repeat(64);
    assert.equal(r.api.rememberMetaCheckoutAttributionHandle(extra, r.win), false);
    const stored = Array.from({ length: r.win.localStorage.length }, (_, index) =>
      r.win.localStorage.getItem(r.win.localStorage.key(index))).join('');
    for (const handle of handles) assert.equal(stored.includes(handle), true);
    assert.equal(stored.includes(extra), false);
  } finally { r.close(); }
});

test('client clock shifts never discard an unacknowledged revocation handle', async () => {
  const r = await runtime();
  try {
    const requests = [];
    r.win.fetch = async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return { ok: true };
    };
    const future = 'a'.repeat(64);
    const old = 'b'.repeat(64);
    const key = 'fabsy:meta-checkout-withdrawal:v1';
    r.win.localStorage.setItem(key, JSON.stringify({
      version: 1,
      entries: [
        { handle: future, savedAt: Date.now() + 365 * 24 * 60 * 60 * 1000 },
        { handle: old, savedAt: Date.now() - 365 * 24 * 60 * 60 * 1000 },
      ],
    }));
    assert.equal(await r.api.flushMetaCheckoutAttributionWithdrawals(r.win), true);
    assert.deepEqual(plain(requests), [{ handles: [future, old] }]);
    assert.equal(r.win.localStorage.getItem(key), null);
  } finally { r.close(); }
});

test('withdrawal queues revoke, clears first-party Meta cookies and retires the document once', async () => {
  const r = await runtime();
  try {
    r.win.document.cookie = '_fbp=fb.1.1788300000000.SYNTHETIC123; Path=/';
    r.win.document.cookie = '_fbc=fb.1.1788300000000.IwZXh0_SYNTHETIC-123; Path=/';
    r.api.setMetaConsentChoice('accepted');
    r.api.initializeMetaMeasurement();
    const script = r.win.document.getElementById('fabsy-meta-pixel');
    const queue = r.win.fbq.queue;
    const staleOnload = script.onload;
    staleOnload();
    r.api.setMetaConsentChoice('declined');
    r.api.recheckMetaMeasurementConsent();
    assert.deepEqual(plain(queue.at(-1)), ['consent', 'revoke']);
    assert.equal(r.win.document.cookie.includes('_fbp='), false);
    assert.equal(r.win.document.cookie.includes('_fbc='), false);
    assert.equal(r.win.fbq, undefined);
    assert.equal(script.onload, null);
    assert.equal(r.win.document.getElementById('fabsy-meta-pixel'), null);
    const before = queue.length;
    staleOnload();
    assert.equal(queue.length, before);
    assert.equal(r.domErrors.filter(message => message.includes('Not implemented: navigation')).length, 1);
    assert.deepEqual(r.network, []);
  } finally { r.close(); }
});

test('withdrawal removes an in-flight Pixel script before stale load can execute', async () => {
  const r = await runtime();
  try {
    r.api.setMetaConsentChoice('accepted');
    r.api.initializeMetaMeasurement();
    const script = r.win.document.getElementById('fabsy-meta-pixel');
    assert.ok(script);
    const queue = r.win.fbq.queue;
    const staleOnload = script.onload;
    r.api.setMetaConsentChoice('declined');
    r.api.recheckMetaMeasurementConsent();
    assert.equal(r.win.document.getElementById('fabsy-meta-pixel'), null);
    assert.equal(script.onload, null);
    assert.equal(r.win.fbq, undefined);
    const before = queue.length;
    staleOnload();
    assert.equal(queue.length, before);
    assert.equal(queue.some(command => command[2] === 'PageView'), false);
  } finally { r.close(); }
});

test('unknown, expired or malformed Meta consent clears stale first-party identifiers before tag load', async () => {
  for (const saved of [null, '{', JSON.stringify({
    version: 1,
    choice: 'accepted',
    savedAt: Date.now() - 181 * 24 * 60 * 60 * 1000,
  })]) {
    const r = await runtime();
    try {
      r.win.document.cookie = '_fbp=fb.1.1788300000000.SYNTHETIC123; Path=/';
      r.win.document.cookie = '_fbc=fb.1.1788300000000.IwZXh0_SYNTHETIC-123; Path=/';
      if (saved === null) r.win.localStorage.removeItem(r.api.META_CONSENT_STORAGE_KEY);
      else r.win.localStorage.setItem(r.api.META_CONSENT_STORAGE_KEY, saved);
      r.api.recheckMetaMeasurementConsent();
      assert.equal(r.win.document.cookie.includes('_fbp='), false);
      assert.equal(r.win.document.cookie.includes('_fbc='), false);
      assert.equal(r.win.document.getElementById('fabsy-meta-pixel'), null);
      assert.deepEqual(r.network, []);
    } finally { r.close(); }
  }
});

test('a pending Meta tag makes private SPA navigation use a new document', async () => {
  const r = await runtime();
  try {
    const requests = [];
    const router = r.api.createMeasurementHistory({
      window: r.win,
      isPublicUrl: r.api.publicMeasurementDocumentUrl,
      isProviderPublicUrl: r.api.publicProviderMeasurementUrl,
      navigateDocument: (url, method) => requests.push({ href: url.href, method }),
    });
    const unlisten = router.listen(() => undefined);
    try {
      assert.equal(r.api.markMeasurementTagPending('meta', r.win), true);
      router.navigator.push('/submit-ticket');
      assert.deepEqual(plain(requests), [{ href: 'https://fabsy.ca/submit-ticket', method: 'assign' }]);
      assert.equal(router.getSnapshot().blocked, true);
      assert.equal(r.win.location.href, landing);
    } finally { unlisten(); }
  } finally { r.close(); }
});

test('approved Meta landings can also reach GA4, while provider policies still isolate later navigation', async () => {
  const meta = await runtime();
  try {
    const requests = [];
    const router = meta.api.createMeasurementHistory({
      window: meta.win,
      isPublicUrl: meta.api.publicMeasurementDocumentUrl,
      isProviderPublicUrl: meta.api.publicProviderMeasurementUrl,
      navigateDocument: (url, method) => requests.push({ href: url.href, method }),
    });
    const unlisten = router.listen(() => undefined);
    try {
      assert.equal(meta.api.markMeasurementTagPending('google', meta.win), true,
        'consented GA4 must not silently lose approved Meta landing traffic');
      assert.equal(meta.api.markMeasurementTagPending('meta', meta.win), true);
      router.navigator.push('/');
      assert.deepEqual(plain(requests), [{ href: 'https://fabsy.ca/', method: 'assign' }]);
      assert.equal(router.getSnapshot().blocked, true);
    } finally { unlisten(); }
  } finally { meta.close(); }

  const google = await runtime('https://fabsy.ca/');
  try {
    const requests = [];
    const router = google.api.createMeasurementHistory({
      window: google.win,
      isPublicUrl: google.api.publicMeasurementDocumentUrl,
      isProviderPublicUrl: google.api.publicProviderMeasurementUrl,
      navigateDocument: (url, method) => requests.push({ href: url.href, method }),
    });
    const unlisten = router.listen(() => undefined);
    try {
      assert.equal(google.api.markMeasurementTagPending('meta', google.win), false,
        'the Meta tag must not start on a Google-only page');
      assert.equal(google.api.markMeasurementTagPending('google', google.win), true);
      router.navigator.push(new URL(landing).pathname + new URL(landing).search);
      assert.deepEqual(plain(requests), []);
      assert.equal(router.getSnapshot().blocked, false);
      assert.equal(google.win.location.href, landing);
      assert.equal(google.api.markMeasurementTagPending('meta', google.win), true,
        'Meta can start after the same clean public document reaches its approved landing');
    } finally { unlisten(); }
  } finally { google.close(); }
});

test('Meta source contains no noscript fallback and exposes no Lead/form event path', async () => {
  const source = await fs.readFile(new URL('../src/lib/metaMeasurement.ts', import.meta.url), 'utf8');
  assert.equal(/createElement\(['"]noscript/.test(source), false);
  assert.equal(/['"]Lead['"]/.test(source), false);
  assert.equal(/FormSubmit|Contact|CompleteRegistration/.test(source), false);
});
