#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  assert.match(edge, /admin\.auth\.getUser\(token\)/);
  assert.match(edge, /\.from\('user_roles'\)/);
  assert.match(edge, /\.in\('role', \['admin', 'case_manager'\]\)/);
  assert.match(edge, /\.in\('role', \['admin', 'case_manager'\]\)\s*\.limit\(1\)\s*\.maybeSingle\(\)/);
  assert.match(migration, /grant execute on function public\.paid_funnel_report[\s\S]*to service_role/);
  assert.match(migration, /count\(distinct session_id\)/);
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
});
