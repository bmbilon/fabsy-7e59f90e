import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

export const REFERRAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const REFERRAL_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
const PAYMENT_INTENT_PATTERN = /^pi_[A-Za-z0-9]+$/;
const encoder = new TextEncoder();

export interface ReferralAttribution {
  code: string;
  attributedAt: string;
  expiresAt: string;
  attributionToken: string;
}

export class ReferralRequestError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function normalizeReferralCode(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const code = value.trim().toUpperCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

export function normalizeReferralPlate(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const plate = value.trim().toUpperCase().replace(/[\s-]/g, "");
  return /^[A-Z0-9]{1,20}$/.test(plate) ? plate : null;
}

// An intake declaration only contributes a deny-list identity fingerprint. It
// cannot set the staff-reviewed plate, clear a hold, or mark identity verified.
export async function recordReferralDeclaredPlate(supabase: SupabaseClient, orderId: string, value: unknown): Promise<boolean> {
  const plate = normalizeReferralPlate(value);
  if (!plate) return false;
  const { error } = await supabase.rpc("referral_record_declared_plate", { p_order_id: orderId, p_plate: plate });
  if (error) throw error;
  return true;
}

function secret(): string {
  const value = Deno.env.get("REFERRAL_ATTRIBUTION_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!value || value.length < 24) throw new Error("Referral attribution signing is not configured.");
  return value;
}

function encodeBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid token encoding");
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (character) => character.charCodeAt(0));
}

async function signingKey(value: string) {
  // Domain separation prevents a shared server secret being used to validate a
  // token from another workflow. Verification uses WebCrypto's constant-time MAC.
  return await crypto.subtle.importKey("raw", encoder.encode(`fabsy.referral.attribution.v1:${value}`),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function mintReferralAttribution(code: string, options: { now?: number; secret?: string } = {}): Promise<ReferralAttribution> {
  const normalized = normalizeReferralCode(code);
  if (!normalized) throw new ReferralRequestError("Enter a valid referral code.");
  const now = options.now ?? Date.now();
  const payload = {
    v: 1,
    code: normalized,
    issued: now,
    expires: now + REFERRAL_WINDOW_MS,
    nonce: crypto.randomUUID(),
  };
  const encoded = encodeBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await signingKey(options.secret ?? secret()), encoder.encode(encoded));
  return {
    code: normalized,
    attributedAt: new Date(payload.issued).toISOString(),
    expiresAt: new Date(payload.expires).toISOString(),
    attributionToken: `${encoded}.${encodeBase64Url(new Uint8Array(signature))}`,
  };
}

export async function verifyReferralAttribution(
  input: { refCode?: unknown; refAttributionToken?: unknown },
  options: { now?: number; secret?: string } = {},
): Promise<ReferralAttribution | null> {
  const code = normalizeReferralCode(input.refCode);
  const token = input.refAttributionToken;
  if (!code || typeof token !== "string" || token.length > 1024) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const signingSecret = options.secret ?? secret();
  try {
    const signature = decodeBase64Url(parts[1]);
    if (signature.byteLength !== 32 || !await crypto.subtle.verify("HMAC", await signingKey(signingSecret), signature, encoder.encode(parts[0]))) return null;
    const payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decodeBase64Url(parts[0])));
    const now = options.now ?? Date.now();
    if (payload.v !== 1 || payload.code !== code || !Number.isSafeInteger(payload.issued) || !Number.isSafeInteger(payload.expires) ||
      payload.issued > now + 5000 || payload.expires !== payload.issued + REFERRAL_WINDOW_MS || payload.expires <= now ||
      typeof payload.nonce !== "string" || payload.nonce.length !== 36) return null;
    return { code, attributedAt: new Date(payload.issued).toISOString(), expiresAt: new Date(payload.expires).toISOString(), attributionToken: token };
  } catch {
    return null;
  }
}

export async function attachReferralAttribution(
  supabase: SupabaseClient,
  orderId: string,
  input: { refCode?: unknown; refAttributionToken?: unknown },
): Promise<{ attached: boolean; reason?: string }> {
  if (!input.refCode && !input.refAttributionToken) return { attached: false };
  const attribution = await verifyReferralAttribution(input);
  if (!attribution) return { attached: false, reason: "invalid_or_expired" };
  const { data, error } = await supabase.rpc("attach_referral_to_order", {
    p_order_id: orderId,
    p_code: attribution.code,
    p_attributed_at: attribution.attributedAt,
  });
  if (error) throw error;
  return data === true ? { attached: true } : { attached: false, reason: "not_eligible" };
}

interface StripeBalanceTransaction {
  status?: string;
  available_on?: number;
  amount?: number;
}
interface StripeCharge {
  id?: string;
  payment_intent?: string | { id?: string };
  paid?: boolean;
  captured?: boolean;
  amount_refunded?: number;
  disputed?: boolean;
  balance_transaction?: string | StripeBalanceTransaction | null;
}
export interface ReferralStripePayment {
  id?: string;
  status?: string;
  currency?: string;
  customer?: string | { id?: string } | null;
  latest_charge?: string | StripeCharge | null;
}
export interface ReferralStripeRefundList {
  data?: Array<{ status?: string | null; created?: number }>;
  has_more?: boolean;
}
export interface ReferralPaymentFacts {
  paymentIntentId: string;
  stripeCustomerId: string | null;
  settledAt: string | null;
  refundedAt: string | null;
  disputedAt: string | null;
}

export function deriveReferralPaymentFacts(
  payment: ReferralStripePayment,
  refunds: ReferralStripeRefundList,
  paymentIntentId: string,
  now = Date.now(),
): ReferralPaymentFacts {
  if (!PAYMENT_INTENT_PATTERN.test(paymentIntentId) || payment.id !== paymentIntentId || payment.currency !== "cad") {
    throw new Error("Stripe payment does not match the representation order.");
  }
  const charge = payment.latest_charge && typeof payment.latest_charge === "object" ? payment.latest_charge : null;
  const balance = charge?.balance_transaction && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
  const chargePayment = typeof charge?.payment_intent === "string" ? charge.payment_intent : charge?.payment_intent?.id;
  if (chargePayment && chargePayment !== paymentIntentId) throw new Error("Stripe charge does not match the payment.");
  const refundDates = (refunds.data || []).filter((refund) => refund.status !== "failed" && refund.status !== "canceled")
    .map((refund) => refund.created).filter((value): value is number => typeof value === "number" && value > 0 && value * 1000 <= now);
  const hasRefund = refundDates.length > 0 || Number(charge?.amount_refunded || 0) > 0 || refunds.has_more === true ||
    (refunds.data || []).some((refund) => refund.status !== "failed" && refund.status !== "canceled");
  const availableOn = balance?.available_on;
  const settled = payment.status === "succeeded" && charge?.paid === true && charge.captured === true &&
    balance?.status === "available" && typeof availableOn === "number" && availableOn > 0 && availableOn * 1000 <= now && Number(balance.amount) > 0;
  const customer = typeof payment.customer === "string" ? payment.customer : payment.customer?.id || null;
  if (customer && !/^cus_[A-Za-z0-9]+$/.test(customer)) throw new Error("Invalid Stripe customer reference.");
  return {
    paymentIntentId,
    stripeCustomerId: customer,
    settledAt: settled ? new Date(availableOn! * 1000).toISOString() : null,
    refundedAt: hasRefund ? new Date(refundDates.length ? Math.min(...refundDates) * 1000 : now).toISOString() : null,
    disputedAt: charge?.disputed === true ? new Date(now).toISOString() : null,
  };
}

async function stripeRead(path: string, key: string): Promise<unknown> {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${key}`, "Stripe-Version": "2025-08-27.basil" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    // Never surface the provider response: it can contain payment/contact data.
    await response.body?.cancel();
    throw new ReferralRequestError("Stripe payment verification is unavailable. Refresh again before paying.", 503);
  }
  return await response.json();
}

export async function refreshReferralPayment(supabase: SupabaseClient, orderId: string): Promise<unknown> {
  const { data: order, error } = await supabase.from("ticket_submissions")
    .select("id,referral_payment_intent_id").eq("id", orderId).maybeSingle();
  if (error) throw error;
  if (!order) throw new ReferralRequestError("Referral order not found.", 404);
  if (!order.referral_payment_intent_id) {
    const result = await supabase.rpc("referral_recalculate", { p_order_id: orderId });
    if (result.error) throw result.error;
    return result.data;
  }
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new ReferralRequestError("Stripe payment verification is unavailable. Refresh again before paying.", 503);
  const id = String(order.referral_payment_intent_id);
  if (!PAYMENT_INTENT_PATTERN.test(id)) throw new Error("Invalid stored payment reference.");
  const responses = await Promise.allSettled([
    stripeRead(`payment_intents/${id}?expand%5B%5D=latest_charge.balance_transaction`, key),
    stripeRead(`refunds?payment_intent=${id}&limit=100`, key),
  ]);
  for (const response of responses) if (response.status === "rejected") throw response.reason;
  const payment = (responses[0] as PromiseFulfilledResult<unknown>).value as ReferralStripePayment;
  const refunds = (responses[1] as PromiseFulfilledResult<unknown>).value as ReferralStripeRefundList;
  if (!Array.isArray(refunds.data) || typeof refunds.has_more !== "boolean") throw new Error("Stripe returned an incomplete refund check.");
  const facts = deriveReferralPaymentFacts(payment, refunds, id);
  if (facts.refundedAt || facts.disputedAt) {
    const hold = await supabase.rpc("referral_record_payment_hold", {
      p_payment_intent_id: id,
      p_refunded_at: facts.refundedAt,
      p_disputed_at: facts.disputedAt,
      p_source_event_id: "stripe_refresh",
    });
    if (hold.error) throw hold.error;
  }
  const result = await supabase.rpc("referral_record_payment_check", {
    p_order_id: orderId,
    p_payment_intent_id: id,
    p_settled_at: facts.settledAt,
    p_stripe_customer_id: facts.stripeCustomerId,
  });
  if (result.error) throw result.error;
  return result.data;
}

export async function recordReferralCheckoutPayment(
  supabase: SupabaseClient,
  input: { orderId: string; paymentIntentId: string; stripeCustomerId?: string | null },
): Promise<void> {
  const { error } = await supabase.rpc("referral_record_checkout_payment", {
    p_order_id: input.orderId,
    p_payment_intent_id: input.paymentIntentId,
    p_stripe_customer_id: input.stripeCustomerId || null,
  });
  if (error) throw error;
  // Also captures customer identity for future referrals on orders with no code.
  await refreshReferralPayment(supabase, input.orderId);
}

export async function recordReferralRefund(
  supabase: SupabaseClient,
  input: { paymentIntentId: string; refundedAt?: string | null; disputedAt?: string | null; eventId?: string },
): Promise<void> {
  const { error } = await supabase.rpc("referral_record_payment_hold", {
    p_payment_intent_id: input.paymentIntentId,
    p_refunded_at: input.refundedAt || (input.disputedAt ? null : new Date().toISOString()),
    p_disputed_at: input.disputedAt || null,
    p_source_event_id: input.eventId || null,
  });
  if (error) throw error;
}

export async function clientReferralCode(supabase: SupabaseClient, clientId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("ensure_client_referral_code", { p_client_id: clientId });
  if (error) throw error;
  const code = Array.isArray(data) ? data[0]?.code : data?.code;
  return normalizeReferralCode(code);
}
