import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { MessageChannel } from 'node:worker_threads';

const root = resolve(import.meta.dirname, '..');
const bundle = await build({ absWorkingDir: root, bundle: true, jsx: 'automatic', format: 'iife', globalName: 'inboxTest', write: false,
  stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React, {act} from 'react'; import {createRoot} from 'react-dom/client';
    import Inbox from './src/components/SmsIntakeInbox';
    import Page from './src/pages/AdminSmsIntake';
    import {MemoryRouter,Routes,Route} from 'react-router-dom';
    let root; export {act};
    export async function mount(){ await act(async()=>{root=createRoot(document.getElementById('root'));root.render(<Inbox/>);}); }
    export async function mountPage(){ await act(async()=>{root=createRoot(document.getElementById('root'));root.render(<MemoryRouter initialEntries={['/admin/sms']}><Routes><Route path="/admin/sms" element={<Page/>}/><Route path="/admin" element={<p>Admin sign in</p>}/></Routes></MemoryRouter>);}); }
    export async function unmount(){await act(async()=>root.unmount());}
  ` }, plugins: [{ name: 'offline-inbox', setup(b) {
    b.onResolve({ filter: /hooks\/useIdrAuth$/ }, () => ({ path: 'staff', namespace: 'offline' }));
    b.onResolve({ filter: /integrations\/supabase\/client$/ }, () => ({ path: 'supabase', namespace: 'offline' }));
    b.onLoad({ filter: /.*/, namespace: 'offline' }, args => ({ contents: args.path === 'staff' ? 'export const getIdrStaffRole=()=>window.__staffRole();' : 'export const supabase={rpc:(...args)=>window.__inboxRpc(...args),auth:window.__smsAuth};', loader: 'js' }));
  } }] });

async function fixture(t, options = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://fabsy.invalid/admin/sms', runScripts: 'outside-only' });
  const pending = [];
  const channels = [];
  dom.window.MessageChannel = class { constructor() { const channel = new MessageChannel(); channels.push(channel); return channel; } };
  dom.window.IS_REACT_ACT_ENVIRONMENT = true;
  const roleRequests = [];
  dom.window.__staffRole = () => new Promise(resolve => roleRequests.push(resolve));
  dom.window.__smsAuth = {
    getSession: () => Promise.resolve({ data: { session: options.session || null }, error: null }),
    onAuthStateChange: callback => { dom.window.__authChanged = callback; return { data: { subscription: { unsubscribe(){} } } }; },
  };
  dom.window.__inboxRpc = (name) => {
    assert.equal(name, 'admin_sms_intake_inbox');
    return new Promise(resolve => pending.push(resolve));
  };
  dom.window.fetch = () => { throw new Error('External network forbidden'); };
  dom.window.eval(bundle.outputFiles[0].text);
  const api = dom.window.inboxTest;
  if (options.page) await api.mountPage(); else await api.mount();
  t.after(async () => { await api.unmount(); for (const channel of channels) { channel.port1.close(); channel.port2.close(); } dom.window.close(); });
  const settle = async (index, data, error = null) => api.act(async () => pending[index]({ data, error }));
  const refresh = async () => api.act(async () => dom.window.document.querySelector('button').click());
  const authorize = role => api.act(async () => roleRequests.shift()(role));
  const signOut = () => api.act(async () => dom.window.__authChanged('SIGNED_OUT', null));
  return { window: dom.window, document: dom.window.document, api, settle, refresh, authorize, signOut, pending };
}
const data = { inquiries: [{ id: 'fixture', from_number: '+14035550123', to_number: '+18255550123',
  created_at: '2026-09-18T12:00:00Z', last_message_at: '2026-09-18T12:01:00Z', opted_out: false,
  email_status: 'sent', message_count: 1, messages_truncated: false,
  messages: [{ message_sid: 'SMfixture', body: '<img src=x onerror="alert(1)">', reply_text: 'Use secure intake.', received_at: '2026-09-18T12:00:00Z', state: 'replied', delivery_status: null, delivery_error_code: null }] }] };

test('staff inbox renders escaped messages and distinguishes prepared from delivered replies', async t => {
  const f = await fixture(t);
  await f.settle(0, data);
  assert.equal(f.document.querySelector('img'), null);
  assert.match(f.document.body.textContent, /<img src=x/);
  assert.match(f.document.body.textContent, /Prepared reply:/);
  assert.match(f.document.body.textContent, /awaiting provider confirmation/);
  assert.match(f.document.body.textContent, /Internal email: provider accepted; delivery unconfirmed/);
  assert.match(f.document.body.textContent, /not a submitted ticket/);
});
test('refresh failure clears stale inquiries and reports unavailable', async t => {
  const f = await fixture(t);
  await f.settle(0, data);
  await f.refresh();
  assert.doesNotMatch(f.document.body.textContent, /14035550123/);
  await f.settle(1, null, { message: 'Unauthorized' });
  assert.match(f.document.querySelector('[role="alert"]').textContent, /unavailable/);
  assert.doesNotMatch(f.document.body.textContent, /No recent SMS inquiries/);
});
test('late prior response cannot replace the latest inbox refresh', async t => {
  const f = await fixture(t);
  await f.refresh();
  await f.settle(1, { inquiries: [] });
  await f.settle(0, data);
  assert.match(f.document.body.textContent, /No recent SMS inquiries/);
  assert.doesNotMatch(f.document.body.textContent, /14035550123/);
});

test('admin page waits for staff role and removes all messages on sign-out', async t => {
  const f = await fixture(t, { page: true, session: { user: { id: 'staff' } } });
  assert.equal(f.pending.length, 0);
  assert.match(f.document.body.textContent, /Checking staff access/);
  await f.authorize('case_manager');
  assert.equal(f.pending.length, 1);
  await f.settle(0, data);
  assert.match(f.document.body.textContent, /14035550123/);
  await f.signOut();
  assert.doesNotMatch(f.document.body.textContent, /14035550123/);
  assert.match(f.document.body.textContent, /Admin sign in/);
});
test('ordinary account cannot query staff inbox', async t => {
  const f = await fixture(t, { page: true, session: { user: { id: 'customer' } } });
  await f.authorize(null);
  assert.equal(f.pending.length, 0);
  assert.match(f.document.body.textContent, /Admin sign in/);
});
test('late staff authorization after sign-out cannot restore private inbox', async t => {
  const f = await fixture(t, { page: true, session: { user: { id: 'staff' } } });
  await f.signOut();
  await f.authorize('admin');
  assert.equal(f.pending.length, 0);
  assert.match(f.document.body.textContent, /Admin sign in/);
});
test('admin route and dashboard link exist and new webhooks use their own authentication', () => {
  const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
  const dashboard = readFileSync(resolve(root, 'src/pages/AdminDashboard.tsx'), 'utf8');
  assert.match(app, /path="\/admin\/sms"[^\n]+AdminSmsIntake/);
  assert.match(dashboard, /path: "\/admin\/sms"/);
  const config = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8');
  for (const name of ['sms-vapi-webhook', 'process-sms-intake-emails']) {
    const section = config.split(`[functions.${name}]`)[1]?.split('[')[0];
    assert.match(section || '', /verify_jwt\s*=\s*false/);
  }
});
