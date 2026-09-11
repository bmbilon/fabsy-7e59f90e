import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../src/lib/ticketUploadMeasurement.ts', import.meta.url))],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

function storage() {
  const values = new Map();
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

test('a confirmed upload creates only a bounded, PII-free return handoff', () => {
  const store = storage();
  assert.equal(api.beginTicketUploadMeasurementHandoff('/submit-ticket', store), true);
  const handoff = api.readTicketUploadMeasurementHandoff(store);
  assert.deepEqual(Object.keys(handoff).sort(), ['createdAt', 'googleReported', 'openAIReported', 'returnPath', 'version']);
  assert.equal(handoff.returnPath, '/submit-ticket');
  assert.equal(JSON.stringify(handoff).includes('email'), false);
  assert.equal(JSON.stringify(handoff).includes('ticket'), true, 'only the fixed route name is present');
  assert.equal(api.beginTicketUploadMeasurementHandoff('/pa/submit-ticket', store), true);
  assert.equal(api.readTicketUploadMeasurementHandoff(store).returnPath, '/pa/submit-ticket');
});

test('malformed, sensitive and expired handoffs fail closed', () => {
  const store = storage();
  for (const path of ['/submit-ticket?email=x', '/portal', 'https://evil.invalid/', '//evil.invalid/']) {
    assert.equal(api.beginTicketUploadMeasurementHandoff(path, store), false, path);
  }
  store.setItem(api.TICKET_UPLOAD_MEASUREMENT_STORAGE_KEY, JSON.stringify({
    version: 1,
    createdAt: Date.now() - 11 * 60 * 1000,
    returnPath: '/submit-ticket',
    googleReported: false,
    openAIReported: false,
  }));
  assert.equal(api.readTicketUploadMeasurementHandoff(store), null);
  assert.equal(store.values.size, 0);
});

test('provider success is persisted independently and clearing prevents replay', () => {
  const store = storage();
  assert.equal(api.beginTicketUploadMeasurementHandoff('/ticket-form', store), true);
  assert.equal(api.updateTicketUploadMeasurementHandoff({ googleReported: true, openAIReported: false }, store).googleReported, true);
  assert.equal(api.updateTicketUploadMeasurementHandoff({ googleReported: true, openAIReported: true }, store).openAIReported, true);
  api.clearTicketUploadMeasurementHandoff(store);
  assert.equal(api.readTicketUploadMeasurementHandoff(store), null);
});
