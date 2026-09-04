#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, webcrypto } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
if (!process.execArgv.includes('--experimental-strip-types')) {
  const child = spawnSync(process.execPath, [
    '--experimental-strip-types', '--no-warnings', thisFile,
  ], { stdio: 'inherit' });
  process.exit(child.status ?? 1);
}

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const root = fileURLToPath(new URL('../', import.meta.url));
const ledger = await import(pathToFileURL(path.join(
  root, 'supabase/functions/_shared/paid-payment-ledger.ts',
)).href);

const event = {
  id: 'evt_SYNTHETIC_LEDGER_12345678',
  type: 'checkout.session.completed',
  created: Math.floor(Date.now() / 1000) - 5,
  livemode: true,
};
const session = {
  id: 'cs_live_SYNTHETIC_LEDGER_12345678',
  livemode: true,
  mode: 'payment',
  payment_status: 'paid',
  status: 'complete',
  currency: 'cad',
  amount_subtotal: 19_800,
  amount_total: 20_790,
  client_reference_id: '33333333-3333-4333-8333-333333333333',
  payment_intent: 'pi_SYNTHETIC_LEDGER_12345678',
  total_details: { amount_discount: 0, amount_tax: 990, amount_shipping: 0 },
  metadata: {
    checkout_intent_id: '22222222-2222-4222-8222-222222222222',
    submission_id: '33333333-3333-4333-8333-333333333333',
    ticket_submission_id: '33333333-3333-4333-8333-333333333333',
    client_id: '44444444-4444-4444-8444-444444444444',
    checkout_attempt: '1',
    fabsy_checkout_kind: 'ticket_only',
    fabsy_product: 'rapid_resolution',
    fabsy_pricing_version: 'rapid_resolution_2026_08',
    pro_pricing_version: 'pro_drivers_2026_08',
    pro_coupon: '',
    pro_verification_id: '',
    pro_discount_cents: '0',
    ticket_type: 'officer_issued',
    order_type: 'rapid_resolution',
    review_path: 'standard',
    ticket_base_cents: '19800',
    representation_includes_assessment: 'false',
  },
};

const digest = value => createHash('sha256').update(value).digest('hex');

test('live signed-checkout projection contains only hashes and verified money fields', async () => {
  const record = await ledger.paidPurchaseLedgerRecord(event, session);
  assert.deepEqual(record, {
    checkoutSessionHash: digest(session.id),
    paymentIntentHash: digest(session.payment_intent),
    stripeEventHash: digest(event.id),
    occurredAt: new Date(event.created * 1000).toISOString(),
    product: 'rapid_resolution',
    amountCents: 20_790,
    taxCents: 990,
    currency: 'cad',
  });
  assert.equal(JSON.stringify(record).includes(session.id), false);
  assert.equal(JSON.stringify(record).includes(session.payment_intent), false);
});

test('test-mode, malformed and unsupported checkout events never enter the ledger', async () => {
  for (const [eventPatch, sessionPatch] of [
    [{ livemode: false }, {}],
    [{ id: 'not-an-event' }, {}],
    [{ type: 'refund.created' }, {}],
    [{}, { id: 'cs_test_SYNTHETIC_LEDGER_12345678' }],
    [{}, { payment_intent: 'not-a-payment-intent' }],
    [{}, { amount_total: -1 }],
    [{}, { currency: 'usd' }],
  ]) {
    assert.equal(await ledger.paidPurchaseLedgerRecord(
      { ...event, ...eventPatch }, { ...session, ...sessionPatch },
    ), null);
  }
});

test('partial refunds remain separate and status updates retain stable hashes', async () => {
  const refundEvent = {
    id: 'evt_SYNTHETIC_REFUND_12345678',
    type: 'refund.updated',
    created: event.created + 60,
    livemode: true,
  };
  const first = {
    id: 're_SYNTHETIC_PARTIAL_12345678', amount: 5_000,
    created: event.created + 30, currency: 'cad',
    payment_intent: session.payment_intent, status: 'succeeded',
  };
  const second = { ...first, id: 're_SYNTHETIC_PARTIAL_87654321', amount: 1_000 };
  const firstRecord = await ledger.paidRefundLedgerRecord(refundEvent, first);
  const secondRecord = await ledger.paidRefundLedgerRecord(refundEvent, second);
  assert.equal(firstRecord.refundHash, digest(first.id));
  assert.equal(secondRecord.refundHash, digest(second.id));
  assert.notEqual(firstRecord.refundHash, secondRecord.refundHash);
  assert.equal(firstRecord.paymentIntentHash, digest(session.payment_intent));
  assert.equal(firstRecord.amountCents, 5_000);
  assert.equal(secondRecord.amountCents, 1_000);
});

test('unrelated refund shapes are ledger no-ops and do not block the shared webhook', async () => {
  const refundEvent = {
    id: 'evt_SYNTHETIC_REFUND_NOOP_12345678',
    type: 'refund.created',
    created: event.created + 60,
    livemode: true,
  };
  let rpcCalls = 0;
  const client = { async rpc() { rpcCalls += 1; return { data: true, error: null }; } };
  assert.equal(await ledger.recordPaidRefundLedger(client, refundEvent, {
    id: 're_SYNTHETIC_UNRELATED_12345678', amount: 100,
    created: event.created + 30, currency: 'cad', payment_intent: null, status: 'succeeded',
  }), false);
  assert.equal(rpcCalls, 0);
  assert.equal(await ledger.recordPaidRefundLedger(client, refundEvent, {
    id: 're_SYNTHETIC_UNRELATED_87654321', amount: 100,
    created: event.created + 30, currency: 'usd',
    payment_intent: session.payment_intent, status: 'succeeded',
  }), false);
  assert.equal(rpcCalls, 0);
});

test('pre-ledger refunds are ignored before any RPC and cannot poison a later charge.refunded event', async () => {
  const refundEvent = {
    id: 'evt_SYNTHETIC_LEGACY_REFUND_12345678',
    type: 'charge.refunded',
    created: event.created + 60,
    livemode: true,
  };
  const legacyRefund = {
    id: 're_SYNTHETIC_LEGACY_12345678',
    amount: 5_000,
    created: Math.floor(Date.parse('2025-12-31T23:59:59.000Z') / 1000),
    currency: 'cad',
    payment_intent: session.payment_intent,
    status: 'succeeded',
  };
  let rpcCalls = 0;
  const client = {
    async rpc() {
      rpcCalls += 1;
      return { data: true, error: null };
    },
  };
  assert.equal(await ledger.paidRefundLedgerRecord(refundEvent, legacyRefund), null);
  assert.equal(await ledger.recordPaidRefundLedger(client, refundEvent, legacyRefund), false);
  assert.equal(rpcCalls, 0);
});

test('RPC adapters preserve unsupported no-ops and fail conflicts or uncertain writes', async () => {
  const calls = [];
  const conflict = { async rpc(name, parameters) {
    calls.push({ name, parameters }); return { data: false, error: null };
  } };
  await assert.rejects(ledger.recordPaidPurchaseLedger(conflict, event, session), /ledger write failed/);
  assert.equal(calls[0].name, 'record_paid_payment_purchase');
  assert.equal(Object.values(calls[0].parameters).includes(session.id), false);
  let unsupportedCalls = 0;
  assert.equal(await ledger.recordPaidPurchaseLedger({ async rpc() {
    unsupportedCalls += 1; return { data: true, error: null };
  } }, { ...event, livemode: false }, session), false);
  assert.equal(unsupportedCalls, 0);
  await assert.rejects(
    ledger.recordPaidPurchaseLedger({ async rpc() { return { data: null, error: null }; } }, event, session),
    /ledger write failed/,
  );
});

test('webhook records only after Stripe signature verification and never forwards refunds', async () => {
  const webhook = await fs.readFile(path.join(
    root, 'supabase/functions/idr-payment-webhook/index.ts',
  ), 'utf8');
  const verification = webhook.indexOf('constructEventAsync(');
  const handler = webhook.indexOf('if (event.type.startsWith("refund."))');
  const refundWrite = webhook.indexOf('recordPaidRefundLedger(supabase, event, refund)', handler);
  assert.ok(verification >= 0 && handler > verification && refundWrite > handler);
  assert.match(webhook, /recordChargeRefundLedger\(stripe, supabase, event, charge\)/);
  assert.doesNotMatch(webhook, /enqueue(?:Meta|Google)[A-Za-z]*Refund|event_name:\s*["']Refund["']/);
});

test('aggregate report exposes refund cash facts and leaves net-retained unresolved', async () => {
  const report = await fs.readFile(path.join(
    root, 'supabase/migrations/20260903185000_paid_payment_reporting.sql',
  ), 'utf8');
  assert.match(report, /succeeded_refund_amount_cents/);
  assert.match(report, /multiple_refund_purchase_count/);
  assert.match(report, /purchases_in_window_with_all_succeeded_refunds_known_at_generated_at/);
  assert.match(report, /any_refund_purchase_rate/);
  assert.match(report, /not_classified_by_stripe_webhook/);
  assert.match(report, /gross_customer_cash_including_tax/);
  assert.match(report, /not_measurable_without_qualifying_crown_rejection/);
  assert.doesNotMatch(report, /interval\s+'30 days'[\s\S]*net_retained/i);
});
