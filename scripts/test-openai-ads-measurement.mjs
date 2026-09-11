import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = {
  PROD: true,
  VITE_OPENAI_ADS_MEASUREMENT_ENABLED: 'true',
  VITE_OPENAI_ADS_PIXEL_ID: 'QbJtdpTVT8DTb7BcRq7jY5',
};
const compiled = await build({
  absWorkingDir: root,
  stdin: {
    sourcefile: 'openai-ads-measurement-fixture.ts',
    resolveDir: root,
    loader: 'ts',
    contents: `export * from './src/lib/openAIAdsMeasurement';`,
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  define: { 'import.meta.env': JSON.stringify(env) },
  logLevel: 'silent',
  plugins: [{
    name: 'consent-boundary-fixture',
    setup(builder) {
      builder.onResolve({ filter: /(?:googleConsent|measurementNavigation)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents: args.path.includes('googleConsent')
        ? `export const getOpenAIAdsConsentChoice = () => globalThis.__openAIAdsFixture.consent;`
        : `export const measurementProviderMayLoadInDocument = () => globalThis.__openAIAdsFixture.documentAllowed;
           export const markMeasurementTagPending = () => globalThis.__openAIAdsFixture.documentAllowed;` }));
    },
  }],
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`;

test('the OpenAI Ads pixel is production-, consent-, route- and referrer-gated', async () => {
  const api = await import(moduleUrl);
  assert.deepEqual(api.openAIAdsMeasurementConfig(env, 'https://fabsy.ca'), { pixelId: env.VITE_OPENAI_ADS_PIXEL_ID });
  for (const override of [
    { PROD: false },
    { VITE_OPENAI_ADS_MEASUREMENT_ENABLED: 'false' },
    { VITE_OPENAI_ADS_PIXEL_ID: 'wrong' },
  ]) assert.deepEqual(api.openAIAdsMeasurementConfig({ ...env, ...override }, 'https://fabsy.ca'), {});
  assert.deepEqual(api.openAIAdsMeasurementConfig(env, 'https://preview.fabsy.ca'), {});
  assert.equal(api.publicOpenAIAdsMeasurementUrl(new URL('https://fabsy.ca/ticket-uploaded')), true);
  assert.equal(api.publicOpenAIAdsMeasurementUrl(new URL('https://fabsy.ca/rapid-resolution?utm_source=openai&utm_medium=cpc&utm_campaign=rr_alberta_pilot_202609&utm_content=admin_198&oppref=chatgpt_click_123')), true);
  for (const href of [
    'https://fabsy.ca/submit-ticket',
    'https://fabsy.ca/rapid-resolution',
    'https://fabsy.ca/rapid-resolution?oppref=bad%20value',
    'https://fabsy.ca/rapid-resolution?oppref=one&oppref=two',
    'https://fabsy.ca/rapid-resolution?oppref=one&utm_source=openai',
    'https://fabsy.ca/rapid-resolution?utm_source=meta&utm_medium=cpc&utm_campaign=rr&utm_content=admin&oppref=one',
    'https://fabsy.ca/rapid-resolution?utm_source=openai&utm_medium=cpc&utm_campaign=rr&utm_content=admin&oppref=one&private=value',
    'https://fabsy.ca/ticket-uploaded?ticket=private',
    'https://fabsy.ca/ticket-uploaded#private',
  ]) assert.equal(api.publicOpenAIAdsMeasurementUrl(new URL(href)), false, href);

  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://fabsy.ca/ticket-uploaded' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Event = dom.window.Event;
  globalThis.__openAIAdsFixture = { consent: 'accepted', documentAllowed: true };
  api.initializeOpenAIAdsMeasurement();
  const script = document.getElementById('fabsy-openai-ads-pixel');
  assert.equal(script?.getAttribute('src'), 'https://bzrcdn.openai.com/sdk/oaiq.min.js');
  assert.equal(script?.referrerPolicy, 'no-referrer');
  script.onload();
  assert.equal(api.dispatchOpenAIAdsTicketUploadConversion(), true);
  const commands = window.oaiq.q;
  assert.deepEqual(commands.slice(0, 3), [
    ['consent', false],
    ['init', { pixelId: env.VITE_OPENAI_ADS_PIXEL_ID }],
    ['consent', true],
  ]);
  assert.deepEqual(commands[3], [
    'measure', 'lead_created',
    { type: 'customer_action', amount: 5000, currency: 'CAD' },
    { opt_out: true },
  ]);
  assert.equal(JSON.stringify(commands).match(/email|phone|ticket_number|form/), null);
  dom.window.close();
});
