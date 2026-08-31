import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInContext, runInNewContext } from "node:vm";
import { MessageChannel } from "node:worker_threads";
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";

// Synthetic browsers only. Script elements are inert, every network API throws,
// and the router probe never retrieves a receipt or executes a Google script.
const root = fileURLToPath(new URL("../", import.meta.url));
const enabledEnv = {
  PROD: true,
  VITE_GOOGLE_MEASUREMENT_ENABLED: "true",
  VITE_GA4_MEASUREMENT_ID: "G-TEST123456",
  VITE_GADS_ID: "AW-123456789",
  VITE_GADS_PURCHASE_LABEL: "RR_TEST_1",
  VITE_GADS_PHOTO_RADAR_PURCHASE_LABEL: "PHOTO_TEST_1",
};
const cleanContext = { page_location: "https://fabsy.ca/thank-you", page_referrer: "", page_title: "Fabsy" };
const plain = value => JSON.parse(JSON.stringify(value));
const compiled = new Map();

async function helperBundle(env) {
  const key = JSON.stringify(env);
  if (!compiled.has(key)) compiled.set(key, build({
    absWorkingDir: root,
    stdin: { resolveDir: root, sourcefile: 'measurement-helper-fixture.ts', loader: 'ts', contents: `
      export * from './src/lib/googleMeasurement';
      export * from './src/lib/googleConsent';
      export { registerMeasurementDocument } from './src/lib/measurementNavigation';
    ` },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    define: { "import.meta.env": key },
    logLevel: "silent",
  }).then(result => result.outputFiles[0].text));
  return compiled.get(key);
}

function syntheticBrowser(href = "https://fabsy.ca/thank-you", referrer = "") {
  let current = new URL(href);
  const scripts = [];
  const replacements = [];
  const events = [];
  const networkAttempts = [];
  const listeners = new Map();
  const store = new Map();
  const reloads = [];
  let nativeHistoryError = null;
  const blockNetwork = () => { networkAttempts.push("blocked"); throw new Error("Synthetic tests forbid network access"); };
  const historyState = { idx: 3, key: "synthetic-router-key", usr: { routeHint: "synthetic" } };
  const window = {
    get location() {
      current.reload = () => reloads.push(current.href);
      return current;
    },
    localStorage: {
      getItem: key => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
      removeItem: key => store.delete(key),
    },
    fetch: blockNetwork,
    navigator: { sendBeacon: blockNetwork },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    dispatchEvent(event) {
      events.push(event.type);
      for (const listener of listeners.get(event.type) || []) listener(event);
      return true;
    },
    history: {
      state: historyState,
      replaceState(state, title, url) {
        if (nativeHistoryError) throw nativeHistoryError;
        replacements.push({ state, title, url });
        this.state = state;
        current = new URL(url, current);
      },
    },
  };
  const commands = () => Array.from(window.dataLayer || [], command => plain(Array.from(command)));
  const document = {
    referrer,
    title: "SYNTHETIC PRIVATE TITLE MUST NOT BE MEASURED",
    getElementById: id => scripts.find(item => item.script.id === id && !item.script.removed)?.script || null,
    createElement(tag) {
      assert.equal(tag, "script");
      return { tagName: "SCRIPT", remove() { this.removed = true; } };
    },
    head: {
      appendChild(script) {
        scripts.push({ script, queueAtAppend: commands() });
        return script;
      },
    },
  };
  window.document = document;
  return {
    window, document, scripts, replacements, events, historyState, networkAttempts, blockNetwork, commands, store, reloads,
    failNativeHistory: error => { nativeHistoryError = error; },
    navigate: href => { current = new URL(href, current); },
  };
}

async function runtime(env = enabledEnv, options = {}) {
  const browser = syntheticBrowser(options.href, options.referrer);
  const module = { exports: {} };
  runInNewContext(await helperBundle(env), {
    module,
    exports: module.exports,
    window: browser.window,
    document: browser.document,
    URL,
    Event: class SyntheticEvent { constructor(type) { this.type = type; } },
    fetch: browser.blockNetwork,
    XMLHttpRequest: class { constructor() { browser.blockNetwork(); } },
  });
  const api = module.exports;
  if (options.consent !== 'unknown') {
    browser.store.set(api.GOOGLE_CONSENT_STORAGE_KEY, JSON.stringify({ version: 1, choice: options.consent || 'accepted', savedAt: Date.now() }));
  }
  api.registerMeasurementDocument(browser.window, api.publicGoogleMeasurementUrl);
  return { api: module.exports, browser };
}

test('basic consent starts unknown, expires, and never interprets malformed storage as permission', async () => {
  const { api, browser } = await runtime(enabledEnv, { consent: 'unknown' });
  const now = Date.now();
  for (const value of [null, '', 'true', '{', 'null', '[]', JSON.stringify({choice:'accepted'}),
    JSON.stringify({version:2,choice:'accepted',savedAt:now}),
    JSON.stringify({version:1,choice:'accepted',savedAt:now+1}),
    JSON.stringify({version:1,choice:'accepted',savedAt:now-api.GOOGLE_CONSENT_MAX_AGE_MS}),
    JSON.stringify({version:1,choice:'granted',savedAt:now}),
    JSON.stringify({version:1,choice:'accepted',savedAt:'2026-08-31'})]) {
    assert.equal(api.parseGoogleConsent(value, now), 'unknown', value);
  }
  assert.equal(api.parseGoogleConsent(JSON.stringify({version:1,choice:'accepted',savedAt:now}),now),'accepted');
  assert.equal(api.parseGoogleConsent(JSON.stringify({version:1,choice:'declined',savedAt:now}),now),'declined');
  assert.equal(api.getGoogleConsentChoice(),'unknown');
  api.initializeGoogleMeasurement();
  assert.deepEqual(browser.scripts,[]);
  assert.equal(browser.window.dataLayer,undefined);
});

test('only an affirmative choice starts loading; decline is not a denied-mode Google ping', async () => {
  for (const consent of ['unknown','declined']) {
    const { api,browser } = await runtime(enabledEnv,{consent});
    api.initializeGoogleMeasurement();
    api.sendGooglePageView();
    assert.equal(api.dispatchGoogleMeasurement('page_view',{send_to:enabledEnv.VITE_GA4_MEASUREMENT_ID}),false);
    assert.deepEqual(browser.scripts,[]);
    assert.equal(browser.window.dataLayer,undefined);
    api.setGoogleConsentChoice('accepted');
    api.recheckGoogleMeasurementConsent();
    assert.equal(browser.scripts.length,1);
    assert.deepEqual(browser.reloads,[]);
    assert.equal(api.getGoogleConsentChoice(),'accepted');
  }
});

test('withdrawal retires pending and loaded documents and rejects late onload/dispatch', async () => {
  for (const loaded of [false,true]) {
    const { api,browser } = await runtime();
    api.initializeGoogleMeasurement();
    const staleOnload=browser.scripts[0].script.onload;
    if(loaded)staleOnload();
    api.setGoogleConsentChoice('declined');
    const before=browser.commands();
    api.recheckGoogleMeasurementConsent();
    assert.equal(browser.reloads.length,1);
    staleOnload();
    assert.equal(api.dispatchGoogleMeasurement('page_view',{send_to:enabledEnv.VITE_GA4_MEASUREMENT_ID}),false);
    assert.deepEqual(browser.commands(),before);
    api.recheckGoogleMeasurementConsent();
    assert.equal(browser.reloads.length,1,'a retirement must not create a reload loop');
    assert.equal(browser.window[`ga-disable-${enabledEnv.VITE_GA4_MEASUREMENT_ID}`],true);
  }
});

test('cross-tab removal or expiry blocks an already loaded document before another app event', async () => {
  for (const expired of [false,true]) {
    const { api,browser } = await runtime();
    api.initializeGoogleMeasurement();
    browser.scripts[0].script.onload();
    if(expired)browser.store.set(api.GOOGLE_CONSENT_STORAGE_KEY,JSON.stringify({version:1,choice:'accepted',savedAt:Date.now()-api.GOOGLE_CONSENT_MAX_AGE_MS}));
    else browser.store.delete(api.GOOGLE_CONSENT_STORAGE_KEY);
    api.clearTemporaryGoogleConsent();
    assert.equal(api.dispatchGoogleMeasurement('page_view',{send_to:enabledEnv.VITE_GA4_MEASUREMENT_ID}),false);
    api.recheckGoogleMeasurementConsent();
    assert.equal(browser.reloads.length,1);
  }
});

test('declining in a private document does not reload or destroy its in-memory upload', async () => {
  const { api,browser }=await runtime(enabledEnv,{href:'https://fabsy.ca/submit-ticket',consent:'unknown'});
  const file={name:'SYNTHETIC-file.png',bytes:new Uint8Array([1,2,3])};
  browser.window.syntheticFile=file;
  api.setGoogleConsentChoice('declined');
  api.recheckGoogleMeasurementConsent();
  assert.deepEqual(browser.reloads,[]);
  assert.equal(browser.window.syntheticFile,file);
  assert.deepEqual(browser.scripts,[]);
});

test('blocked consent storage is document-only and never an implicit permission on a later read', async () => {
  const { api,browser }=await runtime(enabledEnv,{consent:'unknown'});
  browser.window.localStorage.setItem=()=>{throw new Error('Synthetic quota denial');};
  api.setGoogleConsentChoice('accepted');
  assert.equal(api.getGoogleConsentChoice(),'accepted');
  api.clearTemporaryGoogleConsent();
  assert.equal(api.getGoogleConsentChoice(),'unknown');
  api.initializeGoogleMeasurement();
  assert.deepEqual(browser.scripts,[]);
});

test('failed withdrawal persistence cannot restore stale acceptance in a fresh document', async () => {
  for (const failure of ['throw', 'silent']) {
    const blockWrites = browser => {
      browser.window.localStorage.setItem = () => {
        if (failure === 'throw') throw new Error('Synthetic read-only consent store');
      };
      browser.window.localStorage.removeItem = () => {
        if (failure === 'throw') throw new Error('Synthetic read-only consent store');
      };
    };
    const first = await runtime();
    first.api.initializeGoogleMeasurement();
    first.browser.scripts[0].script.onload();
    const savedAcceptance = first.browser.store.get(first.api.GOOGLE_CONSENT_STORAGE_KEY);
    blockWrites(first.browser);
    first.api.setGoogleConsentChoice('declined');
    assert.equal(first.api.getGoogleConsentChoice(), 'declined');
    first.api.recheckGoogleMeasurementConsent();
    assert.equal(first.browser.reloads.length, 1);
    assert.equal(first.browser.store.get(first.api.GOOGLE_CONSENT_STORAGE_KEY), savedAcceptance);

    // A new module is a new document: no temporary in-memory refusal survives.
    const fresh = await runtime(enabledEnv, { consent: 'unknown' });
    for (const [key, value] of first.browser.store) fresh.browser.store.set(key, value);
    blockWrites(fresh.browser);
    assert.equal(fresh.api.getGoogleConsentChoice(), 'unknown');
    fresh.api.initializeGoogleMeasurement();
    assert.deepEqual(fresh.browser.scripts, []);
    assert.equal(fresh.browser.window.dataLayer, undefined);
    assert.deepEqual(fresh.browser.networkAttempts, []);
  }
});

test('silent failed choices are document-only and storage probes never refresh consent or leave keys', async () => {
  const { api, browser } = await runtime();
  const original = browser.store.get(api.GOOGLE_CONSENT_STORAGE_KEY);
  for (let index = 0; index < 3; index += 1) assert.equal(api.getGoogleConsentChoice(), 'accepted');
  assert.equal(browser.store.get(api.GOOGLE_CONSENT_STORAGE_KEY), original);
  assert.deepEqual([...browser.store.keys()], [api.GOOGLE_CONSENT_STORAGE_KEY]);
  browser.window.localStorage.setItem = () => undefined;
  api.setGoogleConsentChoice('declined');
  assert.equal(api.getGoogleConsentChoice(), 'declined');
  assert.equal(browser.store.has(api.GOOGLE_CONSENT_STORAGE_KEY), false);
  api.clearTemporaryGoogleConsent();
  assert.equal(api.getGoogleConsentChoice(), 'unknown');
  api.setGoogleConsentChoice('accepted');
  assert.equal(api.getGoogleConsentChoice(), 'accepted', 'an explicit choice may apply to this document');
  api.clearTemporaryGoogleConsent();
  assert.equal(api.getGoogleConsentChoice(), 'unknown', 'a silent failed save cannot persist permission');
});

test('failed loader can retry without admitting its superseded callback', async () => {
  const {api,browser}=await runtime();
  api.initializeGoogleMeasurement();
  const first=browser.scripts[0].script;
  const staleOnload=first.onload;
  first.onerror();
  assert.equal(first.removed,true);
  assert.equal(browser.window.fabsyAnalyticsInitialized,false);
  api.initializeGoogleMeasurement();
  assert.equal(browser.scripts.length,2);
  const before=browser.commands();
  staleOnload();
  assert.deepEqual(browser.commands(),before);
  browser.scripts[1].script.onload();
  assert.equal(browser.commands().filter(command=>command[0]==='event'&&command[1]==='page_view').length,1);
});

test("destination IDs alone never enable collection and the production gate requires exact opt-in", async () => {
  const { api } = await runtime();
  for (const enabled of [undefined, "", "false", "TRUE", "1", "true ", true]) {
    assert.deepEqual(plain(api.googleMeasurementConfig({ ...enabledEnv, VITE_GOOGLE_MEASUREMENT_ENABLED: enabled }, "https://fabsy.ca")), {});
  }
  for (const PROD of [false, undefined]) {
    assert.deepEqual(plain(api.googleMeasurementConfig({ ...enabledEnv, PROD }, "https://fabsy.ca")), {});
  }
});

test("only exact production origins can select valid destinations", async () => {
  const { api } = await runtime();
  for (const origin of ["https://fabsy.ca", "https://www.fabsy.ca"]) {
    assert.deepEqual(plain(api.googleMeasurementConfig(enabledEnv, origin)), {
      ga4Id: enabledEnv.VITE_GA4_MEASUREMENT_ID,
      adsId: enabledEnv.VITE_GADS_ID,
      rrLabel: enabledEnv.VITE_GADS_PURCHASE_LABEL,
      photoLabel: enabledEnv.VITE_GADS_PHOTO_RADAR_PURCHASE_LABEL,
    });
  }
  for (const origin of ["http://fabsy.ca", "https://fabsy.ca:8443", "https://preview.fabsy.ca", "https://fabsy.ca.evil.invalid", "https://fabsy.pages.dev", "http://localhost:5173", "https://www.fabsy.ca.evil.invalid"]) {
    assert.deepEqual(plain(api.googleMeasurementConfig(enabledEnv, origin)), {});
  }
  const invalid = api.googleMeasurementConfig({ ...enabledEnv, VITE_GA4_MEASUREMENT_ID: "G-TEST\n", VITE_GADS_ID: "AW-invalid" }, "https://fabsy.ca");
  assert.equal(invalid.ga4Id, undefined);
  assert.equal(invalid.adsId, undefined);
});

test("reviewed public routes include locale and trailing-slash variants", async () => {
  const { api } = await runtime();
  assert.equal(api.publicMeasurementPath("/"), "/");
  assert.equal(api.publicMeasurementPath("/photo-radar/"), "/photo-radar");
  assert.equal(api.publicMeasurementPath("/rapid-resolution"), "/rapid-resolution");
  for (const locale of ["en", "pa", "tl", "zh-hans", "zh-hant", "ar", "es", "hi"]) {
    assert.equal(api.publicMeasurementPath(`/${locale}/thank-you/`), `/${locale}/thank-you`);
    assert.equal(api.publicMeasurementPath(`/${locale}`), `/${locale}`);
  }
});

test("private, unknown, encoded and misleading route variants remain excluded", async () => {
  const { api } = await runtime();
  const privatePaths = [
    "/portal", "/portal/cases/SYNTHETIC-CASE", "/portal/pro-discount/SYNTHETIC-SUBMISSION",
    "/admin", "/admin/submissions/SYNTHETIC-SUBMISSION", "/insurance-damage-report/intake",
    "/representation-consent", "/submit-ticket", "/ticket-assessment/confirmation", "/contact", "/fleet", "/free-ticket-check",
    "/thank-you/SYNTHETIC-TOKEN", "/unknown", "/%70ortal", "/thank-you//", "//thank-you",
  ];
  for (const path of privatePaths) {
    assert.equal(api.publicMeasurementPath(path), null, path);
    assert.equal(api.publicMeasurementPath(`/es${path}`), null, `localized ${path}`);
  }
});

test("safe context strips approved click identifiers and uses no document title or referrer", async () => {
  const { api } = await runtime();
  const href = "https://fabsy.ca/thank-you/?gclid=SYNTHETIC_CLICK&gbraid=SYNTHETIC-BRAID&wbraid=SYNTHETIC_2";
  assert.deepEqual(plain(api.safeGooglePageContext(href, "https://checkout.stripe.com/")), cleanContext);
  assert.deepEqual(plain(api.safeGooglePageContext("https://www.fabsy.ca/es/thank-you/", "https://www.fabsy.ca/rapid-resolution")), {
    ...cleanContext, page_location: "https://www.fabsy.ca/es/thank-you",
  });
});

test("unknown or sensitive query parameters, fragments and malformed click IDs fail closed", async () => {
  const { api } = await runtime();
  for (const suffix of [
    "?session_id=cs_live_SYNTHETIC", "?email=synthetic%40example.invalid", "?case_id=SYNTHETIC",
    "?access_token=SYNTHETIC", "?utm_campaign=SYNTHETIC", "?unknown=SYNTHETIC", "#SYNTHETIC",
    "?gclid=ONE&gclid=TWO", "?GCLID=SYNTHETIC", "?gclid=", "?gclid=SYNTHETIC%40example.invalid",
    "?gclid=SYNTHETIC%0A", "?gclid=SYNTHETIC%0D", "?gclid=SYNTHETIC%20CLICK", `?gclid=${"a".repeat(513)}`,
    "?gclid=SYNTHETIC#private", "?wbraid=SYNTHETIC&email=synthetic%40example.invalid",
  ]) assert.equal(api.safeGooglePageContext(`https://fabsy.ca/thank-you${suffix}`, ""), null, suffix);
});

test("credentials, unapproved origins and malformed current URLs fail closed", async () => {
  const { api } = await runtime();
  for (const href of [
    "https://synthetic:secret@fabsy.ca/thank-you", "https://synthetic@fabsy.ca/thank-you",
    "https://fabsy.ca.evil.invalid/thank-you", "https://fabsy.ca@evil.invalid/thank-you",
    "http://fabsy.ca/thank-you", "https://fabsy.ca:8443/thank-you", "https://preview.fabsy.ca/thank-you",
    "/thank-you", "not-a-url", "javascript:synthetic",
  ]) assert.equal(api.safeGooglePageContext(href, ""), null, href);
});

test("unsafe immutable referrers prevent measurement even on a clean public page", async () => {
  const { api } = await runtime();
  for (const referrer of [
    "not-a-url", "http://example.invalid/", "https://synthetic:secret@example.invalid/",
    "https://fabsy.ca/portal/cases/SYNTHETIC", "https://fabsy.ca/es/portal/cases/SYNTHETIC",
    "https://fabsy.ca/representation-consent", "https://fabsy.ca/insurance-damage-report/intake",
    "https://fabsy.ca/thank-you?session_id=cs_live_SYNTHETIC", "https://fabsy.ca/rapid-resolution#SYNTHETIC",
    "https://checkout.stripe.com/c/pay/cs_live_SYNTHETIC", "https://example.invalid/private-path",
    "https://example.invalid/?email=synthetic%40example.invalid",
  ]) assert.equal(api.safeGooglePageContext("https://fabsy.ca/thank-you", referrer), null, referrer);
});

test("exact receipt cleanup removes its token while preserving the router history state", async () => {
  for (const path of ["/thank-you", "/es/thank-you/"]) {
    const token = "cs_live_SYNTHETICreceipt";
    const { api, browser } = await runtime(enabledEnv, { href: `https://fabsy.ca${path}?session_id=${token}` });
    assert.equal(api.currentGooglePageContext(), null);
    api.removeCheckoutTokenFromUrl(token);
    assert.equal(browser.window.location.href, `https://fabsy.ca${path}`);
    assert.equal(browser.replacements.length, 1);
    assert.equal(browser.replacements[0].state, browser.historyState);
    assert.equal(browser.window.history.state, browser.historyState);
    assert.equal(JSON.stringify(browser.window.history.state).includes(token), false);
    assert.deepEqual(browser.events, [api.GOOGLE_CONTEXT_READY]);
    assert.ok(api.currentGooglePageContext());
  }
});

test("a receipt with extra query fields or a fragment cannot become a Google document", async () => {
  const token = 'cs_live_SYNTHETICreceipt';
  for (const suffix of ['&email=synthetic%40example.invalid', '#SYNTHETIC', '&session_id=cs_live_OTHER']) {
    const href = `https://fabsy.ca/thank-you?session_id=${token}${suffix}`;
    const { api, browser } = await runtime(enabledEnv, { href });
    api.removeCheckoutTokenFromUrl(token);
    api.initializeGoogleMeasurement();
    assert.equal(browser.window.location.href, href);
    assert.deepEqual(browser.scripts, []);
    assert.equal(api.currentGooglePageContext(), null);
  }
});

test("cleanup never changes private intake, authorization links or mismatched receipts", async () => {
  const token = "cs_live_SYNTHETICreceipt";
  for (const path of ["/insurance-damage-report/intake", "/es/insurance-damage-report/intake", "/representation-consent", "/portal/cases/SYNTHETIC", "/rapid-resolution"]) {
    const href = `https://fabsy.ca${path}?session_id=${token}&order_id=SYNTHETIC#SYNTHETIC`;
    const { api, browser } = await runtime(enabledEnv, { href });
    api.removeCheckoutTokenFromUrl(token);
    assert.equal(browser.window.location.href, href);
    assert.deepEqual(browser.replacements, []);
    assert.deepEqual(browser.events, []);
  }
  for (const expected of [null, "cs_live_SYNTHETICother"]) {
    const href = `https://fabsy.ca/thank-you?session_id=${token}`;
    const { api, browser } = await runtime(enabledEnv, { href });
    api.removeCheckoutTokenFromUrl(expected);
    assert.equal(browser.window.location.href, href);
    assert.deepEqual(browser.replacements, []);
  }
});

test("failed history cleanup cannot throw, signal readiness or enable measurement", async () => {
  const token = "cs_live_SYNTHETICreceipt";
  const href = `https://fabsy.ca/thank-you?session_id=${token}`;
  for (const name of ["SecurityError", "DataCloneError"]) {
    const { api, browser } = await runtime(enabledEnv, { href });
    const error = new Error("Synthetic History API failure");
    error.name = name;
    browser.failNativeHistory(error);
    assert.doesNotThrow(() => api.removeCheckoutTokenFromUrl(token));
    assert.equal(browser.window.location.href, href);
    assert.equal(browser.window.history.state, browser.historyState);
    assert.deepEqual(browser.events, []);
    api.initializeGoogleMeasurement();
    assert.equal(api.currentGooglePageContext(), null);
    assert.equal(browser.window.dataLayer, undefined);
    assert.deepEqual(browser.scripts, []);
    assert.equal(api.dispatchGoogleMeasurement("purchase", { send_to: enabledEnv.VITE_GA4_MEASUREMENT_ID }), false);
    // A later successful cleanup can recover without having marked readiness early.
    browser.failNativeHistory(null);
    api.removeCheckoutTokenFromUrl(token);
    assert.equal(browser.window.location.href, "https://fabsy.ca/thank-you");
    assert.deepEqual(browser.events, [api.GOOGLE_CONTEXT_READY]);
    assert.deepEqual(browser.networkAttempts, []);
  }
});

test("disabled builds create neither script nor queue, including after receipt cleanup", async () => {
  for (const env of [{ ...enabledEnv, VITE_GOOGLE_MEASUREMENT_ENABLED: undefined }, { ...enabledEnv, VITE_GOOGLE_MEASUREMENT_ENABLED: "false" }, { ...enabledEnv, PROD: false }]) {
    const { api, browser } = await runtime(env, { href: "https://fabsy.ca/thank-you?session_id=cs_live_SYNTHETIC" });
    api.initializeGoogleMeasurement();
    api.removeCheckoutTokenFromUrl("cs_live_SYNTHETIC");
    api.initializeGoogleMeasurement();
    api.sendGooglePageView();
    assert.equal(api.dispatchGoogleMeasurement("purchase", { send_to: enabledEnv.VITE_GA4_MEASUREMENT_ID }), false);
    browser.window.gtag?.("event", "purchase", { email: "synthetic@example.invalid" });
    assert.equal(browser.window.dataLayer, undefined);
    assert.equal(browser.window.fabsyAnalyticsInitialized, undefined);
    assert.deepEqual(browser.scripts, []);
    assert.deepEqual(browser.networkAttempts, []);
  }
});

test("enabled builds still create no script or queue on unsafe pages, referrers or preview hosts", async () => {
  for (const options of [
    { href: "https://fabsy.ca/portal/cases/SYNTHETIC" },
    { href: "https://fabsy.ca/thank-you?session_id=cs_live_SYNTHETIC" },
    { href: "https://preview.fabsy.ca/thank-you" },
    { href: "https://fabsy.ca/thank-you", referrer: "https://fabsy.ca/portal/cases/SYNTHETIC" },
  ]) {
    const { api, browser } = await runtime(enabledEnv, options);
    api.initializeGoogleMeasurement();
    assert.equal(browser.window.dataLayer, undefined);
    assert.deepEqual(browser.scripts, []);
    assert.deepEqual(browser.networkAttempts, []);
  }
});

test("explicit consent queues default then update and safe configuration before the inert script", async () => {
  const { api, browser } = await runtime();
  api.initializeGoogleMeasurement();
  assert.equal(browser.scripts.length, 1);
  const { script, queueAtAppend } = browser.scripts[0];
  assert.deepEqual(queueAtAppend.map(command => command[0]), ["consent", "consent", "set", "js", "config", "config"]);
  assert.deepEqual(queueAtAppend[0], ["consent", "default", {
    analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
  }]);
  assert.deepEqual(queueAtAppend[1], ["consent", "update", {
    analytics_storage: "granted", ad_storage: "granted", ad_user_data: "granted", ad_personalization: "denied",
  }]);
  assert.deepEqual(queueAtAppend[2], ["set", {
    allow_google_signals: false, allow_ad_personalization_signals: false,
    ads_data_redaction: true, url_passthrough: false, ...cleanContext,
  }]);
  const options = { ...cleanContext, send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false };
  assert.deepEqual(queueAtAppend[4], ["config", enabledEnv.VITE_GA4_MEASUREMENT_ID, options]);
  assert.deepEqual(queueAtAppend[5], ["config", enabledEnv.VITE_GADS_ID, options]);
  assert.ok(browser.window.dataLayer.every(command => Object.prototype.toString.call(command) === "[object Arguments]"));
  assert.equal(script.async, true);
  assert.equal(script.referrerPolicy, "no-referrer");
  assert.equal(script.src, `https://www.googletagmanager.com/gtag/js?id=${enabledEnv.VITE_GA4_MEASUREMENT_ID}`);
  assert.deepEqual(browser.events, []);
  assert.equal(api.dispatchGoogleMeasurement("purchase", { send_to: enabledEnv.VITE_GA4_MEASUREMENT_ID }), false);
  // Invoke only our own onload callback; no remote code is fetched or evaluated.
  script.onload();
  assert.deepEqual(browser.events, [api.GOOGLE_MEASUREMENT_READY]);
  assert.deepEqual(browser.commands().at(-1), ["event", "page_view", {
    send_to: enabledEnv.VITE_GA4_MEASUREMENT_ID, ...cleanContext,
    allow_google_signals: false, allow_ad_personalization_signals: false,
  }]);
  const length = browser.commands().length;
  api.initializeGoogleMeasurement();
  assert.equal(browser.scripts.length, 1);
  assert.equal(browser.commands().length, length);
  assert.deepEqual(browser.networkAttempts, []);
});

test("legacy raw gtag calls cannot add acquisition, form, customer or arbitrary conversion data", async () => {
  const { api, browser } = await runtime();
  api.initializeGoogleMeasurement();
  browser.scripts[0].script.onload();
  const before = browser.commands();
  browser.window.gtag("event", "purchase", { send_to: enabledEnv.VITE_GA4_MEASUREMENT_ID, customer_email: "synthetic@example.invalid" });
  browser.window.gtag("event", "conversion", { send_to: "AW-123456789/UNREVIEWED", case_id: "SYNTHETIC" });
  browser.window.gtag("set", "user_properties", { acquisition_source: "SYNTHETIC-PRIVATE" });
  browser.window.gtag("config", "G-UNREVIEWED", { page_location: "https://fabsy.ca/portal/SYNTHETIC" });
  assert.deepEqual(browser.commands(), before);
  assert.deepEqual(browser.networkAttempts, []);
});

test("scoped dispatch rejects unknown destinations and overrides caller URL, referrer and title", async () => {
  const { api, browser } = await runtime();
  api.initializeGoogleMeasurement();
  browser.scripts[0].script.onload();
  for (const send_to of [undefined, "G-UNREVIEWED", "AW-123456789/UNREVIEWED", "undefined/undefined"]) {
    assert.equal(api.dispatchGoogleMeasurement("purchase", { send_to }), false);
  }
  assert.equal(api.dispatchGoogleMeasurement("purchase", {
    send_to: enabledEnv.VITE_GA4_MEASUREMENT_ID, transaction_id: "cs_live_SYNTHETIC",
    page_location: "https://fabsy.ca/portal/SYNTHETIC", page_referrer: "https://private.invalid/SYNTHETIC",
    page_title: "SYNTHETIC PRIVATE TITLE", allow_google_signals: true, allow_ad_personalization_signals: true,
  }), true);
  assert.deepEqual(browser.commands().at(-1), ["event", "purchase", {
    send_to: enabledEnv.VITE_GA4_MEASUREMENT_ID, transaction_id: "cs_live_SYNTHETIC", ...cleanContext,
    allow_google_signals: false, allow_ad_personalization_signals: false,
  }]);
});

test("events cannot cross GA4 and Ads destinations or introduce an unreviewed event type", async () => {
  const { api, browser } = await runtime();
  api.initializeGoogleMeasurement();
  browser.scripts[0].script.onload();
  const ga4 = enabledEnv.VITE_GA4_MEASUREMENT_ID;
  const rrAds = `${enabledEnv.VITE_GADS_ID}/${enabledEnv.VITE_GADS_PURCHASE_LABEL}`;
  const before = browser.commands();
  for (const [event, send_to] of [
    ["purchase", rrAds], ["page_view", rrAds], ["conversion", ga4],
    ["generate_lead", ga4], ["form_submit", ga4], ["config", ga4], ["", rrAds],
  ]) assert.equal(api.dispatchGoogleMeasurement(event, { send_to, order_type: "rapid_resolution" }), false);
  assert.deepEqual(browser.commands(), before);
  assert.equal(api.dispatchGoogleMeasurement("purchase", { send_to: ga4, order_type: "rapid_resolution" }), true);
  assert.equal(api.dispatchGoogleMeasurement("conversion", { send_to: rrAds, order_type: "rapid_resolution" }), true);
});

test("absent and malformed Ads settings cannot create synthetic allowed destinations", async () => {
  const cases = [
    [{ VITE_GADS_ID: undefined, VITE_GADS_PURCHASE_LABEL: undefined, VITE_GADS_PHOTO_RADAR_PURCHASE_LABEL: undefined }, "undefined/undefined", "rapid_resolution"],
    [{ VITE_GADS_ID: undefined }, `undefined/${enabledEnv.VITE_GADS_PURCHASE_LABEL}`, "rapid_resolution"],
    [{ VITE_GADS_ID: "AW-invalid" }, "AW-invalid/RR_TEST_1", "rapid_resolution"],
    [{ VITE_GADS_PURCHASE_LABEL: undefined }, `${enabledEnv.VITE_GADS_ID}/undefined`, "rapid_resolution"],
    [{ VITE_GADS_PHOTO_RADAR_PURCHASE_LABEL: undefined }, `${enabledEnv.VITE_GADS_ID}/undefined`, "photo_radar"],
    [{ VITE_GADS_PURCHASE_LABEL: "RR/OTHER" }, `${enabledEnv.VITE_GADS_ID}/RR/OTHER`, "rapid_resolution"],
    [{ VITE_GADS_PHOTO_RADAR_PURCHASE_LABEL: "PHOTO/OTHER" }, `${enabledEnv.VITE_GADS_ID}/PHOTO/OTHER`, "photo_radar"],
    [{ VITE_GADS_PURCHASE_LABEL: "RR_TEST_1\n" }, `${enabledEnv.VITE_GADS_ID}/RR_TEST_1\n`, "rapid_resolution"],
    [{ VITE_GADS_PHOTO_RADAR_PURCHASE_LABEL: "PHOTO_TEST_1\n" }, `${enabledEnv.VITE_GADS_ID}/PHOTO_TEST_1\n`, "photo_radar"],
  ];
  for (const [overrides, send_to, order_type] of cases) {
    const { api, browser } = await runtime({ ...enabledEnv, ...overrides });
    api.initializeGoogleMeasurement();
    browser.scripts[0].script.onload();
    const before = browser.commands();
    assert.equal(api.dispatchGoogleMeasurement("conversion", { send_to, order_type }), false, JSON.stringify(send_to));
    assert.deepEqual(browser.commands(), before);
    assert.deepEqual(browser.networkAttempts, []);
  }
});

test("conversion routing cannot fall back from Photo to RR, including equal configured labels", async () => {
  const rrAds = `${enabledEnv.VITE_GADS_ID}/${enabledEnv.VITE_GADS_PURCHASE_LABEL}`;
  for (const photoLabel of [undefined, enabledEnv.VITE_GADS_PURCHASE_LABEL, "PHOTO/OTHER"]) {
    const { api, browser } = await runtime({ ...enabledEnv, VITE_GADS_PHOTO_RADAR_PURCHASE_LABEL: photoLabel });
    api.initializeGoogleMeasurement();
    browser.scripts[0].script.onload();
    const before = browser.commands();
    assert.equal(api.dispatchGoogleMeasurement("conversion", { send_to: rrAds, order_type: "photo_radar" }), false);
    assert.deepEqual(browser.commands(), before);
    // Equal labels must not disable an otherwise valid officer-ticket purchase.
    assert.equal(api.dispatchGoogleMeasurement("conversion", { send_to: rrAds, order_type: "rapid_resolution" }), true);
  }
  const { api, browser } = await runtime();
  api.initializeGoogleMeasurement();
  browser.scripts[0].script.onload();
  const photoAds = `${enabledEnv.VITE_GADS_ID}/${enabledEnv.VITE_GADS_PHOTO_RADAR_PURCHASE_LABEL}`;
  for (const [send_to, order_type] of [
    [rrAds, "photo_radar"], [photoAds, "rapid_resolution"], [rrAds, "standalone_report"], [rrAds, undefined],
  ]) assert.equal(api.dispatchGoogleMeasurement("conversion", { send_to, order_type }), false);
  assert.equal(api.dispatchGoogleMeasurement("conversion", { send_to: photoAds, order_type: "photo_radar" }), true);
  assert.equal(api.dispatchGoogleMeasurement("conversion", { send_to: rrAds, order_type: "rapid_resolution_bundle" }), true);
});

test("manual dispatch rechecks private navigation even when the script finished earlier or later", async () => {
  for (const loadBeforeNavigation of [true, false]) {
    const { api, browser } = await runtime();
    api.initializeGoogleMeasurement();
    if (loadBeforeNavigation) browser.scripts[0].script.onload();
    browser.navigate("https://fabsy.ca/portal/cases/SYNTHETIC?access_token=SYNTHETIC#private");
    const before = browser.commands();
    if (!loadBeforeNavigation) browser.scripts[0].script.onload();
    api.initializeGoogleMeasurement();
    api.sendGooglePageView();
    assert.equal(api.dispatchGoogleMeasurement("purchase", { send_to: enabledEnv.VITE_GA4_MEASUREMENT_ID }), false);
    assert.deepEqual(browser.commands(), before);
    assert.deepEqual(browser.networkAttempts, []);
  }
  // This verifies application dispatch only, not previously installed Google listeners.
});

test("script failure never marks measurement ready or accepts a conversion", async () => {
  const { api, browser } = await runtime();
  api.initializeGoogleMeasurement();
  browser.scripts[0].script.onerror();
  assert.deepEqual(browser.events, []);
  assert.equal(api.dispatchGoogleMeasurement("conversion", { send_to: `${enabledEnv.VITE_GADS_ID}/${enabledEnv.VITE_GADS_PURCHASE_LABEL}` }), false);
  assert.equal(browser.commands().filter(command => command[0] === "event").length, 0);
});

test("the real receipt hook retains its token across URL scrub, opt-in and component rerender", async () => {
  const bundle = await build({
    absWorkingDir: root,
    stdin: {
      sourcefile: "synthetic-receipt-router-test.tsx", resolveDir: root, loader: "tsx",
      contents: `
        import React, { act, useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { useLocation, useSearchParams } from 'react-router-dom';
        import MeasurementRouter from './src/components/MeasurementRouter';
        import Analytics from './src/components/Analytics';
        import { setGoogleConsentChoice } from './src/lib/googleConsent';
        import { usePaidPurchaseTracking } from './src/hooks/usePaidPurchaseTracking';
        export async function exercise(mode) {
          let rerender;
          const seen = [];
          function Probe() {
            const location = useLocation();
            const [searchParams] = useSearchParams();
            const [, setTick] = useState(0);
            rerender = () => setTick(value => value + 1);
            const sessionId = mode === 'params' ? searchParams.get('session_id') : new URLSearchParams(location.search).get('session_id');
            usePaidPurchaseTracking(null, sessionId);
            return <output data-router-search={location.search}>{sessionId || 'none'}</output>;
          }
          const root = createRoot(document.getElementById('root'));
          const record = () => {
            const output = document.querySelector('output');
            seen.push({ id: output.textContent, routerSearch: output.getAttribute('data-router-search'), href: window.location.href, state: window.history.state });
          };
          try {
            await act(async () => { root.render(<MeasurementRouter><Analytics /><Probe /></MeasurementRouter>); });
            record();
            await act(async () => { setGoogleConsentChoice('accepted'); rerender(); });
            record();
            return seen;
          } finally {
            await act(async () => { root.unmount(); });
          }
        }
      `,
    },
    bundle: true, write: false, platform: "browser", format: "cjs", jsx: "automatic",
    define: { "import.meta.env": JSON.stringify({ ...enabledEnv, VITE_GOOGLE_MEASUREMENT_ENABLED: "false" }), "process.env.NODE_ENV": '"test"' },
    logLevel: "silent",
  });
  for (const mode of ["params", "location"]) {
    const path = mode === "params" ? "/thank-you" : "/es/thank-you";
    const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
      url: `https://fabsy.ca${path}?session_id=cs_live_SYNTHETICfirst`, runScripts: "outside-only",
      // Omitting resources keeps external scripts, images and styles disabled.
    });
    const channels = [];
    try {
      const networkAttempts = [];
      const blockNetwork = () => { networkAttempts.push("blocked"); throw new Error("Router test forbids network access"); };
      dom.window.fetch = blockNetwork;
      dom.window.XMLHttpRequest = class { constructor() { blockNetwork(); } };
      dom.window.navigator.sendBeacon = blockNetwork;
      dom.window.MessageChannel = class {
        constructor() {
          const channel = new MessageChannel();
          channels.push(channel);
          return channel;
        }
      };
      dom.window.IS_REACT_ACT_ENVIRONMENT = true;
      const context = dom.getInternalVMContext();
      context.module = { exports: {} };
      context.exports = context.module.exports;
      runInContext(bundle.outputFiles[0].text, context);
      const seen = plain(await context.module.exports.exercise(mode));
      assert.deepEqual(seen.map(value => value.id), ["cs_live_SYNTHETICfirst", "cs_live_SYNTHETICfirst"]);
      assert.deepEqual(seen.map(value => value.href), Array(2).fill(`https://fabsy.ca${path}`));
      assert.match(seen[0].routerSearch, /cs_live_SYNTHETICfirst/);
      assert.match(seen[1].routerSearch, /cs_live_SYNTHETICfirst/);
      assert.equal(seen[1].state.idx, seen[0].state.idx);
      assert.equal(JSON.stringify(seen.map(value => value.state)).includes("cs_live_"), false);
      assert.equal(dom.window.document.querySelectorAll("script").length, 0);
      assert.equal(dom.window.dataLayer, undefined);
      assert.deepEqual(networkAttempts, []);
    } finally {
      for (const channel of channels) {
        channel.port1.close();
        channel.port2.close();
      }
      dom.window.close();
    }
  }
});

test('the persistent guardian expires foreground consent even while document navigation is held', async () => {
  const bundle = await build({
    absWorkingDir: root,
    stdin: { sourcefile: 'foreground-consent-expiry.tsx', resolveDir: root, loader: 'tsx', contents: `
      import React, { act } from 'react';
      import { createRoot } from 'react-dom/client';
      import { useNavigate } from 'react-router-dom';
      import MeasurementRouter from './src/components/MeasurementRouter';
      import Analytics from './src/components/Analytics';
      export * from './src/lib/googleConsent';
      export { dispatchGoogleMeasurement } from './src/lib/googleMeasurement';
      let root;
      let navigateAway;
      export const navigations = [];
      function PublicRouteProbe() {
        const navigate = useNavigate();
        navigateAway = () => navigate('/submit-ticket');
        return <output>Public page</output>;
      }
      export async function mount() {
        root = createRoot(document.getElementById('root'));
        await act(async () => root.render(
          <MeasurementRouter navigateDocument={url => navigations.push(url.href)}>
            <Analytics /><PublicRouteProbe />
          </MeasurementRouter>
        ));
      }
      export async function beginPrivateNavigation() { await act(async () => navigateAway()); }
      export async function tick(callback) { await act(async () => callback()); }
      export async function unmount() { await act(async () => root?.unmount()); }
    ` },
    bundle: true, write: false, platform: 'browser', format: 'cjs', jsx: 'automatic',
    define: { 'import.meta.env': JSON.stringify(enabledEnv), 'process.env.NODE_ENV': '"test"' },
    logLevel: 'silent',
  });
  for (const [loaded, heldNavigation] of [[false, false], [true, false], [false, true], [true, true]]) {
    const virtualConsole = new VirtualConsole();
    const retirements = [];
    const unexpectedErrors = [];
    virtualConsole.on('jsdomError', error => {
      // JSDOM does not navigate; its reload attempt is the retirement proof.
      if (error.message.includes('Not implemented: navigation')) retirements.push(error.message);
      else unexpectedErrors.push(error.message);
    });
    const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
      url: 'https://fabsy.ca/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole,
      // No resource loader: external Google scripts remain inert.
    });
    const channels = [];
    const timers = new Map();
    let timerId = 0;
    let now = Date.now();
    let api;
    try {
      const networkAttempts = [];
      const blockNetwork = () => { networkAttempts.push('blocked'); throw new Error('Expiry fixture forbids network'); };
      dom.window.fetch = blockNetwork;
      dom.window.XMLHttpRequest = class { constructor() { blockNetwork(); } };
      dom.window.navigator.sendBeacon = blockNetwork;
      dom.window.MessageChannel = class {
        constructor() { const channel = new MessageChannel(); channels.push(channel); return channel; }
      };
      dom.window.Date.now = () => now;
      dom.window.setTimeout = (callback, delay, ...args) => {
        timers.set(++timerId, { callback, delay, args });
        return timerId;
      };
      dom.window.clearTimeout = id => timers.delete(id);
      dom.window.IS_REACT_ACT_ENVIRONMENT = true;
      const context = dom.getInternalVMContext();
      context.module = { exports: {} };
      context.exports = context.module.exports;
      runInContext(bundle.outputFiles[0].text, context);
      api = context.module.exports;
      const saved = JSON.stringify({ version: 1, choice: 'accepted', savedAt: now });
      dom.window.localStorage.setItem(api.GOOGLE_CONSENT_STORAGE_KEY, saved);
      await api.mount();
      assert.equal(dom.window.document.visibilityState, 'visible');
      const script = dom.window.document.getElementById('fabsy-google-tag');
      assert.ok(script);
      const staleOnload = script.onload;
      if (loaded) staleOnload();
      const before = plain(Array.from(dom.window.dataLayer, command => Array.from(command)));
      if (heldNavigation) {
        await api.beginPrivateNavigation();
        assert.deepEqual(plain(api.navigations), ['https://fabsy.ca/submit-ticket']);
        assert.equal(dom.window.document.querySelector('output'), null, 'blocked navigation unmounts route children');
      }
      assert.equal(timers.size, 1);
      assert.equal([...timers.values()][0].delay, 2_147_483_647, '180 days must use safe timer chunks');
      let ticks = 0;
      while (timers.size && ticks < 10) {
        assert.equal(timers.size, 1, 'each recheck replaces its timer');
        const [id, timer] = timers.entries().next().value;
        assert.ok(timer.delay > 0 && timer.delay <= 2_147_483_647);
        timers.delete(id);
        now += timer.delay;
        await api.tick(() => timer.callback(...timer.args));
        ticks += 1;
      }
      assert.ok(ticks > 1 && ticks < 10);
      assert.equal(timers.size, 0);
      assert.equal(dom.window.location.href, 'https://fabsy.ca/');
      assert.equal(dom.window.document.visibilityState, 'visible');
      assert.equal(api.getGoogleConsentChoice(), 'unknown');
      assert.equal(dom.window.localStorage.getItem(api.GOOGLE_CONSENT_STORAGE_KEY), saved, 'reads must not extend permission');
      assert.equal(retirements.length, 1, 'the timer must retire the document automatically');
      assert.equal(dom.window[`ga-disable-${enabledEnv.VITE_GA4_MEASUREMENT_ID}`], true);
      assert.equal(script.onload, null);
      staleOnload();
      assert.equal(api.dispatchGoogleMeasurement('page_view', { send_to: enabledEnv.VITE_GA4_MEASUREMENT_ID }), false);
      assert.deepEqual(plain(Array.from(dom.window.dataLayer, command => Array.from(command))), before);
      assert.deepEqual(networkAttempts, []);
      assert.deepEqual(unexpectedErrors, []);
    } finally {
      await api?.unmount();
      assert.equal(timers.size, 0, 'unmount clears any scheduled recheck');
      for (const channel of channels) { channel.port1.close(); channel.port2.close(); }
      dom.window.close();
    }
  }
});
