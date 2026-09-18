#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MessageChannel } from 'node:worker_threads';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

const thisFile = fileURLToPath(import.meta.url);
if (!process.execArgv.includes('--experimental-strip-types')) {
  const { spawnSync } = await import('node:child_process');
  const child = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', thisFile], { stdio: 'inherit' });
  process.exit(child.status ?? 1);
}

const root = fileURLToPath(new URL('../', import.meta.url));

test('report window parser accepts only the bounded fixed windows', async () => {
  const { parseFunnelReportWindow, FunnelReportRequestError } = await import(
    pathToFileURL(path.join(root, 'supabase/functions/_shared/funnel-report.ts')).href
  );
  assert.equal(parseFunnelReportWindow({}), 7);
  for (const days of [1, 7, 14, 30, 90]) assert.equal(parseFunnelReportWindow({ days }), days);
  for (const value of [null, [], { days: 2 }, { days: '7' }, { days: 7, campaign: 'all' }]) {
    assert.throws(() => parseFunnelReportWindow(value), FunnelReportRequestError);
  }
});

test('aggregate report is staff gated and exposes no row-level identifiers', async () => {
  const edge = await fs.readFile(path.join(root, 'supabase/functions/paid-funnel-report/index.ts'), 'utf8');
  const migration = await fs.readFile(path.join(root, 'supabase/migrations/20260903173000_paid_funnel_reporting.sql'), 'utf8');
  const behaviorMigration = await fs.readFile(path.join(root, 'supabase/migrations/20260906170000_paid_funnel_behavior_diagnostics.sql'), 'utf8');
  assert.match(edge, /admin\.auth\.getUser\(token\)/);
  assert.match(edge, /\.from\('user_roles'\)/);
  assert.match(edge, /\.in\('role', \['admin', 'case_manager'\]\)/);
  assert.match(edge, /\.in\('role', \['admin', 'case_manager'\]\)\s*\.limit\(1\)\s*\.maybeSingle\(\)/);
  assert.match(migration, /grant execute on function public\.paid_funnel_report[\s\S]*to service_role/);
  assert.match(migration, /count\(distinct session_id\)/);
  assert.match(edge, /paid_funnel_behavior_report/);
  assert.match(edge, /behavior: behaviorResult\.data/);
  assert.match(behaviorMigration, /count\(distinct session_id\)/);
  assert.match(behaviorMigration, /intake_step_viewed/);
  assert.doesNotMatch(behaviorMigration, /jsonb_build_object\([\s\S]*?(?:event_id|session_id|click_id_hash)[\s\S]*?'steps'/i);
  assert.match(migration, /event_name = 'purchase'/);
  assert.match(migration, /p_since < p_until - interval '90 days'/);
  assert.doesNotMatch(migration, /jsonb_build_object\([\s\S]*?(?:event_id|session_id|click_id_hash)[\s\S]*?'campaigns'/i);
  for (const forbidden of ['email', 'phone_number', 'ticket_number', 'ip_address', 'user_agent']) {
    assert.equal(migration.toLowerCase().includes(forbidden), false, forbidden);
  }
});

test('admin report clearly identifies consent scope and platform reconciliation', async () => {
  const ui = await fs.readFile(path.join(root, 'src/pages/AdminPaidFunnel.tsx'), 'utf8');
  assert.match(ui, /only visitors who explicitly allowed Fabsy funnel measurement/i);
  assert.match(ui, /Reconcile them with Meta and Google clicks, spend, and consent acceptance/i);
  assert.match(ui, /Recoverable lead rate/);
  assert.match(ui, /Verified purchases/);
  assert.match(ui, /All-customer, order-level facts from signed Stripe webhooks/i);
  assert.match(ui, /Net-retained customers remain not measurable/i);
  assert.match(ui, /Refund facts are never sent to Google or Meta/i);
  assert.match(ui, /Landing-page behavior/);
  assert.match(ui, /visible browsing time/);
  assert.match(ui, /Behavior by campaign and creative/);
  assert.match(ui, /Upload failures/);
});

test('behavior checkpoints remain bounded, consent gated and free of captured content', async () => {
  const component = await fs.readFile(path.join(root, 'src/components/FunnelMeasurement.tsx'), 'utf8');
  const intake = await fs.readFile(path.join(root, 'src/components/TicketForm.tsx'), 'utf8');
  assert.match(component, /getFabsyFunnelConsentChoice\(\) !== 'accepted'/);
  assert.match(component, /document\.visibilityState !== 'visible'/);
  assert.match(component, /new IntersectionObserver/);
  assert.match(component, /scrollCheckpoints = \[25, 50, 75, 90\]/);
  assert.match(component, /engagementCheckpoints = \[10, 30, 60\]/);
  assert.match(intake, /fabsy:intake-ticket-upload-started/);
  assert.match(intake, /fabsy:intake-ticket-upload-failed/);
  assert.match(intake, /fabsy:intake-step-viewed/);
  for (const forbidden of ['formData.', 'ticketNumber', 'dateOfBirth', 'driversLicense', 'offenceDescription']) {
    assert.equal(component.includes(forbidden), false, forbidden);
  }
});

test('report failures and overlapping window requests cannot appear as zero or stale traffic', async () => {
  const output = await build({
    absWorkingDir: root, bundle: true, platform: 'browser', format: 'iife', write: false,
    jsx: 'automatic', alias: { '@': path.join(root, 'src') }, logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{
      name: 'offline-funnel-report',
      setup(builder) {
        builder.onResolve({ filter: /^@\/(?:integrations\/supabase\/client|hooks\/useIdrAuth|hooks\/use-toast)$/ }, args => ({
          path: args.path, namespace: 'offline-report',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'offline-report' }, args => ({
          loader: 'js',
          contents: args.path.endsWith('/client') ? `
            export const supabase = {
              auth: { getSession: async () => ({ data: { session: {} } }) },
              functions: { invoke: (_, options) => new Promise(resolve => {
                window.reportRequests.push({ days: options.body.days, resolve });
              }) },
            };
          ` : args.path.endsWith('/useIdrAuth')
            ? 'export const getIdrStaffRole = async () => "admin";'
            : 'const toast = () => {}; export const useToast = () => ({ toast });',
        }));
      },
    }],
    stdin: {
      loader: 'tsx', resolveDir: root, sourcefile: 'offline-funnel-report.tsx',
      contents: `
        import React, { act } from 'react';
        import { createRoot } from 'react-dom/client';
        import { MemoryRouter } from 'react-router-dom';
        import AdminPaidFunnel from './src/pages/AdminPaidFunnel';
        const root = createRoot(document.getElementById('root'));
        window.reportTest = {
          mount: () => act(async () => root.render(<MemoryRouter><AdminPaidFunnel /></MemoryRouter>)),
          click: label => act(async () => {
            const button = Array.from(document.querySelectorAll('button')).find(item => item.textContent === label);
            if (!button) throw new Error('Button missing: ' + label);
            button.click();
          }),
          resolve: (index, response) => act(async () => window.reportRequests[index].resolve(response)),
          unmount: () => act(async () => root.unmount()),
        };
      `,
    },
  });
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: 'https://offline-fabsy.invalid/admin/acquisition', runScripts: 'outside-only',
    pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
  });
  dom.window.IS_REACT_ACT_ENVIRONMENT = true;
  const channels = [];
  dom.window.MessageChannel = class extends MessageChannel {
    constructor() { super(); channels.push(this); }
  };
  dom.window.reportRequests = [];
  dom.window.fetch = () => { throw new Error('Unexpected network request'); };
  dom.window.eval(output.outputFiles[0].text);
  const fixture = dom.window.reportTest;
  const text = () => dom.window.document.body.textContent;
  const payload = (marker, count = 17) => ({ data: {
    generated_at: '2026-09-18T12:00:00Z', since: '2026-09-11T12:00:00Z', until: '2026-09-18T12:00:00Z',
    consented_sessions_only: true, events: [], campaigns: [], daily: [],
    preconsent: { events: [{ event_name: 'paid_landing', event_count: count }], campaigns: [{
      source: 'google', campaign: marker, medium: 'cpc', content: 'en_rsa_v1', locale: 'en',
      landing_requests: count, consent_accepted: 0, consent_declined: 0, consent_dismissed: 0,
    }], daily: [] },
  }, error: null });
  const failure = { data: null, error: { message: 'Report unavailable' } };
  try {
    await fixture.mount();
    assert.match(text(), /Loading acquisition report/);
    assert.doesNotMatch(text(), /No paid landing requests|Paid landing requests/);
    await fixture.resolve(0, failure);
    assert.match(dom.window.document.querySelector('[role="alert"]').textContent, /Acquisition report unavailable/);
    assert.doesNotMatch(text(), /No paid landing requests|Paid landing requests/);

    await fixture.click('Refresh');
    await fixture.resolve(1, payload('seven_day_campaign'));
    assert.match(text(), /seven_day_campaign/);
    assert.doesNotMatch(text(), /Tagged verification traffic is excluded/);
    assert.equal(dom.window.document.querySelector('[role="alert"]'), null);

    await fixture.click('14 days');
    assert.doesNotMatch(text(), /seven_day_campaign/);
    await fixture.click('30 days');
    assert.deepEqual(Array.from(dom.window.reportRequests, request => request.days), [7, 7, 14, 30]);
    const verifiedReport = payload('thirty_day_campaign');
    verifiedReport.data.verification_traffic_excluded = true;
    await fixture.resolve(3, verifiedReport);
    await fixture.resolve(2, payload('stale_fourteen_day_campaign'));
    assert.match(text(), /thirty_day_campaign/);
    assert.match(text(), /Tagged verification traffic is excluded from the session funnel/);
    assert.match(text(), /Payment totals include all signed live purchases/);
    assert.doesNotMatch(text(), /stale_fourteen_day_campaign/);

    await fixture.click('24 hours');
    await fixture.resolve(4, failure);
    assert.match(text(), /Acquisition report unavailable/);
    assert.doesNotMatch(text(), /thirty_day_campaign|No paid landing requests|Paid landing requests/);
    await fixture.click('Refresh');
    const empty = payload('');
    empty.data.preconsent = { events: [], campaigns: [], daily: [] };
    await fixture.resolve(5, empty);
    assert.match(text(), /No paid landing requests in this window/);
    assert.equal(dom.window.document.querySelector('[role="alert"]'), null);
  } finally {
    await fixture.unmount();
    dom.window.close();
    for (const channel of channels) { channel.port1.close(); channel.port2.close(); }
  }
});
