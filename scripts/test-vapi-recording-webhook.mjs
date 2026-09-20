import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Execute the actual handler against local providers. No Vapi, email, Storage,
// database or customer request is made by this test.
const directory = await mkdtemp(join(tmpdir(), 'fabsy-vapi-recording-test-'));
const originalFetch = globalThis.fetch;
const originalDeno = globalThis.Deno;
const state = globalThis.__vapiRecordingTest = { handler: null, rows: [], uploads: [], emails: [], calls: [], apiStatus: 302, signed: true, key: 'test-vapi-private-key' };
const supabase = {
  from: table => ({ upsert: async row => { assert.equal(table, 'call_logs'); state.rows.push(row); return { error: null }; } }),
  storage: { from: bucket => {
    assert.equal(bucket, 'call-recordings');
    return {
      upload: async (path, bytes, options) => { state.uploads.push({ path, bytes, options }); return { error: null }; },
      createSignedUrl: async () => ({ data: state.signed ? { signedUrl: 'https://supabase.example.test/signed-recording?token=synthetic' } : null }),
    };
  } },
};
state.supabase = supabase;
globalThis.Deno = { env: { get: name => name === 'VAPI_PRIVATE_API_KEY' ? state.key : `test-${name}` } };
globalThis.fetch = async (url, options) => {
  const value = String(url);
  state.calls.push({ url: value, options });
  if (value === 'https://api.vapi.ai/call/00000000-0000-4000-8000-000000000001/mono-recording') {
    assert.equal(new Headers(options.headers).get('authorization'), 'Bearer test-vapi-private-key');
    return new Response(null, { status: state.apiStatus, headers: state.apiStatus === 302 ? { location: 'https://recordings.example.test/signed.wav' } : {} });
  }
  assert.equal(value, 'https://recordings.example.test/signed.wav', 'Webhook-provided URLs never choose the recording fetch target');
  assert.equal(new Headers(options.headers).get('authorization'), null, 'Vapi key never reaches recording storage');
  return new Response(new Uint8Array([82, 73, 70, 70]), { headers: { 'content-type': 'audio/wav' } });
};
try {
  const outfile = join(directory, 'handler.mjs');
  await build({ entryPoints: ['supabase/functions/vapi-call-webhook/index.ts'], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'mock-webhook-providers', setup(builder) {
    builder.onResolve({ filter: /^(https:|npm:)/ }, args => ({ path: args.path, namespace: 'provider' }));
    builder.onLoad({ filter: /.*/, namespace: 'provider' }, args => {
      if (args.path.endsWith('/http/server.ts')) return { contents: 'export const serve = handler => { globalThis.__vapiRecordingTest.handler = handler; };' };
      if (args.path.startsWith('npm:resend@')) return { contents: 'export class Resend { emails = { send: async message => { globalThis.__vapiRecordingTest.emails.push(message); return { data: { id: "test-email" }, error: null }; } }; }' };
      if (args.path.includes('@supabase/supabase-js')) return { contents: 'export const createClient = () => globalThis.__vapiRecordingTest.supabase;' };
      throw new Error(`Unexpected external module: ${args.path}`);
    });
  } }] });
  await import(pathToFileURL(outfile).href);
  const callId = '00000000-0000-4000-8000-000000000001';
  const privateUrl = 'https://private-recordings.example.test/hipaa-recordings/private.wav';
  async function run(message) {
    state.rows = []; state.uploads = []; state.emails = []; state.calls = [];
    const response = await state.handler(new Request('https://webhook.example.test', { method: 'POST', body: JSON.stringify({ message: { type: 'end-of-call-report', call: { id: callId }, ...message } }) }));
    assert.equal(response.status, 200);
    assert.equal(state.rows.length, 1, 'Call metadata persists independently of recording availability');
    assert.equal(state.emails.length, 1);
    assert.deepEqual(state.emails[0].to, ['hello@fabsy.ca']);
    assert.deepEqual(state.emails[0].bcc, []);
    assert.equal(state.emails[0].reply_to, 'hello@fabsy.ca');
    return response.json();
  }
  const success = await run({ artifact: { recording: { mono: { combinedUrl: privateUrl } } } });
  assert.equal(success.recording_saved, true);
  assert.equal(state.calls.length, 2);
  assert.equal(state.uploads[0].path, `${callId}.wav`);
  assert.equal(state.rows[0].recording_url, privateUrl, 'Existing source metadata retained');
  assert.match(state.emails[0].html, /https:\/\/supabase.example.test\/signed-recording/);
  assert.ok(!state.emails[0].html.includes(privateUrl));

  state.apiStatus = 403;
  const denied = await run({ recordingUrl: privateUrl });
  assert.equal(denied.recording_saved, false);
  assert.equal(state.uploads.length, 0);
  assert.match(state.emails[0].html, /Recording retrieval is unavailable/);
  assert.ok(!state.emails[0].html.includes(privateUrl), 'Private provider URL is never offered as a working recording link');

  state.apiStatus = 302; state.signed = false;
  await run({ artifact: { recordingUrl: privateUrl } });
  assert.equal(state.uploads.length, 1);
  assert.match(state.emails[0].html, /Recording retrieval is unavailable/);

  state.key = '';
  await run({ artifact: { recordingUrl: privateUrl } });
  assert.equal(state.calls.length, 0);
  assert.match(state.emails[0].html, /Recording retrieval is unavailable/);

  await run({ artifact: {} });
  assert.equal(state.calls.length, 0);
  assert.ok(!state.emails[0].html.includes('Recording retrieval is unavailable'), 'Calls without a recording artifact are not falsely labelled failed');
  console.log('Vapi recording webhook passed: nested artifact, canonical authenticated fetch, storage credential isolation, original call/email routing, unavailable recording, missing key, and absent artifact.');
} finally {
  globalThis.fetch = originalFetch;
  globalThis.Deno = originalDeno;
  delete globalThis.__vapiRecordingTest;
  await rm(directory, { recursive: true, force: true });
}
