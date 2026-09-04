#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInContext } from 'node:vm';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const thisFile = fileURLToPath(import.meta.url);
if (!process.execArgv.includes('--experimental-strip-types')) {
  const { spawnSync } = await import('node:child_process');
  const child = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', thisFile], { stdio: 'inherit' });
  process.exit(child.status ?? 1);
}

const root = fileURLToPath(new URL('../', import.meta.url));
const enabledEnv = { PROD: true, VITE_FABSY_FUNNEL_MEASUREMENT_ENABLED: 'true' };

async function bundle() {
  const result = await build({
    absWorkingDir: root,
    stdin: {
      resolveDir: root,
      sourcefile: 'funnel-measurement-fixture.ts',
      loader: 'ts',
      contents: `
        export * from './src/lib/fabsyFunnelConsent';
        export * from './src/lib/marketingAttribution';
        export * from './src/lib/funnelMeasurement';
        export * from './src/lib/checkoutMeasurement';
      `,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'cjs',
    logLevel: 'silent',
    define: { 'import.meta.env': JSON.stringify(enabledEnv) },
  });
  return result.outputFiles[0].text;
}

async function runtime(href = 'https://fabsy.ca/rapid-resolution?utm_source=meta&utm_medium=paid_social&utm_campaign=rr_launch_v2&utm_content=rr_easy_v2&fbclid=SYNTHETIC_CLICK') {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: href, runScripts: 'outside-only' });
  const context = dom.getInternalVMContext();
  context.module = { exports: {} };
  context.exports = context.module.exports;
  Object.defineProperty(context, 'crypto', { configurable: true, value: webcrypto });
  runInContext(await bundle(), context);
  const calls = [];
  dom.window.fetch = async (url, options) => {
    calls.push({ url, options });
    return { status: 202, json: async () => ({ accepted: true }) };
  };
  return { api: context.module.exports, calls, win: dom.window, close: () => dom.window.close() };
}

test('first-party consent is explicit, versioned and expires', async () => {
  const r = await runtime();
  try {
    const now = Date.now();
    assert.equal(r.api.getFabsyFunnelConsentChoice(), 'unknown');
    for (const value of [null, '', '{}', JSON.stringify({ version: 2, choice: 'accepted', savedAt: now }),
      JSON.stringify({ version: 1, choice: 'accepted', savedAt: now - r.api.FABSY_FUNNEL_CONSENT_MAX_AGE_MS })]) {
      assert.equal(r.api.parseFabsyFunnelConsent(value, now), 'unknown');
    }
    r.api.setFabsyFunnelConsentChoice('accepted');
    assert.equal(r.api.getFabsyFunnelConsentChoice(), 'accepted');
    assert.ok(r.api.getFabsyFunnelConsentGrant()?.savedAt <= Date.now());
    const checkoutContext = r.api.currentFunnelCheckoutContext();
    assert.equal(checkoutContext.consentVersion, 'fabsy-funnel-v1');
    assert.match(checkoutContext.sessionId, /^[0-9a-f-]{36}$/i);
    assert.ok(Date.parse(checkoutContext.consentedAt) <= Date.now());
    r.api.setFabsyFunnelConsentChoice('declined');
    assert.equal(r.api.getFabsyFunnelConsentChoice(), 'declined');
    assert.equal(r.api.currentFunnelCheckoutContext(), null);
  } finally { r.close(); }
});

test('ad attribution stays memory-only until first-party measurement consent', async () => {
  const r = await runtime();
  try {
    const search = r.win.location.search;
    const captured = r.api.captureMarketingAttribution(search, '/rapid-resolution', '');
    assert.equal(captured.fbclid, 'SYNTHETIC_CLICK');
    assert.equal(captured.utm_campaign, 'rr_launch_v2');
    assert.equal(r.win.localStorage.getItem(r.api.MARKETING_STORAGE_KEY), null);
    assert.deepEqual(JSON.parse(JSON.stringify(r.api.readMarketingAttribution())), {});

    r.api.setFabsyFunnelConsentChoice('accepted');
    const persisted = r.api.persistPendingMarketingAttribution();
    assert.equal(persisted.fbclid, 'SYNTHETIC_CLICK');
    assert.equal(persisted.utm_content, 'rr_easy_v2');
    assert.equal(JSON.parse(r.win.localStorage.getItem(r.api.MARKETING_STORAGE_KEY)).landing_page, '/rapid-resolution');

    r.api.setFabsyFunnelConsentChoice('declined');
    r.api.clearMarketingAttribution();
    assert.equal(r.win.localStorage.getItem(r.api.MARKETING_STORAGE_KEY), null);
  } finally { r.close(); }
});

test('malformed or personal-looking campaign fields are never retained', async () => {
  const r = await runtime('https://fabsy.ca/rapid-resolution');
  try {
    const captured = r.api.captureMarketingAttribution(
      '?utm_source=meta&utm_campaign=person%40example.invalid&utm_content=contains%20spaces&fbclid=bad%40id',
      '/rapid-resolution',
      '',
    );
    assert.equal(captured.utm_source, 'meta');
    assert.equal(captured.utm_campaign, undefined);
    assert.equal(captured.utm_content, undefined);
    assert.equal(captured.fbclid, undefined);
  } finally { r.close(); }
});

test('client funnel payload is consent gated, deduplicated and PII free', async () => {
  const r = await runtime();
  try {
    r.api.captureMarketingAttribution(r.win.location.search, '/rapid-resolution', '');
    assert.equal(await r.api.recordFunnelEvent('landing_view', { dedupeKey: 'landing_view' }), false);
    assert.equal(r.calls.length, 0);
    r.api.setFabsyFunnelConsentChoice('accepted');
    r.api.persistPendingMarketingAttribution();
    assert.equal(await r.api.recordFunnelEvent('landing_view', { dedupeKey: 'landing_view' }), true);
    assert.equal(await r.api.recordFunnelEvent('landing_view', { dedupeKey: 'landing_view' }), true);
    assert.equal(r.calls.length, 1);
    const call = r.calls[0];
    assert.match(String(call.url), /\/functions\/v1\/record-funnel-event$/);
    assert.equal(call.options.keepalive, true);
    assert.equal(call.options.credentials, 'omit');
    assert.equal(call.options.referrerPolicy, 'no-referrer');
    const body = JSON.parse(call.options.body);
    assert.equal(body.eventName, 'landing_view');
    assert.equal(body.pageKey, 'rapid_resolution');
    assert.equal(body.attribution.utm_campaign, 'rr_launch_v2');
    assert.deepEqual(body.clickId, { kind: 'fbclid', value: 'SYNTHETIC_CLICK' });
    const serialized = JSON.stringify(body);
    for (const forbidden of ['email', 'phone', 'ticketNumber', 'freeText', 'referrer', 'userAgent', 'pathname']) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
  } finally { r.close(); }
});

test('client rejects event/page and step mismatches before transport', async () => {
  const r = await runtime();
  try {
    r.api.setFabsyFunnelConsentChoice('accepted');
    assert.equal(await r.api.recordFunnelEvent('lead_saved'), false);
    assert.equal(await r.api.recordFunnelEvent('intake_step_completed', { step: 7 }), false);
    assert.equal(await r.api.recordFunnelEvent('landing_view', { position: 'hero' }), false);
    assert.equal(await r.api.recordFunnelEvent('purchase', { product: 'rapid_resolution' }), false);
    assert.equal(r.calls.length, 0);
    assert.equal(r.api.funnelMeasurementEnabled(enabledEnv, 'https://fabsy.ca'), true);
    assert.equal(r.api.funnelMeasurementEnabled({ ...enabledEnv, PROD: false }, 'https://fabsy.ca'), false);
    assert.equal(r.api.funnelMeasurementEnabled(enabledEnv, 'https://preview.fabsy.ca'), false);
  } finally { r.close(); }
});

test('checkout measurement scopes preserve valid mixed consent and detect consent races', async () => {
  const r = await runtime();
  try {
    const handle = 'a'.repeat(64);
    const funnelOnly = r.api.checkoutMeasurementEnvelope({
      measurementAttributionHandle: handle,
      measurementAttributionScopes: { meta: false, funnel: true },
      metaAttributionHandle: handle,
    });
    assert.deepEqual(JSON.parse(JSON.stringify(funnelOnly)), {
      handle,
      scopes: { meta: false, funnel: true },
    });
    assert.equal(r.api.checkoutMeasurementWithdrawalRequired(funnelOnly.scopes, {
      meta: 'declined',
      funnel: 'accepted',
    }), false, 'Meta refusal must not revoke funnel-only attribution');
    assert.equal(r.api.checkoutMeasurementWithdrawalRequired(funnelOnly.scopes, {
      meta: 'declined',
      funnel: 'declined',
    }), true, 'a funnel withdrawal after request start must revoke the handoff');

    const metaOnly = r.api.checkoutMeasurementEnvelope({
      measurementAttributionHandle: handle,
      measurementAttributionScopes: { meta: true, funnel: false },
    });
    assert.equal(r.api.checkoutMeasurementWithdrawalRequired(metaOnly.scopes, {
      meta: 'accepted',
      funnel: 'declined',
    }), false, 'Fabsy funnel refusal must not revoke Meta-only attribution');
    assert.equal(r.api.checkoutMeasurementWithdrawalRequired(metaOnly.scopes, {
      meta: 'unknown',
      funnel: 'accepted',
    }), true, 'a Meta withdrawal after request start must revoke the handoff');

    assert.deepEqual(JSON.parse(JSON.stringify(r.api.checkoutMeasurementEnvelope({
      metaAttributionHandle: handle,
    }))), { handle, scopes: { meta: true, funnel: false } });
    assert.equal(r.api.checkoutMeasurementEnvelope({
      measurementAttributionHandle: handle,
      measurementAttributionScopes: { meta: false, funnel: false },
    }), null);
  } finally { r.close(); }
});

test('server parser accepts only the exact no-PII contract', async () => {
  const { parseFunnelEventRequest, FunnelRequestError } = await import(
    pathToFileURL(path.join(root, 'supabase/functions/_shared/funnel-measurement.ts')).href
  );
  const now = Date.now();
  const base = {
    eventId: '11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
    eventName: 'intake_step_completed',
    occurredAt: new Date(now).toISOString(),
    pageKey: 'intake',
    consentVersion: 'fabsy-funnel-v1',
    consentedAt: new Date(now - 1000).toISOString(),
    step: 2,
    attribution: { utm_source: 'meta', utm_campaign: 'rr_launch_v2' },
    clickId: { kind: 'fbclid', value: 'SYNTHETIC_CLICK' },
  };
  const parsed = parseFunnelEventRequest(base, now);
  assert.equal(parsed.step, 2);
  assert.equal(parsed.clickIdKind, 'fbclid');
  assert.equal(parsed.clickIdValue, 'SYNTHETIC_CLICK');
  const cta = parseFunnelEventRequest({
    ...base,
    eventName: 'primary_cta_click',
    pageKey: 'rapid_resolution',
    step: undefined,
    position: 'hero',
  }, now);
  assert.equal(cta.position, 'hero');
  for (const invalid of [
    { ...base, email: 'person@example.invalid' },
    { ...base, eventName: 'lead_saved', step: 2 },
    { ...base, pageKey: 'rapid_resolution' },
    { ...base, consentVersion: 'google-v1' },
    { ...base, position: 'hero' },
    { ...base, eventName: 'primary_cta_click', pageKey: 'rapid_resolution', step: undefined, position: 'modal' },
    { ...base, clickId: { kind: 'fbclid', value: 'person@example.invalid' } },
    { ...base, eventName: 'purchase', pageKey: 'thank_you', step: undefined, product: 'rapid_resolution' },
  ]) assert.throws(() => parseFunnelEventRequest(invalid, now), FunnelRequestError);
});

test('database and edge contracts store no raw click ID, IP, user agent or form value', async () => {
  const migration = await fs.readFile(path.join(root, 'supabase/migrations/20260903170000_paid_funnel_measurement.sql'), 'utf8');
  const edge = await fs.readFile(path.join(root, 'supabase/functions/record-funnel-event/index.ts'), 'utf8');
  assert.match(migration, /click_id_hash text/);
  assert.doesNotMatch(migration, /\b(click_id_value|email|phone|ticket_number|user_agent|ip_address)\b/i);
  assert.match(migration, /revoke all on analytics_private\.paid_funnel_events from public, anon, authenticated, service_role/);
  assert.match(migration, /FUNNEL_PURCHASE_REQUIRES_VERIFIED_WEBHOOK/);
  assert.match(migration, /record_verified_paid_funnel_purchase/);
  assert.match(migration, /record_paid_funnel_checkout/);
  assert.match(migration, /withdraw_paid_funnel_checkout/);
  assert.match(edge, /sha256\(`\$\{event\.clickIdKind\}:\$\{event\.clickIdValue\}`\)/);
  const client = await fs.readFile(path.join(root, 'src/lib/funnelMeasurement.ts'), 'utf8');
  assert.match(client, /keepalive: true/);
  assert.match(client, /referrerPolicy: 'no-referrer'/);
  assert.doesNotMatch(edge, /console\.(?:log|warn|error)\([^\n]*(?:event\.|request\.headers|clickIdValue)/);
  const createPayment = await fs.readFile(path.join(root, 'supabase/functions/create-payment/index.ts'), 'utf8');
  const paymentStep = await fs.readFile(path.join(root, 'src/components/form-steps/PaymentStep.tsx'), 'utf8');
  const webhook = await fs.readFile(path.join(root, 'supabase/functions/idr-payment-webhook/index.ts'), 'utf8');
  const withdrawal = await fs.readFile(path.join(root, 'supabase/functions/withdraw-meta-measurement/index.ts'), 'utf8');
  assert.match(createPayment, /recordPaidFunnelCheckoutAttribution/);
  assert.match(createPayment, /record_paid_funnel_checkout/);
  assert.equal(
    createPayment.match(/measurementAttributionScopes/g)?.length,
    4,
    'new and reused checkout responses must expose the two recorded consent scopes',
  );
  assert.match(paymentStep, /checkoutMeasurementWithdrawalRequired/);
  assert.match(paymentStep, /getFabsyFunnelConsentChoice/);
  assert.match(webhook, /recordCurrentPaidFunnelPurchaseIfEligible/);
  assert.match(webhook, /record_verified_paid_funnel_purchase/);
  assert.match(withdrawal, /withdraw_paid_funnel_checkout/);
});
