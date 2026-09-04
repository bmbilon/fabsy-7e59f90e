#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInContext } from 'node:vm';
import { MessageChannel } from 'node:worker_threads';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({
  absWorkingDir: root,
  stdin: {
    resolveDir: root,
    sourcefile: 'meta-consent-ui-fixture.tsx',
    loader: 'tsx',
    contents: `
      import React, { act } from 'react';
      import { createRoot } from 'react-dom/client';
      import { MemoryRouter } from 'react-router-dom';
      import GoogleConsent from './src/components/GoogleConsent';
      export * from './src/lib/googleConsent';
      export * from './src/lib/fabsyFunnelConsent';
      export { googleConsentCopy } from './src/i18n/googleConsentCopy';
      let root;
      export async function mount(route = '/') {
        root = createRoot(document.getElementById('root'));
        await act(async () => root.render(
          <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <GoogleConsent />
          </MemoryRouter>
        ));
      }
      export async function click(selector) {
        const element = document.querySelector(selector);
        if (!element) throw new Error('Missing consent control: ' + selector);
        await act(async () => element.click());
      }
      export async function unmount() { await act(async () => root?.unmount()); }
    `,
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'cjs',
  jsx: 'automatic',
  logLevel: 'silent',
  define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"test"' },
});

test('a prior Google-only acceptance prompts for Meta and the combined controls write both records', async () => {
  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://fabsy.ca/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const network = [];
  const forbid = () => { network.push('blocked'); throw new Error('Consent UI test forbids network'); };
  dom.window.fetch = forbid;
  dom.window.XMLHttpRequest = class { constructor() { forbid(); } };
  dom.window.navigator.sendBeacon = forbid;
  const channels = [];
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
  const api = context.module.exports;
  try {
    api.setGoogleConsentChoice('accepted');
    assert.equal(api.getGoogleConsentChoice(), 'accepted');
    assert.equal(api.getMetaConsentChoice(), 'unknown');
    await api.mount();
    assert.ok(dom.window.document.querySelector('[data-google-consent-panel]'), 'Meta unknown must reopen the choice UI');
    assert.ok(dom.window.document.body.textContent.includes(api.googleConsentCopy.en.mixedStatus));

    await api.click('[data-google-consent-choice="accepted"]');
    assert.equal(api.getGoogleConsentChoice(), 'accepted');
    assert.equal(api.getMetaConsentChoice(), 'accepted');
    assert.equal(api.getFabsyFunnelConsentChoice(), 'accepted');
    assert.equal(dom.window.document.querySelector('[data-google-consent-panel]'), null);
    assert.ok(dom.window.document.body.textContent.includes(api.googleConsentCopy.en.acceptedStatus));

    await api.click('button[aria-expanded]');
    await api.click('[data-google-consent-choice="declined"]');
    assert.equal(api.getGoogleConsentChoice(), 'declined');
    assert.equal(api.getMetaConsentChoice(), 'declined');
    assert.equal(api.getFabsyFunnelConsentChoice(), 'declined');
    assert.ok(dom.window.document.body.textContent.includes(api.googleConsentCopy.en.declinedStatus));
    assert.equal(dom.window.document.querySelectorAll('script[src]').length, 0);
    assert.deepEqual(network, []);
    assert.deepEqual(errors, []);
  } finally {
    await api.unmount();
    for (const channel of channels) { channel.port1.close(); channel.port2.close(); }
    dom.window.close();
  }
});

test('all eight consent locales name both providers and explain the limited Meta controls', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://fabsy.ca/', runScripts: 'outside-only' });
  const context = dom.getInternalVMContext();
  context.module = { exports: {} };
  context.exports = context.module.exports;
  runInContext(bundle.outputFiles[0].text, context);
  try {
    const copies = context.module.exports.googleConsentCopy;
    assert.deepEqual(Object.keys(copies).sort(), ['ar', 'en', 'es', 'hi', 'pa', 'tl', 'zh-hans', 'zh-hant']);
    for (const [locale, copy] of Object.entries(copies)) {
      for (const provider of ['Google Analytics', 'Google Ads', 'Meta Pixel', 'Fabsy']) {
        assert.ok(copy.body.includes(provider), `${locale} body must name ${provider}`);
      }
      for (const term of ['Google', 'Meta', 'Cloudflare']) assert.ok(copy.scope.includes(term), `${locale} scope must name ${term}`);
      assert.ok(/automatic|ਆਟੋਮੈਟਿਕ|awtomatikong|自动|自動|التلقائية|स्वचालित|automáticos/.test(copy.scope), `${locale} scope must explain automatic Meta events`);
    }
  } finally { dom.window.close(); }
});
