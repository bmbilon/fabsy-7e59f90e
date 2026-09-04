import { currentMetaPurchaseFromSignedCheckout } from './meta-purchase.ts';
import { PHOTO_RADAR_PRODUCT, validatePhotoRadarPaidSession } from './photo-radar.ts';

export type PaidFunnelProduct = 'rapid_resolution' | 'rapid_resolution_bundle' | 'photo_radar';

export interface PaidFunnelCheckoutContext {
  consentVersion: 'fabsy-funnel-v1';
  consentedAt: string;
  sessionId: string;
}

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIVE_CHECKOUT_PATTERN = /^cs_live_[A-Za-z0-9_]{8,240}$/;
const CONTEXT_KEYS = new Set(['consentVersion', 'consentedAt', 'sessionId']);

export function parsePaidFunnelCheckoutContext(
  value: unknown,
  now = Date.now(),
): PaidFunnelCheckoutContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !CONTEXT_KEYS.has(key)) ||
      record.consentVersion !== 'fabsy-funnel-v1' ||
      typeof record.sessionId !== 'string' || !UUID_V4_PATTERN.test(record.sessionId) ||
      typeof record.consentedAt !== 'string' || record.consentedAt.length > 60) return null;
  const consentedAt = Date.parse(record.consentedAt);
  if (!Number.isFinite(consentedAt) || consentedAt > now + 5 * 60 * 1000 ||
      consentedAt < now - 180 * 24 * 60 * 60 * 1000) return null;
  return {
    consentVersion: 'fabsy-funnel-v1',
    consentedAt: new Date(consentedAt).toISOString(),
    sessionId: record.sessionId,
  };
}

interface SignedEvent {
  type: unknown;
  created: unknown;
  livemode: unknown;
}

interface SignedSession {
  id: unknown;
  livemode: unknown;
  mode: string | null;
  payment_status: string;
  status?: unknown;
  currency: string | null;
  amount_subtotal: number | null;
  amount_total: number | null;
  client_reference_id: string | null;
  total_details?: {
    amount_discount?: number | null;
    amount_tax?: number | null;
    amount_shipping?: number | null;
  } | null;
  metadata: Record<string, string> | null;
}

/**
 * Fail-closed product projection for a Stripe-signature-verified event. This
 * does not trust a browser purchase event or a caller-supplied product label.
 */
export function paidFunnelProductFromSignedCheckout(
  event: SignedEvent,
  session: SignedSession,
): PaidFunnelProduct | null {
  if ((event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') ||
      event.livemode !== true || session.livemode !== true ||
      typeof session.id !== 'string' || !LIVE_CHECKOUT_PATTERN.test(session.id) ||
      session.mode !== 'payment' || session.payment_status !== 'paid' || session.status !== 'complete' ||
      session.currency !== 'cad' || !Number.isSafeInteger(event.created) || Number(event.created) < 1) return null;

  const rapidResolution = currentMetaPurchaseFromSignedCheckout(event, session);
  if (rapidResolution?.contentId === 'rapid_resolution' || rapidResolution?.contentId === 'rapid_resolution_bundle') {
    return rapidResolution.contentId;
  }

  try {
    validatePhotoRadarPaidSession(session);
    if (session.metadata?.fabsy_pricing_version !== PHOTO_RADAR_PRODUCT.pricingVersion) return null;
    return 'photo_radar';
  } catch {
    return null;
  }
}
