#!/usr/bin/env node
// Exercise the real intake/payment/licence handlers with synthetic persisted
// orders. Supabase, Stripe and HTTP are replaced before module loading. This
// runner cannot create a real intake, upload, checkout, refund or notification.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const locales = ['pa', 'tl', 'zh-hans', 'zh-hant', 'ar', 'hi', 'es'];
const submissionId = '10000000-0000-4000-8000-000000000001';
const clientId = '20000000-0000-4000-8000-000000000001';
const accessToken = 'a'.repeat(64);
const tokenHash = createHash('sha256').update(accessToken).digest('hex');
const temporary = await mkdtemp(path.join(tmpdir(), 'fabsy-product-locales-'));
const originalFetch = globalThis.fetch;
const originalDeno = globalThis.Deno;
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
let state;
let sequence = 0;
let assertions = 0;

function reset(locale = 'en', patch = {}) {
  state = {
    reads: [], writes: [], external: [],
    order: {
      id: submissionId, client_id: clientId, ticket_number: 'SYNTHETIC-LOCALE',
      first_name: 'Synthetic', last_name: 'Driver', drivers_license: 'SYNTH-123456',
      status: 'awaiting_payment', service_type: 'representation', ticket_type: 'officer_issued',
      order_type: 'rapid_resolution', review_path: 'standard', declared_licence_class: 'unknown',
      preferred_locale: locale, pro_verified: false, pro_verification_id: null,
      representation_access_token_hash: tokenHash, representation_includes_assessment: false,
      ticket_document_path: null, clients: { email: 'synthetic@example.test', auth_user_id: null },
      ...patch,
    },
    env: {
      SUPABASE_URL: 'https://product-locale.fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service',
      SUPABASE_ANON_KEY: 'fixture-anon', STRIPE_SECRET_KEY: 'fixture-stripe', SITE_URL: 'https://fabsy.test',
      FABSY_LIVE_SERVICE_LOCALES: locales.join(','),
    },
  };
}
function forbidden(kind) {
  state.external.push(kind);
  throw new Error(`Unexpected external side effect: ${kind}`);
}
class Query {
  constructor(table) { this.table = table; this.filters = []; }
  select(columns) { this.columns = columns; return this; }
  eq(key, value) { this.filters.push([key, value]); return this; }
  in() { return this; }
  limit() { return this; }
  order() { return this; }
  insert() { state.writes.push(this.table); throw new Error('Database writes forbidden'); }
  update() { state.writes.push(this.table); throw new Error('Database writes forbidden'); }
  upsert() { state.writes.push(this.table); throw new Error('Database writes forbidden'); }
  async maybeSingle() {
    state.reads.push({ table: this.table, columns: this.columns });
    if (this.table === 'ticket_submissions') {
      assert.ok(this.columns.includes('preferred_locale'), 'Existing order gates must query its persisted locale');
      return { data: this.filters.every(([key, value]) => state.order?.[key] === value) ? structuredClone(state.order) : null, error: null };
    }
    if (this.table === 'pro_discount_refunds') return { data: null, error: null };
    throw new Error(`Unexpected query ${this.table}`);
  }
  single() { return this.maybeSingle(); }
}
reset();
globalThis.fetch = () => forbidden('fetch');
globalThis.Deno = { env: { get: key => state.env[key] } };
globalThis.__productLocaleTest = {
  admin: {
    from: table => new Query(table),
    rpc: () => forbidden('rpc'),
    storage: { from: () => forbidden('storage') },
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  },
  Stripe: class { constructor() { forbidden('Stripe'); } },
};
console.log = console.error = console.warn = () => {};

try {
  const handlers = {};
  const mocks = {
    'https://deno.land/std@0.190.0/http/server.ts': 'export const serve = handler => { globalThis.__productLocaleTest.handler = handler; };',
    'https://esm.sh/@supabase/supabase-js@2.57.4': 'export const createClient = () => globalThis.__productLocaleTest.admin;',
    'https://esm.sh/stripe@18.5.0': 'export default globalThis.__productLocaleTest.Stripe;',
  };
  for (const name of ['submit-ticket', 'submit-assessment-intake', 'create-payment', 'verify-pro-licence']) {
    const outfile = path.join(temporary, `${name}.mjs`);
    await build({
      entryPoints: [fileURLToPath(new URL(`../functions/${name}/index.ts`, import.meta.url))],
      outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
      plugins: [{ name: 'offline-product-locale-adapters', setup(builder) {
        builder.onResolve({ filter: /.*/ }, args => {
          if (Object.hasOwn(mocks, args.path)) return { path: args.path, namespace: 'product-locale-test' };
          if (/^https?:/.test(args.path)) throw new Error(`Unmocked external module ${args.path}`);
          return null;
        });
        builder.onLoad({ filter: /.*/, namespace: 'product-locale-test' }, args => ({ contents: mocks[args.path], loader: 'js' }));
      } }],
    });
    await import(pathToFileURL(outfile).href);
    handlers[name] = globalThis.__productLocaleTest.handler;
  }
  async function request(name, body, { origin = 'http://localhost:5173', authorization } = {}) {
    const response = await handlers[name](new Request(`https://product-locale.fixture.invalid/functions/v1/${name}`, {
      method: 'POST', headers: {
        'content-type': 'application/json', 'x-forwarded-for': `192.0.2.${++sequence}`,
        ...(origin ? { origin } : {}), ...(authorization ? { authorization } : {}),
      }, body: JSON.stringify(body),
    }));
    assert.equal(state.writes.length, 0, `${name}: no database writes`);
    assert.equal(state.external.length, 0, `${name}: no uploads, providers or RPCs`);
    assertions++;
    return { status: response.status, data: await response.json() };
  }
  const payment = extra => ({
    submissionId, clientId, accessToken, formData: {
      email: 'synthetic@example.test', firstName: 'Synthetic', lastName: 'Driver', ticketNumber: 'SYNTHETIC-LOCALE',
    }, ...extra,
  });
  const expectProductGate = result => {
    assert.equal(result.status, 409, JSON.stringify(result.data));
    assert.equal(result.data.error_code, 'product_locale_not_released', JSON.stringify(result.data));
  };

  for (const locale of locales) {
    for (const declaredLicenceClass of ['1', '2', '4', 'Class 1']) {
      reset();
      expectProductGate(await request('submit-ticket', { preferred_locale: locale, declaredLicenceClass }));
      assert.equal(state.reads.length, 0, 'Unreleased product rejected before any persisted intake work');
    }
    for (const endpoint of ['submit-ticket', 'submit-assessment-intake']) {
      reset();
      expectProductGate(await request(endpoint, {
        preferred_locale: locale, ticket_type: 'photo_radar', registered_owner_on_offence_date: 'yes',
      }));
      assert.equal(state.reads.length, 0);
    }
    for (const declaredLicenceClass of [undefined, 'unknown', '5']) {
      reset();
      const ordinary = await request('submit-ticket', { preferred_locale: locale, declaredLicenceClass });
      assert.equal(ordinary.status, 400);
      assert.equal(ordinary.data.error, 'Missing required fields', 'Ordinary multilingual intake reaches existing validation');
    }
    reset();
    const ordinaryAssessment = await request('submit-assessment-intake', { preferred_locale: locale });
    assert.equal(ordinaryAssessment.status, 400);
    assert.equal(ordinaryAssessment.data.error, 'Terms acceptance is required.', 'Ordinary assessment retains its existing consent gate');

    for (const patch of [
      { ticket_type: 'photo_radar', order_type: 'photo_radar', review_path: 'ate', registered_owner_on_offence_date: 'yes' },
      { declared_licence_class: '1', pro_verified: true, pro_verification_id: '30000000-0000-4000-8000-000000000001' },
    ]) {
      reset(locale, patch);
      expectProductGate(await request('create-payment', payment({ preferred_locale: 'en', ticket_type: 'officer_issued', pro_verified: false })));
      reset(locale, patch);
      const denied = await request('create-payment', payment({ accessToken: 'b'.repeat(64) }));
      assert.equal(denied.status, 403, 'Product language must not disclose unauthorized order state');
    }
    for (const includeIdrAddon of [false, true]) {
      reset(locale);
      const ordinary = await request('create-payment', payment({
        preferred_locale: 'en', ticket_type: 'photo_radar', pro_verified: true,
        includeIdrAddon, ...(includeIdrAddon ? { idrOrderId: '40000000-0000-4000-8000-000000000001' } : {}),
      }));
      assert.equal(ordinary.status, 409);
      assert.match(ordinary.data.error, /Ticket document path could not be verified/, 'Ordinary payment reaches unchanged consent/upload guards');
      assert.equal(ordinary.data.error_code, undefined, 'Forged request flags do not create a Pro/photo product');
    }
    for (const action of ['status', 'verify', 'refund']) {
      reset(locale, { declared_licence_class: '1' });
      expectProductGate(await request('verify-pro-licence', {
        submissionId, accessToken, action, licenceClass: '1', preferred_locale: 'en',
      }));
      assert.equal(state.reads.length, 1, 'No evidence/refund query occurs before persisted locale gate');
    }
    reset(locale);
    const denied = await request('verify-pro-licence', { submissionId, accessToken: 'b'.repeat(64), action: 'status' });
    assert.equal(denied.status, 403, 'Private verification remains protected before locale checks');
  }

  for (const locale of [undefined, 'en']) {
    for (const declaredLicenceClass of ['1', '2', '4']) {
      reset();
      const allowed = await request('submit-ticket', { preferred_locale: locale, declaredLicenceClass });
      assert.equal(allowed.status, 400); assert.equal(allowed.data.error, 'Missing required fields');
    }
    reset(locale);
    const status = await request('verify-pro-licence', { submissionId, accessToken, action: 'status', preferred_locale: 'pa' });
    assert.equal(status.status, 200); assert.equal(status.data.verified, false);
  }
  for (const patch of [
    { ticket_type: 'photo_radar', order_type: 'photo_radar', review_path: 'ate', registered_owner_on_offence_date: 'yes' },
    { declared_licence_class: '1', pro_verified: true, pro_verification_id: '30000000-0000-4000-8000-000000000001' },
  ]) {
    reset('en', patch);
    const checkout = await request('create-payment', payment({ preferred_locale: 'pa' }));
    assert.equal(checkout.status, 409);
    assert.match(checkout.data.error, /Ticket document path could not be verified/);
    assert.equal(checkout.data.error_code, undefined, 'English products still require the original upload/consent flow');
  }
  for (const endpoint of ['submit-ticket', 'submit-assessment-intake']) {
    reset();
    const allowed = await request(endpoint, { preferred_locale: 'en', ticket_type: 'photo_radar', registered_owner_on_offence_date: 'yes' });
    assert.equal(allowed.status, 400);
    assert.equal(allowed.data.error, endpoint === 'submit-ticket' ? 'Missing required fields' : 'Terms acceptance is required.');
  }
  reset('en', { declared_licence_class: '1' });
  const imageRequired = await request('verify-pro-licence', { submissionId, accessToken, action: 'verify', licenceClass: '1' });
  assert.equal(imageRequired.status, 400);
  assert.match(imageRequired.data.error, /licence photo/);
  for (const endpoint of ['create-payment', 'verify-pro-licence', 'submit-assessment-intake']) {
    reset();
    const denied = await request(endpoint, {}, { origin: 'https://untrusted.invalid' });
    assert.equal(denied.status, 403); assert.equal(state.reads.length, 0);
  }
  for (const locale of [null, 'PA', 'pa-IN', 'fil', 'zh', 'ur', '', {}]) {
    reset();
    const intake = await request('submit-ticket', { preferred_locale: locale });
    assert.equal(intake.status, 400); assert.equal(intake.data.error_code, 'invalid_preferred_locale');
    reset(locale);
    const checkout = await request('create-payment', payment({ preferred_locale: 'en' }));
    assert.equal(checkout.status, 400); assert.equal(checkout.data.error_code, 'invalid_preferred_locale');
    reset(locale);
    const verification = await request('verify-pro-licence', { submissionId, accessToken, action: 'status', preferred_locale: 'en' });
    assert.equal(verification.status, 400); assert.equal(verification.data.error_code, 'invalid_preferred_locale');
  }
  reset('pa');
  state.env.FABSY_LIVE_SERVICE_LOCALES = '';
  state.env.FABSY_REVIEWED_SERVICE_LOCALES = locales.join(',');
  const rollback = await request('create-payment', payment());
  assert.equal(rollback.status, 409); assert.equal(rollback.data.error_code, 'locale_not_released');
  originalLog(`Product locale handlers: ${assertions} synthetic requests passed; no DB mutations, provider calls, uploads, refunds or messages.`);
} finally {
  globalThis.fetch = originalFetch;
  globalThis.Deno = originalDeno;
  delete globalThis.__productLocaleTest;
  console.log = originalLog; console.error = originalError; console.warn = originalWarn;
  await rm(temporary, { recursive: true, force: true });
}
