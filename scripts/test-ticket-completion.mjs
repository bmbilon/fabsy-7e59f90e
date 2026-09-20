import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';


const token = `c1.${'1'.repeat(32)}.${'a'.repeat(64)}.1999999999.${'b'.repeat(64)}`;
const draftId = '11111111-1111-4111-8111-111111111111';
const base = {
  success: true, draftId, revision: 2, contact: { email: 'fixture@example.test', phone: '4035550100' },
  albertaConfirmed: true, contactPermission: true, preferredLocale: 'en', currentStep: 1, completedStep: 1,
  draftData: { firstName: 'Amber', lastName: 'Example', email: 'fixture@example.test', phone: '4035550100',
    address: '100 Example Street', city: 'Edmonton', province: 'AB', postalCode: 'T5J 0N3',
    dateOfBirth: '1992-01-02', driversLicense: 'TEST-12345', ticketType: 'officer_issued',
    ticketTypeSource: 'manual', ticketNumber: 'FIXTURE-101', violation: 'Distracted driving', fineAmount: '300' },
  ticketDocumentPath: `${draftId}/existing-ticket.jpg`, ticketUploadedAt: '2026-09-19T12:00:00Z',
  hasPendingTicketUpload: false, status: 'active', expiresAt: '2033-05-18T03:33:19Z',
  resumeDelivery: { status: 'sent', channel: 'email', sentAt: '2026-09-19T12:00:00Z', canRetry: false, mode: 'automatic' },
};
const mocks = {
  '@/integrations/supabase/client': 'export const supabase = { functions: { invoke: (...args) => window.__fixture.invoke(...args) }, storage: { from() { throw new Error("Ticket upload forbidden"); } } };',
  '@/i18n/locale-context': 'export const useLocale = () => ({ locale: "en", isReleased: true, href: x => x });',
  'react-i18next': 'export const useTranslation = () => ({ t: x => x });',
  '@/hooks/use-toast': 'export const useToast = () => ({ toast: x => window.__fixture.toasts.push(x) });',
  '@/lib/referrals/capture': 'export const referralForCheckout = async () => null;',
};
const bundle = await build({
  stdin: { contents: `import React, { act } from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter } from 'react-router-dom'; import CompleteTicket from './src/pages/CompleteTicket'; window.__act = act; window.__mount = () => { window.__root = createRoot(document.getElementById('root')); window.__root.render(<MemoryRouter><CompleteTicket /></MemoryRouter>); };`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'import.meta.env': '{}' }, logLevel: 'silent',
  plugins: [{ name: 'synthetic-completion-backend', setup(b) { b.onResolve({ filter: /.*/ }, args => mocks[args.path] ? { path: args.path, namespace: 'fixture' } : undefined); b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js' })); } }],
});
const compiled = bundle.outputFiles[0].text;

if (process.argv.includes('--preview')) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fabsy-completion-preview-'));
  const setup = `window.__fixture = { toasts: [], invoke: async (name, { body }) => {
    if (name !== 'ticket-intake-draft') throw new Error('Preview cannot create payments or send messages');
    return { data: ${JSON.stringify(base)}, error: null };
  } }; window.history.replaceState(null, '', '#access=${token}');`;
  await fs.writeFile(path.join(directory, 'app.js'), setup + compiled + ';window.__mount();');
  const cssDirectory = '/tmp/fabsy-completion-build/assets';
  const cssName = (await fs.readdir(cssDirectory)).find(name => /^index-.*\.css$/.test(name));
  await fs.copyFile(path.join(cssDirectory, cssName), path.join(directory, 'app.css'));
  await fs.writeFile(path.join(directory, 'index.html'), '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  console.log(directory);
  process.exit(0);
}

async function runtime(t, options = {}) {
  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on('jsdomError', error => { if (!error.message.includes('navigation')) errors.push(error.message); });
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: `https://fabsy.ca/complete-ticket#access=${options.token ?? token}`, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const win = dom.window;
  win.scrollTo = () => {};
  win.MessageChannel = class { constructor() { this.port1 = { onmessage: null }; this.port2 = { postMessage: () => setTimeout(() => this.port1.onmessage?.(), 0) }; } };
  win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.IS_REACT_ACT_ENVIRONMENT = true;
  win.fetch = () => { throw new Error('External network forbidden'); };
  win.structuredClone = structuredClone;
  win.TextEncoder = TextEncoder;
  win.TextDecoder = TextDecoder;
  let record = structuredClone({ ...base, ...options.record });
  const calls = [], toasts = [];
  win.__fixture = { toasts, invoke: async (name, { body }) => {
    calls.push({ name, body: structuredClone(body) });
    if (name === 'ticket-intake-draft') {
      if (body.action === 'read') return { data: structuredClone(record), error: null };
      if (body.action === 'discard_pending_upload') { record.hasPendingTicketUpload = false; return { data: structuredClone(record), error: null }; }
      assert.equal(body.action, 'save');
      record = { ...record, revision: body.revision + 1, draftData: body.draftData, currentStep: body.currentStep, completedStep: body.completedStep, capabilityRotated: Boolean(options.rotation) };
      if (options.rotation) return { data: null, error: new Error('Lost save response') };
      return { data: structuredClone(record), error: null };
    }
    if (name === 'submit-ticket') { assert.equal(body.draftId, draftId); assert.equal('file' in body, false); return { data: { success: true, submissionId: draftId, clientId: 'client-fixture', accessToken: body.draftAccessToken }, error: null }; }
    if (name === 'generate-consent-form') return { data: { success: true, consentFormPath: `${draftId}/consent-form.pdf` }, error: null };
    if (name === 'create-payment') return { data: { url: 'https://checkout.stripe.com/c/pay/cs_test_synthetic', paymentLinkCode: 'fixture-payment' }, error: null };
    if (name === 'send-notification') return { data: { success: true }, error: null };
    throw new Error(`Unexpected endpoint ${name}`);
  } };
  if (options.savedToken) win.sessionStorage.setItem('fabsy.ticket-completion.v1', JSON.stringify({ token: options.savedToken }));
  win.eval(compiled);
  await win.__act(async () => { win.__mount(); });
  t.after(async () => { await win.__act(async () => win.__root.unmount()); dom.window.close(); assert.deepEqual(errors, []); });
  const click = async selector => { const target = win.document.querySelector(selector); assert.ok(target, selector); await win.__act(async () => target.click()); };
  const input = async (selector, value) => { const target = win.document.querySelector(selector); assert.ok(target, selector); await win.__act(async () => { Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set.call(target, value); target.dispatchEvent(new win.Event('input', { bubbles: true })); }); };
  return { win, calls, toasts, click, input, text: () => win.document.body.textContent };
}

test('saved ticket opens directly at consent with prefilled details and no upload control', async t => {
  const f = await runtime(t);
  assert.match(f.text(), /Your ticket is received/);
  assert.equal(f.win.document.querySelector('#completion-firstName').value, 'Amber');
  assert.equal(f.win.document.querySelector('input[type=file]'), null);
  assert.equal(f.win.location.hash, '');
  assert.equal(f.win.localStorage.length, 0);
  assert.equal(f.calls.length, 1);
  assert.equal(f.win.document.querySelector('meta[name=robots]').content, 'noindex, nofollow, noarchive');
});
test('wrong or missing consent never creates a submission or opens payment', async t => {
  const f = await runtime(t);
  await f.click('button[type=submit]');
  assert.match(f.text(), /Consent agreement/);
  await f.input('#digitalSignature', 'Wrong Person'); await f.click('#consent'); await f.click('button[type=submit]');
  assert.match(f.text(), /Signature matching your full legal name/);
  assert.equal(f.calls.some(call => call.name === 'submit-ticket'), false);
});
test('consent and checkout reuse the saved ticket without another upload or intake', async t => {
  const f = await runtime(t);
  await f.input('#digitalSignature', 'Amber Example'); await f.click('#consent'); await f.click('button[type=submit]');
  assert.ok(f.win.document.querySelector('#payment-terms'));
  await f.click('#payment-terms');
  const pay = [...f.win.document.querySelectorAll('button')].find(button => button.textContent.includes('Continue to Stripe'));
  assert.ok(pay); await f.win.__act(async () => pay.click());
  assert.deepEqual(f.calls.map(call => call.name), ['ticket-intake-draft', 'ticket-intake-draft', 'submit-ticket', 'generate-consent-form', 'create-payment', 'send-notification']);
  const checkout = f.calls.find(call => call.name === 'create-payment').body;
  assert.equal(checkout.submissionId, draftId); assert.equal(checkout.completionFlow, true);
  assert.equal(checkout.accessToken, token);
  assert.equal(f.toasts.length, 0);
});
test('already signed unpaid case resumes payment without generating a second consent', async t => {
  const f = await runtime(t, { record: { status: 'converted', completion: { paid: false, paymentAvailable: true, consentSigned: true } } });
  assert.match(f.text(), /signed consent is on file/); await f.click('#payment-terms');
  const pay = [...f.win.document.querySelectorAll('button')].find(button => button.textContent.includes('Continue to Stripe'));
  await f.win.__act(async () => pay.click());
  assert.equal(f.calls.some(call => call.name === 'generate-consent-form'), false);
  assert.equal(f.calls.filter(call => call.name === 'create-payment').length, 1);
});
test('paid case offers no second payment', async t => {
  const f = await runtime(t, { record: { status: 'converted', completion: { paid: true, paymentAvailable: false, consentSigned: true } } });
  assert.match(f.text(), /Your payment is received/);
  assert.equal(f.win.document.querySelector('#payment-terms'), null);
  assert.equal(f.win.document.querySelector('input'), null);
  assert.equal(f.calls.length, 1);
});
test('malformed explicit link cannot open another saved client', async t => {
  const f = await runtime(t, { token: 'invalid', savedToken: token });
  assert.match(f.text(), /Open the complete private link/);
  assert.equal(f.calls.length, 0);
});
test('lost contact-rotation response recovers the new capability without resubmitting', async t => {
  const f = await runtime(t, { rotation: true });
  await f.input('#digitalSignature', 'Amber Example'); await f.click('#consent'); await f.click('button[type=submit]');
  assert.ok(f.win.document.querySelector('#payment-terms'));
  assert.deepEqual(f.calls.map(call => call.body.action), ['read', 'save', 'read']);
  assert.notEqual(JSON.parse(f.win.sessionStorage.getItem('fabsy.ticket-completion.v1')).token, token);
});
test('unfinished replacement can use the confirmed saved ticket', async t => {
  const f = await runtime(t, { record: { hasPendingTicketUpload: true } });
  const keep = [...f.win.document.querySelectorAll('button')].find(button => button.textContent.includes('Use the ticket already saved'));
  assert.ok(keep); await f.win.__act(async () => keep.click());
  assert.equal(f.calls.at(-1).body.action, 'discard_pending_upload');
  assert.equal(f.win.document.querySelector('input[type=file]'), null);
});
