#!/usr/bin/env node
// Offline UI contract test. Consent persistence/loading have separate tests;
// this uses an in-memory consent adapter and the real public-route policy.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MessageChannel } from 'node:worker_threads';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const unexpected = [];
const forbid = name => {
  unexpected.push(name);
  throw new Error(`Consent UI attempted an external operation: ${name}`);
};
const virtualConsole = new VirtualConsole();
const domErrors = [];
virtualConsole.on('jsdomError', error => domErrors.push(error.message));
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://offline-fabsy.invalid/', pretendToBeVisual: true, virtualConsole,
});
const descriptors = new Map();
function install(name, value) {
  descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'StorageEvent', 'MutationObserver']) {
  install(name, name === 'window' ? dom.window : dom.window[name]);
}
install('IS_REACT_ACT_ENVIRONMENT', true);
const channels = [];
install('MessageChannel', class extends MessageChannel {
  constructor() { super(); channels.push(this); }
});
install('fetch', () => forbid('fetch'));
dom.window.fetch = globalThis.fetch;
dom.window.gtag = () => forbid('gtag');
for (const name of ['XMLHttpRequest', 'WebSocket']) {
  const Forbidden = class { constructor() { forbid(name); } };
  install(name, Forbidden);
  dom.window[name] = Forbidden;
}
Object.defineProperty(dom.window.navigator, 'sendBeacon', { configurable: true, value: () => forbid('sendBeacon') });
dom.window.open = () => forbid('window.open');

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'fabsy-google-consent-ui-'));
try {
  const outfile = path.join(temporary, 'google-consent-ui.cjs');
  await build({
    absWorkingDir: repoRoot, bundle: true, platform: 'node', format: 'cjs', outfile,
    jsx: 'automatic', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"development"' },
    alias: { '@': path.join(repoRoot, 'src') }, logLevel: 'silent',
    plugins: [{
      name: 'offline-consent-adapter',
      setup(build) {
        build.onResolve({ filter: /(?:googleConsent|offline-consent-state)$/ }, args => {
          if (args.path === 'offline-consent-state' || args.importer.endsWith('/src/components/GoogleConsent.tsx')) {
            return { path: 'offline-consent-state', namespace: 'offline-consent' };
          }
        });
        build.onLoad({ filter: /.*/, namespace: 'offline-consent' }, () => ({ loader: 'js', contents: `
          export const GOOGLE_CONSENT_CHANGED = 'offline:google-consent-changed';
          export const GOOGLE_CONSENT_STORAGE_KEY = 'offline:google-consent';
          let choice = 'unknown';
          export const choices = [];
          export const getGoogleConsentChoice = () => choice;
          export function setGoogleConsentChoice(next) {
            if (!['accepted', 'declined'].includes(next)) throw Error('Invalid explicit choice');
            choice = next; choices.push(next); window.dispatchEvent(new Event(GOOGLE_CONSENT_CHANGED));
          }
          export function reset(next = 'unknown') { choice = next; choices.length = 0; }
          export function externalChoice(next, event = GOOGLE_CONSENT_CHANGED) {
            choice = next; window.dispatchEvent(event === 'storage' ? new StorageEvent('storage', { key: GOOGLE_CONSENT_STORAGE_KEY }) : new Event(event));
          }
        ` }));
      },
    }],
    stdin: { loader: 'tsx', resolveDir: repoRoot, sourcefile: 'offline-google-consent-ui.tsx', contents: `
      import assert from 'node:assert/strict';
      import React, { act, useEffect } from 'react';
      import { createRoot } from 'react-dom/client';
      import { MemoryRouter, useNavigate } from 'react-router-dom';
      import GoogleConsent from './src/components/GoogleConsent';
      import { googleConsentCopy } from './src/i18n/googleConsentCopy';
      import registry from './src/i18n/locales.json';
      import { publicMeasurementPath } from './src/lib/googleMeasurement';
      import { choices, reset, externalChoice, getGoogleConsentChoice } from 'offline-consent-state';

      export async function runChecks() {
        const locales = registry.locales.filter(item => item.wave <= 1);
        const keys = Object.keys(googleConsentCopy.en).sort();
        const nativeScripts = { pa: /\\p{Script=Gurmukhi}/u, 'zh-hans': /\\p{Script=Han}/u, 'zh-hant': /\\p{Script=Han}/u, ar: /\\p{Script=Arabic}/u, hi: /\\p{Script=Devanagari}/u };
        assert.deepEqual(Object.keys(googleConsentCopy).sort(), locales.map(item => item.code).sort());
        let submitCount = 0;
        let mountedJourneys = 0;
        const panel = element => element.querySelector('[data-google-consent-panel]');
        const settings = element => element.querySelector('button[aria-expanded]');
        const decision = (element, choice) => element.querySelector('[data-google-consent-choice="' + choice + '"]');
        const click = async element => { assert.ok(element); await act(async () => element.click()); };
        const openSettings = async (element, copy) => {
          await click(settings(element));
          assert.ok(panel(element));
          assert.equal(panel(element).getAttribute('data-google-consent-panel-mode'), 'settings');
          assert.ok(panel(element).className.includes('max-h-[60vh]'));
          for (const key of ['body', 'scope', 'changeHint']) assert.ok(panel(element).textContent.includes(copy[key]));
          assert.equal(document.activeElement, panel(element).querySelector('h2'), 'Deliberate settings opening should focus its heading');
        };

        async function mount(route, choice = 'unknown') {
          reset(choice);
          const container = document.createElement('div');
          document.body.append(container);
          const previous = document.createElement('button');
          previous.textContent = 'Synthetic previous focus';
          document.body.prepend(previous); previous.focus();
          let navigate;
          function Navigation() {
            const next = useNavigate();
            useEffect(() => { navigate = next; }, [next]);
            return null;
          }
          const root = createRoot(container);
          await act(async () => root.render(
            <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Navigation />
              <form onSubmit={event => { event.preventDefault(); submitCount += 1; }}>
                <input aria-label="Synthetic untouched field" defaultValue="Keep this private value" />
                <GoogleConsent />
              </form>
            </MemoryRouter>
          ));
          mountedJourneys += 1;
          assert.equal(document.activeElement, previous, 'Automatic UI must not steal page focus');
          return {
            container,
            navigate: async route => act(async () => navigate(route)),
            unmount: async () => {
              assert.equal(container.querySelector('input').value, 'Keep this private value');
              await act(async () => root.unmount());
              container.remove(); previous.remove();
            },
          };
        }

        for (const locale of locales) {
          const copy = googleConsentCopy[locale.code];
          assert.deepEqual(Object.keys(copy).sort(), keys, locale.code + ' must have complete standalone copy');
          for (const [key, value] of Object.entries(copy)) {
            assert.equal(typeof value, 'string');
            assert.ok(value.trim(), locale.code + '.' + key + ' must not be blank');
            assert.ok(!/<[^>]*>|{{|}}/.test(value), locale.code + '.' + key + ' must be plain, fully resolved text');
            if (nativeScripts[locale.code]) assert.ok(nativeScripts[locale.code].test(value), locale.code + '.' + key + ' must contain its native script');
          }
          for (const name of ['Google Analytics', 'Google Ads', 'Fabsy']) assert.ok(copy.body.includes(name));
          for (const name of ['Google', 'Cloudflare']) assert.ok(copy.scope.includes(name));
          if (locale.code !== 'en') for (const key of ['allow', 'decline', 'withdraw', 'settings', 'privacyPolicy']) {
            assert.notEqual(copy[key], googleConsentCopy.en[key], locale.code + ' must not silently use English action labels');
          }
          const route = locale.code === 'en' ? '/' : '/' + locale.code + '/';
          const view = await mount(route);
          try {
            const control = view.container.querySelector('[data-google-consent-controls]');
            assert.equal(control.lang, locale.languageTag);
            assert.equal(control.dir, locale.dir);
            assert.ok(panel(view.container), locale.code + ' public home should offer an initial choice');
            assert.equal(panel(view.container).getAttribute('role'), 'region');
            assert.equal(panel(view.container).getAttribute('aria-modal'), null, 'The banner must remain nonmodal');
            assert.equal(panel(view.container).getAttribute('data-google-consent-panel-mode'), 'initial');
            assert.ok(panel(view.container).className.includes('max-h-[25vh]'), 'The automatic banner must stay within one quarter of the viewport');
            assert.ok(panel(view.container).className.includes('overflow-hidden'), 'The automatic banner keeps its action row visible');
            const titleId = panel(view.container).getAttribute('aria-labelledby');
            assert.equal(document.getElementById(titleId).textContent, copy.title);
            assert.equal(panel(view.container).querySelector('a').getAttribute('href'), '/privacy-policy');
            assert.equal(panel(view.container).querySelector('a').textContent, copy.privacyPolicy);
            assert.ok(panel(view.container).textContent.includes(copy.body));
            assert.equal(decision(view.container, 'accepted').textContent, copy.allow);
            assert.equal(decision(view.container, 'declined').textContent, copy.decline);
            assert.equal(decision(view.container, 'accepted').className, decision(view.container, 'declined').className, 'Allow and decline must have equal visual treatment');
            for (const button of control.querySelectorAll('button')) assert.equal(button.type, 'button', 'Consent controls must never submit surrounding forms');
            assert.equal(control.querySelectorAll('input').length, 0, 'No prechecked consent');
            assert.deepEqual(choices, [], 'Rendering must never make a consent choice');

            await act(async () => panel(view.container).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
            assert.equal(panel(view.container), null, 'Escape can dismiss the nonmodal banner');
            assert.equal(getGoogleConsentChoice(), 'unknown', 'Dismissal is not acceptance or refusal');
            assert.deepEqual(choices, []);
            assert.equal(document.activeElement, settings(view.container));

            await openSettings(view.container, copy);
            await click(decision(view.container, 'declined'));
            assert.deepEqual(choices, ['declined']);
            assert.equal(panel(view.container), null);
            assert.ok(view.container.textContent.includes(copy.declinedStatus));
            await openSettings(view.container, copy);
            await click(decision(view.container, 'accepted'));
            assert.deepEqual(choices, ['declined', 'accepted']);
            assert.equal(panel(view.container), null);
            assert.ok(view.container.textContent.includes(copy.acceptedStatus));
            await openSettings(view.container, copy);
            assert.equal(decision(view.container, 'declined').textContent, copy.withdraw, 'Stored acceptance must have an explicit withdrawal action');
            await click(decision(view.container, 'declined'));
            assert.deepEqual(choices, ['declined', 'accepted', 'declined']);
            assert.equal(panel(view.container), null);

            // Refresh from the shared state API, including a cross-tab storage notification.
            await act(async () => externalChoice('accepted'));
            assert.ok(view.container.textContent.includes(copy.acceptedStatus));
            await act(async () => externalChoice('declined', 'storage'));
            assert.ok(view.container.textContent.includes(copy.declinedStatus));
          } finally { await view.unmount(); }

          for (const privatePath of ['/submit-ticket', '/contact', '/fleet', '/insurance-damage-report/checkout']) {
            const target = locale.code === 'en' ? privatePath : '/' + locale.code + privatePath;
            assert.equal(publicMeasurementPath(target), null, target + ' must not become a tagged public page');
            const privateView = await mount(target);
            try {
              assert.equal(panel(privateView.container), null, target + ' must not show an automatic first-choice banner');
              assert.ok(settings(privateView.container), 'Privacy choices must remain revisitable on forms');
              await openSettings(privateView.container, copy);
              await click(privateView.container.querySelector('button[aria-label="' + copy.close + '"]'));
              assert.equal(panel(privateView.container), null);
              assert.equal(getGoogleConsentChoice(), 'unknown');
              assert.deepEqual(choices, [], 'Opening or closing settings must not choose for the visitor');
            } finally { await privateView.unmount(); }
          }
        }

        for (const route of ['/representation-consent?token=offline-only', '/pa/representation-consent?token=offline-only', '/en/representation-consent']) {
          const view = await mount(route);
          try {
            assert.equal(view.container.querySelector('[data-google-consent-controls]'), null, 'Bearer-sensitive consent pages must not render this UI');
            assert.deepEqual(choices, []);
          } finally { await view.unmount(); }
        }
        for (const storedChoice of ['accepted', 'declined']) {
          const view = await mount('/es/', storedChoice);
          try {
            assert.equal(panel(view.container), null, 'A remembered choice must not be asked again on mount');
            assert.deepEqual(choices, []);
          } finally { await view.unmount(); }
        }
        const navigation = await mount('/ar/');
        try {
          await openSettings(navigation.container, googleConsentCopy.ar);
          await navigation.navigate('/ar/submit-ticket');
          assert.equal(panel(navigation.container), null, 'A manually opened public panel must not follow navigation into a private form');
          assert.deepEqual(choices, []);
        } finally { await navigation.unmount(); }
        assert.equal(submitCount, 0, 'No UI control submitted its surrounding form');
        assert.equal(document.querySelectorAll('script[src]').length, 0, 'The UI must not append Google or any other remote scripts');
        assert.equal(document.body.style.overflow, '', 'Nonmodal UI must not lock the document');
        return { locales: locales.length, standaloneStringsPerLocale: keys.length, mountedJourneys, formSubmissions: submitCount };
      }
    ` },
  });
  const { runChecks } = (await import(pathToFileURL(outfile).href)).default;
  const results = await runChecks();
  assert.deepEqual(unexpected, [], 'No external calls are permitted');
  assert.deepEqual(domErrors, [], 'No unhandled DOM errors are permitted');
  console.log(JSON.stringify({ status: 'passed', ...results, externalCalls: unexpected.length }));
} finally {
  for (const channel of channels) { channel.port1.close(); channel.port2.close(); }
  dom.window.close();
  for (const [name, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
  await fs.rm(temporary, { recursive: true, force: true });
}
