import { paidCheckoutSummary, type CheckoutReceipt } from './checkoutReceipt';
import { getMetaConsentChoice, getMetaConsentGrant } from './googleConsent';
import {
  authorizeMeasurementProviderOnVerifiedReceipt,
  markMeasurementTagPending,
  measurementProviderMayLoadInDocument,
  measurementTagMayLoadInDocument,
} from './measurementNavigation';
import { opaqueTransactionId, type PaidPurchaseContext, type PaidPurchaseStorage } from './paidPurchaseMeasurement';
import { publicMeasurementPath } from './googleMeasurement';
import { requestMetaCheckoutAttributionWithdrawal } from './metaCheckoutWithdrawal';
import { uniqueSafeSearchValues } from './acquisitionParameters';

type MetaPixelFunction = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  loaded: boolean;
  version: string;
  push: MetaPixelFunction;
  disablePushState: boolean;
};

declare global {
  interface Window {
    fbq?: MetaPixelFunction;
    _fbq?: MetaPixelFunction;
    fabsyMetaInitialized?: boolean;
    fabsyMeasurementReloadRequested?: boolean;
  }
}

export const META_PIXEL_ID = '2917050565322500';
export const META_MEASUREMENT_READY = 'fabsy:meta-measurement-ready';

interface MetaMeasurementEnvironment {
  PROD?: boolean;
  VITE_META_MEASUREMENT_ENABLED?: string;
  VITE_META_PIXEL_ID?: string;
}

export interface MetaMeasurementConfig {
  pixelId?: string;
}

export interface MetaCheckoutContext {
  consentVersion: 'meta-measurement-v1';
  consentedAt: string;
  fbp?: string;
  fbc?: string;
}

const productionOrigins = new Set(['https://fabsy.ca', 'https://www.fabsy.ca']);
const eligibleOrderTypes = new Set(['rapid_resolution', 'rapid_resolution_bundle']);
const eligiblePurchaseValues: Record<string, ReadonlySet<number>> = {
  rapid_resolution: new Set([158.4, 198]),
  rapid_resolution_bundle: new Set([183.2, 229]),
};
const metaThankYouPath = /^\/(?:en\/|pa\/|tl\/|zh-hans\/|zh-hant\/|ar\/|hi\/|es\/)?thank-you\/?$/;

export function metaMeasurementConfig(env: MetaMeasurementEnvironment, origin: string): MetaMeasurementConfig {
  return env.PROD && env.VITE_META_MEASUREMENT_ENABLED === 'true' &&
      env.VITE_META_PIXEL_ID === META_PIXEL_ID && productionOrigins.has(origin)
    ? { pixelId: env.VITE_META_PIXEL_ID }
    : {};
}

export function currentMetaMeasurementConfig(): MetaMeasurementConfig {
  if (typeof window === 'undefined') return {};
  return metaMeasurementConfig(import.meta.env, window.location.origin);
}

function approvedCookie(name: '_fbp' | '_fbc'): string | undefined {
  try {
    const matches: string[] = [];
    for (const part of document.cookie.split(';')) {
      const separator = part.indexOf('=');
      if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
      matches.push(decodeURIComponent(part.slice(separator + 1).trim()));
    }
    if (matches.length !== 1) return undefined;
    const value = matches[0];
    return value.length <= 255 && /^fb\.[0-9]{1,3}\.[0-9]{10,16}\.[A-Za-z0-9_-]{1,200}$/.test(value)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

/** A deliberately tiny checkout handoff; no location, campaign or form data. */
export function currentMetaCheckoutContext(): MetaCheckoutContext | null {
  if (typeof window === 'undefined' || typeof document === 'undefined' ||
      !currentMetaMeasurementConfig().pixelId) return null;
  const grant = getMetaConsentGrant();
  if (!grant) return null;
  const context: MetaCheckoutContext = {
    consentVersion: 'meta-measurement-v1',
    consentedAt: new Date(grant.savedAt).toISOString(),
  };
  const fbp = approvedCookie('_fbp');
  const fbc = approvedCookie('_fbc');
  if (fbp) context.fbp = fbp;
  if (fbc) context.fbc = fbc;
  return context;
}

function approvedRapidResolutionCampaign(url: URL): boolean {
  const allowedKeys = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid']);
  const values = uniqueSafeSearchValues(url, allowedKeys);
  if (!values) return false;
  if (values.size < 4 || values.size > 6) return false;
  if (values.get('utm_source') !== 'meta' || values.get('utm_medium') !== 'paid_social' ||
      !values.get('utm_campaign') || !values.get('utm_content')) return false;
  return true;
}

/** Meta starts only on the three reviewed ad landings. Receipt access is dynamic. */
export function publicMetaMeasurementUrl(url: URL): boolean {
  if (url.username || url.password || url.hash) return false;
  return url.pathname === '/rapid-resolution' && approvedRapidResolutionCampaign(url);
}

function safeMetaContext(
  href: string,
  referrer: string,
  acceptsUrl: (url: URL) => boolean,
): PaidPurchaseContext | null {
  try {
    const url = new URL(href);
    if (!productionOrigins.has(url.origin) || !acceptsUrl(url)) return null;
    if (referrer) {
      const previous = new URL(referrer);
      if (previous.search || previous.hash || previous.username || previous.password ||
          previous.protocol !== 'https:' ||
          (previous.origin === url.origin
            ? !publicMeasurementPath(previous.pathname)
            : previous.pathname !== '/')) return null;
    }
    return { page_location: `${url.origin}${url.pathname}`, page_referrer: '', page_title: 'Fabsy' };
  } catch {
    return null;
  }
}

export function safeMetaPageContext(href: string, referrer: string): PaidPurchaseContext | null {
  return safeMetaContext(href, referrer, publicMetaMeasurementUrl);
}

function safeMetaReceiptPageContext(href: string, referrer: string): PaidPurchaseContext | null {
  return safeMetaContext(href, referrer, url =>
    !url.username && !url.password && !url.hash && metaThankYouPath.test(url.pathname) &&
    Array.from(url.searchParams).length === 0);
}

export function currentMetaPageContext(): PaidPurchaseContext | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  return safeMetaPageContext(window.location.href, document.referrer) ||
    (measurementProviderMayLoadInDocument('meta', window)
      ? safeMetaReceiptPageContext(window.location.href, document.referrer)
      : null);
}

let configuredPixelId: string | undefined;
let tagLoaded = false;
let lastPageLocation: string | undefined;
let loaderEpoch = 0;
let documentTouched = false;
let activeScript: HTMLScriptElement | null = null;
let installedFbq: MetaPixelFunction | null = null;
let restarting = false;
const reportedPurchases = new Set<string>();

function createMetaQueue(): MetaPixelFunction | null {
  if (window.fbq) return null;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as MetaPixelFunction;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];
  // Prevent the vendor script from observing SPA history and producing events.
  fbq.disablePushState = true;
  window.fbq = fbq;
  if (!window._fbq) window._fbq = fbq;
  return fbq;
}

function validPurchaseParams(params: Record<string, unknown>, eventId?: string): boolean {
  const keys = Object.keys(params).sort();
  const contentIds = params.content_ids;
  const contentId = Array.isArray(contentIds) && contentIds.length === 1 &&
    typeof contentIds[0] === 'string' ? contentIds[0] : '';
  return keys.join(',') === 'content_ids,content_type,currency,num_items,value' &&
    eligibleOrderTypes.has(contentId) && params.content_type === 'product' &&
    params.currency === 'CAD' && params.num_items === 1 && typeof params.value === 'number' &&
    Number.isFinite(params.value) && eligiblePurchaseValues[contentId]?.has(params.value) === true &&
    typeof eventId === 'string' && /^[a-f0-9]{64}$/.test(eventId);
}

/** Only the two reviewed browser events can reach the Pixel queue. */
export function dispatchMetaMeasurement(
  eventName: 'PageView' | 'Purchase',
  params: Record<string, unknown> = {},
  eventId?: string,
): boolean {
  const context = currentMetaPageContext();
  if (!tagLoaded || !context || !configuredPixelId || !window.fabsyMetaInitialized ||
      !window.fbq || restarting || getMetaConsentChoice() !== 'accepted' ||
      !measurementTagMayLoadInDocument(window)) return false;
  if (eventName === 'PageView') {
    if (eventId !== undefined || Object.keys(params).length !== 0) return false;
    window.fbq('trackSingle', configuredPixelId, 'PageView');
    return true;
  }
  if (eventName !== 'Purchase') return false;
  if (!metaThankYouPath.test(new URL(context.page_location).pathname)) return false;
  if (!validPurchaseParams(params, eventId)) return false;
  window.fbq('trackSingle', configuredPixelId, 'Purchase', params, { eventID: eventId });
  return true;
}

export function sendMetaPageView(): void {
  const context = currentMetaPageContext();
  if (!context || lastPageLocation === context.page_location) return;
  if (dispatchMetaMeasurement('PageView')) lastPageLocation = context.page_location;
}

function deleteMetaCookies(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const localePrefixes = ['en', 'pa', 'tl', 'zh-hans', 'zh-hant', 'ar', 'hi', 'es'];
  const paths = new Set(['/', '/rapid-resolution', '/thank-you', '/thank-you/']);
  for (const locale of localePrefixes) {
    paths.add(`/${locale}`);
    paths.add(`/${locale}/`);
    paths.add(`/${locale}/thank-you`);
    paths.add(`/${locale}/thank-you/`);
  }
  const hostname = window.location.hostname;
  const domains: Array<string | undefined> = [undefined, hostname, `.${hostname}`];
  if (hostname === 'fabsy.ca' || hostname.endsWith('.fabsy.ca')) domains.push('fabsy.ca', '.fabsy.ca');
  for (const name of ['_fbp', '_fbc']) {
    for (const path of paths) {
      for (const domain of new Set(domains)) {
        const domainAttribute = domain ? `; Domain=${domain}` : '';
        try {
          document.cookie = `${name}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=${path}${domainAttribute}; Secure; SameSite=Lax`;
        } catch { /* Continue through all first-party path/domain variants. */ }
      }
    }
  }
}

export function stopMetaMeasurementAndReload(): void {
  loaderEpoch += 1;
  tagLoaded = false;
  if (activeScript) {
    activeScript.onload = null;
    activeScript.onerror = null;
    activeScript.remove();
    activeScript = null;
  }
  if (typeof window === 'undefined') return;
  if (!documentTouched) {
    // Expiry, storage loss, malformed state and explicit refusal are all
    // non-consent. Remove old first-party Meta identifiers in every case.
    deleteMetaCookies();
    return;
  }
  if (restarting) return;
  restarting = true;
  try { window.fbq?.('consent', 'revoke'); } catch { /* Retirement continues even if the vendor queue fails. */ }
  deleteMetaCookies();
  if (window.fbq === installedFbq) window.fbq = undefined;
  if (window._fbq === installedFbq) window._fbq = undefined;
  if (!window.fabsyMeasurementReloadRequested) {
    window.fabsyMeasurementReloadRequested = true;
    window.location.reload();
  }
}

export function recheckMetaMeasurementConsent(): void {
  if (getMetaConsentChoice() !== 'accepted') {
    requestMetaCheckoutAttributionWithdrawal();
    stopMetaMeasurementAndReload();
    return;
  }
  initializeMetaMeasurement();
}

/** No init data, automatic events, advanced matching or fallback beacon. */
export function initializeMetaMeasurement(): void {
  const context = currentMetaPageContext();
  const config = currentMetaMeasurementConfig();
  if (typeof window === 'undefined' || typeof document === 'undefined' || restarting ||
      getMetaConsentChoice() !== 'accepted' || !measurementTagMayLoadInDocument(window) ||
      !context || !config.pixelId) return;
  if (window.fabsyMetaInitialized) {
    sendMetaPageView();
    return;
  }
  // Do not attach Fabsy commands to an unknown third-party Pixel instance.
  if (window.fbq || !markMeasurementTagPending('meta', window)) return;
  const fbq = createMetaQueue();
  if (!fbq) return;
  const epoch = ++loaderEpoch;
  documentTouched = true;
  configuredPixelId = config.pixelId;
  installedFbq = fbq;
  fbq('consent', 'grant');
  fbq('set', 'autoConfig', false, config.pixelId);
  fbq('init', config.pixelId);
  window.fabsyMetaInitialized = true;

  const script = document.createElement('script');
  activeScript = script;
  script.id = 'fabsy-meta-pixel';
  script.async = true;
  script.referrerPolicy = 'no-referrer';
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  script.onload = () => {
    if (epoch !== loaderEpoch || restarting || getMetaConsentChoice() !== 'accepted' ||
        !measurementTagMayLoadInDocument(window) || !currentMetaPageContext()) return;
    tagLoaded = true;
    sendMetaPageView();
    window.dispatchEvent(new Event(META_MEASUREMENT_READY));
  };
  script.onerror = () => {
    if (epoch !== loaderEpoch) return;
    loaderEpoch += 1;
    tagLoaded = false;
    window.fabsyMetaInitialized = false;
    activeScript = null;
    if (window.fbq === fbq) window.fbq = undefined;
    if (window._fbq === fbq) window._fbq = undefined;
    installedFbq = null;
    script.remove();
  };
  document.head.appendChild(script);
}

/** Queue only a server-verified live purchase on the scrubbed receipt page. */
export async function reportMetaPurchase(
  receipt: CheckoutReceipt | null | undefined,
  expectedSessionId: string | null | undefined,
  storage?: PaidPurchaseStorage,
): Promise<string | null> {
  const context = typeof window === 'undefined' || typeof document === 'undefined'
    ? null
    : safeMetaReceiptPageContext(window.location.href, document.referrer);
  const config = currentMetaMeasurementConfig();
  if (!context || !metaThankYouPath.test(new URL(context.page_location).pathname) || !config.pixelId ||
      !receipt || typeof expectedSessionId !== 'string' ||
      !/^cs_live_[A-Za-z0-9]+$/.test(expectedSessionId) || /\s/.test(expectedSessionId) ||
      receipt.id !== expectedSessionId ||
      (receipt as CheckoutReceipt & { livemode?: unknown }).livemode === false) return null;
  const paid = paidCheckoutSummary(receipt);
  if (!paid || !eligibleOrderTypes.has(paid.orderType)) return null;
  if (!authorizeMeasurementProviderOnVerifiedReceipt('meta', window)) return null;
  initializeMetaMeasurement();
  const eventId = await opaqueTransactionId(expectedSessionId);
  if (!eventId) return null;
  const key = `fabsy-paid-purchase:v2:meta-${config.pixelId}:${eventId}`;
  if (reportedPurchases.has(key)) return null;
  try {
    if (storage?.getItem(key) === '1') {
      reportedPurchases.add(key);
      return null;
    }
  } catch { /* Browser storage is optional. */ }
  const queued = dispatchMetaMeasurement('Purchase', {
    value: paid.serviceValue,
    currency: 'CAD',
    content_type: 'product',
    content_ids: [paid.orderType],
    num_items: 1,
  }, eventId);
  if (!queued) return null;
  reportedPurchases.add(key);
  try { storage?.setItem(key, '1'); } catch { /* Memory still prevents duplicate dispatch. */ }
  return eventId;
}
