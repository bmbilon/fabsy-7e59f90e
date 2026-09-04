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
const productionSupabaseFallback = 'gcasbisxfrssonllpqrw.supabase.co';
const enabledEnv = {
  PROD: true,
  VITE_FABSY_FUNNEL_MEASUREMENT_ENABLED: 'true',
  VITE_SUPABASE_URL: 'https://synthetic-project.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'synthetic-publishable-key',
};

async function bundle(env = enabledEnv) {
  const result = await build({
    absWorkingDir: root,
    stdin: {
      resolveDir: root,
      sourcefile: 'funnel-measurement-fixture.ts',
      loader: 'ts',
      contents: `
        export * from './src/lib/fabsyFunnelConsent';
        export * from './src/lib/marketingAttribution';
        export * from './src/lib/funnelSessionStorage';
        export { currentFunnelSessionId } from './src/lib/funnelMeasurement';
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
    define: { 'import.meta.env': JSON.stringify(env) },
  });
  return result.outputFiles[0].text;
}

async function runtime(
  href = 'https://fabsy.ca/rapid-resolution?utm_source=meta&utm_medium=paid_social&utm_campaign=rr_launch_v2&utm_content=rr_easy_v2&fbclid=SYNTHETIC_CLICK',
  env = enabledEnv,
) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: href, runScripts: 'outside-only' });
  const context = dom.getInternalVMContext();
  context.module = { exports: {} };
  context.exports = context.module.exports;
  Object.defineProperty(context, 'crypto', { configurable: true, value: webcrypto });
  runInContext(await bundle(env), context);
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
    assert.match(checkoutContext.consentedAt, /T00:00:00\.000Z$/);
    assert.equal(r.win.sessionStorage.getItem(r.api.FUNNEL_SESSION_STORAGE_KEY), checkoutContext.sessionId);
    r.api.setFabsyFunnelConsentChoice('declined');
    assert.equal(r.api.getFabsyFunnelConsentChoice(), 'declined');
    assert.equal(r.api.currentFunnelCheckoutContext(), null);
    assert.equal(r.win.sessionStorage.getItem(r.api.FUNNEL_SESSION_STORAGE_KEY), null);
  } finally { r.close(); }
});

test('an environment without explicit Supabase public configuration fails closed', async () => {
  const r = await runtime(undefined, {
    PROD: true,
    VITE_FABSY_FUNNEL_MEASUREMENT_ENABLED: 'true',
  });
  try {
    r.api.setFabsyFunnelConsentChoice('accepted');
    assert.equal(await r.api.recordFunnelEvent('landing_view'), false);
    assert.equal(r.api.rememberMetaCheckoutAttributionHandle('e'.repeat(64), r.win), true);
    assert.equal(await r.api.flushMetaCheckoutAttributionWithdrawals(r.win), false);
    assert.equal(r.calls.length, 0);
  } finally { r.close(); }
});

test('browser data and consent modules contain no hard-coded production Supabase fallback', async () => {
  for (const relativePath of [
    'src/integrations/supabase/client.ts',
    'src/lib/funnelMeasurement.ts',
    'src/lib/metaCheckoutWithdrawal.ts',
    'src/pages/RepresentationConsent.tsx',
  ]) {
    const source = await fs.readFile(path.resolve(root, relativePath), 'utf8');
    // The browser client may name the expected production host as an allowlist;
    // reject only an executable default/fallback to that host.
    assert.doesNotMatch(
      source,
      new RegExp(String.raw`(?:\|\||\?\?)\s*['"]https://${productionSupabaseFallback.replaceAll('.', String.raw`\.`)}`),
      relativePath,
    );
  }
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

test('document guardian preserves undecided attribution but retires it on cross-tab removal and expiry', async () => {
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
        export * from './src/lib/marketingAttribution';
        export { FUNNEL_EVENT_DEDUPE_PREFIX, FUNNEL_SESSION_STORAGE_KEY } from './src/lib/funnelSessionStorage';
        export { currentFunnelSessionId } from './src/lib/funnelMeasurement';
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
    define: {
      'import.meta.env': JSON.stringify({
        PROD: false,
        VITE_SUPABASE_URL: 'https://synthetic-project.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'synthetic-publishable-key',
      }),
      'process.env.NODE_ENV': '"test"',
    },
  });

  for (const scenario of [
    'initial-unknown',
    'initial-expired',
    'initial-malformed',
    'cross-tab-removal',
    'missed-removal-pageshow',
    'expiry',
  ]) {
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
      // Capture before first-party consent while the route tracker is present,
      // then model navigation to the secure consent document where only the
      // document-lifetime guardian remains mounted.
      const pending = api.captureMarketingAttribution(
        '?utm_source=meta&utm_campaign=must_not_revive&utm_content=secure_route',
        '/rapid-resolution',
        '',
      );
      assert.equal(pending.utm_campaign, 'must_not_revive', scenario);
      assert.equal(api.getMetaConsentChoice(), 'accepted');
      const handle = (scenario === 'expiry' ? 'c' : 'd').repeat(64);
      if (!['initial-unknown', 'initial-malformed'].includes(scenario)) {
        dom.window.localStorage.setItem(api.FABSY_FUNNEL_CONSENT_STORAGE_KEY, JSON.stringify({
          version: 1,
          choice: 'accepted',
          savedAt: scenario === 'initial-expired'
            ? Date.now() - api.FABSY_FUNNEL_CONSENT_MAX_AGE_MS - 1
            : scenario === 'expiry'
            ? Date.now() - api.FABSY_FUNNEL_CONSENT_MAX_AGE_MS + 30
            : Date.now(),
        }));
        if (scenario !== 'initial-expired') {
          assert.equal(api.rememberMetaCheckoutAttributionHandle(handle, dom.window), true);
        }
      } else if (scenario === 'initial-malformed') {
        dom.window.localStorage.setItem(api.FABSY_FUNNEL_CONSENT_STORAGE_KEY, '{"version":1,"choice":');
      }

      const staleSessionId = '11111111-1111-4111-8111-111111111111';
      if (['initial-expired', 'initial-malformed', 'missed-removal-pageshow'].includes(scenario)) {
        assert.equal(typeof api.FUNNEL_SESSION_STORAGE_KEY, 'string');
        assert.equal(typeof api.FUNNEL_EVENT_DEDUPE_PREFIX, 'string');
        dom.window.sessionStorage.setItem(api.FUNNEL_SESSION_STORAGE_KEY, staleSessionId);
        dom.window.sessionStorage.setItem(`${api.FUNNEL_EVENT_DEDUPE_PREFIX}page_view:stale`, '1');
      }

      await api.mount();

      if (scenario === 'initial-unknown') {
        assert.equal(api.getFabsyFunnelConsentChoice(), 'unknown', scenario);
        api.setFabsyFunnelConsentChoice('accepted');
        const persisted = api.persistPendingMarketingAttribution();
        assert.equal(persisted.utm_campaign, 'must_not_revive', scenario);
        assert.ok(dom.window.localStorage.getItem(api.MARKETING_STORAGE_KEY), scenario);
      } else if (scenario === 'initial-expired' || scenario === 'initial-malformed') {
        assert.equal(api.getFabsyFunnelConsentChoice(), 'unknown', scenario);
        assert.equal(dom.window.sessionStorage.getItem(api.FUNNEL_SESSION_STORAGE_KEY), null, scenario);
        assert.equal(dom.window.sessionStorage.getItem(`${api.FUNNEL_EVENT_DEDUPE_PREFIX}page_view:stale`), null, scenario);
        api.setFabsyFunnelConsentChoice('accepted');
        const persisted = api.persistPendingMarketingAttribution();
        assert.equal(persisted.utm_campaign, 'must_not_revive', scenario);
        const newSessionId = api.currentFunnelSessionId(dom.window.sessionStorage);
        assert.notEqual(newSessionId, staleSessionId, scenario);
      } else if (scenario === 'cross-tab-removal') {
        dom.window.localStorage.removeItem(api.FABSY_FUNNEL_CONSENT_STORAGE_KEY);
        await api.tick(() => dom.window.dispatchEvent(new dom.window.StorageEvent('storage', {
          key: api.FABSY_FUNNEL_CONSENT_STORAGE_KEY,
          storageArea: dom.window.localStorage,
        })));
      } else if (scenario === 'missed-removal-pageshow') {
        dom.window.localStorage.removeItem(api.FABSY_FUNNEL_CONSENT_STORAGE_KEY);
        await api.tick(() => dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow')));
      } else {
        await api.tick(() => new Promise(resolve => dom.window.setTimeout(resolve, 60)));
      }

      const withdrawals = calls.filter(call => String(call.url).endsWith('/functions/v1/withdraw-meta-measurement'));
      if (['initial-unknown', 'initial-expired', 'initial-malformed'].includes(scenario)) {
        assert.equal(withdrawals.length, 0, scenario);
      } else {
        assert.equal(api.getMetaConsentChoice(), 'accepted', scenario);
        assert.equal(api.getFabsyFunnelConsentChoice(), 'unknown', scenario);
        api.setFabsyFunnelConsentChoice('accepted');
        assert.deepEqual(JSON.parse(JSON.stringify(api.persistPendingMarketingAttribution())), {}, scenario);
        assert.equal(dom.window.localStorage.getItem(api.MARKETING_STORAGE_KEY), null, scenario);
        assert.equal(withdrawals.length, 1, scenario);
        assert.deepEqual(JSON.parse(withdrawals[0].options.body), { handles: [handle] });
      }
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
    assert.match(body.consentedAt, /T00:00:00\.000Z$/);
    assert.equal(body.attribution.utm_campaign, 'rr_launch_v2');
    assert.deepEqual(body.clickId, { kind: 'fbclid', value: 'SYNTHETIC_CLICK' });
    const serialized = JSON.stringify(body);
    for (const forbidden of ['email', 'phone', 'ticketNumber', 'freeText', 'referrer', 'userAgent', 'pathname']) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
    const dedupeStorageKey = `${r.api.FUNNEL_EVENT_DEDUPE_PREFIX}landing_view`;
    assert.equal(r.win.sessionStorage.getItem(dedupeStorageKey), '1');
    r.api.setFabsyFunnelConsentChoice('declined');
    assert.equal(r.win.sessionStorage.getItem(r.api.FUNNEL_SESSION_STORAGE_KEY), null);
    assert.equal(r.win.sessionStorage.getItem(dedupeStorageKey), null);
  } finally { r.close(); }
});

test('consent withdrawal during a deferred funnel request cannot restore its dedupe marker', async () => {
  const r = await runtime();
  try {
    r.api.setFabsyFunnelConsentChoice('accepted');
    let releaseFetch;
    r.win.fetch = (url, options) => {
      r.calls.push({ url, options });
      return new Promise(resolve => {
        releaseFetch = () => resolve({ status: 202, json: async () => ({ accepted: true }) });
      });
    };

    const dedupeKey = 'deferred-withdrawal';
    const storageKey = `${r.api.FUNNEL_EVENT_DEDUPE_PREFIX}${dedupeKey}`;
    const pending = r.api.recordFunnelEvent('landing_view', { dedupeKey });
    assert.equal(typeof releaseFetch, 'function', 'Expected the funnel request to remain deferred');
    assert.match(r.win.sessionStorage.getItem(r.api.FUNNEL_SESSION_STORAGE_KEY), /^[0-9a-f-]{36}$/i);

    r.api.setFabsyFunnelConsentChoice('declined');
    assert.equal(r.win.sessionStorage.getItem(r.api.FUNNEL_SESSION_STORAGE_KEY), null);
    releaseFetch();

    assert.equal(await pending, false);
    assert.equal(r.win.sessionStorage.getItem(storageKey), null);
    assert.equal(r.win.sessionStorage.getItem(r.api.FUNNEL_SESSION_STORAGE_KEY), null);
    assert.equal(r.calls.length, 1);
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
  const withdrawalFence = await fs.readFile(path.join(root, 'supabase/migrations/20260903183000_paid_funnel_checkout_withdrawal_fence.sql'), 'utf8');
  const edge = await fs.readFile(path.join(root, 'supabase/functions/record-funnel-event/index.ts'), 'utf8');
  assert.match(migration, /click_id_hash text/);
  assert.doesNotMatch(migration, /\b(click_id_value|email|phone|ticket_number|user_agent|ip_address)\b/i);
  assert.match(migration, /revoke all on analytics_private\.paid_funnel_events from public, anon, authenticated, service_role/);
  assert.match(migration, /FUNNEL_PURCHASE_REQUIRES_VERIFIED_WEBHOOK/);
  assert.match(migration, /record_verified_paid_funnel_purchase/);
  assert.match(migration, /record_paid_funnel_checkout/);
  assert.match(migration, /withdraw_paid_funnel_checkout/);
  assert.match(withdrawalFence, /paid_funnel_checkout_withdrawals/);
  assert.match(withdrawalFence, /withdraw_known_paid_funnel_checkout/);
  assert.doesNotMatch(withdrawalFence, /revoked_at\s*=\s*null/i);
  assert.ok(
    (withdrawalFence.match(/pg_advisory_xact_lock/g) ?? []).length >= 4,
    'record, both withdrawal paths and verified purchase must serialize on the checkout hash',
  );
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
  assert.match(createPayment, /withdraw_paid_funnel_checkout/);
  assert.equal(
    createPayment.match(/measurementAttributionScopes/g)?.length,
    4,
    'new and reused checkout responses must expose the two recorded consent scopes',
  );
  assert.match(paymentStep, /checkoutMeasurementWithdrawalRequired/);
  assert.match(paymentStep, /getFabsyFunnelConsentChoice/);
  assert.match(webhook, /recordCurrentPaidFunnelPurchaseIfEligible/);
  assert.match(webhook, /record_verified_paid_funnel_purchase/);
  assert.match(withdrawal, /withdraw_known_paid_funnel_checkout/);
  assert.doesNotMatch(withdrawal, /["']withdraw_paid_funnel_checkout["']/);
});
