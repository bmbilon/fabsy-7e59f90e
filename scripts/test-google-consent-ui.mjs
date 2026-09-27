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
          export const OPENAI_ADS_CONSENT_CHANGED = 'offline:openai-ads-consent-changed';
          export const OPENAI_ADS_CONSENT_STORAGE_KEY = 'offline:openai-ads-consent';
          let choice = 'unknown';
          let openAIChoice = 'unknown';
          export const choices = [];
          export const getGoogleConsentChoice = () => choice;
          export const getOpenAIAdsConsentChoice = () => openAIChoice;
          export function setGoogleConsentChoice(next) {
            if (!['accepted', 'declined'].includes(next)) throw Error('Invalid explicit choice');
            choice = next; choices.push(next); window.dispatchEvent(new Event(GOOGLE_CONSENT_CHANGED));
          }
          export function setOpenAIAdsConsentChoice(next) {
            if (!['accepted', 'declined'].includes(next)) throw Error('Invalid explicit choice');
            openAIChoice = next; window.dispatchEvent(new Event(OPENAI_ADS_CONSENT_CHANGED));
          }
          export function reset(next = 'unknown') { choice = next; openAIChoice = next; choices.length = 0; }
          export function externalChoice(next, event = GOOGLE_CONSENT_CHANGED) {
            choice = next; openAIChoice = next; window.dispatchEvent(event === 'storage' ? new StorageEvent('storage', { key: GOOGLE_CONSENT_STORAGE_KEY }) : new Event(event));
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
      import {
        FABSY_FUNNEL_CONSENT_STORAGE_KEY,
        setFabsyFunnelConsentChoice,
      } from './src/lib/fabsyFunnelConsent';

      export async function runChecks() {
        reset('accepted');
        const container=document.createElement('div');document.body.append(container);
        const root=createRoot(container);let submitted=0;
        await act(async()=>root.render(<MemoryRouter><form onSubmit={e=>{e.preventDefault();submitted++;}}><input aria-label="Private field" defaultValue="unchanged"/><GoogleConsent/></form></MemoryRouter>));
        assert.equal(container.querySelector('[data-google-consent-panel]'),null,'No initial opt-in banner');
        assert.equal(container.querySelector('[role=dialog]'),null);
        assert.ok(container.textContent.includes('Opt out of Google measurement'));
        assert.deepEqual(choices,[],'Mount does not fabricate a saved choice');
        await act(async()=>container.querySelector('[data-google-measurement-toggle]').click());
        assert.equal(getGoogleConsentChoice(),'declined');
        assert.ok(container.textContent.includes('Google measurement is off'));
        assert.equal(container.querySelector('input').value,'unchanged');assert.equal(submitted,0);
        await act(async()=>externalChoice('accepted','storage'));
        assert.ok(container.textContent.includes('Opt out of Google measurement'));
        assert.equal(container.querySelectorAll('script[src]').length,0);
        await act(async()=>root.unmount());container.remove();
        return {defaultGrant:true,optOut:true,crossTab:true,formPreserved:true,initialBanner:false};
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
