import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { MessageChannel } from 'node:worker_threads';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

const compiled = await build({
  absWorkingDir: resolve(import.meta.dirname, '..'),
  stdin: { sourcefile: 'checkout-test.tsx', resolveDir: resolve(import.meta.dirname, '..'), loader: 'tsx', contents: `
    import React, { act } from 'react';
    import { createRoot } from 'react-dom/client';
    import { MemoryRouter } from 'react-router-dom';
    import Checkout from './src/pages/ManualCheckout';
    import AdminCheckout from './src/pages/AdminCheckoutLinks';
    let root;
    export { act };
    export async function mount(admin = false) { root = createRoot(document.getElementById('root')); await act(async () => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{admin ? <AdminCheckout /> : <Checkout />}</MemoryRouter>)); }
    export async function change(element, value) { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); }); }
    export async function click(element) { await act(async () => element.click()); }
    export async function unmount() { await act(async () => root.unmount()); }
  ` },
  bundle: true, write: false, platform: 'browser', format: 'cjs', jsx: 'automatic', logLevel: 'silent',
  define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"test"' },
  plugins: [{ name: 'offline-checkout', setup(bundler) {
    bundler.onResolve({ filter: /integrations\/supabase\/client$/ }, () => ({ path: 'backend', namespace: 'offline' }));
    bundler.onResolve({ filter: /hooks\/useSafeHead$/ }, () => ({ path: 'head', namespace: 'offline' }));
    bundler.onResolve({ filter: /hooks\/useIdrAuth$/ }, () => ({ path: 'staff', namespace: 'offline' }));
    bundler.onLoad({ filter: /.*/, namespace: 'offline' }, ({ path }) => ({ loader: 'js', contents: path === 'backend'
      ? 'export const supabase = { auth: { getSession: async () => ({ data: { session: window.__staff ? {} : null } }) }, functions: { invoke: (...args) => window.__invoke(...args) } };'
      : path === 'staff' ? 'export const getIdrStaffRole = async () => window.__staff ? "admin" : null;'
      : 'export default function useSafeHead() {}' }));
  } }],
});

const fixture = { submissionId: '11111111-1111-4111-8111-111111111111', clientId: '22222222-2222-4222-8222-222222222222',
  firstName: 'Alex', lastName: 'Example', email: 'alex@example.test', ticketNumber: 'TEST-TICKET', violation: 'Speeding',
  violationDate: '2026-09-01', ticketType: 'photo_radar', registeredOwnerOnOffenceDate: 'yes', consentSigned: false,
  consentAccepted: false, pleadNotGuilty: null, paymentState: 'not_started', priceCad: 79, priceLabel: '$79 CAD plus 5% GST ($82.95 total)' };
const credentials = `#case=${fixture.submissionId}&token=${'a'.repeat(64)}`;

async function runtime(t, record = {}, hash = credentials, { admin = false, staff = true } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
    url: `https://fabsy.invalid/representation-payment${hash}`, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
  });
  const { window } = dom;
  const calls = []; const channels = [];
  const state = { failConsent: false, failPdf: false, failPayment: false, pendingConsent: null };
  const blocked = () => { throw new Error('Unexpected real network in checkout test'); };
  window.fetch = blocked; window.XMLHttpRequest = class { constructor() { blocked(); } }; window.navigator.sendBeacon = blocked;
  window.Response = Response; window.Request = Request; window.Headers = Headers;
  window.scrollTo = () => {}; window.HTMLElement.prototype.scrollIntoView = () => {};
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.IS_REACT_ACT_ENVIRONMENT = true;
  window.__staff = staff;
  window.MessageChannel = class extends MessageChannel { constructor() { super(); channels.push(this); } };
  window.__invoke = async (name, { body }) => {
    calls.push({ name, body });
    if (name === 'manual-representation-link' && body.action === 'read') return { data: { ...fixture, ...record }, error: null };
    if (name === 'manual-representation-link' && body.action === 'create') return { data: {
      submissionId: fixture.submissionId, checkoutUrl: `https://fabsy.invalid/representation-payment${credentials}`,
      emailSubject: `Ticket ${body.ticketNumber} — Consent and secure payment`, emailBody: 'Synthetic review and payment message',
    }, error: null };
    if (name === 'manual-representation-link' && body.action === 'consent') {
      if (state.pendingConsent) await state.pendingConsent;
      return state.failConsent ? { data: null, error: new window.Error('Consent unavailable') } : { data: { success: true }, error: null };
    }
    if (name === 'generate-consent-form') return state.failPdf ? { data: null, error: new window.Error('PDF unavailable') } : { data: { success: true, consentFormPath: 'synthetic/consent.pdf' }, error: null };
    if (name === 'create-payment') return state.failPayment ? { data: null, error: new window.Error('Checkout unavailable') } : { data: { url: 'https://checkout.stripe.com/c/pay/cs_test_synthetic' }, error: null };
    throw new Error(`Unexpected request: ${name}`);
  };
  window.module = { exports: {} }; window.exports = window.module.exports;
  window.eval(compiled.outputFiles[0].text);
  const api = window.module.exports;
  t.after(async () => { await api.unmount(); for (const channel of channels) { channel.port1.close(); channel.port2.close(); } window.close(); });
  await api.mount(admin);
  const button = () => [...window.document.querySelectorAll('button')].find(node => /Continue to secure payment|Resume secure payment|Saving and opening/.test(node.textContent));
  return { window, api, state, calls, button, checkbox: id => window.document.getElementById(id) };
}

test('checkboxes start unchecked, and payment cannot start without consent', async t => {
  const r = await runtime(t);
  assert.equal(r.checkbox('checkout-consent').getAttribute('data-state'), 'unchecked');
  assert.equal(r.checkbox('checkout-plea').getAttribute('data-state'), 'unchecked');
  assert.equal(r.button().disabled, true);
  await r.api.click(r.button());
  assert.deepEqual(r.calls.map(call => call.body.action), ['read']);
  assert.equal(r.window.location.hash, '');
  assert.ok(!r.window.document.body.textContent.includes('a'.repeat(64)));
});

for (const plea of [false, true]) test(`consent, PDF and payment run in order with plea=${plea}`, async t => {
  const r = await runtime(t);
  await r.api.click(r.checkbox('checkout-consent'));
  if (plea) await r.api.click(r.checkbox('checkout-plea'));
  await r.api.click(r.button());
  assert.deepEqual(r.calls.slice(1).map(call => [call.name, call.body.action]), [
    ['manual-representation-link', 'consent'], ['generate-consent-form', undefined], ['create-payment', undefined],
  ]);
  assert.equal(r.calls[1].body.consent.pleadNotGuilty, plea);
  assert.equal(r.calls[1].body.consent.accepted, true);
  assert.equal(r.calls[3].body.formData.ticketNumber, 'TEST-TICKET');
  assert.equal(r.calls[3].body.clientId, fixture.clientId);
  assert.equal(r.calls[3].body.includeIdrAddon, false);
  assert.equal('price' in r.calls[3].body, false);
});

test('consent failure stops before PDF and payment, while allowing retry', async t => {
  const r = await runtime(t); r.state.failConsent = true;
  await r.api.click(r.checkbox('checkout-consent')); await r.api.click(r.button());
  assert.equal(r.calls.length, 2); assert.match(r.window.document.body.textContent, /Consent unavailable/);
  r.state.failConsent = false; await r.api.click(r.button());
  assert.equal(r.calls.at(-1).name, 'create-payment');
});

test('PDF failure retains the acceptance and retries without recording new consent', async t => {
  const r = await runtime(t); r.state.failPdf = true;
  await r.api.click(r.checkbox('checkout-consent')); await r.api.click(r.button());
  assert.equal(r.calls.at(-1).name, 'generate-consent-form');
  assert.match(r.window.document.body.textContent, /PDF unavailable/);
  assert.equal(r.checkbox('checkout-consent'), null);
  r.state.failPdf = false; await r.api.click(r.button());
  assert.equal(r.calls.filter(call => call.body.action === 'consent').length, 1);
  assert.equal(r.calls.at(-1).name, 'create-payment');
});

test('checkout failure retries only payment after consent PDF was saved', async t => {
  const r = await runtime(t); r.state.failPayment = true;
  await r.api.click(r.checkbox('checkout-consent')); await r.api.click(r.button());
  r.state.failPayment = false; await r.api.click(r.button());
  assert.equal(r.calls.filter(call => call.body.action === 'consent').length, 1);
  assert.equal(r.calls.filter(call => call.name === 'generate-consent-form').length, 1);
  assert.equal(r.calls.filter(call => call.name === 'create-payment').length, 2);
});

test('reload after consent acceptance can resume PDF creation without a new choice', async t => {
  const r = await runtime(t, { consentAccepted: true, pleadNotGuilty: false });
  assert.equal(r.checkbox('checkout-consent'), null); assert.equal(r.button().disabled, false);
  assert.match(r.window.document.body.textContent, /not authorized a plea/);
  await r.api.click(r.button());
  assert.deepEqual(r.calls.slice(1).map(call => call.name), ['generate-consent-form', 'create-payment']);
});

test('paid and closed cases have no consent or checkout action', async t => {
  for (const paymentState of ['paid', 'unavailable']) {
    const r = await runtime(t, { paymentState });
    assert.equal(r.button(), undefined); assert.equal(r.checkbox('checkout-consent'), null);
    assert.equal(r.calls.length, 1);
  }
});

test('incomplete private link does not load a case', async t => {
  const r = await runtime(t, {}, '#case=broken&token=bad');
  assert.match(r.window.document.body.textContent, /Private link unavailable/);
  assert.equal(r.calls.length, 0);
});

test('double clicks cannot create overlapping consent or checkout requests', async t => {
  const r = await runtime(t); let release;
  r.state.pendingConsent = new Promise(resolve => { release = resolve; });
  await r.api.click(r.checkbox('checkout-consent'));
  await r.api.act(async () => { r.button().click(); r.button().click(); });
  assert.equal(r.calls.filter(call => call.body.action === 'consent').length, 1);
  await r.api.act(async () => release());
  assert.equal(r.calls.filter(call => call.name === 'create-payment').length, 1);
});

test('staff checkout generator requires confirmed email receipt and camera ownership', async t => {
  const r = await runtime(t, {}, '', { admin: true });
  const create = [...r.window.document.querySelectorAll('button')].find(node => /Create consent and payment/.test(node.textContent));
  for (const [field, value] of Object.entries({ firstName: 'Alex', lastName: 'Example', email: 'alex@example.test', ticketNumber: 'TEST-TICKET' })) {
    await r.api.change(r.window.document.getElementById(`checkout-link-${field}`), value);
  }
  assert.equal(create.disabled, true);
  await r.api.click(r.checkbox('checkout-link-received'));
  assert.equal(create.disabled, true);
  await r.api.click(r.checkbox('checkout-link-owner'));
  assert.equal(create.disabled, false);
  await r.api.click(create);
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].body.action, 'create');
  assert.equal(r.calls[0].body.ticketNumber, 'TEST-TICKET');
  assert.equal(r.calls[0].body.registeredOwnerOnOffenceDate, 'yes');
  assert.match(r.window.document.getElementById('created-checkout-link').value, /representation-payment#case=/);
  assert.match(r.window.document.getElementById('checkout-email-subject').value, /TEST-TICKET/);
  assert.equal(create.disabled, true, 'Successful creation cannot be submitted twice');
});

test('unsigned staff visitors cannot access the link generator', async t => {
  const r = await runtime(t, {}, '', { admin: true, staff: false });
  assert.equal(r.window.document.getElementById('checkout-link-firstName'), null);
  assert.equal(r.calls.length, 0);
});
