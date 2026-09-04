export const FUNNEL_EVENT_NAMES = [
  'landing_view',
  'primary_cta_click',
  'phone_click',
  'intake_started',
  'ticket_uploaded',
  'lead_saved',
  'intake_step_completed',
  'checkout_started',
  'checkout_canceled',
  'purchase',
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number];
export type FunnelPageKey = 'rapid_resolution' | 'intake' | 'payment_canceled' | 'thank_you';
export type FunnelActionPosition = 'hero' | 'header' | 'sticky' | 'section' | 'footer';

export interface ParsedFunnelEvent {
  eventId: string;
  sessionId: string;
  eventName: FunnelEventName;
  occurredAt: string;
  pageKey: FunnelPageKey;
  consentVersion: 'fabsy-funnel-v1';
  consentedAt: string;
  step: number | null;
  product: 'rapid_resolution' | 'rapid_resolution_bundle' | 'photo_radar' | null;
  position: FunnelActionPosition | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  clickIdKind: 'gclid' | 'gbraid' | 'wbraid' | 'fbclid' | null;
  clickIdValue: string | null;
}

export class FunnelRequestError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeUtmPattern = /^[A-Za-z0-9._~-]{1,250}$/;
const clickIdPattern = /^[A-Za-z0-9_-]{1,512}$/;
const pageKeys = new Set<FunnelPageKey>(['rapid_resolution', 'intake', 'payment_canceled', 'thank_you']);
const productKeys = new Set(['rapid_resolution', 'rapid_resolution_bundle', 'photo_radar']);
const clickIdKinds = new Set(['gclid', 'gbraid', 'wbraid', 'fbclid']);
const actionPositions = new Set<FunnelActionPosition>(['hero', 'header', 'sticky', 'section', 'footer']);
const topLevelKeys = new Set([
  'eventId', 'sessionId', 'eventName', 'occurredAt', 'pageKey', 'consentVersion',
  'consentedAt', 'step', 'product', 'position', 'attribution', 'clickId',
]);
const attributionKeys = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']);

function objectValue(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new FunnelRequestError(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, code: string): void {
  if (Object.keys(value).some(key => !allowed.has(key))) throw new FunnelRequestError(code);
}

function timestamp(value: unknown, code: string): { iso: string; milliseconds: number } {
  if (typeof value !== 'string' || value.length > 60) throw new FunnelRequestError(code);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new FunnelRequestError(code);
  return { iso: new Date(milliseconds).toISOString(), milliseconds };
}

function optionalUtm(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !safeUtmPattern.test(value) || /\s/.test(value)) {
    throw new FunnelRequestError('attribution_invalid');
  }
  return value;
}

function eventMatchesPage(eventName: FunnelEventName, pageKey: FunnelPageKey): boolean {
  if (['landing_view', 'primary_cta_click', 'phone_click'].includes(eventName)) return pageKey === 'rapid_resolution';
  if (['intake_started', 'ticket_uploaded', 'lead_saved', 'intake_step_completed', 'checkout_started'].includes(eventName)) {
    return pageKey === 'intake';
  }
  if (eventName === 'checkout_canceled') return pageKey === 'payment_canceled';
  return eventName === 'purchase' && pageKey === 'thank_you';
}

export function parseFunnelEventRequest(value: unknown, now = Date.now()): ParsedFunnelEvent {
  const body = objectValue(value, 'body_invalid');
  exactKeys(body, topLevelKeys, 'body_fields_invalid');
  if (typeof body.eventId !== 'string' || !uuidPattern.test(body.eventId) ||
      typeof body.sessionId !== 'string' || !uuidPattern.test(body.sessionId)) {
    throw new FunnelRequestError('identifier_invalid');
  }
  if (typeof body.eventName !== 'string' || !FUNNEL_EVENT_NAMES.includes(body.eventName as FunnelEventName)) {
    throw new FunnelRequestError('event_invalid');
  }
  if (typeof body.pageKey !== 'string' || !pageKeys.has(body.pageKey as FunnelPageKey)) {
    throw new FunnelRequestError('page_invalid');
  }
  const eventName = body.eventName as FunnelEventName;
  const pageKey = body.pageKey as FunnelPageKey;
  if (eventName === 'purchase') throw new FunnelRequestError('purchase_requires_verified_webhook');
  if (!eventMatchesPage(eventName, pageKey)) throw new FunnelRequestError('event_page_invalid');
  if (body.consentVersion !== 'fabsy-funnel-v1') throw new FunnelRequestError('consent_invalid');
  const occurred = timestamp(body.occurredAt, 'occurred_at_invalid');
  const consented = timestamp(body.consentedAt, 'consented_at_invalid');
  if (occurred.milliseconds < now - 24 * 60 * 60 * 1000 || occurred.milliseconds > now + 5 * 60 * 1000) {
    throw new FunnelRequestError('occurred_at_invalid');
  }
  if (consented.milliseconds < now - 180 * 24 * 60 * 60 * 1000 ||
      consented.milliseconds > occurred.milliseconds + 5 * 60 * 1000) {
    throw new FunnelRequestError('consented_at_invalid');
  }
  const step = body.step === undefined ? null : body.step;
  if (eventName === 'intake_step_completed') {
    if (!Number.isInteger(step) || (step as number) < 1 || (step as number) > 6) {
      throw new FunnelRequestError('step_invalid');
    }
  } else if (step !== null) throw new FunnelRequestError('step_invalid');
  const product = body.product === undefined ? null : body.product;
  if (product !== null) throw new FunnelRequestError('product_invalid');
  const position = body.position === undefined ? null : body.position;
  if (position !== null && (typeof position !== 'string' || !actionPositions.has(position as FunnelActionPosition) ||
      (eventName !== 'primary_cta_click' && eventName !== 'phone_click'))) {
    throw new FunnelRequestError('position_invalid');
  }

  const attribution = body.attribution === undefined
    ? {}
    : objectValue(body.attribution, 'attribution_invalid');
  exactKeys(attribution, attributionKeys, 'attribution_invalid');
  const clickId = body.clickId === undefined ? null : objectValue(body.clickId, 'click_id_invalid');
  if (clickId) {
    exactKeys(clickId, new Set(['kind', 'value']), 'click_id_invalid');
    if (typeof clickId.kind !== 'string' || !clickIdKinds.has(clickId.kind) ||
        typeof clickId.value !== 'string' || !clickIdPattern.test(clickId.value) || /\s/.test(clickId.value)) {
      throw new FunnelRequestError('click_id_invalid');
    }
  }

  return {
    eventId: body.eventId,
    sessionId: body.sessionId,
    eventName,
    occurredAt: occurred.iso,
    pageKey,
    consentVersion: 'fabsy-funnel-v1',
    consentedAt: consented.iso,
    step: step as number | null,
    product: product as ParsedFunnelEvent['product'],
    position: position as FunnelActionPosition | null,
    utmSource: optionalUtm(attribution.utm_source),
    utmMedium: optionalUtm(attribution.utm_medium),
    utmCampaign: optionalUtm(attribution.utm_campaign),
    utmTerm: optionalUtm(attribution.utm_term),
    utmContent: optionalUtm(attribution.utm_content),
    clickIdKind: (clickId?.kind as ParsedFunnelEvent['clickIdKind']) ?? null,
    clickIdValue: (clickId?.value as string | undefined) ?? null,
  };
}
