#!/usr/bin/env node
// Bundles the real handler with in-memory Supabase/Auth/Resend adapters. No
// credentials, external calls, live authentication or email delivery are used.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'fabsy-resolution-endpoint-'));
const submissionId = '11111111-1111-4111-8111-111111111111';
const clientId = '22222222-2222-4222-8222-222222222222';
const staffId = '33333333-3333-4333-8333-333333333333';
const originalFetch = globalThis.fetch;
const originalDeno = globalThis.Deno;
globalThis.fetch = () => { throw new Error('External networking is forbidden in resolution email tests'); };
let state;

class Query {
  constructor(table) { this.table = table; this.operation = 'select'; this.filters = []; this.values = null; this.maximum = Infinity; }
  select() { return this; }
  eq(key, value) { this.filters.push(row => row[key] === value); return this; }
  in(key, values) { this.filters.push(row => values.includes(row[key])); return this; }
  is(key, value) { this.filters.push(row => value === null ? row[key] == null : row[key] === value); return this; }
  lte(key, value) { this.filters.push(row => row[key] != null && row[key] <= value); return this; }
  limit(value) { this.maximum = value; return this; }
  order(key, options) { this.sort = { key, ascending: options.ascending }; return this; }
  upsert(values, options) { this.operation = 'upsert'; this.values = values; this.upsertOptions = options; return this; }
  update(values) { this.operation = 'update'; this.values = values; return this; }
  async run(single = false) {
    const rows = state.tables[this.table];
    assert.ok(rows, `Unexpected table ${this.table}`);
    state.queries.push({ table: this.table, operation: this.operation });
    if (this.operation === 'upsert') {
      state.mutations.push({ table: this.table, operation: this.operation, values: structuredClone(this.values) });
      assert.equal(this.table, 'idr_email_events');
      const old = rows.find(row => row.event_key === this.values.event_key);
      if (!old) rows.push({
        id: '44444444-4444-4444-8444-444444444444', status: 'pending', attempts: 0,
        claimed_at: null, last_error: null, created_at: new Date().toISOString(), ...structuredClone(this.values),
      });
      else assert.equal(this.upsertOptions.ignoreDuplicates, true, 'Retries must preserve the original event snapshot');
      return { data: null, error: null };
    }
    let selected = rows.filter(row => this.filters.every(filter => filter(row)));
    if (this.sort) {
      const { key, ascending } = this.sort;
      selected.sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (ascending ? 1 : -1));
    }
    selected = selected.slice(0, this.maximum);
    if (this.operation === 'update') {
      state.mutations.push({ table: this.table, operation: this.operation, values: structuredClone(this.values) });
      for (const row of selected) Object.assign(row, structuredClone(this.values));
    }
    return { data: single ? selected.length ? structuredClone(selected[0]) : null : structuredClone(selected), error: null };
  }
  single() { return this.run(true); }
  maybeSingle() { return this.run(true); }
  then(resolve, reject) { return this.run().then(resolve, reject); }
}

function reset({ camera = false, invitation = false } = {}) {
  state = {
    authenticated: true, sends: [], mutations: [], queries: [], referralLookups: [],
    env: {
      SUPABASE_URL: 'https://supabase.fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key',
      SUPABASE_ANON_KEY: 'fixture-anon-key', SITE_URL: 'https://fabsy.test', RESEND_API_KEY: 'fixture-resend-key',
      ...(invitation ? { REFERRAL_EMAIL_ENABLED: 'true', FABSY_BUSINESS_MAILING_ADDRESS: '123 Fixture Street, Calgary Alberta' } : {}),
    },
    tables: {
      user_roles: [{ user_id: staffId, role: 'admin' }],
      ticket_submissions: [{
        id: submissionId, client_id: clientId, service_type: 'representation', ticket_type: camera ? 'photo_radar' : 'officer_issued',
        status: 'completed', case_outcome: camera ? null : 'withdrawn', verdict: 'unwinnable', preferred_locale: 'en',
        ticket_number: 'FIXTURE-1', violation: 'Fixture traffic offence', clients: { first_name: 'Fixture', email: 'client@example.test' },
      }],
      idr_checkout_intents: [{ ticket_submission_id: submissionId, client_id: clientId, status: 'paid', checkout_kind: camera ? 'photo_radar' : 'ticket_only', created_at: new Date(Date.now() - 86_400_000).toISOString() }],
      ate_reviews: camera ? [{ ticket_submission_id: submissionId, outcome: 'unchanged', resolved_at: new Date().toISOString() }] : [],
      idr_email_events: [], idr_orders: [],
    },
  };
  return state;
}
reset();
globalThis.Deno = { env: { get: key => state.env[key] } };
globalThis.__resolutionEndpointTest = {
  admin: { from: table => new Query(table) },
  userClient: { auth: { getUser: async () => ({ data: { user: state.authenticated ? { id: staffId } : null }, error: null }) } },
  send: async (payload, key) => { state.sends.push({ payload, key }); return 'offline-provider-fixture'; },
  referral: async id => { state.referralLookups.push(id); return 'AB12CD34EF'; },
};

try {
  const outfile = path.join(temporary, 'resolution-endpoint.mjs');
  const mocks = {
    'https://deno.land/std@0.190.0/http/server.ts': 'export const serve = handler => { globalThis.__resolutionEndpointTest.handler = handler; };',
    'https://esm.sh/@supabase/supabase-js@2.57.4': 'export const createClient = (_url, key) => key === "fixture-service-key" ? globalThis.__resolutionEndpointTest.admin : globalThis.__resolutionEndpointTest.userClient;',
    '../_shared/resend-email.ts': 'export const sendResendEmail = async (_key, payload, idempotency) => globalThis.__resolutionEndpointTest.send(payload, idempotency);',
    '../_shared/referrals.ts': 'export const clientReferralCode = async (_admin, clientId) => globalThis.__resolutionEndpointTest.referral(clientId);',
  };
  await build({
    entryPoints: [fileURLToPath(new URL('../supabase/functions/send-idr-case-update/index.ts', import.meta.url))],
    bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent',
    plugins: [{ name: 'offline-resolution-adapters', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (Object.hasOwn(mocks, args.path)) return { path: args.path, namespace: 'resolution-test' };
        if (/^https?:/.test(args.path)) throw new Error(`Unmocked external module ${args.path}`);
        return null;
      });
      builder.onLoad({ filter: /.*/, namespace: 'resolution-test' }, args => ({ contents: mocks[args.path], loader: 'js' }));
    } }],
  });
  await import(pathToFileURL(outfile).href);
  const handler = globalThis.__resolutionEndpointTest.handler;
  const request = async (body = {}, authorization = true) => {
    const response = await handler(new Request('https://supabase.fixture.invalid/functions/v1/send-idr-case-update', {
      method: 'POST', headers: { 'content-type': 'application/json', ...(authorization ? { authorization: 'Bearer offline-staff-fixture' } : {}) },
      body: JSON.stringify({ submissionId, event: 'case_resolved', ...body }),
    }));
    return { status: response.status, data: await response.json() };
  };
  const getPreview = async () => {
    const result = await request({ preview: true });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.equal(result.data.success, true);
    assert.match(result.data.preview.fingerprint, /^[a-f0-9]{64}$/);
    return result.data.preview;
  };
  const noSend = message => assert.equal(state.sends.length, 0, message);

  for (const failure of ['missing authorization', 'invalid user', 'not staff']) {
    reset();
    if (failure === 'invalid user') state.authenticated = false;
    if (failure === 'not staff') state.tables.user_roles = [];
    const result = await request({ preview: true }, failure !== 'missing authorization');
    assert.equal(result.status, 401, failure);
    noSend(failure); assert.equal(state.mutations.length, 0);
  }

  reset({ invitation: true });
  const firstPreview = await getPreview();
  assert.equal(firstPreview.invitationAvailable, true);
  noSend('Preview must never send email');
  assert.equal(state.mutations.length, 0, 'Preview must not reserve/claim an email event');
  assert.equal(state.referralLookups.length, 0, 'Preview must not provision a referral account');
  let result = await request();
  assert.equal(result.status, 409, 'A direct send without a reviewed fingerprint must be refused');
  noSend();

  for (const mutation of [
    () => { state.tables.ticket_submissions[0].case_outcome = 'reduced'; },
    () => { state.tables.ticket_submissions[0].clients.email = 'different@example.test'; },
    () => { state.tables.ticket_submissions[0].clients.first_name = 'Different'; },
    () => { state.tables.ticket_submissions[0].ticket_number = 'CHANGED-TICKET'; },
    () => { state.tables.ticket_submissions[0].preferred_locale = 'fr'; },
  ]) {
    reset(); const preview = await getPreview(); mutation();
    const stale = await request({ previewFingerprint: preview.fingerprint });
    assert.equal(stale.status, 409, 'A changed saved outcome/recipient/content requires a new review');
    noSend(); assert.equal(state.mutations.length, 0, 'A stale preview must be rejected before reservation');
  }

  for (const failure of ['unsaved', 'awaiting payment', 'no paid intent', 'wrong client paid', 'wrong product paid']) {
    reset(); const preview = await getPreview();
    const row = state.tables.ticket_submissions[0];
    if (failure === 'unsaved') row.case_outcome = null;
    if (failure === 'awaiting payment') row.status = 'awaiting_payment';
    if (failure === 'no paid intent') state.tables.idr_checkout_intents[0].status = 'open';
    if (failure === 'wrong client paid') state.tables.idr_checkout_intents[0].client_id = 'another-client';
    if (failure === 'wrong product paid') state.tables.idr_checkout_intents[0].checkout_kind = 'photo_radar';
    for (const isPreview of [true, false]) {
      result = await request({ preview: isPreview, previewFingerprint: preview.fingerprint, case_outcome: 'withdrawn', status: 'paid' });
      assert.equal(result.status, 409, failure);
      noSend(); assert.equal(state.mutations.length, 0);
    }
  }

  reset(); const defaultPreview = await getPreview();
  assert.equal(defaultPreview.invitationAvailable, false, 'Server invitations default off');
  result = await request({ previewFingerprint: defaultPreview.fingerprint, includeReferralInvite: true, referralConsentConfirmed: true });
  assert.equal(result.status, 409, 'Staff consent does not override disabled invitation configuration');
  noSend(); assert.equal(state.referralLookups.length, 0);
  result = await request({ previewFingerprint: defaultPreview.fingerprint });
  assert.equal(result.status, 200);
  assert.equal(state.sends.length, 1);
  assert.equal(state.referralLookups.length, 0);
  assert.ok(!state.sends[0].payload.html.includes('Know a driver with a ticket?'));
  assert.equal(state.tables.idr_email_events[0].referral_invite_included, false);
  assert.equal(state.tables.idr_email_events[0].requested_by, staffId);
  assert.equal(state.tables.idr_email_events[0].resolution_payload.fingerprint, defaultPreview.fingerprint);
  result = await request({ previewFingerprint: defaultPreview.fingerprint });
  assert.equal(result.data.skipped, 'already_sent');
  assert.equal(state.sends.length, 1, 'A repeated reviewed action cannot duplicate an accepted email');

  for (const consent of [undefined, false, 'true']) {
    reset({ invitation: true }); const preview = await getPreview();
    result = await request({ previewFingerprint: preview.fingerprint, includeReferralInvite: true, referralConsentConfirmed: consent });
    assert.equal(result.status, 409, 'Invitation requires explicit boolean consent confirmation');
    noSend(); assert.equal(state.referralLookups.length, 0);
  }
  reset({ invitation: true }); const optedInPreview = await getPreview();
  result = await request({ previewFingerprint: optedInPreview.fingerprint, includeReferralInvite: true, referralConsentConfirmed: true });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.deepEqual(state.referralLookups, [clientId]);
  assert.equal(state.sends.length, 1);
  assert.ok(state.sends[0].payload.html.includes('/r/AB12CD34EF'));
  assert.ok(state.sends[0].payload.html.includes('unsubscribe'));
  assert.equal(state.tables.idr_email_events[0].referral_invite_included, true);

  for (const outcome of ['withdrawn', 'reduced', 'unchanged']) {
    reset({ camera: true }); state.tables.ate_reviews[0].outcome = outcome;
    const preview = await getPreview();
    assert.ok(!/insurance|conviction|premium|renewal|demerit/i.test(preview.mainCopy));
    result = await request({ previewFingerprint: preview.fingerprint });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.equal(state.sends.length, 1);
    assert.ok(!/insurance|conviction|premium|renewal|demerit/i.test(state.sends[0].payload.html), 'Camera final email must not inherit an officer insurance offer');
  }
  reset({ camera: true }); state.tables.ate_reviews[0].resolved_at = null;
  result = await request({ preview: true, case_outcome: 'withdrawn' });
  assert.equal(result.status, 409, 'An unresolved camera draft cannot be emailed'); noSend();
  result = await request({ event: 'conviction_stands' });
  assert.equal(result.data.skipped, 'photo_radar_no_insurance_impact'); noSend();

  for (const status of ['processing', 'failed']) {
    reset(); const preview = await getPreview();
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    state.tables.idr_email_events.push({
      id: '44444444-4444-4444-8444-444444444444', event_key: `ticket:${submissionId}:case_resolved:withdrawn`, status,
      // Zero attempts reproduces a crash after provider acceptance but before
      // the attempt counter/database completion could be persisted.
      attempts: status === 'processing' ? 0 : 1, claimed_at: status === 'processing' ? old : null,
      created_at: old, last_error: null, referral_invite_included: false,
      resolution_payload: { subject: preview.subject, html: 'Previously reserved fixture', fingerprint: preview.fingerprint },
    });
    result = await request({ previewFingerprint: preview.fingerprint });
    assert.equal(result.status, 409, `Old ${status} attempt requires reconciliation beyond provider idempotency window`);
    assert.match(result.data.error, /reconciliation/);
    noSend(); assert.equal(state.mutations.filter(item => item.operation === 'update').length, 0, 'Old claim cannot be reclaimed');
  }
  reset(); const reservedPreview = await getPreview();
  state.tables.idr_email_events.push({
    id: '44444444-4444-4444-8444-444444444444', event_key: `ticket:${submissionId}:case_resolved:withdrawn`, status: 'pending', attempts: 0,
    claimed_at: null, created_at: new Date().toISOString(), last_error: null, referral_invite_included: false,
    resolution_payload: { subject: 'Old subject', html: 'Old fixture copy', fingerprint: 'outdated-reserved-payload' },
  });
  result = await request({ previewFingerprint: reservedPreview.fingerprint });
  assert.equal(result.status, 409, 'A fresh preview cannot silently send a different immutable reserved payload');
  noSend(); assert.equal(state.mutations.filter(item => item.operation === 'update').length, 0);

  console.log('Resolution endpoint offline tests passed: staff authentication, side-effect-free preview, saved/paid gates, preview/outcome/recipient binding, invitation consent/default-off, camera copy, immutable retries and crash-safe duplicate guard. No real Auth, Supabase or Resend calls.');
} finally {
  globalThis.fetch = originalFetch;
  globalThis.Deno = originalDeno;
  delete globalThis.__resolutionEndpointTest;
  await fs.rm(temporary, { recursive: true, force: true });
}
