import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInContext } from 'node:vm';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiled = await build({
  absWorkingDir: root,
  stdin: { contents: `export * from './src/config/live-chat';
    export * from './src/lib/liveChat';
    export * from './src/lib/measurementNavigation';
    export * from './src/lib/publicMeasurementUrl';`, resolveDir: root },
  bundle: true, write: false, platform: 'browser', format: 'cjs',
  define: { 'import.meta.env': '{"PROD":false}' }, logLevel: 'silent',
});

// Inert provider only: these tests never contact Tawk or send a message.
function fixture(href = 'https://fabsy.ca/', referrer = '') {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: href, ...(referrer ? { referrer } : {}), runScripts: 'outside-only',
  });
  const win = dom.window;
  const context = dom.getInternalVMContext();
  context.module = { exports: {} }; context.exports = context.module.exports;
  const timeouts = [];
  context.setTimeout = fn => { timeouts.push(fn); return timeouts.length; };
  context.clearTimeout = () => {};
  win.fetch = () => { throw new Error('Network forbidden'); };
  runInContext(compiled.outputFiles[0].text, context);
  const api = context.module.exports;
  const leaves = [];
  const router = api.createMeasurementHistory({
    window: win, isPublicUrl: api.publicMeasurementDocumentUrl,
    isProviderPublicUrl: api.publicProviderMeasurementUrl,
    navigateDocument: (url, method) => leaves.push({ href: url.href, method }),
  });
  const unlisten = router.listen(() => {});
  return { dom, win, api, router, leaves, timeouts, close() { unlisten(); dom.window.close(); } };
}

test('public/localized articles work; intake, contacts, portals, unknown and token URLs do not', () => {
  const r = fixture();
  for (const path of ['/', '/about', '/photo-radar', '/es/rapid-resolution', '/blog/alberta-tickets', '/content/speeding-ticket-calgary']) {
    assert.equal(r.api.isLiveChatUrl('https://fabsy.ca' + path), true, path);
  }
  for (const path of ['/submit-ticket', '/contact', '/fleet', '/free-ticket-check', '/admin', '/portal/cases/abc', '/representation-consent?token=secret', '/pay/abc', '/es/submit-ticket', '/%73ubmit-ticket', '/not-a-page', '/about?email=a%40example.invalid', '/about#access_token=secret']) {
    assert.equal(r.api.isLiveChatUrl('https://fabsy.ca' + path), false, path);
  }
  assert.equal(r.api.liveChatContextAllowed('https://fabsy.ca/', 'https://fabsy.ca/portal/cases/abc'), false);
  assert.equal(r.api.liveChatContextAllowed('https://fabsy.ca/', 'https://example.invalid/?token=secret'), false);
  r.close();
});

test('the official script loads once and callbacks remain safe after a late private transition', () => {
  const r = fixture();
  r.api.setLiveChatVisible(true);
  r.api.setLiveChatVisible(true);
  const scripts = r.win.document.querySelectorAll('#fabsy-tawk-widget');
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, 'https://embed.tawk.to/6aa1fe19a9c2983442420e67/1k24ch563');
  assert.equal(scripts[0].async, true);
  assert.equal(scripts[0].referrerPolicy, 'no-referrer');
  assert.equal(r.win.Tawk_API.customStyle.visibility.mobile.yOffset, 120);
  const calls = [];
  for (const action of ['minimize', 'hideWidget', 'shutdown', 'showWidget', 'start']) r.win.Tawk_API[action] = () => calls.push(action);
  r.api.setLiveChatVisible(false);
  r.win.Tawk_API.onBeforeLoad();
  r.win.Tawk_API.onLoad();
  assert.ok(calls.includes('minimize'));
  assert.ok(calls.includes('shutdown'));
  assert.ok(!calls.includes('showWidget') && !calls.includes('start'));
  r.api.setLiveChatVisible(true);
  assert.equal(calls.at(-1), 'start');
  assert.equal(r.win.document.querySelectorAll('#fabsy-tawk-widget').length, 1);
  r.close();
});

test('provider failure and slow secondary bundles expose the contact fallback, late success removes it', () => {
  const r = fixture(); const states = [];
  const stop = r.api.subscribeLiveChatFailure(value => states.push(value));
  r.api.setLiveChatVisible(true);
  r.win.document.querySelector('#fabsy-tawk-widget').onerror();
  assert.equal(states.at(-1), true);
  r.timeouts.at(-1)();
  assert.equal(states.at(-1), true);
  r.win.Tawk_API.onLoad();
  assert.equal(states.at(-1), false);
  stop(); r.close();
});

test('narrow desktop and embedded browsers also clear the mobile purchase bar', () => {
  const r = fixture();
  r.win.innerWidth = 390;
  r.api.setLiveChatVisible(true);
  assert.equal(r.win.Tawk_API.customStyle.visibility.desktop.yOffset, 120);
  r.close();
});

test('public navigation preserves the widget; private navigation starts an untagged document before history changes', () => {
  const r = fixture('https://fabsy.ca/blog/alberta-tickets');
  assert.equal(r.api.chatTagMayLoadInDocument(r.win), true);
  r.api.setLiveChatVisible(true);
  r.router.navigator.push('/about', null);
  assert.equal(r.leaves.length, 0);
  assert.equal(r.win.location.pathname, '/about');
  r.router.navigator.push('/submit-ticket?token=synthetic', { customer: 'synthetic' });
  assert.equal(r.leaves.length, 1);
  assert.equal(r.win.location.pathname, '/about');
  assert.equal(r.router.getSnapshot().blocked, true);
  assert.equal(r.api.chatTagMayLoadInDocument(r.win), false);
  assert.equal(r.win.document.querySelector('meta[name="referrer"]').content, 'no-referrer');
  r.close();
});

test('a private document cannot later initialize chat just because its URL was replaced', () => {
  const r = fixture('https://fabsy.ca/admin');
  assert.equal(r.api.chatTagMayLoadInDocument(r.win), false);
  r.win.history.replaceState(null, '', '/about');
  assert.equal(r.api.chatTagMayLoadInDocument(r.win), false);
  r.close();
});

test('chat never obtains verified payment receipt privileges', () => {
  const r = fixture('https://fabsy.ca/thank-you?session_id=cs_live_SYNTHETIC');
  assert.equal(r.api.chatTagMayLoadInDocument(r.win), false);
  r.api.scrubCheckoutReceiptUrl('cs_live_SYNTHETIC', r.win);
  assert.equal(r.api.chatTagMayLoadInDocument(r.win), false);
  assert.equal(r.api.authorizeMeasurementProviderOnVerifiedReceipt('tawk', r.win), false);
  r.close();
});
