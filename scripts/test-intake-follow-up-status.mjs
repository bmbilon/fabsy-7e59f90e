import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';

// Mount the actual staff page against local fixtures. These actions record
// completed contact only: every delivery/storage/network path rejects calls.
const require = createRequire(import.meta.url);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'fabsy-follow-up-status-'));
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://fabsy.test/admin/cases', pretendToBeVisual: true,
});
const now = new Date().toISOString();
const staffId = 'synthetic-admin';
const lead = (id, changed = {}) => ({
  id, email: `${id}@example.invalid`, phone: '+18255550100', deleted_at: null,
  preferred_locale: 'en', current_step: 5, completed_step: 4, status: 'active',
  converted_submission_id: null, ticket_document_path: 'synthetic/ticket.jpg',
  ticket_document_content_type: 'image/jpeg', ticket_document_size_bytes: 1200,
  ticket_uploaded_at: now, updated_at: now, expires_at: '2099-01-01T00:00:00Z',
  resume_delivery_status: 'sent', resume_delivery_channel: 'email',
  resume_delivery_sent_at: now, resume_delivery_attempt_count: 1,
  resume_delivery_failure_code: null, staff_follow_up_status: 'open',
  staff_follow_up_updated_at: null, staff_follow_up_updated_by: null,
  follow_up_email_sent_at: null, follow_up_email_sent_by: null,
  follow_up_phone_called_at: null, follow_up_phone_called_by: null,
  ...changed,
});
const rpcCalls = [], notifications = [], deliveryCalls = [], queries = [];
let resolveRpc, resolveLeadQuery;
const fixture = globalThis.__intakeFollowUpTest = {
  leads: [
    lead('open'),
    lead('email-only', { follow_up_email_sent_at: now }),
    lead('both', { staff_follow_up_status: 'contacted', follow_up_email_sent_at: now, follow_up_email_sent_by: staffId, follow_up_phone_called_at: now, follow_up_phone_called_by: staffId }),
    lead('legacy', { staff_follow_up_status: 'contacted', staff_follow_up_updated_at: now, staff_follow_up_updated_by: staffId }),
    lead('dismissed', { staff_follow_up_status: 'dismissed' }),
    lead('deleted', { deleted_at: now }),
  ],
  toast: value => notifications.push(value),
  query: (table, fields) => queries.push({ table, fields }),
  holdLeadQuery: false,
  read: table => {
    const result = { data: table === 'ticket_intake_drafts' ? structuredClone(fixture.leads) : [], error: null };
    if (table === 'ticket_intake_drafts' && fixture.holdLeadQuery) {
      fixture.holdLeadQuery = false;
      return new Promise(resolve => { resolveLeadQuery = () => resolve(result); });
    }
    return Promise.resolve(result);
  },
  forbidden: (...args) => { deliveryCalls.push(args); throw new Error('Contact recording must not send, call, or access storage'); },
  rpc: (name, args) => {
    rpcCalls.push({ name, args });
    assert.equal(name, 'record_ticket_intake_follow_up', 'Contact actions use the recording RPC only');
    return new Promise(resolve => { resolveRpc = resolve; });
  },
};
for (const key of ['document', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'MutationObserver', 'CustomEvent', 'HTMLInputElement', 'NodeFilter']) globalThis[key] = dom.window[key];
globalThis.window = new Proxy(dom.window, {
  get(target, key) {
    if (key === 'location') return { ...target.location, assign: fixture.forbidden };
    if (key === 'open') return fixture.forbidden;
    return Reflect.get(target, key, target);
  },
});
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalFetch = globalThis.fetch;
globalThis.fetch = fixture.forbidden;
let root;
try {
  const outfile = path.join(temporary, 'AdminCaseManagement.mjs');
  const mocks = {
    '@/hooks/use-toast': 'export const useToast = () => ({ toast: globalThis.__intakeFollowUpTest.toast });',
    '@/hooks/useIdrAuth': 'export const getIdrStaffRole = async () => "admin";',
    '@/components/DisclosureConfirmations': 'export const DisclosureAutomationPanel = () => null;',
    '@/components/AteCaseReview': 'export const AtePilotMetrics = () => null;',
    '@/integrations/supabase/client': `
      const fixture = globalThis.__intakeFollowUpTest;
      export const supabase = {
        rpc: (name, args) => fixture.rpc(name, args),
        functions: { invoke: fixture.forbidden },
        auth: {
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          getSession: async () => ({ data: { session: { user: { id: 'synthetic-admin' } } } }),
        },
        from(table) {
          const chain = {
            select(fields) { fixture.query(table, fields); return chain; },
            neq() { return chain; }, in() { return chain; }, not() { return chain; }, gt() { return chain; },
            order: () => fixture.read(table),
          };
          return chain;
        },
        storage: { from: fixture.forbidden },
      };
    `,
  };
  await build({
    entryPoints: [fileURLToPath(new URL('../src/pages/AdminCaseManagement.tsx', import.meta.url))],
    bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', outfile, logLevel: 'silent',
    banner: { js: "import { createRequire as createTestRequire } from 'node:module'; const require = createTestRequire(import.meta.url);" },
    plugins: [{ name: 'isolated-follow-up-status-services', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (Object.hasOwn(mocks, args.path)) return { path: args.path, namespace: 'follow-up-status-test' };
        if (/^(react|react-dom|react-router-dom)(\/|$)/.test(args.path)) return { path: require.resolve(args.path), external: true };
        return null;
      });
      builder.onLoad({ filter: /.*/, namespace: 'follow-up-status-test' }, args => ({ contents: mocks[args.path], loader: 'js' }));
    } }],
  });
  const { act, createElement } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { MemoryRouter } = await import('react-router-dom');
  const { default: AdminCaseManagement } = await import(pathToFileURL(outfile).href);
  const container = document.createElement('main');
  document.body.append(container);
  const mount = async () => {
    root = createRoot(container);
    await act(async () => root.render(createElement(MemoryRouter,
      { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(AdminCaseManagement))));
  };
  const row = id => {
    const anchor = document.querySelector(`a[href="mailto:${id}@example.invalid"]`);
    assert.ok(anchor, `Fixture ${id} is visible`);
    let parent = anchor.parentElement;
    while (parent && !parent.querySelector('button')) parent = parent.parentElement;
    assert.ok(parent, `Fixture ${id} has a row`);
    return parent;
  };
  const button = (scope, text) => [...scope.querySelectorAll('button')].find(el => el.textContent.trim() === text);
  const badge = (scope, text) => [...scope.querySelectorAll('div.rounded-full')].find(el => el.textContent.trim() === text);
  const click = async (scope, text) => {
    const node = button(scope, text);
    assert.ok(node, `Button ${text} exists`);
    await act(async () => node.click());
    return node;
  };
  const complete = async channel => {
    const target = fixture.leads.find(item => item.id === 'open');
    const prefix = channel === 'email' ? 'follow_up_email_sent' : 'follow_up_phone_called';
    target[`${prefix}_at`] = now;
    target[`${prefix}_by`] = staffId;
    target.staff_follow_up_status = 'contacted';
    target.staff_follow_up_updated_at = now;
    target.staff_follow_up_updated_by = staffId;
    await act(async () => resolveRpc({ error: null, data: [{
      draft_id: target.id, follow_up_status: target.staff_follow_up_status,
      follow_up_updated_at: now, follow_up_updated_by: staffId,
      follow_up_email_sent_at: target.follow_up_email_sent_at,
      follow_up_email_sent_by: target.follow_up_email_sent_by,
      follow_up_phone_called_at: target.follow_up_phone_called_at,
      follow_up_phone_called_by: target.follow_up_phone_called_by,
    }] }));
  };
  await mount();
  const selected = queries.find(query => query.table === 'ticket_intake_drafts').fields;
  for (const field of ['follow_up_email_sent_at', 'follow_up_email_sent_by', 'follow_up_phone_called_at', 'follow_up_phone_called_by']) assert.ok(selected.includes(field), `Queue loads persisted ${field}`);
  assert.ok(button(row('open'), 'Record email sent'));
  assert.ok(button(row('open'), 'Phone call made'));
  assert.equal(badge(row('open'), 'Email sent'), undefined, 'Resume email delivery is not a follow-up email');
  assert.match(row('open').textContent, /Resume link:/, 'Resume-link delivery has a separate label');
  assert.doesNotMatch(row('open').textContent, /Follow-up status: resume link/);
  assert.ok(badge(row('email-only'), 'Email sent'), 'Automatic email delivery is visible even while queue status remains open');
  assert.equal(button(row('email-only'), 'Record email sent'), undefined);
  assert.ok(button(row('email-only'), 'Phone call made'));
  assert.ok(badge(row('both'), 'Email sent'));
  assert.ok(badge(row('both'), 'Phone call made'));
  assert.equal(button(row('both'), 'Record email sent'), undefined);
  assert.equal(button(row('both'), 'Phone call made'), undefined);
  assert.ok(badge(row('legacy'), 'Contacted'), 'Historical generic contact stays visible without guessing a channel');
  assert.equal(badge(row('legacy'), 'Email sent'), undefined);
  assert.equal(badge(row('legacy'), 'Phone call made'), undefined);

  // Tap twice before a response, including a second channel; only one mutation
  // may run for this lead and no success badge may appear before confirmation.
  const emailButton = button(row('open'), 'Record email sent');
  const phoneButton = button(row('open'), 'Phone call made');
  await act(async () => { emailButton.click(); emailButton.click(); phoneButton.click(); });
  assert.equal(rpcCalls.length, 1, 'Synchronous duplicate taps cannot enqueue duplicate or competing records');
  assert.ok(emailButton.disabled && phoneButton.disabled, 'Both actions are disabled while pending');
  assert.equal(badge(row('open'), 'Email sent'), undefined, 'Pending RPC is not a sent email');
  assert.deepEqual(rpcCalls[0], { name: 'record_ticket_intake_follow_up', args: { p_id: 'open', p_expected_status: 'open', p_channel: 'email' } });
  await act(async () => resolveRpc({ data: null, error: { message: 'permission denied' } }));
  assert.equal(badge(row('open'), 'Email sent'), undefined, 'Failed RPC does not invent a successful contact');
  assert.ok(button(row('open'), 'Record email sent') && !button(row('open'), 'Record email sent').disabled);
  assert.ok(notifications.some(value => value.variant === 'destructive'), 'Failed recording explains the error');
  await click(row('open'), 'Record email sent');
  await act(async () => resolveRpc({ data: [], error: null }));
  assert.equal(badge(row('open'), 'Email sent'), undefined, 'Empty RPC result is not a successful contact');
  await click(row('open'), 'Record email sent');
  await complete('email');
  assert.ok(badge(row('open'), 'Email sent'));
  assert.equal(button(row('open'), 'Record email sent'), undefined);
  await click(row('open'), 'Phone call made');
  assert.deepEqual(rpcCalls.at(-1), { name: 'record_ticket_intake_follow_up', args: { p_id: 'open', p_expected_status: 'contacted', p_channel: 'phone' } });
  const leadQueryCount = () => queries.filter(query => query.table === 'ticket_intake_drafts').length;
  const beforeDeferredActionRefresh = leadQueryCount();
  // Another operator records a call while our own mutation is pending. Focus
  // refreshes must wait for that mutation, then retrieve the new server state.
  fixture.leads.find(item => item.id === 'email-only').follow_up_phone_called_at = now;
  await act(async () => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('focus')); });
  assert.equal(leadQueryCount(), beforeDeferredActionRefresh, 'Refresh waits while a contact mutation is pending');
  await complete('phone');
  assert.equal(leadQueryCount(), beforeDeferredActionRefresh + 1, 'Queued refreshes coalesce and run after the contact mutation');
  assert.ok(badge(row('email-only'), 'Phone call made'), 'Deferred refresh retrieves another operator\'s change');
  assert.ok(badge(row('open'), 'Email sent'), 'Recording a phone call retains the earlier email status');
  assert.ok(badge(row('open'), 'Phone call made'));
  assert.equal(button(row('open'), 'Phone call made'), undefined);

  // A refresh already in progress may contain a stale snapshot. A second
  // refresh request must run afterward rather than being silently discarded.
  fixture.holdLeadQuery = true;
  const beforeDeferredFetchRefresh = leadQueryCount();
  await click(document, 'Refresh queue');
  assert.equal(leadQueryCount(), beforeDeferredFetchRefresh + 1);
  fixture.leads.push(lead('arrived-during-refresh'));
  await act(async () => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('focus')); });
  assert.equal(leadQueryCount(), beforeDeferredFetchRefresh + 1, 'Pending fetch prevents overlapping refresh requests');
  await act(async () => resolveLeadQuery());
  assert.equal(leadQueryCount(), beforeDeferredFetchRefresh + 2, 'Queued refresh runs after the stale fetch finishes');
  assert.ok(row('arrived-during-refresh'), 'Latest queue state appears after the deferred refresh');

  await click(document, 'Dismissed (1)');
  assert.equal(button(row('dismissed'), 'Record email sent'), undefined);
  assert.equal(button(row('dismissed'), 'Phone call made'), undefined);
  await click(document, 'Deleted intakes (1)');
  assert.equal(button(row('deleted'), 'Record email sent'), undefined);
  assert.equal(button(row('deleted'), 'Phone call made'), undefined);
  await act(async () => root.unmount()); root = null;
  await mount();
  assert.ok(badge(row('open'), 'Email sent') && badge(row('open'), 'Phone call made'), 'Both contact channels remain after a fresh page load');
  assert.deepEqual(deliveryCalls, [], 'Recording contact never sends email, places calls, navigates away, or touches storage');
  await act(async () => root.unmount()); root = null;
  console.log('Intake follow-up status UI passed: separate persistent channel badges, automatic email visibility, legacy contact, no duplicate taps, RPC failures/empty responses, email then phone retention, deferred refresh after pending mutations/fetches, dismissed/deleted exclusions, resume-link distinction, and no delivery side effects.');
} finally {
  if (root) root.unmount();
  globalThis.fetch = originalFetch;
  dom.window.close();
  delete globalThis.__intakeFollowUpTest;
  await fs.rm(temporary, { recursive: true, force: true });
}
