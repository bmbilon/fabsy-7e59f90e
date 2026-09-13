#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const thisFile = fileURLToPath(import.meta.url);
if (!process.execArgv.includes('--experimental-strip-types')) {
  const { spawnSync } = await import('node:child_process');
  const child = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', thisFile], { stdio: 'inherit' });
  process.exit(child.status ?? 1);
}

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = async file => (await build({
  entryPoints: [path.join(root, file)], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent',
})).outputFiles[0].text;

test('paid URL reduction keeps campaign labels but never returns raw click IDs or URLs', async () => {
  const module = { exports: {} };
  runInNewContext(await bundle('src/lib/preconsentMeasurementCore.ts'), { module, URL });
  const core = module.exports;
  const rawClick = 'fb_1_privacy-sensitive-click';
  const payload = core.preconsentMetricPayload(new URL(
    `https://fabsy.ca/pa/rapid-resolution?utm_source=meta&utm_medium=paid_social&utm_campaign=rr_ab_en_creative_20260831&utm_content=rr_client_control_v1&fbclid=${rawClick}`,
  ), 'paid_landing');
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), {
    eventName: 'paid_landing', pageKey: 'rapid_resolution', locale: 'pa',
    utmSource: 'meta', utmMedium: 'paid_social', utmCampaign: 'rr_ab_en_creative_20260831',
    utmContent: 'rr_client_control_v1', clickIdKind: 'fbclid',
  });
  assert.ok(!JSON.stringify(payload).includes(rawClick));
  assert.equal(core.preconsentMetricPayload(new URL('https://fabsy.ca/rapid-resolution'), 'paid_landing'), null);
  assert.equal(core.preconsentMetricPayload(new URL('https://fabsy.ca/submit-ticket?fbclid=safe'), 'paid_landing'), null);
  assert.equal(core.preconsentMetricPayload(new URL('https://fabsy.ca/rapid-resolution?utm_source=meta&utm_source=evil'), 'paid_landing'), null);
  const unknownLabels = core.preconsentMetricPayload(new URL('https://fabsy.ca/rapid-resolution?utm_source=meta&utm_medium=cpc&utm_campaign=PersonName&utm_content=private_note'), 'paid_landing');
  assert.equal(unknownLabels.utmCampaign, '');
  assert.equal(unknownLabels.utmContent, '');
});

test('reviewed Google relaunch and multilingual labels remain attributable', async () => {
  const module = { exports: {} };
  runInNewContext(await bundle('src/lib/preconsentMeasurementCore.ts'), { module, URL });
  const core = module.exports;

  const english = core.preconsentMetricPayload(new URL(
    'https://fabsy.ca/rapid-resolution?utm_source=google&utm_medium=cpc&utm_campaign=rr_google_profit_20260913&utm_content=en_rsa_v1&utm_term=traffic_ticket_defense&gclid=SYNTHETIC',
  ), 'paid_landing');
  assert.deepEqual(JSON.parse(JSON.stringify(english)), {
    eventName: 'paid_landing', pageKey: 'rapid_resolution', locale: 'en',
    utmSource: 'google', utmMedium: 'cpc', utmCampaign: 'rr_google_profit_20260913',
    utmContent: 'en_rsa_v1', clickIdKind: 'gclid',
  });

  const punjabi = core.preconsentMetricPayload(new URL(
    'https://fabsy.ca/pa/rapid-resolution?utm_source=google&utm_medium=cpc&utm_campaign=rr_ab_multilingual_20260906&utm_content=pa_rsa_v1',
  ), 'paid_landing');
  assert.equal(punjabi.utmCampaign, 'rr_ab_multilingual_20260906');
  assert.equal(punjabi.utmContent, 'pa_rsa_v1');
  assert.equal(punjabi.locale, 'pa');
});

test('same-origin endpoint accepts only bounded identifier-free payloads and respects privacy signals', async () => {
  const code = await bundle('functions/api/preconsent-measurement.ts');
  const calls = [];
  const module = { exports: {} };
  runInNewContext(code, {
    module, Request, Response, URL, TextEncoder, AbortSignal,
    fetch: async (url, init) => { calls.push({ url, ...init }); return new Response('true'); },
  });
  const valid = {
    eventName: 'consent_accepted', pageKey: 'rapid_resolution', locale: 'hi',
    utmSource: 'meta', utmMedium: 'paid_social', utmCampaign: 'rr_ab_en_creative_20260831',
    utmContent: 'rr_client_control_v1', clickIdKind: 'fbclid',
  };
  const invoke = (body = valid, headers = {}) => module.exports.onRequest({
    request: new Request('https://fabsy.ca/api/preconsent-measurement', {
      method: 'POST',
      headers: { Origin: 'https://fabsy.ca', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', ...headers },
      body: JSON.stringify(body),
    }),
    env: { SUPABASE_SERVICE_ROLE_KEY: 'server-secret' },
  });
  assert.equal((await invoke()).status, 202);
  const rpcBody = JSON.parse(calls[0].body);
  assert.deepEqual(Object.keys(rpcBody).sort(), [
    'p_click_id_kind', 'p_event_name', 'p_locale', 'p_page_key', 'p_utm_campaign',
    'p_utm_content', 'p_utm_medium', 'p_utm_source',
  ]);
  assert.ok(!calls[0].body.includes('server-secret'));
  assert.equal((await invoke({ ...valid, eventName: 'paid_landing' })).status, 400);
  assert.equal((await invoke({ ...valid, email: 'private@example.test' })).status, 400);
  assert.equal((await invoke(valid, { DNT: '1' })).status, 204);
  assert.equal((await invoke(valid, { 'Sec-GPC': '1' })).status, 204);
  assert.equal((await invoke(valid, { Origin: 'https://evil.test' })).status, 403);
  assert.equal(calls.length, 1);
});

test('Cloudflare middleware counts successful paid HTML requests in waitUntil only', async () => {
  const code = await bundle('functions/_middleware.ts');
  const calls = [];
  const module = { exports: {} };
  runInNewContext(code, {
    module, Request, Response, Headers, URL, TextEncoder, AbortSignal,
    fetch: async (url, init) => { calls.push({ url, ...init }); return new Response('true'); },
  });
  const background = [];
  const request = new Request('https://fabsy.ca/hi/rapid-resolution?utm_source=meta&utm_medium=cpc&utm_campaign=rr_ab_en_creative_20260831&utm_content=rr_relief_v1&fbclid=opaque-click', {
    headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0' },
  });
  const response = await module.exports.onRequest({
    request,
    env: { SUPABASE_SERVICE_ROLE_KEY: 'server-secret', ASSETS: { fetch: () => new Response(null, { status: 404 }) } },
    next: () => new Response('<!doctype html><title>Fabsy</title>', { headers: { 'Content-Type': 'text/html; charset=UTF-8' } }),
    waitUntil: promise => background.push(promise),
  });
  assert.equal(response.status, 200);
  assert.equal(background.length, 1);
  await Promise.all(background);
  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0].body);
  assert.equal(body.p_event_name, 'paid_landing');
  assert.equal(body.p_locale, 'hi');
  assert.equal(body.p_click_id_kind, 'fbclid');
  assert.ok(!calls[0].body.includes('opaque-click'));
});

test('browser consent action sends a reduced payload without storage or raw click identifiers', async () => {
  const output = await build({
    absWorkingDir: root,
    stdin: {
      resolveDir: root, sourcefile: 'preconsent-browser-fixture.ts', loader: 'ts',
      contents: `import { recordPreconsentMetric } from './src/lib/preconsentMeasurement'; window.runMetric = recordPreconsentMetric;`,
    },
    bundle: true, platform: 'browser', format: 'iife', write: false, logLevel: 'silent',
    define: { 'import.meta.env': JSON.stringify({ PROD: true }) },
  });
  const rawClick = 'do-not-send-this-click-id';
  const dom = new JSDOM('<!doctype html>', {
    url: `https://fabsy.ca/rapid-resolution?utm_source=meta&utm_medium=cpc&utm_campaign=rr_ab_en_creative_20260831&utm_content=rr_flat_fee_v1&fbclid=${rawClick}`,
    runScripts: 'outside-only',
  });
  const calls = [];
  dom.window.fetch = async (url, init) => { calls.push({ url, ...init }); return new Response(null, { status: 202 }); };
  dom.window.eval(output.outputFiles[0].text);
  assert.equal(await dom.window.runMetric('consent_declined'), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/preconsent-measurement');
  assert.ok(!calls[0].body.includes(rawClick));
  assert.equal(JSON.parse(calls[0].body).clickIdKind, 'fbclid');
  assert.equal(dom.window.localStorage.length, 0);
  dom.window.close();
});

test('database and staff report retain aggregate counters only', async () => {
  const migration = await fs.readFile(path.join(root, 'supabase/migrations/20260913130000_preconsent_paid_measurement.sql'), 'utf8');
  const campaignMigration = await fs.readFile(path.join(root, 'supabase/migrations/20260913170000_preconsent_campaign_labels.sql'), 'utf8');
  const reportEdge = await fs.readFile(path.join(root, 'supabase/functions/paid-funnel-report/index.ts'), 'utf8');
  assert.match(migration, /create table analytics_private\.preconsent_metrics_hourly/);
  assert.match(migration, /date_trunc\('hour', clock_timestamp\(\)\)/);
  assert.match(migration, /event_count = analytics_private\.preconsent_metrics_hourly\.event_count \+ 1/);
  assert.match(migration, /grant execute on function public\.record_preconsent_metric[\s\S]*to service_role/);
  assert.match(migration, /request_counts_not_people_or_sessions/);
  const tableDefinition = migration.match(/create table analytics_private\.preconsent_metrics_hourly[\s\S]*?\n\);/)?.[0] || '';
  assert.doesNotMatch(tableDefinition, /\b(?:session_id|visitor_id|user_agent|ip_address|referrer|raw_click_id)\b/i);
  assert.match(reportEdge, /preconsent_measurement_report/);
  assert.match(reportEdge, /preconsent: preconsentResult\.data/);
  assert.match(campaignMigration, /create or replace function public\.record_preconsent_metric/);
  assert.match(campaignMigration, /rr_google_profit_20260913/);
  assert.match(campaignMigration, /rr_ab_multilingual_20260906/);
  assert.match(campaignMigration, /en_rsa_v1/);
  assert.match(campaignMigration, /pa_rsa_v1/);
});
