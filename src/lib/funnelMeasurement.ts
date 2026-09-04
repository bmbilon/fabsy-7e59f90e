import { getFabsyFunnelConsentGrant } from './fabsyFunnelConsent';
import {
  FUNNEL_EVENT_DEDUPE_PREFIX,
  FUNNEL_SESSION_STORAGE_KEY,
} from './funnelSessionStorage';
import { readMarketingAttribution } from './marketingAttribution';

export {
  FUNNEL_EVENT_DEDUPE_PREFIX,
  FUNNEL_SESSION_STORAGE_KEY,
} from './funnelSessionStorage';

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

interface FunnelMeasurementEnvironment {
  PROD?: boolean;
  VITE_FABSY_FUNNEL_MEASUREMENT_ENABLED?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

export interface FunnelEventOptions {
  step?: number;
  position?: FunnelActionPosition;
  dedupeKey?: string;
}

export interface FunnelCheckoutContext {
  consentVersion: 'fabsy-funnel-v1';
  consentedAt: string;
  sessionId: string;
}

interface FunnelEventPayload {
  eventId: string;
  sessionId: string;
  eventName: FunnelEventName;
  occurredAt: string;
  pageKey: FunnelPageKey;
  consentVersion: 'fabsy-funnel-v1';
  consentedAt: string;
  step?: number;
  position?: FunnelActionPosition;
  attribution?: Record<string, string>;
  clickId?: { kind: 'gclid' | 'gbraid' | 'wbraid' | 'fbclid'; value: string };
}

const productionOrigins = new Set(['https://fabsy.ca', 'https://www.fabsy.ca']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const inFlight = new Set<string>();

function endpointConfiguration(env: FunnelMeasurementEnvironment): { url: string; publishableKey: string } | null {
  const configuredBase = env.VITE_SUPABASE_URL?.trim();
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!configuredBase || !publishableKey) return null;
  const base = configuredBase.replace(/\/$/, '');
  try {
    const url = new URL(`${base}/functions/v1/record-funnel-event`);
    if (url.protocol !== 'https:' || url.username || url.password || !publishableKey || /\s/.test(publishableKey)) return null;
    return { url: url.href, publishableKey };
  } catch {
    return null;
  }
}

async function sendPayload(payload: FunnelEventPayload): Promise<boolean> {
  const config = endpointConfiguration(import.meta.env);
  if (!config) return false;
  try {
    const response = await window.fetch(config.url, {
      method: 'POST',
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${config.publishableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'omit',
      keepalive: true,
      referrerPolicy: 'no-referrer',
    });
    if (response.status !== 202) return false;
    const data = await response.json().catch(() => null) as { accepted?: unknown } | null;
    return data?.accepted === true;
  } catch {
    return false;
  }
}

export function funnelMeasurementEnabled(
  env: FunnelMeasurementEnvironment,
  origin: string,
): boolean {
  return env.PROD === true && env.VITE_FABSY_FUNNEL_MEASUREMENT_ENABLED !== 'false' &&
    productionOrigins.has(origin);
}

export function funnelPageKey(pathname: string): FunnelPageKey | null {
  const base = pathname
    .replace(/^\/(?:en|pa|tl|zh-hans|zh-hant|ar|es|hi)(?=\/|$)/, '')
    .replace(/\/$/, '') || '/';
  if (base === '/rapid-resolution') return 'rapid_resolution';
  if (base === '/submit-ticket' || base === '/ticket-form') return 'intake';
  if (base === '/payment-canceled') return 'payment_canceled';
  if (base === '/thank-you') return 'thank_you';
  return null;
}

function randomUuid(): string | null {
  try {
    const value = crypto.randomUUID();
    return uuidPattern.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function currentFunnelSessionId(storage: Storage = window.sessionStorage): string | null {
  const grant = getFabsyFunnelConsentGrant();
  if (!grant) return null;
  try {
    const existing = storage.getItem(FUNNEL_SESSION_STORAGE_KEY);
    if (existing && uuidPattern.test(existing)) return existing;
    const created = randomUuid();
    if (!created) return null;
    storage.setItem(FUNNEL_SESSION_STORAGE_KEY, created);
    return storage.getItem(FUNNEL_SESSION_STORAGE_KEY) === created ? created : null;
  } catch {
    return null;
  }
}

/**
 * Minimal, PII-free handoff used to correlate a consented browser journey with
 * a server-verified Stripe purchase. The raw Stripe session and form contents
 * never enter the funnel event store.
 */
export function currentFunnelCheckoutContext(): FunnelCheckoutContext | null {
  if (typeof window === 'undefined') return null;
  const grant = getFabsyFunnelConsentGrant();
  const sessionId = grant ? currentFunnelSessionId() : null;
  if (!grant || !sessionId) return null;
  return {
    consentVersion: 'fabsy-funnel-v1',
    consentedAt: new Date(new Date(grant.savedAt).setUTCHours(0, 0, 0, 0)).toISOString(),
    sessionId,
  };
}

function safeAttribution(): Pick<FunnelEventPayload, 'attribution' | 'clickId'> {
  const source = readMarketingAttribution();
  const attribution: Record<string, string> = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const) {
    const value = source[key];
    if (value) attribution[key] = value;
  }
  for (const kind of ['fbclid', 'gclid', 'gbraid', 'wbraid'] as const) {
    const value = source[kind];
    if (value) return {
      ...(Object.keys(attribution).length ? { attribution } : {}),
      clickId: { kind, value },
    };
  }
  return Object.keys(attribution).length ? { attribution } : {};
}

function validStep(eventName: FunnelEventName, step: number | undefined): boolean {
  if (eventName !== 'intake_step_completed') return step === undefined;
  return Number.isInteger(step) && step! >= 1 && step! <= 6;
}

function validPosition(eventName: FunnelEventName, position: FunnelActionPosition | undefined): boolean {
  if (position === undefined) return true;
  return (eventName === 'primary_cta_click' || eventName === 'phone_click') &&
    ['hero', 'header', 'sticky', 'section', 'footer'].includes(position);
}

function validEventPage(eventName: FunnelEventName, pageKey: FunnelPageKey): boolean {
  if (['landing_view', 'primary_cta_click', 'phone_click'].includes(eventName)) {
    return pageKey === 'rapid_resolution';
  }
  if (['intake_started', 'ticket_uploaded', 'lead_saved', 'intake_step_completed', 'checkout_started'].includes(eventName)) {
    return pageKey === 'intake';
  }
  if (eventName === 'checkout_canceled') return pageKey === 'payment_canceled';
  return eventName === 'purchase' && pageKey === 'thank_you';
}

export async function recordFunnelEvent(
  eventName: FunnelEventName,
  options: FunnelEventOptions = {},
): Promise<boolean> {
  if (typeof window === 'undefined' || typeof crypto === 'undefined' ||
      !funnelMeasurementEnabled(import.meta.env, window.location.origin)) return false;
  const grant = getFabsyFunnelConsentGrant();
  const pageKey = funnelPageKey(window.location.pathname);
  // Purchases are accepted only from the signed Stripe webhook. A public
  // browser must never be able to assert revenue into the admin report.
  if (!grant || !pageKey || eventName === 'purchase' || !FUNNEL_EVENT_NAMES.includes(eventName) ||
      !validStep(eventName, options.step) || !validPosition(eventName, options.position) ||
      !validEventPage(eventName, pageKey)) return false;
  const sessionId = currentFunnelSessionId();
  const eventId = randomUuid();
  if (!sessionId || !eventId) return false;
  const dedupeKey = options.dedupeKey?.replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 100);
  const storageKey = dedupeKey ? `${FUNNEL_EVENT_DEDUPE_PREFIX}${dedupeKey}` : null;
  if (storageKey) {
    try { if (window.sessionStorage.getItem(storageKey) === '1') return true; } catch { /* Memory still deduplicates in-flight. */ }
    if (inFlight.has(storageKey)) return true;
    inFlight.add(storageKey);
  }
  const payload: FunnelEventPayload = {
    eventId,
    sessionId,
    eventName,
    occurredAt: new Date().toISOString(),
    pageKey,
    consentVersion: 'fabsy-funnel-v1',
    consentedAt: new Date(new Date(grant.savedAt).setUTCHours(0, 0, 0, 0)).toISOString(),
    ...safeAttribution(),
    ...(options.step === undefined ? {} : { step: options.step }),
    ...(options.position ? { position: options.position } : {}),
  };
  try {
    if (!await sendPayload(payload)) return false;
    if (storageKey) {
      const currentGrant = getFabsyFunnelConsentGrant();
      if (!currentGrant || currentGrant.savedAt !== grant.savedAt) return false;
      try {
        if (window.sessionStorage.getItem(FUNNEL_SESSION_STORAGE_KEY) !== sessionId) return false;
        window.sessionStorage.setItem(storageKey, '1');
      } catch { /* Server idempotency remains authoritative; no unverified marker is written. */ }
    }
    return true;
  } catch {
    return false;
  } finally {
    if (storageKey) inFlight.delete(storageKey);
  }
}
