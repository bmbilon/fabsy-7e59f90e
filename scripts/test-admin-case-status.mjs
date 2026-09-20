import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'fabsy-case-status-'));
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://fabsy.test/admin/dashboard', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'MutationObserver']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let resolveSave;
const calls = [];
const fixture = globalThis.__caseStatusTest = {
  rpc: (name, args) => {
    calls.push({ name, args });
    if (name === 'get_admin_ticket_case_status') return Promise.resolve({ data: { kind: 'draft', ticket_id: 'synthetic', stage: 'disclosure_requested', version: 3 } });
    assert.equal(name, 'set_admin_ticket_case_status', 'Only the dedicated staff RPC may write');
    return new Promise(resolve => { resolveSave = resolve; });
  },
};
let root;
try {
  const outfile = path.join(temporary, 'case-status.mjs');
  await build({
    stdin: { contents: `import React from 'react'; import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; import Editor from './src/components/admin/CaseStatusSelect'; const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); export default function Harness(props) { return <QueryClientProvider client={client}><Editor {...props}/></QueryClientProvider>; }`, loader: 'tsx', resolveDir: process.cwd() },
    bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', outfile, logLevel: 'silent',
    banner: { js: "import { createRequire as createTestRequire } from 'node:module'; const require = createTestRequire(import.meta.url);" },
    plugins: [{ name: 'case-status-fixture', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (args.path === '@/integrations/supabase/client') return { path: args.path, namespace: 'fixture' };
        if (/^(react|react-dom)(\/|$)/.test(args.path)) return { path: require.resolve(args.path), external: true };
        return null;
      });
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const supabase = { rpc: (name, args) => globalThis.__caseStatusTest.rpc(name, args) };', loader: 'js' }));
    }}],
  });
  const { act, createElement } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { default: Harness } = await import(pathToFileURL(outfile).href);
  const container = document.createElement('main'); document.body.append(container); root = createRoot(container);
  const base = { kind: 'draft', ticketId: 'synthetic', label: 'Sample Ticket', initial: { kind: 'draft', ticket_id: 'synthetic', stage: null, version: 0 } };
  const render = async props => act(async () => root.render(createElement(Harness, { ...base, ...props })));
  const select = () => container.querySelector('select');
  const choose = async value => act(async () => { select().value = value; select().dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  await render();
  assert.equal(select().getAttribute('aria-label'), 'Case status for Sample Ticket');
  assert.equal(select().options.length, 12, 'All eleven staff stages are available');
  await choose('done_withdrawn');
  assert.equal(select().disabled, true, 'Duplicate saves disabled');
  assert.equal(select().value, '', 'Never claim success before server acknowledgement');
  assert.deepEqual(calls.at(-1).args, { p_kind: 'draft', p_ticket_id: 'synthetic', p_stage: 'done_withdrawn', p_expected_version: 0 });
  await act(async () => resolveSave({ data: { ...base.initial, stage: 'done_withdrawn', version: 1 } }));
  assert.equal(select().value, 'done_withdrawn');
  assert.match(container.textContent, /Saved/);
  await render();
  assert.equal(select().value, 'done_withdrawn', 'Stale list data cannot undo a confirmed save');
  await choose('trial_proceeding');
  await act(async () => resolveSave({ error: { message: 'Offline' } }));
  assert.equal(select().value, 'done_withdrawn', 'Failed save preserves last confirmed stage');
  assert.match(container.querySelector('[role="alert"]').textContent, /not saved/);
  await choose('trial_proceeding');
  await act(async () => resolveSave({ error: { message: 'CASE_STATUS_CHANGED' } }));
  assert.equal(select().value, 'disclosure_requested', 'Concurrent update is reloaded for review');
  assert.match(container.querySelector('[role="alert"]').textContent, /Another staff member/);
  await choose('trial_date_pending');
  assert.equal(calls.at(-1).args.p_expected_version, 3, 'Retry uses refreshed server version');
  await act(async () => resolveSave({ data: { ...base.initial, stage: 'trial_date_pending', version: 4 } }));
  assert.equal(select().querySelector('optgroup').label, 'Trial matters', 'Trial choices are first for trial cases');
  await render({ disabled: true });
  assert.equal(select().disabled, true, 'Deleted tickets cannot be edited');
  await act(async () => root.unmount()); root = null;
  console.log('Case status editor passed: server confirmation, failure recovery, stale data, concurrent edits, trial choices and disabled tickets.');
} finally {
  if (root) root.unmount();
  dom.window.close(); delete globalThis.__caseStatusTest;
  await fs.rm(temporary, { recursive: true, force: true });
}
