import { paidFunnelProductFromSignedCheckout, type PaidFunnelProduct } from './funnel-checkout.ts';

const CHECKOUT_PATTERN = /^cs_live_[A-Za-z0-9_]{8,240}$/;
const PAYMENT_INTENT_PATTERN = /^pi_[A-Za-z0-9_]{8,240}$/;
const REFUND_PATTERN = /^re_[A-Za-z0-9_]{8,240}$/;
const EVENT_PATTERN = /^evt_[A-Za-z0-9_]{8,240}$/;
const CURRENCY_PATTERN = /^[a-z]{3}$/;
const REFUND_STATUSES = new Set(['pending', 'requires_action', 'succeeded', 'failed', 'canceled']);
const encoder = new TextEncoder();

export interface PaidPaymentRpcClient {
  rpc(
    functionName: string,
    parameters: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown | null }>;
}

interface SignedStripeEvent {
  id: unknown;
  type: unknown;
  created: unknown;
  livemode: unknown;
}

interface PaidCheckoutSession {
  id: unknown;
  livemode: unknown;
  mode: string | null;
  payment_status: string;
  status?: unknown;
  amount_subtotal: number | null;
  amount_total: number | null;
  currency: string | null;
  payment_intent?: string | { id?: string } | null;
  total_details?: {
    amount_tax?: number | null;
    amount_shipping?: number | null;
  } | null;
  client_reference_id: string | null;
  metadata: Record<string, string> | null;
}

interface StripeRefundLike {
  id: unknown;
  amount: unknown;
  created: unknown;
  currency: unknown;
  payment_intent?: string | { id?: string } | null;
  status?: unknown;
}

export interface PaidPurchaseLedgerRecord {
  checkoutSessionHash: string;
  paymentIntentHash: string;
  stripeEventHash: string;
  occurredAt: string;
  product: PaidFunnelProduct;
  amountCents: number;
  taxCents: number;
  currency: string;
}

export interface PaidRefundLedgerRecord {
  refundHash: string;
  paymentIntentHash: string;
  stripeEventHash: string;
  occurredAt: string;
  statusObservedAt: string;
  amountCents: number;
  currency: string;
  status: 'pending' | 'requires_action' | 'succeeded' | 'failed' | 'canceled';
}

function stripeId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value) &&
      typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id;
  }
  return null;
}

function safeEpochSeconds(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function safeCents(value: unknown, allowZero = false): number | null {
  return Number.isSafeInteger(value) && Number(value) >= (allowZero ? 0 : 1) && Number(value) <= 100_000_000
    ? Number(value)
    : null;
}

export async function sha256StripeIdentifier(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Projects an already Stripe-signature-verified, live Checkout event into a
 * PII-free ledger row. This helper is called only by idr-payment-webhook.
 */
export async function paidPurchaseLedgerRecord(
  event: SignedStripeEvent,
  session: PaidCheckoutSession,
): Promise<PaidPurchaseLedgerRecord | null> {
  const product = paidFunnelProductFromSignedCheckout(event, session);
  const paymentIntentId = stripeId(session.payment_intent);
  const occurred = safeEpochSeconds(event.created);
  const amountCents = safeCents(session.amount_total);
  const taxCents = safeCents(session.total_details?.amount_tax ?? 0, true);
  if (!product || event.livemode !== true || session.livemode !== true ||
      typeof event.id !== 'string' || !EVENT_PATTERN.test(event.id) ||
      typeof session.id !== 'string' || !CHECKOUT_PATTERN.test(session.id) ||
      !paymentIntentId || !PAYMENT_INTENT_PATTERN.test(paymentIntentId) ||
      !occurred || amountCents === null || taxCents === null || taxCents > amountCents ||
      typeof session.currency !== 'string' || !CURRENCY_PATTERN.test(session.currency)) return null;
  return {
    checkoutSessionHash: await sha256StripeIdentifier(session.id),
    paymentIntentHash: await sha256StripeIdentifier(paymentIntentId),
    stripeEventHash: await sha256StripeIdentifier(event.id),
    occurredAt: new Date(occurred * 1000).toISOString(),
    product,
    amountCents,
    taxCents,
    currency: session.currency,
  };
}

/**
 * Projects Stripe's current Refund object after a verified refund/charge
 * webhook. Partial refunds remain distinct because each Refund id is hashed.
 */
export async function paidRefundLedgerRecord(
  event: SignedStripeEvent,
  refund: StripeRefundLike,
): Promise<PaidRefundLedgerRecord | null> {
  const paymentIntentId = stripeId(refund.payment_intent);
  const refundCreated = safeEpochSeconds(refund.created);
  const statusObserved = safeEpochSeconds(event.created);
  const amountCents = safeCents(refund.amount);
  if (event.livemode !== true ||
      (typeof event.type !== 'string' ||
        (!event.type.startsWith('refund.') && event.type !== 'charge.refunded')) ||
      typeof event.id !== 'string' || !EVENT_PATTERN.test(event.id) ||
      typeof refund.id !== 'string' || !REFUND_PATTERN.test(refund.id) ||
      !paymentIntentId || !PAYMENT_INTENT_PATTERN.test(paymentIntentId) ||
      !refundCreated || !statusObserved || amountCents === null ||
      refund.currency !== 'cad' || !CURRENCY_PATTERN.test(refund.currency) ||
      typeof refund.status !== 'string' || !REFUND_STATUSES.has(refund.status)) return null;
  return {
    refundHash: await sha256StripeIdentifier(refund.id),
    paymentIntentHash: await sha256StripeIdentifier(paymentIntentId),
    stripeEventHash: await sha256StripeIdentifier(event.id),
    occurredAt: new Date(refundCreated * 1000).toISOString(),
    statusObservedAt: new Date(statusObserved * 1000).toISOString(),
    amountCents,
    currency: refund.currency,
    status: refund.status as PaidRefundLedgerRecord['status'],
  };
}

export async function recordPaidPurchaseLedger(
  client: PaidPaymentRpcClient,
  event: SignedStripeEvent,
  session: PaidCheckoutSession,
): Promise<boolean> {
  const record = await paidPurchaseLedgerRecord(event, session);
  if (!record) return false;
  const { data, error } = await client.rpc('record_paid_payment_purchase', {
    p_checkout_session_hash: record.checkoutSessionHash,
    p_payment_intent_hash: record.paymentIntentHash,
    p_stripe_event_hash: record.stripeEventHash,
    p_occurred_at: record.occurredAt,
    p_product: record.product,
    p_amount_cents: record.amountCents,
    p_tax_cents: record.taxCents,
    p_currency: record.currency,
  });
  if (error || data !== true) throw new Error('Paid purchase ledger write failed.');
  return true;
}

export async function recordPaidRefundLedger(
  client: PaidPaymentRpcClient,
  event: SignedStripeEvent,
  refund: StripeRefundLike,
): Promise<boolean> {
  const record = await paidRefundLedgerRecord(event, refund);
  // This is a shared Stripe endpoint. Refunds without the minimum immutable
  // ledger fields are unrelated/legacy no-ops and must not block existing
  // fulfillment or Pro/referral reconciliation.
  if (!record) return false;
  const { data, error } = await client.rpc('record_paid_payment_refund', {
    p_refund_hash: record.refundHash,
    p_payment_intent_hash: record.paymentIntentHash,
    p_stripe_event_hash: record.stripeEventHash,
    p_occurred_at: record.occurredAt,
    p_status_observed_at: record.statusObservedAt,
    p_amount_cents: record.amountCents,
    p_currency: record.currency,
    p_status: record.status,
  });
  if (error || data !== true) throw new Error('Paid refund ledger write failed.');
  return true;
}
