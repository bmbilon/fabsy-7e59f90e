#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { MessageChannel } from 'node:worker_threads';
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
        export * from './src/lib/metaCheckoutWithdrawal';
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
    const durable = JSON.parse(r.win.localStorage.getItem(r.api.MARKETING_STORAGE_KEY));
    assert.equal(durable.version, 3);
    assert.equal(durable.consentSavedAt, r.api.getFabsyFunnelConsentGrant().savedAt);
    assert.equal(durable.attribution.landing_page, '/rapid-resolution');
    assert.ok(Date.parse(durable.attribution.first_touch_at) >= durable.consentSavedAt);

    r.api.setFabsyFunnelConsentChoice('declined');
    r.api.clearMarketingAttribution();
    assert.equal(r.win.localStorage.getItem(r.api.MARKETING_STORAGE_KEY), null);
  } finally { r.close(); }
});

test('retired, malformed and prior-consent attribution can never be revived by a new grant', async () => {
  for (const fixture of ['retired-v2', 'legacy', 'prior-grant', 'malformed-current']) {
    const r = await runtime('https://fabsy.ca/rapid-resolution');
    try {
      const stale = {
        utm_source: 'meta',
        utm_campaign: 'stale_campaign',
        landing_page: '/rapid-resolution',
        first_touch_at: new Date(Date.now() - 60_000).toISOString(),
      };
      if (fixture === 'retired-v2') r.win.localStorage.setItem('fabsy_marketing_v2', JSON.stringify(stale));
      if (fixture === 'legacy') r.win.localStorage.setItem('fabsy_marketing', JSON.stringify({ ...stale, email: 'person@example.invalid' }));
      r.api.setFabsyFunnelConsentChoice('accepted');
      const grant = r.api.getFabsyFunnelConsentGrant();
      if (fixture === 'prior-grant') {
        r.win.localStorage.setItem(r.api.MARKETING_STORAGE_KEY, JSON.stringify({
          version: 3,
          consentSavedAt: grant.savedAt - 1,
          attribution: { ...stale, first_touch_at: new Date(grant.savedAt).toISOString() },
        }));
      }
      if (fixture === 'malformed-current') {
        r.win.localStorage.setItem(r.api.MARKETING_STORAGE_KEY, JSON.stringify({
          version: 3,
          consentSavedAt: grant.savedAt,
          attribution: { ...stale, first_touch_at: new Date(grant.savedAt).toISOString(), unexpected: 'value' },
        }));
      }
      assert.deepEqual(JSON.parse(JSON.stringify(r.api.readMarketingAttribution())), {}, fixture);
      assert.equal(r.win.localStorage.getItem('fabsy_marketing_v2'), null, fixture);
      assert.equal(r.win.localStorage.getItem('fabsy_marketing'), null, fixture);
      assert.equal(r.win.localStorage.getItem(r.api.MARKETING_STORAGE_KEY), null, fixture);
    } finally { r.close(); }
  }
});

test('consent-bound attribution remains usable in this document when only its durable write is blocked', async () => {
  const r = await runtime();
  try {
    r.api.captureMarketingAttribution(r.win.location.search, '/rapid-resolution', '');
    r.api.setFabsyFunnelConsentChoice('accepted');
    const durableStorage = r.win.localStorage;
    Object.defineProperty(r.win, 'localStorage', { configurable: true, value: {
      getItem: key => durableStorage.getItem(key),
      setItem: (key, value) => {
        if (key === r.api.MARKETING_STORAGE_KEY) throw new Error('Synthetic attribution-only storage failure');
        durableStorage.setItem(key, value);
      },
      removeItem: key => durableStorage.removeItem(key),
      clear: () => durableStorage.clear(),
      key: index => durableStorage.key(index),
      get length() { return durableStorage.length; },
    } });
    const persisted = r.api.persistPendingMarketingAttribution();
    assert.equal(persisted.utm_campaign, 'rr_launch_v2');
    assert.equal(durableStorage.getItem(r.api.MARKETING_STORAGE_KEY), null);
    assert.equal(r.api.readMarketingAttribution().fbclid, 'SYNTHETIC_CLICK');
  } finally { r.close(); }
});

test('first-party-only refusal withdraws a remembered checkout while Meta may remain accepted', async () => {
  const r = await runtime('https://fabsy.ca/rapid-resolution');
  try {
    const handle = 'b'.repeat(64);
    r.api.setFabsyFunnelConsentChoice('accepted');
    assert.equal(r.api.rememberMetaCheckoutAttributionHandle(handle, r.win), true);
    r.api.setFabsyFunnelConsentChoice('declined');
    await new Promise(resolve => r.win.setTimeout(resolve, 0));
    const withdrawal = r.calls.find(call => String(call.url).endsWith('/functions/v1/withdraw-meta-measurement'));
    assert.ok(withdrawal);
    assert.deepEqual(JSON.parse(withdrawal.options.body), { handles: [handle] });
  } finally { r.close(); }
});

test('document guardian withdraws first-party checkout attribution on cross-tab removal and expiry', async () => {
  const guardianBundle = await build({
    absWorkingDir: root,
    stdin: {
      resolveDir: root,
      sourcefile: 'funnel-consent-guardian-fixture.tsx',
      loader: 'tsx',
      contents: `
        import React, { act } from 'react';
        import { createRoot } from 'react-dom/client';
        import GoogleMeasurementGuardian from './src/components/GoogleMeasurementGuardian';
        export * from './src/lib/fabsyFunnelConsent';
        export { setMetaConsentChoice, getMetaConsentChoice } from './src/lib/googleConsent';
        export { rememberMetaCheckoutAttributionHandle } from './src/lib/metaCheckoutWithdrawal';
        let root;
        export async function mount() {
          root = createRoot(document.getElementById('root'));
          await act(async () => root.render(<GoogleMeasurementGuardian />));
        }
        export async function tick(callback) { await act(async () => callback()); }
        export async function unmount() { await act(async () => root?.unmount()); }
      `,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'cjs',
    jsx: 'automatic',
    logLevel: 'silent',
    define: { 'import.meta.env': JSON.stringify({ PROD: false }), 'process.env.NODE_ENV': '"test"' },
  });

  for (const scenario of ['cross-tab-removal', 'expiry']) {
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'https://fabsy.ca/rapid-resolution',
      runScripts: 'outside-only',
    });
    const context = dom.getInternalVMContext();
    context.module = { exports: {} };
    context.exports = context.module.exports;
    dom.window.IS_REACT_ACT_ENVIRONMENT = true;
    const calls = [];
    const channels = [];
    dom.window.MessageChannel = class {
      constructor() { const channel = new MessageChannel(); channels.push(channel); return channel; }
    };
    dom.window.fetch = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 202, json: async () => ({ accepted: true }) };
    };
    runInContext(guardianBundle.outputFiles[0].text, context);
    const api = context.module.exports;
    try {
      api.setMetaConsentChoice('accepted');
      api.setFabsyFunnelConsentChoice('accepted');
      assert.equal(api.getMetaConsentChoice(), 'accepted');
      const handle = (scenario === 'expiry' ? 'c' : 'd').repeat(64);
      assert.equal(api.rememberMetaCheckoutAttributionHandle(handle, dom.window), true);

      if (scenario === 'expiry') {
        dom.window.localStorage.setItem(api.FABSY_FUNNEL_CONSENT_STORAGE_KEY, JSON.stringify({
          version: 1,
          choice: 'accepted',
          savedAt: Date.now() - api.FABSY_FUNNEL_CONSENT_MAX_AGE_MS + 30,
        }));
      }
      await api.mount();

      if (scenario === 'cross-tab-removal') {
        dom.window.localStorage.removeItem(api.FABSY_FUNNEL_CONSENT_STORAGE_KEY);
        await api.tick(() => dom.window.dispatchEvent(new dom.window.StorageEvent('storage', {
          key: api.FABSY_FUNNEL_CONSENT_STORAGE_KEY,
          storageArea: dom.window.localStorage,
        })));
      } else {
        await api.tick(() => new Promise(resolve => dom.window.setTimeout(resolve, 60)));
      }

      assert.equal(api.getMetaConsentChoice(), 'accepted', scenario);
      assert.equal(api.getFabsyFunnelConsentChoice(), 'unknown', scenario);
      const withdrawals = calls.filter(call => String(call.url).endsWith('/functions/v1/withdraw-meta-measurement'));
      assert.equal(withdrawals.length, 1, scenario);
      assert.deepEqual(JSON.parse(withdrawals[0].options.body), { handles: [handle] });
    } finally {
      await api.unmount();
      for (const channel of channels) { channel.port1.close(); channel.port2.close(); }
      dom.window.close();
    }
  }
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
