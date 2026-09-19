import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { MessageChannel } from 'node:worker_threads';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = resolve(import.meta.dirname, '..');
const bundle = await build({
  absWorkingDir: root,
  stdin: {
    sourcefile: 'instant-assessment-tests.tsx', resolveDir: root, loader: 'tsx',
    contents: `
      import React, { act } from 'react';
      import { createRoot } from 'react-dom/client';
      import { MemoryRouter, useLocation } from 'react-router-dom';
      import InstantTicketAssessment from './src/components/InstantTicketAssessment';
      export * from './src/lib/assessment/instantEstimate';
      export { publicMeasurementDocumentUrl } from './src/lib/publicMeasurementUrl';
      export { act };
      let root, routeSnapshot;
      function Probe() { routeSnapshot = useLocation(); return routeSnapshot.pathname === '/' ? <InstantTicketAssessment /> : <p>Intake handoff</p>; }
      export function handoff() { return routeSnapshot; }
      export async function mount(entry = '/?assessment=1') {
        root = createRoot(document.getElementById('root'));
        await act(async () => root.render(<MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Probe /></MemoryRouter>));
      }
      export async function unmount() { await act(async () => root.unmount()); }
      export async function edit(node, value) {
        await act(async () => {
          const proto = node.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, value);
          node.dispatchEvent(new Event('input', { bubbles: true }));
          node.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }
      export async function click(node) { await act(async () => node.click()); }
      export async function choose(node, file) {
        await act(async () => {
          Object.defineProperty(node, 'files', { configurable: true, value: file ? [file] : [] });
          node.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }
    `,
  },
  bundle: true, write: false, platform: 'browser', format: 'cjs', jsx: 'automatic', logLevel: 'silent',
  define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"test"' },
  plugins: [{ name: 'offline-ocr', setup(bundler) {
    bundler.onResolve({ filter: /integrations\/supabase\/client$/ }, () => ({ path: 'backend', namespace: 'offline' }));
    bundler.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({ contents: 'export const supabase = { functions: { invoke: (...args) => globalThis.__ocr(...args) } };', loader: 'js' }));
  } }],
});

async function runtime(t, mount = true, entry = '/?assessment=1') {
  const errors = [], forbidden = [], requests = [], channels = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://offline.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console });
  const { window } = dom;
  const blocked = () => { forbidden.push('network'); throw new Error('Network is forbidden in this test'); };
  window.fetch = blocked;
  window.XMLHttpRequest = class { constructor() { blocked(); } };
  window.MessageChannel = class { constructor() { const c = new MessageChannel(); channels.push(c); return c; } };
  window.IS_REACT_ACT_ENVIRONMENT = true;
  window.__ocr = (name, options) => {
    assert.equal(name, 'ocr-ticket');
    assert.match(options.body.imageBase64, /^data:image\/png;base64,/);
    return new Promise(resolve => requests.push(resolve));
  };
  window.module = { exports: {} };
  window.eval(bundle.outputFiles[0].text);
  const api = window.module.exports;
  t.after(async () => {
    if (mount) await api.unmount();
    for (const c of channels) { c.port1.close(); c.port2.close(); }
    window.close();
    assert.deepEqual(errors, []);
    assert.deepEqual(forbidden, []);
  });
  if (mount) await api.mount(entry);
  const field = name => {
    const el = window.document.getElementById(`assessment-${name}`);
    assert.ok(el, `Expected ${name} field`);
    return el;
  };
  const button = text => {
    const el = [...window.document.querySelectorAll('button')].find(el => el.textContent.trim() === text);
    assert.ok(el, `Expected ${text} button`);
    return el;
  };
  const edit = (name, value) => api.edit(field(name), value);
  const fill = async () => { await edit('offence', 'lowSpeeding'); await edit('fine', '300'); await edit('demerits', '3'); await edit('record', 'yes'); };
  const flush = () => api.act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  const until = async predicate => { for (let i = 0; i < 50 && !predicate(); i++) await flush(); assert.ok(predicate()); };
  const choose = async (name = 'synthetic-ticket.png', type = 'image/png') => {
    const file = new window.File(['SYNTHETIC TEST DATA'], name, { type });
    await api.choose(window.document.querySelector('input[type="file"][accept*="application/pdf"]'), file);
    return file;
  };
  const finish = async (index, data) => { await api.act(async () => requests[index]({ data: { success: true, data }, error: null })); };
  return { api, window, requests, field, button, edit, fill, choose, until, finish, text: () => window.document.body.textContent };
}

const base = { ticketType: 'officer_issued', offence: 'lowSpeeding', fineAmount: 300, demerits: 3, cleanRecord: true, annualPremium: 1800 };
const plain = value => JSON.parse(JSON.stringify(value));

test('first interaction enters the private assessment before accepting ticket data', async t => {
  const { api, window, field } = await runtime(t, true, '/');
  assert.equal(window.document.querySelector('input[type="file"]'), null);
  assert.equal(field('fine').readOnly, true);
  assert.equal(api.publicMeasurementDocumentUrl(new window.URL('https://fabsy.ca/?assessment=1#assessment-fine')), false);
  await api.click(field('fine'));
  assert.equal(api.handoff().search, '?assessment=1');
  assert.equal(api.handoff().hash, '#assessment-fine');
  assert.equal(field('fine').readOnly, false);
  assert.equal(field('fine').value, '');
  assert.ok(window.document.querySelector('input[type="file"]'));
});

test('officer estimate sums both benefits, deducts $198 once, and separates GST', async t => {
  const { api } = await runtime(t, false);
  const result = api.calculateInstantEstimate(base);
  assert.deepEqual(plain(result.fineReduction), { min: 0, max: 15000 });
  assert.deepEqual(plain(result.insuranceImpact), { min: 0, max: 81000 });
  assert.deepEqual(plain(result.netSavings), { min: -19800, max: 76200 });
  assert.deepEqual(plain(result.netAfterGst), { min: -20790, max: 75210 });
  assert.equal(result.gst, 990);
  assert.equal(api.calculateInstantEstimate({ ...base, cleanRecord: false }).fineReduction.max, 12000);
  assert.equal(api.calculateInstantEstimate({ ...base, annualPremium: 0 }).insuranceImpact.max, 0);
  assert.equal(api.calculateInstantEstimate({ ...base, demerits: 0 }).insuranceImpact.max, result.insuranceImpact.max, 'points must not manufacture insurance savings');
});

test('camera rules always use $79 with no insurance or demerits and preserve negative savings', async t => {
  const { api } = await runtime(t, false);
  const result = api.calculateInstantEstimate({ ...base, ticketType: 'photo_radar', fineAmount: 200, demerits: 6, annualPremium: 9999, cleanRecord: false });
  assert.equal(result.fee, 7900);
  assert.equal(result.gst, 395);
  assert.equal(result.demerits, 0);
  assert.deepEqual(plain(result.insuranceImpact), { min: 0, max: 0 });
  assert.deepEqual(plain(result.netSavings), { min: -7900, max: -5900 });
});

test('currency rounds in cents and invalid inputs never produce a financial range', async t => {
  const { api } = await runtime(t, false);
  const result = api.calculateInstantEstimate({ ...base, fineAmount: 300.01 });
  assert.equal(result.fineReduction.max, 15001);
  assert.equal(api.formatEstimateMoney(-19800), '-$198');
  for (const invalid of [{ fineAmount: NaN }, { fineAmount: Infinity }, { fineAmount: -1 }, { fineAmount: 0 }, { fineAmount: 1_000_001 }, { annualPremium: -1 }, { annualPremium: NaN }, { demerits: -1 }, { demerits: 1.5 }, { demerits: 16 }, { cleanRecord: null }, { offence: '__proto__' }, { ticketType: 'unknown' }]) {
    assert.throws(() => api.calculateInstantEstimate({ ...base, ...invalid }));
  }
  assert.equal(api.extractedFine('$1,234.50'), '1234.50');
  for (const invalid of ['', null, '300xyz', -1, Infinity]) assert.equal(api.extractedFine(invalid), '');
  assert.equal(api.extractAssessmentBasics({ violation: 'Speeding' }).offence, '', 'unknown speed band requires a user answer');
  assert.equal(api.extractAssessmentBasics({ ticketType: 'photo_radar', violation: 'Speeding (35 km/h over)' }).offence, 'lowSpeeding', 'camera speeding must use an available camera option regardless of speed');
});

test('manual form validates, calculates and recalculates without stale results', async t => {
  const app = await runtime(t);
  await app.api.click(app.button('Instant Ticket Assessment'));
  assert.doesNotMatch(app.text(), /Combined possible net savings/);
  await app.fill();
  await app.api.click(app.button('Instant Ticket Assessment'));
  assert.match(app.text(), /-\$198 to \$762/);
  assert.match(app.window.document.activeElement.textContent, /Your possible savings/);
  await app.api.click(app.button('Edit ticket details'));
  assert.equal(app.field('fine').value, '300');
  await app.edit('fine', '400');
  await app.api.click(app.button('Instant Ticket Assessment'));
  assert.match(app.text(), /-\$198 to \$812/);
  const link = app.window.document.querySelector('a[href="/submit-ticket"]');
  await app.api.click(link);
  assert.equal(app.api.handoff().state.prefillTicketData.fineAmount, '400');
  assert.equal(app.api.handoff().state.prefillTicketData.priorTickets, 'none');
});

test('camera form calculates without record answers and hands off to the camera intake', async t => {
  const app = await runtime(t);
  await app.api.click(app.window.document.querySelector('input[value="photo_radar"]'));
  assert.equal(app.field('demerits').value, '0');
  assert.equal(app.field('demerits').disabled, true);
  await app.edit('offence', 'lowSpeeding');
  await app.edit('fine', '200');
  await app.api.click(app.button('Instant Ticket Assessment'));
  assert.match(app.text(), /-\$79 to -\$59/);
  const link = app.window.document.querySelector('a[href="/submit-ticket?ticket_type=photo_radar"]');
  assert.ok(link);
  await app.api.click(link);
  assert.equal(app.api.handoff().state.prefillTicketData.ticketType, 'photo_radar');
  assert.equal(app.api.handoff().search, '?ticket_type=photo_radar');
});

test('image OCR fills review fields, preserves corrected values on edit, and carries the file to intake', async t => {
  const app = await runtime(t);
  const file = await app.choose();
  await app.until(() => app.requests.length === 1);
  assert.equal(app.button('Instant Ticket Assessment').disabled, true);
  await app.finish(0, { violation: 'Speeding (16-29 km/h over)', fineAmount: 300, demerits: 3, ticketNumber: 'SYNTHETIC-123', issueDate: '2026-09-19', location: 'Synthetic location' });
  assert.equal(app.field('offence').value, 'lowSpeeding');
  assert.equal(app.field('fine').value, '300');
  await app.edit('fine', '350');
  await app.edit('record', 'yes');
  await app.api.click(app.button('Instant Ticket Assessment'));
  await app.api.click(app.button('Edit ticket details'));
  assert.equal(app.requests.length, 1, 'editing must not rescan or replace reviewed fields');
  assert.equal(app.field('fine').value, '350');
  await app.api.click(app.button('Instant Ticket Assessment'));
  await app.api.click(app.window.document.querySelector('a[href="/submit-ticket"]'));
  assert.equal(app.api.handoff().state.ticketImage, file);
  assert.equal(app.api.handoff().state.prefillTicketData.ticketNumber, 'SYNTHETIC-123');
  assert.equal(app.api.handoff().state.prefillTicketData.fineAmount, '350');
  assert.equal(app.api.handoff().state.prefillTicketData.offenceDescription, 'Speeding (16-29 km/h over)');
});

test('late OCR from replaced or removed files cannot overwrite the current assessment', async t => {
  const app = await runtime(t);
  await app.choose('old.png');
  await app.until(() => app.requests.length === 1);
  await app.choose('current.png');
  await app.until(() => app.requests.length === 2);
  await app.finish(1, { violation: 'Distracted driving', fineAmount: 300 });
  await app.finish(0, { violation: 'Careless driving', fineAmount: 999 });
  assert.equal(app.field('fine').value, '300');
  assert.equal(app.field('offence').value, 'distractedDriving');
  await app.choose('removed.png');
  await app.until(() => app.requests.length === 3);
  await app.api.click(app.button('Remove'));
  await app.finish(2, { violation: 'Careless driving', fineAmount: 888 });
  assert.equal(app.field('fine').value, '');
  assert.equal(app.field('offence').value, '');
});

test('PDF and failed scans leave a working manual form and retain the selected attachment', async t => {
  const app = await runtime(t);
  await app.choose('synthetic.pdf', 'application/pdf');
  assert.equal(app.requests.length, 0);
  assert.equal(app.button('Instant Ticket Assessment').disabled, false);
  await app.choose('unreadable.png');
  await app.until(() => app.requests.length === 1);
  await app.api.act(async () => app.requests[0]({ data: null, error: new Error('Synthetic failure') }));
  assert.equal(app.button('Instant Ticket Assessment').disabled, false);
  assert.match(app.text(), /scan did not finish/);
  await app.fill();
  await app.api.click(app.button('Instant Ticket Assessment'));
  assert.match(app.text(), /Combined possible net savings/);
});
