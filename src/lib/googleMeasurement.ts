import type { PaidPurchaseConfig, PaidPurchaseContext } from './paidPurchaseMeasurement';
import { purchaseAdsDestination } from './checkoutReceipt';
import { getGoogleConsentChoice } from './googleConsent';
import {
  googleTagMayLoadInDocument, markGoogleTagPending, scrubCheckoutReceiptUrl,
} from './measurementNavigation';
import { CLICK_ID_KEYS, UTM_KEYS, uniqueSafeSearchValues } from './acquisitionParameters';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fabsyAnalyticsInitialized?: boolean;
    fabsyMeasurementReloadRequested?: boolean;
  }
}

export const GOOGLE_MEASUREMENT_READY = 'fabsy:google-measurement-ready';
export const GOOGLE_CONTEXT_READY = 'fabsy:google-context-ready';

interface MeasurementEnvironment {
  PROD?: boolean;
  VITE_GOOGLE_MEASUREMENT_ENABLED?: string;
  VITE_GA4_MEASUREMENT_ID?: string;
  VITE_GADS_ID?: string;
  VITE_GADS_PURCHASE_LABEL?: string;
  VITE_GADS_PHOTO_RADAR_PURCHASE_LABEL?: string;
}

// The deployment gate and exact production origins are necessary, but never
// sufficient: a visitor's explicit consent and a safe document are also needed.
export function googleMeasurementConfig(env: MeasurementEnvironment, origin: string): PaidPurchaseConfig {
  if (!env.PROD || env.VITE_GOOGLE_MEASUREMENT_ENABLED !== 'true' ||
      !['https://fabsy.ca', 'https://www.fabsy.ca'].includes(origin)) return {};
  const ga4Id = env.VITE_GA4_MEASUREMENT_ID || 'G-26G8CMWTKY';
  return {
    ga4Id: /^G-[A-Z0-9]+$/.test(ga4Id) && !/\s/.test(ga4Id) ? ga4Id : undefined,
    adsId: /^AW-\d+$/.test(env.VITE_GADS_ID || '') && !/\s/.test(env.VITE_GADS_ID || '') ? env.VITE_GADS_ID : undefined,
    rrLabel: env.VITE_GADS_PURCHASE_LABEL,
    photoLabel: env.VITE_GADS_PHOTO_RADAR_PURCHASE_LABEL,
  };
}

export function currentGoogleMeasurementConfig(): PaidPurchaseConfig {
  if (typeof window === 'undefined') return {};
  return googleMeasurementConfig(import.meta.env, window.location.origin);
}

const publicPaths = new Set([
  '/', '/rapid-resolution', '/photo-radar', '/pro-drivers', '/refer',
  '/how-it-works', '/about', '/about/comparison', '/services', '/testimonials',
  '/faq', '/founder', '/ai-info', '/privacy-policy', '/terms-of-service',
  '/terms-of-purchase', '/insurance-damage-report', '/blog', '/thank-you',
  '/hubs/alberta-tickets-101', '/hubs/photo-radar-vs-officer-issued',
  '/hubs/demerits-and-insurance', '/hubs/court-options-and-deadlines',
  '/hubs/city-specific-quirks',
]);

export function publicMeasurementPath(pathname: string): string | null {
  // Unknown paths and private IDs, including localized variants, stay out.
  const path = pathname.replace(/\/$/, '') || '/';
  const base = path.replace(/^\/(?:en|pa|tl|zh-hans|zh-hant|ar|es|hi)(?=\/|$)/, '') || '/';
  return publicPaths.has(base) ? path : null;
}

function hasOnlyApprovedAcquisitionParameters(url: URL): boolean {
  if (url.hash) return false;
  const basePath = url.pathname
    .replace(/^\/(?:en|pa|tl|zh-hans|zh-hant|ar|es|hi)(?=\/|$)/, '')
    .replace(/\/$/, '') || '/';
  const paidLanding = basePath === '/rapid-resolution';
  const allowed = new Set<string>([
    ...CLICK_ID_KEYS.filter(key => paidLanding || key !== 'fbclid'),
    ...(paidLanding ? UTM_KEYS : []),
  ]);
  return uniqueSafeSearchValues(url, allowed) !== null;
}

/** Router classification only; destination/origin and referrer gates stay separate. */
export function publicGoogleMeasurementUrl(url: URL): boolean {
  return Boolean(publicMeasurementPath(url.pathname)) && !url.username && !url.password && hasOnlyApprovedAcquisitionParameters(url);
}

export function safeGooglePageContext(href: string, referrer: string): PaidPurchaseContext | null {
  try {
    const url = new URL(href);
    const path = publicMeasurementPath(url.pathname);
    if (!path || !['https://fabsy.ca', 'https://www.fabsy.ca'].includes(url.origin) ||
        !publicGoogleMeasurementUrl(url)) return null;
    // Ads does not document a complete immutable-referrer override. Do not
    // initialize in a document whose actual referrer may contain private data.
    if (referrer) {
      const previous = new URL(referrer);
      if (previous.search || previous.hash || previous.username || previous.password ||
          previous.protocol !== 'https:' ||
          (previous.origin === url.origin
            ? !publicMeasurementPath(previous.pathname)
            : previous.pathname !== '/')) return null;
    }
    return { page_location: `${url.origin}${path}`, page_referrer: '', page_title: 'Fabsy' };
  } catch {
    return null;
  }
}

export function currentGooglePageContext(): PaidPurchaseContext | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  return safeGooglePageContext(window.location.href, document.referrer);
}

/** Call only after the receipt component has retained its session ID in memory. */
export function removeCheckoutTokenFromUrl(expectedSessionId: string | null): void {
  if (!expectedSessionId || typeof window === 'undefined') return;
  if (scrubCheckoutReceiptUrl(expectedSessionId, window)) {
    window.dispatchEvent(new Event(GOOGLE_CONTEXT_READY));
  }
}

let configured: PaidPurchaseConfig = {};
let tagLoaded = false;
let lastPageLocation: string | undefined;
let loaderEpoch = 0;
let documentTouched = false;
let activeScript: HTMLScriptElement | null = null;
let restarting = false;

function queue(..._args: unknown[]): void {
  // Google requires the arguments object in its dataLayer queue.
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer?.push(arguments);
}

export function dispatchGoogleMeasurement(eventName: string, params: Record<string, unknown>): boolean {
  const context = currentGooglePageContext();
  if (!tagLoaded || !context || !window.fabsyAnalyticsInitialized || restarting ||
      getGoogleConsentChoice() !== 'accepted' || !googleTagMayLoadInDocument(window)) return false;
  const destination = params.send_to;
  const adsConfig = { destinationId: configured.adsId, officerPurchaseLabel: configured.rrLabel, photoRadarPurchaseLabel: configured.photoLabel };
  const allowed = eventName === 'conversion'
    ? [typeof params.order_type === 'string' ? purchaseAdsDestination(params.order_type, adsConfig) : null]
    : eventName === 'purchase' || eventName === 'page_view' ? [configured.ga4Id] : [];
  if (typeof destination !== 'string' || !allowed.includes(destination)) return false;
  queue('event', eventName, {
    ...params, ...context,
    allow_google_signals: false, allow_ad_personalization_signals: false,
  });
  return true;
}

export function sendGooglePageView(): void {
  const context = currentGooglePageContext();
  if (!context || !configured.ga4Id || lastPageLocation === context.page_location) return;
  if (dispatchGoogleMeasurement('page_view', { send_to: configured.ga4Id })) lastPageLocation = context.page_location;
}

/** A loaded script's listeners cannot be removed reliably. Retire its document. */
export function stopGoogleMeasurementAndReload(): void {
  loaderEpoch += 1;
  tagLoaded = false;
  if (activeScript) {
    activeScript.onload = null;
    activeScript.onerror = null;
  }
  if (typeof window === 'undefined' || !documentTouched || restarting) return;
  restarting = true;
  if (configured.ga4Id) {
    (window as unknown as Record<string, unknown>)[`ga-disable-${configured.ga4Id}`] = true;
  }
  // Do not queue a denied-mode ping. The persisted choice prevents any Google
  // request in the replacement document. Already-sent requests cannot be recalled.
  window.gtag = () => undefined;
  if (!window.fabsyMeasurementReloadRequested) {
    window.fabsyMeasurementReloadRequested = true;
    window.location.reload();
  }
}

export function recheckGoogleMeasurementConsent(): void {
  if (getGoogleConsentChoice() !== 'accepted') {
    stopGoogleMeasurementAndReload();
    return;
  }
  initializeGoogleMeasurement();
}

/** Never copy raw acquisition fields, document titles, forms or user data. */
export function initializeGoogleMeasurement(): void {
  const context = currentGooglePageContext();
  const config = currentGoogleMeasurementConfig();
  if (restarting || getGoogleConsentChoice() !== 'accepted' ||
      !googleTagMayLoadInDocument(window) || !context || (!config.ga4Id && !config.adsId)) return;
  if (window.fabsyAnalyticsInitialized) {
    sendGooglePageView();
    return;
  }
  if (!markGoogleTagPending(window)) return;
  const epoch = ++loaderEpoch;
  documentTouched = true;
  configured = config;
  window.dataLayer = window.dataLayer || [];
  // Retire legacy unvalidated direct events. The scoped page-view and verified
  // receipt dispatchers are the only application event producers for this cut.
  window.gtag = () => undefined;
  queue('consent', 'default', {
    analytics_storage: 'denied', ad_storage: 'denied',
    ad_user_data: 'denied', ad_personalization: 'denied',
  });
  // Basic mode: nothing above is sent until this explicit visitor choice.
  // Ads measurement is permitted; personalization and enhanced data stay off.
  queue('consent', 'update', {
    analytics_storage: 'granted', ad_storage: 'granted',
    ad_user_data: 'granted', ad_personalization: 'denied',
  });
  queue('set', {
    allow_google_signals: false, allow_ad_personalization_signals: false,
    ads_data_redaction: true, url_passthrough: false, ...context,
  });
  queue('js', new Date());
  const options = { ...context, send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false };
  if (config.ga4Id) queue('config', config.ga4Id, options);
  if (config.adsId) queue('config', config.adsId, options);
  window.fabsyAnalyticsInitialized = true;
  const script = document.createElement('script');
  activeScript = script;
  script.id = 'fabsy-google-tag';
  script.async = true;
  script.referrerPolicy = 'no-referrer';
  script.src = `https://www.googletagmanager.com/gtag/js?id=${config.ga4Id || config.adsId}`;
  script.onload = () => {
    if (epoch !== loaderEpoch || restarting || getGoogleConsentChoice() !== 'accepted' ||
        !googleTagMayLoadInDocument(window) || !currentGooglePageContext()) return;
    tagLoaded = true;
    sendGooglePageView();
    window.dispatchEvent(new Event(GOOGLE_MEASUREMENT_READY));
  };
  script.onerror = () => {
    if (epoch !== loaderEpoch) return;
    loaderEpoch += 1;
    tagLoaded = false;
    window.fabsyAnalyticsInitialized = false;
    activeScript = null;
    // No retry loop: a later route/consent/readiness action may try again.
    script.remove();
  };
  document.head.appendChild(script);
}
