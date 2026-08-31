import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInContext } from 'node:vm';
import { MessageChannel } from 'node:worker_threads';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

// Inert, synthetic documents only: no Google scripts, customer lookups, storage
// writes outside these isolated DOMs, or document/network requests are made.
const root = fileURLToPath(new URL('../', import.meta.url));
const compiled = await build({
  absWorkingDir: root,
  stdin: {
    contents: `export * from './src/lib/measurementNavigation.ts';
      export * from './src/lib/googleConsent.ts';
      export { publicGoogleMeasurementUrl } from './src/lib/googleMeasurement.ts';`,
    resolveDir: root,
  },
  bundle: true, write: false, format: 'cjs', platform: 'browser', logLevel: 'silent',
  define: { 'import.meta.env': JSON.stringify({ PROD: false }) },
});

function runtime(href = 'https://fabsy.ca/', initiallyTagged = false) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: href, runScripts: 'outside-only',
  });
  const win = dom.window;
  const network = [];
  const forbidden = () => { network.push('forbidden'); throw new Error('Network disabled in navigation fixtures'); };
  win.fetch = forbidden;
  win.navigator.sendBeacon = forbidden;
  win.XMLHttpRequest = class { constructor() { forbidden(); } };
  const native = {
    push: win.history.pushState.bind(win.history),
    replace: win.history.replaceState.bind(win.history),
  };
  const context = dom.getInternalVMContext();
  context.module = { exports: {} };
  context.exports = context.module.exports;
  runInContext(compiled.outputFiles[0].text, context);
  const api = context.module.exports;
  if (initiallyTagged) {
    const script = win.document.createElement('script');
    script.id = 'fabsy-google-tag';
    win.document.head.appendChild(script);
  }
  const fullDocuments = [];
  const router = api.createMeasurementHistory({
    window: win,
    isPublicUrl: api.publicGoogleMeasurementUrl,
    navigateDocument: (url, method) => fullDocuments.push({ href: url.href, method }),
  });
  const snapshots = [router.getSnapshot()];
  const unlisten = router.listen(state => snapshots.push(state));
  const wrappedHistory = [];
  function wrapGoogleHistory() {
    for (const [method, original] of [['pushState', native.push], ['replaceState', native.replace]]) {
      win.history[method] = (state, title, url) => {
        wrappedHistory.push({ method, url, state });
        return original(state, title, url);
      };
    }
  }
  function pop(target, state = { idx: 4, key: 'synthetic-pop', usr: null }) {
    // Simulate an existing unmanaged same-document entry without first sending
    // its URL through the fake Google wrapper being tested.
    native.replace(state, '', target);
    win.dispatchEvent(new win.PopStateEvent('popstate', { state }));
  }
  function dispose() {
    unlisten();
    assert.equal(network.length, 0);
    dom.window.close();
  }
  return { api, win, native, router, snapshots, fullDocuments, wrappedHistory, wrapGoogleHistory, pop, dispose };
}

const privateTargets = [
  '/submit-ticket', '/pa/submit-ticket', '/tl/ticket-form', '/free-ticket-check',
  '/fleet', '/fleet#fleet-intake', '/ar/fleet', '/contact', '/hi/contact',
  '/portal/cases/SYNTHETIC', '/portal/pro-discount/SYNTHETIC', '/admin/submissions/SYNTHETIC',
  '/representation-consent?token=SYNTHETIC', '/insurance-damage-report/intake?order_id=SYNTHETIC',
  '/thank-you?session_id=cs_live_SYNTHETICreceipt', '/es/thank-you?session_id=cs_live_SYNTHETICreceipt',
  '/rapid-resolution?email=synthetic%40example.invalid', '/rapid-resolution#SYNTHETIC-private',
  '/rapid-resolution?gclid=ONE&gclid=TWO', '/unknown', '/%73ubmit-ticket',
];

test('direct private documents cannot initialize Google, including Fleet and sensitive public URLs', () => {
  for (const target of privateTargets) {
    const r = runtime('https://fabsy.ca' + target);
    assert.equal(r.api.googleTagMayLoadInDocument(r.win), false, target);
    assert.equal(r.api.markGoogleTagPending(r.win), false, target);
    assert.equal(r.router.getSnapshot().blocked, false, target);
    assert.equal(r.fullDocuments.length, 0, target);
    r.dispose();
  }
});

test('public push and replace leave before any private URL/state reaches wrapped history', () => {
  for (const mode of ['push', 'replace']) for (const target of privateTargets) {
    const r = runtime();
    assert.equal(r.api.markGoogleTagPending(r.win), true);
    r.wrapGoogleHistory();
    r.router.navigator[mode](target, { privateField: 'SYNTHETIC-HANDOFF' });
    assert.equal(r.wrappedHistory.length, 0, `${mode} ${target}`);
    assert.equal(r.fullDocuments.length, 1, `${mode} ${target}`);
    assert.equal(r.fullDocuments[0].href, 'https://fabsy.ca' + target);
    assert.equal(r.fullDocuments[0].method, mode === 'replace' ? 'replace' : 'assign');
    assert.equal(r.router.getSnapshot().location.pathname, '/');
    assert.equal(r.router.getSnapshot().blocked, true);
    assert.equal(r.api.googleTagMayLoadInDocument(r.win), false);
    assert.equal(r.win.document.querySelector('meta[name="referrer"]').content, 'no-referrer');
    r.dispose();
  }
});

test('a removed/failed pending tag never makes its old document private-safe', () => {
  const r = runtime();
  assert.equal(r.api.markGoogleTagPending(r.win), true);
  r.win.fabsyAnalyticsInitialized = false;
  r.wrapGoogleHistory();
  r.router.navigator.push('/submit-ticket');
  assert.equal(r.wrappedHistory.length, 0);
  assert.equal(r.fullDocuments.length, 1);
  r.dispose();
});

test('ordinary public navigation preserves history and approved click identifiers', () => {
  const r = runtime();
  assert.equal(r.api.markGoogleTagPending(r.win), true);
  r.wrapGoogleHistory();
  r.router.navigator.push('/pa/rapid-resolution?gclid=SYNTHETIC-click');
  r.router.navigator.replace('/faq');
  assert.equal(r.fullDocuments.length, 0);
  assert.deepEqual(r.wrappedHistory.map(entry => entry.url), ['/pa/rapid-resolution?gclid=SYNTHETIC-click', '/faq']);
  assert.equal(r.router.getSnapshot().location.pathname, '/faq');
  assert.equal(r.api.googleTagMayLoadInDocument(r.win), true);
  r.dispose();
});

test('private locale/intake/portal navigation preserves File and handoff state', () => {
  const r = runtime('https://fabsy.ca/free-ticket-check');
  const file = new r.win.File(['SYNTHETIC ticket bytes'], 'synthetic-ticket.png', { type: 'image/png' });
  const handoff = { ticketImage: file, firstName: 'ਸਿੰਥੈਟਿਕ', driverAccount: 'حساب تجريبي', step: 3 };
  r.router.navigator.push('/submit-ticket', handoff);
  assert.equal(r.router.getSnapshot().location.state.ticketImage, file);
  r.router.navigator.replace('/pa/submit-ticket', handoff);
  assert.equal(r.router.getSnapshot().location.state.ticketImage, file);
  assert.equal(r.router.getSnapshot().location.state.driverAccount, handoff.driverAccount);
  r.pop('/submit-ticket', { idx: 1, key: 'previous-private', usr: handoff });
  assert.equal(r.router.getSnapshot().location.state.ticketImage, file);
  assert.equal(r.fullDocuments.length, 0);
  assert.equal(r.api.markGoogleTagPending(r.win), false);
  r.dispose();
});

test('private documents cannot become public/taggable through navigation or raw URL cleanup', () => {
  for (const href of ['https://fabsy.ca/submit-ticket', 'https://fabsy.ca/rapid-resolution?email=SYNTHETIC']) {
    const r = runtime(href);
    r.native.replace(r.win.history.state, '', '/rapid-resolution');
    assert.equal(r.api.googleTagMayLoadInDocument(r.win), false);
    r.wrapGoogleHistory();
    r.router.navigator.push('/faq');
    assert.equal(r.fullDocuments[0].href, 'https://fabsy.ca/faq');
    assert.equal(r.wrappedHistory.length, 0);
    assert.equal(r.router.getSnapshot().blocked, true);
    r.dispose();
  }
});

test('cross-boundary popstate is captured before Router or later Google listeners', () => {
  for (const [from, to, tagged] of [
    ['/', '/portal/cases/SYNTHETIC', true],
    ['/', '/thank-you?session_id=cs_live_SYNTHETICpop', true],
    ['/submit-ticket', '/rapid-resolution', false],
  ]) {
    const r = runtime('https://fabsy.ca' + from);
    if (tagged) r.api.markGoogleTagPending(r.win);
    let observedByGoogle = 0;
    r.win.addEventListener('popstate', () => { observedByGoogle += 1; }, true);
    r.wrapGoogleHistory();
    r.pop(to);
    assert.equal(observedByGoogle, 0);
    assert.equal(r.wrappedHistory.length, 0);
    assert.equal(r.router.getSnapshot().location.pathname, from);
    assert.equal(r.router.getSnapshot().blocked, true);
    assert.equal(r.fullDocuments.length, 1);
    const next = new URL(r.fullDocuments[0].href);
    assert.equal(next.searchParams.get('__fabsy_document'), '1');
    assert.equal(next.pathname, new URL(to, 'https://fabsy.ca').pathname);
    r.dispose();
  }
});

test('fragment-only navigator and plain-anchor transitions force a document before changing history', () => {
  for (const useAnchor of [false, true]) {
    const r = runtime('https://fabsy.ca/rapid-resolution');
    r.api.markGoogleTagPending(r.win);
    r.wrapGoogleHistory();
    if (useAnchor) {
      const anchor = r.win.document.createElement('a');
      anchor.href = '#SYNTHETIC-private';
      anchor.textContent = 'Synthetic link';
      r.win.document.body.appendChild(anchor);
      const event = new r.win.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      assert.equal(anchor.dispatchEvent(event), false);
    } else r.router.navigator.push('/rapid-resolution#SYNTHETIC-private');
    assert.equal(r.win.location.href, 'https://fabsy.ca/rapid-resolution');
    assert.equal(r.wrappedHistory.length, 0);
    assert.equal(r.fullDocuments[0].href, 'https://fabsy.ca/rapid-resolution?__fabsy_document=1#SYNTHETIC-private');
    const fresh = runtime(r.fullDocuments[0].href);
    assert.equal(fresh.win.location.href, 'https://fabsy.ca/rapid-resolution#SYNTHETIC-private');
    assert.equal(fresh.api.googleTagMayLoadInDocument(fresh.win), false);
    fresh.dispose();
    r.dispose();
  }
});

test('marker cleanup preserves unknown values and duplicate fields', () => {
  for (const suffix of ['?__fabsy_document=SYNTHETIC', '?__fabsy_document=1&__fabsy_document=1', '?__fabsy_document=1&email=SYNTHETIC']) {
    const r = runtime('https://fabsy.ca/rapid-resolution' + suffix);
    assert.equal(r.api.googleTagMayLoadInDocument(r.win), false);
    assert.ok(r.win.location.search.includes(suffix.includes('email') ? 'email=SYNTHETIC' : '__fabsy_document='));
    r.dispose();
  }
});

test('receipt cleanup is one authorized transition; Router retains session without storage or reload', () => {
  const session = 'cs_live_SYNTHETICreceipt';
  for (const prefix of ['', '/en', '/pa', '/tl', '/zh-hans', '/zh-hant', '/ar', '/hi', '/es']) {
    const path = prefix + '/thank-you';
    const r = runtime('https://fabsy.ca' + path + '?session_id=' + session);
    const retained = r.router.getSnapshot().location;
    assert.equal(r.api.googleTagMayLoadInDocument(r.win), false);
    assert.equal(r.api.scrubCheckoutReceiptUrl('cs_live_OTHER', r.win), false);
    assert.equal(r.api.scrubCheckoutReceiptUrl(session, r.win), true);
    assert.equal(r.win.location.href, 'https://fabsy.ca' + path);
    assert.equal(r.router.getSnapshot().location, retained);
    assert.equal(retained.search, '?session_id=' + session);
    assert.equal(JSON.stringify(r.win.history.state).includes(session), false);
    assert.equal(r.win.localStorage.length + r.win.sessionStorage.length, 0);
    assert.equal(r.api.googleTagMayLoadInDocument(r.win), true);
    assert.equal(r.api.scrubCheckoutReceiptUrl(session, r.win), false);
    assert.equal(r.fullDocuments.length, 0);
    r.api.markGoogleTagPending(r.win);
    r.wrapGoogleHistory();
    r.router.navigator.push(path + '?session_id=cs_live_SYNTHETICsecond');
    assert.equal(r.fullDocuments.length, 1);
    assert.equal(r.wrappedHistory.length, 0);
    assert.equal(r.router.getSnapshot().location, retained);
    r.dispose();
  }
});

test('private-to-receipt cannot reuse form memory for the receipt tag exception', () => {
  const r = runtime('https://fabsy.ca/submit-ticket');
  r.router.navigator.push('/thank-you?session_id=cs_live_SYNTHETICreceipt');
  assert.equal(r.fullDocuments.length, 1);
  assert.equal(r.api.scrubCheckoutReceiptUrl('cs_live_SYNTHETICreceipt', r.win), false);
  assert.equal(r.api.googleTagMayLoadInDocument(r.win), false);
  r.dispose();
});

test('extra receipt parameters, fragments, aliases and failed scrubs never authorize Google', () => {
  const session = 'cs_live_SYNTHETICreceipt';
  for (const target of [
    `/thank-you?session_id=${session}&email=SYNTHETIC`, `/thank-you?session_id=${session}#private`,
    `/thank-you?session_id=${session}&session_id=${session}`, '/thank-you?session_id=not-a-session',
    `/thank-you//?session_id=${session}`, `/rapid-resolution?session_id=${session}`,
  ]) {
    const r = runtime('https://fabsy.ca' + target);
    assert.equal(r.api.scrubCheckoutReceiptUrl(session, r.win), false, target);
    assert.equal(r.api.markGoogleTagPending(r.win), false, target);
    r.dispose();
  }
  const r = runtime('https://fabsy.ca/thank-you?session_id=' + session);
  r.native.replace(r.win.history.state, '', '/thank-you?session_id=cs_live_DIFFERENT');
  assert.equal(r.api.scrubCheckoutReceiptUrl(session, r.win), false);
  assert.equal(r.api.googleTagMayLoadInDocument(r.win), false);
  r.dispose();
});

test('an unexpectedly pre-tagged private/receipt document never mounts a private snapshot', () => {
  for (const path of ['/submit-ticket', '/thank-you?session_id=cs_live_SYNTHETIC']) {
    const r = runtime('https://fabsy.ca' + path, true);
    assert.equal(r.snapshots[0].blocked, true);
    assert.equal(r.fullDocuments.length, 1);
    assert.equal(r.api.googleTagMayLoadInDocument(r.win), false);
    r.dispose();
  }
});

test('BFCache restore after cross-tab withdrawal/expiry blocks Google pageshow before remount', () => {
  for (const saved of [null, 'malformed',
    { version: 1, choice: 'declined', savedAt: Date.now() },
    { version: 1, choice: 'accepted', savedAt: Date.now() - 181 * 24 * 60 * 60 * 1000 },
  ]) {
    const r = runtime();
    r.api.setGoogleConsentChoice('accepted');
    r.api.markGoogleTagPending(r.win);
    r.router.navigator.push('/submit-ticket');
    if (saved === null) r.win.localStorage.removeItem(r.api.GOOGLE_CONSENT_STORAGE_KEY);
    else r.win.localStorage.setItem(r.api.GOOGLE_CONSENT_STORAGE_KEY, typeof saved === 'string' ? saved : JSON.stringify(saved));
    let laterPageshow = 0;
    r.win.addEventListener('pageshow', () => { laterPageshow += 1; }, true);
    r.win.dispatchEvent(new r.win.PageTransitionEvent('pageshow', { persisted: true }));
    assert.equal(laterPageshow, 0);
    assert.equal(r.fullDocuments.length, 2);
    assert.equal(r.router.getSnapshot().blocked, true);
    assert.equal(r.api.googleTagMayLoadInDocument(r.win), false);
    r.dispose();
  }
});

test('BFCache can restore the same public document only with still-valid persisted consent', () => {
  const r = runtime();
  r.api.setGoogleConsentChoice('accepted');
  r.api.markGoogleTagPending(r.win);
  r.router.navigator.push('/submit-ticket');
  r.win.dispatchEvent(new r.win.PageTransitionEvent('pageshow', { persisted: true }));
  assert.equal(r.fullDocuments.length, 1);
  assert.equal(r.router.getSnapshot().blocked, false);
  assert.equal(r.api.googleTagMayLoadInDocument(r.win), true);
  r.dispose();
});

test('BFCache cannot restore a tag using stale readable acceptance when storage no longer records withdrawal', () => {
  for (const failure of ['throw-on-set', 'throw-on-remove', 'silent-set', 'silent-remove']) {
    const r = runtime();
    r.api.setGoogleConsentChoice('accepted');
    const savedAcceptance = r.win.localStorage.getItem(r.api.GOOGLE_CONSENT_STORAGE_KEY);
    r.api.markGoogleTagPending(r.win);
    r.router.navigator.push('/submit-ticket');
    // Readable permission remains, but this restored document cannot safely
    // record a future withdrawal. Use a complete Storage-shaped facade so
    // failures are confined to exactly the operation named by each fixture.
    const storage = r.win.localStorage;
    Object.defineProperty(r.win, 'localStorage', { configurable: true, value: {
      getItem: key => storage.getItem(key),
      setItem: (key, value) => {
        if (failure === 'throw-on-set') throw new Error('Synthetic read-only storage');
        if (failure !== 'silent-set') storage.setItem(key, value);
      },
      removeItem: key => {
        if (failure === 'throw-on-remove') throw new Error('Synthetic blocked removal');
        if (failure !== 'silent-remove') storage.removeItem(key);
      },
      clear: () => storage.clear(),
      key: index => storage.key(index),
      get length() { return storage.length; },
    } });
    let laterPageshow = 0;
    r.win.addEventListener('pageshow', () => { laterPageshow += 1; }, true);
    r.win.dispatchEvent(new r.win.PageTransitionEvent('pageshow', { persisted: true }));
    assert.equal(storage.getItem(r.api.GOOGLE_CONSENT_STORAGE_KEY), savedAcceptance, failure);
    assert.equal(laterPageshow, 0, failure);
    assert.equal(r.fullDocuments.length, 2, failure);
    assert.equal(r.router.getSnapshot().blocked, true, failure);
    assert.equal(r.api.googleTagMayLoadInDocument(r.win), false, failure);
    r.dispose();
  }
});

test('malformed/cross-origin programmatic URLs cannot reach history or Location navigation', () => {
  for (const target of ['//evil.invalid/portal', 'https://evil.invalid/portal', 'javascript:alert(1)', 'https://synthetic:secret@fabsy.ca/']) {
    const r = runtime();
    r.api.markGoogleTagPending(r.win);
    r.wrapGoogleHistory();
    assert.throws(() => r.router.navigator.push(target), /same-origin HTTP URL/);
    assert.equal(r.wrappedHistory.length + r.fullDocuments.length, 0);
    r.dispose();
  }
});

test('document guardian survives a held private navigation and retires pending/loaded tags on withdrawal', async () => {
  const env = { PROD: true, VITE_GOOGLE_MEASUREMENT_ENABLED: 'true', VITE_GA4_MEASUREMENT_ID: 'G-TEST123456' };
  const bundle = await build({
    absWorkingDir: root,
    stdin: { sourcefile: 'held-document-withdrawal.tsx', resolveDir: root, loader: 'tsx', contents: `
      import React, { act, useEffect } from 'react';
      import { createRoot } from 'react-dom/client';
      import { useLocation, useNavigate } from 'react-router-dom';
      import MeasurementRouter from './src/components/MeasurementRouter';
      import Analytics from './src/components/Analytics';
      export * from './src/lib/googleConsent';
      export { dispatchGoogleMeasurement } from './src/lib/googleMeasurement';
      export { googleTagMayLoadInDocument } from './src/lib/measurementNavigation';
      export const documentRequests = [];
      export const renderedPaths = [];
      export let routeUnmounts = 0;
      let root, navigate;
      function Probe() {
        navigate = useNavigate();
        renderedPaths.push(useLocation().pathname);
        useEffect(() => () => { routeUnmounts += 1; }, []);
        return <p data-route-probe>Public synthetic fixture</p>;
      }
      export async function mount() {
        root = createRoot(document.getElementById('root'));
        await act(async () => root.render(<MeasurementRouter navigateDocument={(url, method) => {
          documentRequests.push({ href: url.href, method });
        }}><Analytics /><Probe /></MeasurementRouter>));
      }
      export async function holdNavigation() { await act(async () => navigate('/submit-ticket')); }
      export async function tick(callback) { await act(async () => callback()); }
      export async function unmount() { await act(async () => root?.unmount()); }
    ` },
    bundle: true, write: false, format: 'cjs', platform: 'browser', jsx: 'automatic', logLevel: 'silent',
    define: { 'import.meta.env': JSON.stringify(env), 'process.env.NODE_ENV': '"test"' },
  });
  const scenarios = [
    ...[false, true].flatMap(loaded => ['cross-tab', 'same-document', 'bfcache-restore'].map(withdrawal => ({ loaded, withdrawal, initialPath: '/' }))),
    ...['/representation-consent?token=SYNTHETIC', '/pa/representation-consent?token=SYNTHETIC', '/fleet']
      .map(initialPath => ({ loaded: false, withdrawal: 'none', initialPath })),
  ];
  for (const { loaded, withdrawal, initialPath } of scenarios) {
    const retirements = [];
    const errors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', error => {
      // No actual navigation: a reload attempt plus the disable flag proves
      // the still-mounted guardian retired the tag before the held request.
      if (error.message.includes('Not implemented: navigation')) retirements.push(error.message);
      else errors.push(error.message);
    });
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'https://fabsy.ca' + initialPath, runScripts: 'outside-only', virtualConsole,
      // No resource loader; inserted Google script elements remain inert.
    });
    const win = dom.window;
    const channels = [];
    const network = [];
    const forbidden = () => { network.push('forbidden'); throw new Error('Held navigation fixture forbids network'); };
    win.fetch = forbidden;
    win.navigator.sendBeacon = forbidden;
    win.XMLHttpRequest = class { constructor() { forbidden(); } };
    win.MessageChannel = class {
      constructor() { const channel = new MessageChannel(); channels.push(channel); return channel; }
    };
    win.IS_REACT_ACT_ENVIRONMENT = true;
    const context = dom.getInternalVMContext();
    context.module = { exports: {} };
    context.exports = context.module.exports;
    runInContext(bundle.outputFiles[0].text, context);
    const api = context.module.exports;
    try {
      api.setGoogleConsentChoice('accepted');
      await api.mount();
      const script = win.document.getElementById('fabsy-google-tag');
      if (initialPath !== '/') {
        assert.equal(script, null, 'the persistent guardian must never initialize on private routes');
        assert.equal(win.dataLayer, undefined, initialPath);
        assert.equal(api.documentRequests.length, 0);
        assert.deepEqual(network, []);
        assert.deepEqual(errors, []);
        continue;
      }
      assert.ok(script);
      const staleOnload = script.onload;
      if (loaded) staleOnload();
      const commands = () => JSON.parse(JSON.stringify(Array.from(win.dataLayer, command => Array.from(command))));
      const before = commands();
      const nativeCalls = [];
      for (const method of ['pushState', 'replaceState']) {
        const original = win.history[method].bind(win.history);
        win.history[method] = (...args) => { nativeCalls.push(args); return original(...args); };
      }
      await api.holdNavigation();
      assert.equal(api.documentRequests.length, 1);
      assert.equal(api.documentRequests[0].href, 'https://fabsy.ca/submit-ticket');
      assert.equal(api.routeUnmounts, 1, 'Analytics and the route subtree have actually unmounted');
      assert.equal(api.renderedPaths.includes('/submit-ticket'), false);
      assert.equal(win.document.querySelector('[data-route-probe]'), null);
      assert.ok(win.document.querySelector('main[aria-busy="true"]'));
      assert.equal(win.location.href, 'https://fabsy.ca/');
      assert.equal(nativeCalls.length, 0, 'private URL must not reach wrapped history');
      assert.equal(win[`ga-disable-${env.VITE_GA4_MEASUREMENT_ID}`], undefined);
      let laterPageshow = 0;
      win.addEventListener('pageshow', event => { if (event.persisted) laterPageshow += 1; }, true);
      await api.tick(() => {
        if (withdrawal === 'same-document') api.setGoogleConsentChoice('declined');
        else {
          win.localStorage.setItem(api.GOOGLE_CONSENT_STORAGE_KEY, JSON.stringify({ version: 1, choice: 'declined', savedAt: Date.now() }));
          // BFCache may restore after durable consent changed without this
          // document first receiving a storage event. Capture must retire the
          // tag even though it suppresses Guardian's normal pageshow listener.
          win.dispatchEvent(withdrawal === 'bfcache-restore'
            ? new win.PageTransitionEvent('pageshow', { persisted: true })
            : new win.StorageEvent('storage', { key: api.GOOGLE_CONSENT_STORAGE_KEY, storageArea: win.localStorage }));
        }
      });
      assert.equal(api.getGoogleConsentChoice(), 'declined');
      assert.equal(win[`ga-disable-${env.VITE_GA4_MEASUREMENT_ID}`], true);
      assert.equal(retirements.length, 1, `${withdrawal}, loaded=${loaded}`);
      assert.equal(script.onload, null);
      assert.equal(script.onerror, null);
      assert.equal(api.googleTagMayLoadInDocument(win), false);
      assert.ok(win.document.querySelector('main[aria-busy="true"]'));
      if (withdrawal === 'bfcache-restore') {
        assert.equal(laterPageshow, 0, 'later Google pageshow observers must stay suppressed');
        assert.equal(api.documentRequests.length, 2);
        assert.equal(api.documentRequests[1].method, 'replace');
      }
      staleOnload();
      assert.equal(api.dispatchGoogleMeasurement('page_view', { send_to: env.VITE_GA4_MEASUREMENT_ID }), false);
      assert.deepEqual(commands(), before, 'no denied ping or stale loader dispatch');
      assert.deepEqual(network, []);
      assert.deepEqual(errors, []);
    } finally {
      await api.unmount();
      for (const channel of channels) { channel.port1.close(); channel.port2.close(); }
      win.close();
    }
  }
});
