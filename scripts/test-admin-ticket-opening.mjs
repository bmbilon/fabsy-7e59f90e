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
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'fabsy-ticket-opening-'));
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://fabsy.test/admin/cases', pretendToBeVisual: true,
});
const navigation = [];
const notifications = [];
const signingCalls = [];
let resolveSigning;
let rejectSigning;
let popups = 0;
const fixture = globalThis.__ticketOpeningTest = {
  toast: value => notifications.push(value),
  sign: (bucket, objectPath, expiresIn) => {
    signingCalls.push({ bucket, objectPath, expiresIn });
    return new Promise((resolve, reject) => { resolveSigning = resolve; rejectSigning = reject; });
  },
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
for (const key of ['document', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'MutationObserver']) {
  globalThis[key] = dom.window[key];
}
globalThis.window = new Proxy(dom.window, {
  get(target, key) {
    if (key === 'location') return { ...target.location, assign: url => navigation.push(url) };
    if (key === 'open') return () => { popups += 1; return null; };
    return Reflect.get(target, key, target);
  },
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
try {
  const outfile = path.join(temporary, 'AdminCaseManagement.mjs');
  const mocks = {
    '@/hooks/use-toast': 'export const useToast = () => ({ toast: globalThis.__ticketOpeningTest.toast });',
    '@/hooks/useIdrAuth': 'export const getIdrStaffRole = async () => "admin";',
    '@/components/DisclosureConfirmations': 'export const DisclosureAutomationPanel = () => null;',
    '@/components/AteCaseReview': 'export const AtePilotMetrics = () => null;',
    '@/integrations/supabase/client': `
      const user = { id: 'synthetic-admin' };
      export const supabase = {
        auth: {
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          getSession: async () => ({ data: { session: { user } } }),
        },
        from(table) {
          const chain = { select() { return chain; }, neq() { return chain; },
            in() { return chain; }, not() { return chain; }, gt() { return chain; },
            order: async () => ({ data: table === 'ticket_intake_drafts' ? [globalThis.__ticketOpeningTest.lead] : [], error: null }) };
          return chain;
        },
        storage: { from: bucket => ({ createSignedUrl: (objectPath, expiresIn) => globalThis.__ticketOpeningTest.sign(bucket, objectPath, expiresIn) }) },
      };
    `,
  };
  await build({
    entryPoints: [fileURLToPath(new URL('../src/pages/AdminCaseManagement.tsx', import.meta.url))],
    bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', outfile, logLevel: 'silent',
    banner: { js: "import { createRequire as createTestRequire } from 'node:module'; const require = createTestRequire(import.meta.url);" },
    plugins: [{ name: 'isolated-ticket-opening-services', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (Object.hasOwn(mocks, args.path)) return { path: args.path, namespace: 'ticket-opening-test' };
        if (/^(react|react-dom|react-router-dom)(\/|$)/.test(args.path)) return { path: require.resolve(args.path), external: true };
        return null;
      });
      builder.onLoad({ filter: /.*/, namespace: 'ticket-opening-test' }, args => ({ contents: mocks[args.path], loader: 'js' }));
    } }],
  });
  const { act, createElement } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { MemoryRouter } = await import('react-router-dom');
  const { default: AdminCaseManagement } = await import(pathToFileURL(outfile).href);
  const container = document.createElement('main');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(MemoryRouter,
    { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(AdminCaseManagement))));
  const button = () => [...container.querySelectorAll('button')].find(el => /^(Open ticket|Opening…)$/.test(el.textContent));
  const tap = async () => {
    const current = button();
    assert.ok(current, 'An uploaded incomplete intake exposes its ticket button');
    await act(async () => current.click());
    assert.equal(current.disabled, true, 'Another tap cannot start a competing signing request');
    assert.equal(current.getAttribute('aria-busy'), 'true');
    assert.equal(current.textContent, 'Opening…', 'Slow signing is visible to the user');
    return current;
  };

  const pending = await tap();
  pending.click();
  assert.equal(signingCalls.length, 1);
  assert.equal(navigation.length, 0, 'Do not navigate before signing succeeds');
  await act(async () => resolveSigning({ data: { signedUrl: 'https://storage.example.invalid/private-ticket?token=synthetic' }, error: null }));
  assert.deepEqual(navigation, ['https://storage.example.invalid/private-ticket?token=synthetic'],
    'A single original tap opens the signed document in the current tab after the asynchronous response');
  assert.equal(popups, 0, 'The flow must work when the browser blocks new windows');
  assert.deepEqual(signingCalls[0], { bucket: 'assessment-tickets', objectPath: fixture.lead.ticket_document_path, expiresIn: 60 });
  assert.equal(button().disabled, false, 'Returning to the cached queue does not leave the button stuck');

  for (const outcome of ['storage-error', 'missing-url', 'network-rejection']) {
    await tap();
    await act(async () => {
      if (outcome === 'network-rejection') rejectSigning(new Error('synthetic network failure'));
      else resolveSigning({ data: outcome === 'missing-url' ? {} : null, error: outcome === 'storage-error' ? new Error('synthetic denied') : null });
    });
    assert.equal(navigation.length, 1, `${outcome} must leave the staff member in the queue`);
    assert.equal(notifications.at(-1).title, 'Ticket unavailable');
    assert.equal(button().disabled, false, `${outcome} leaves a usable retry button`);
  }
  assert.equal(notifications.length, 3);
  assert.equal(popups, 0);
  await act(async () => root.unmount());
  root = null;
  console.log('Admin ticket opening passed: delayed response with popups blocked, duplicate taps, same-tab navigation, storage errors, missing URL and rejected request.');
} finally {
  if (root) root.unmount();
  dom.window.close();
  delete globalThis.__ticketOpeningTest;
  await fs.rm(temporary, { recursive: true, force: true });
}
