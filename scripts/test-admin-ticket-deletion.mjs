import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';

// Mount the real staff page. Signing deliberately resolves after the tap, with
// popup creation blocked. No customer data or external services are involved.
const require = createRequire(import.meta.url);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'fabsy-ticket-deletion-'));
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://fabsy.test/admin/cases', pretendToBeVisual: true,
});
const navigation = [];
const notifications = [];
const signingCalls = [];
let resolveSigning;
let rejectSigning;
let popups = 0;
let finishRpc;
const rpcCalls = [];
let location = '';
const fixture = globalThis.__ticketDeletionTest = {
  toast: value => notifications.push(value),
  sign: (bucket, objectPath, expiresIn) => {
    signingCalls.push({ bucket, objectPath, expiresIn });
    return new Promise((resolve, reject) => { resolveSigning = resolve; rejectSigning = reject; });
  },
  rpc: (name, args) => { rpcCalls.push({ name, args }); return new Promise(resolve => { finishRpc = result => {
    if (!result.error) {
      const target = args.p_kind === 'intake' ? fixture.lead : fixture.ticket;
      target.deleted_at = args.p_deleted ? new Date().toISOString() : null;
    }
    resolve(result);
  }; }); },
  location: value => { location = value; },
  ticket: { id: 'synthetic-ticket', first_name: 'Test', last_name: 'Person', clients: null, email: 'test@example.invalid',
    ticket_number: 'T12345', status: 'pending', violation: 'Example', fine_amount: '100', deleted_at: null,
    created_at: new Date().toISOString(), service_type: 'representation', ticket_type: 'officer_issued' },
  lead: {
    id: 'synthetic-intake', email: 'test@example.invalid', phone: null,
    preferred_locale: 'en', current_step: 5, completed_step: 4, status: 'active',
    converted_submission_id: null, ticket_document_path: 'synthetic/ticket.jpg',
    ticket_document_content_type: 'image/jpeg', ticket_document_size_bytes: 1200,
    ticket_uploaded_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    expires_at: '2040-01-01T00:00:00Z', resume_delivery_status: 'pending',
    resume_delivery_attempt_count: 0, staff_follow_up_status: 'open',
  },
};
for (const key of ['document', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'MutationObserver', 'CustomEvent', 'HTMLInputElement', 'NodeFilter']) {
  globalThis[key] = dom.window[key];
}
globalThis.window = new Proxy(dom.window, {
  get(target, key) {
    if (key === 'location') return { ...target.location, assign: url => navigation.push(url) };
    if (key === 'open') return () => { popups += 1; return null; };
    return Reflect.get(target, key, target);
  },
});
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
try {
  const outfile = path.join(temporary, 'AdminCaseManagement.mjs');
  const mocks = {
    '@/hooks/use-toast': 'export const useToast = () => ({ toast: globalThis.__ticketDeletionTest.toast });',
    '@/hooks/useIdrAuth': 'export const getIdrStaffRole = async () => "admin";',
    '@/components/DisclosureConfirmations': 'export const DisclosureAutomationPanel = () => null;',
    '@/components/AteCaseReview': 'export const AtePilotMetrics = () => null;',
    '@/integrations/supabase/client': `
      const user = { id: 'synthetic-admin' };
      export const supabase = {
        rpc: (name, args) => globalThis.__ticketDeletionTest.rpc(name, args),
        auth: {
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          getSession: async () => ({ data: { session: { user } } }),
        },
        from(table) {
          const chain = { select() { return chain; }, neq() { return chain; },
            in() { return chain; }, not() { return chain; }, gt() { return chain; },
            order: async () => ({ data: table === 'ticket_intake_drafts' ? [globalThis.__ticketDeletionTest.lead] : [globalThis.__ticketDeletionTest.ticket], error: null }) };
          return chain;
        },
        storage: { from: bucket => ({ createSignedUrl: (objectPath, expiresIn) => globalThis.__ticketDeletionTest.sign(bucket, objectPath, expiresIn) }) },
      };
    `,
  };
  await build({
    entryPoints: [fileURLToPath(new URL('../src/pages/AdminCaseManagement.tsx', import.meta.url))],
    bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', outfile, logLevel: 'silent',
    banner: { js: "import { createRequire as createTestRequire } from 'node:module'; const require = createTestRequire(import.meta.url);" },
    plugins: [{ name: 'isolated-ticket-deletion-services', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (Object.hasOwn(mocks, args.path)) return { path: args.path, namespace: 'ticket-deletion-test' };
        if (/^(react|react-dom|react-router-dom)(\/|$)/.test(args.path)) return { path: require.resolve(args.path), external: true };
        return null;
      });
      builder.onLoad({ filter: /.*/, namespace: 'ticket-deletion-test' }, args => ({ contents: mocks[args.path], loader: 'js' }));
    } }],
  });
  const { act, createElement } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { MemoryRouter, useLocation } = await import('react-router-dom');
  function TrackLocation() { fixture.location(useLocation().pathname); return null; }
  const { default: AdminCaseManagement } = await import(pathToFileURL(outfile).href);
  const container = document.createElement('main');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(MemoryRouter,
    { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(AdminCaseManagement), createElement(TrackLocation))));
  const button = text => [...document.querySelectorAll('button')].find(el => el.textContent === text);
  const click = async text => { const node = button(text); assert.ok(node, `Button ${text} exists`); await act(async () => node.click()); return node; };
  const ticketDelete = () => document.querySelector('[aria-label="Delete ticket Test Person · T12345"]');
  assert.ok(ticketDelete(), 'legacy names remain visible without a joined client');
  await act(async () => ticketDelete().click());
  assert.ok(document.querySelector('[role="alertdialog"]'));
  assert.equal(location, '/', 'Delete must not activate the parent ticket card navigation');
  await click('Cancel');
  assert.equal(rpcCalls.length, 0, 'Cancel makes no mutation');
  await act(async () => ticketDelete().click());
  const submit = await click('Delete ticket');
  submit.click();
  assert.equal(rpcCalls.length, 1, 'Duplicate clicks produce only one request');
  assert.ok(submit.disabled);
  await act(async () => finishRpc({ error: { message: 'denied' } }));
  assert.match(document.querySelector('[role="alert"]').textContent, /Could not delete/);
  assert.ok(ticketDelete(), 'A failed delete keeps the ticket visible');
  await click('Delete ticket');
  assert.deepEqual(rpcCalls.at(-1), { name: 'set_admin_ticket_deleted', args: { p_id: 'synthetic-ticket', p_kind: 'submission', p_deleted: true } });
  await act(async () => finishRpc({ error: null }));
  assert.equal(ticketDelete(), null, 'Successful delete refreshes the active list');
  await click('Deleted tickets (1)');
  assert.ok(document.querySelector('[aria-label="Restore ticket Test Person · T12345"]'));
  await click('Restore');
  await click('Restore ticket');
  await act(async () => finishRpc({ error: null }));
  await click('Active tickets');
  assert.ok(ticketDelete(), 'Restore refreshes the active list');
  const intake = document.querySelector('[aria-label="Delete ticket test@example.invalid"]');
  await act(async () => intake.click());
  await click('Delete ticket');
  assert.equal(rpcCalls.at(-1).args.p_kind, 'intake');
  await act(async () => finishRpc({ error: null }));
  await click('Deleted intakes (1)');
  assert.ok(document.querySelector('[aria-label="Restore ticket test@example.invalid"]'));
  await act(async () => root.unmount()); root = null;
  console.log('Admin ticket deletion UI passed: cancel, nested clicks, slow response, duplicate clicks, permission failure, delete/restore refresh, legacy names and incomplete intake deletion.');
} finally {
  if (root) root.unmount();
  dom.window.close();
  delete globalThis.__ticketDeletionTest;
  await fs.rm(temporary, { recursive: true, force: true });
}
