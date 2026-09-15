import type { PaidPurchaseConfig, PaidPurchaseContext } from './paidPurchaseMeasurement';
import { purchaseAdsDestination } from './checkoutReceipt';
import { getGoogleConsentChoice } from './googleConsent';
import {
  googleTagMayLoadInDocument, markGoogleTagPending, scrubCheckoutReceiptUrl,
} from './measurementNavigation';
import { CLICK_ID_KEYS, UTM_KEYS, uniqueSafeSearchValues } from './acquisitionParameters';
import publicArticlePaths from '../config/publicArticlePaths.json';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fabsyAnalyticsInitialized?: boolean;
    fabsyGoogleAdsInitialized?: boolean;
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
  VITE_GADS_CONVERSION_LABEL?: string;
  VITE_GADS_PURCHASE_LABEL?: string;
  VITE_GADS_PHOTO_RADAR_PURCHASE_LABEL?: string;
}

// The deployment gate and exact production origins are necessary, but never
// sufficient: a visitor's explicit consent and a safe document are also needed.
export function googleMeasurementConfig(env: MeasurementEnvironment, origin: string): PaidPurchaseConfig {
  if (!env.PROD || env.VITE_GOOGLE_MEASUREMENT_ENABLED !== 'true' ||
      !['https://fabsy.ca', 'https://www.fabsy.ca'].includes(origin)) return {};
  const ga4Id = env.VITE_GA4_MEASUREMENT_ID || 'G-YRP61S5TPF';
  return {
    ga4Id: /^G-[A-Z0-9]+$/.test(ga4Id) && !/\s/.test(ga4Id) ? ga4Id : undefined,
    adsId: /^AW-\d+$/.test(env.VITE_GADS_ID || '') && !/\s/.test(env.VITE_GADS_ID || '') ? env.VITE_GADS_ID : undefined,
    leadLabel: env.VITE_GADS_CONVERSION_LABEL,
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
  '/ticket-uploaded',
  '/hubs/alberta-tickets-101', '/hubs/photo-radar-vs-officer-issued',
  '/hubs/demerits-and-insurance', '/hubs/court-options-and-deadlines',
  '/hubs/city-specific-quirks',
]);
// An explicit inventory of published articles, never a wildcard for arbitrary
// slugs or IDs. Adding an article to analytics does not authorize an Ads tag.
const articlePaths = new Set<string>(publicArticlePaths);

function baseMeasurementPath(pathname: string): string {
  return pathname.replace(/\/$/, '')
    .replace(/^\/(?:en|pa|tl|zh-hans|zh-hant|ar|es|hi)(?=\/|$)/, '') || '/';
}

export function publicMeasurementPath(pathname: string): string | null {
  // Unknown paths and private IDs, including localized variants, stay out.
  const path = pathname.replace(/\/$/, '') || '/';
  const base = baseMeasurementPath(pathname);
  return publicPaths.has(base) || articlePaths.has(base) ? path : null;
}

function hasOnlyApprovedAcquisitionParameters(url: URL, ads = false): boolean {
  if (url.hash) return false;
  const basePath = baseMeasurementPath(url.pathname);
  const paidLanding = basePath === '/rapid-resolution';
  const publicAcquisition = !ads && !['/thank-you', '/ticket-uploaded'].includes(basePath);
  const allowed = new Set<string>([
    ...CLICK_ID_KEYS.filter(key => paidLanding || key !== 'fbclid'),
    ...(paidLanding || publicAcquisition ? UTM_KEYS : []),
  ]);
  return uniqueSafeSearchValues(url, allowed) !== null;
}

/** Retain the pre-existing Ads route/query policy independently of GA4. */
export function publicGoogleAdsMeasurementUrl(url: URL): boolean {
  return publicPaths.has(baseMeasurementPath(url.pathname)) &&
    Boolean(publicMeasurementPath(url.pathname)) && !url.username && !url.password &&
    hasOnlyApprovedAcquisitionParameters(url, true);
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
  if (window.fabsyGoogleAdsInitialized &&
      !publicGoogleAdsMeasurementUrl(new URL(window.location.href))) return null;
  return safeGooglePageContext(window.location.href, document.referrer);
}

const aiSourceAliases = new Map(Object.entries({
  'chatgpt.com': 'chatgpt.com', 'chat.openai.com': 'chatgpt.com', chatgpt: 'chatgpt.com',
  'perplexity.ai': 'perplexity.ai', perplexity: 'perplexity.ai',
  'claude.ai': 'claude.ai', claude: 'claude.ai',
  'gemini.google.com': 'gemini.google.com', 'bard.google.com': 'gemini.google.com', gemini: 'gemini.google.com',
  'copilot.microsoft.com': 'copilot.microsoft.com', copilot: 'copilot.microsoft.com',
}));

/** Preserve campaign credit without sending a query, prompt or conversation ID. */
export function googleCampaignParameters(href: string, referrer = ''): Record<string, string> {
  try {
    const url = new URL(href);
    if (!safeGooglePageContext(href, referrer)) return {};
    const fields = {
      utm_source: 'campaign_source', utm_medium: 'campaign_medium',
      utm_campaign: 'campaign_name', utm_content: 'campaign_content', utm_term: 'campaign_term',
    } as const;
    const result: Record<string, string> = {};
    for (const key of UTM_KEYS) {
      const value = url.searchParams.get(key);
      if (value) result[fields[key]] = value;
    }
    const explicitCampaign = UTM_KEYS.some(key => url.searchParams.has(key));
    const hasClickId = CLICK_ID_KEYS.some(key => url.searchParams.has(key));
    const source = result.campaign_source?.toLowerCase();
    const aiSource = source ? aiSourceAliases.get(source) : undefined;
    // Only the automatic source-only link can acquire an inferred medium.
    // Explicit paid media/campaigns and click IDs must keep their own credit.
    if (aiSource && !hasClickId &&
        UTM_KEYS.every(key => key === 'utm_source' || !url.searchParams.has(key))) {
      result.campaign_source = aiSource;
      result.campaign_medium = 'referral';
    } else if (!explicitCampaign && !hasClickId && referrer) {
      const previous = new URL(referrer);
      const host = previous.hostname.toLowerCase().replace(/^www\./, '');
      const referredSource = host.includes('.') && !previous.port ? aiSourceAliases.get(host) : undefined;
      if (referredSource) {
        result.campaign_source = referredSource;
        result.campaign_medium = 'referral';
      }
    }
    return result;
  } catch {
    return {};
  }
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
    ...(eventName === 'page_view' ? googleCampaignParameters(window.location.href, document.referrer) : {}),
    allow_google_signals: false, allow_ad_personalization_signals: false,
  });
  return true;
}

function ticketUploadAdsDestination(config: PaidPurchaseConfig): string | null {
  if (!/^AW-\d+$/.test(config.adsId || '') || /\s/.test(config.adsId || '') ||
      !/^[A-Za-z0-9_-]+$/.test(config.leadLabel || '') || /\s/.test(config.leadLabel || '')) return null;
  return `${config.adsId}/${config.leadLabel}`;
}

/** Queue only the generic, consented upload-completion signal on its clean public bridge. */
export function dispatchGoogleTicketUploadConversion(): boolean {
  const context = currentGooglePageContext();
  const destination = ticketUploadAdsDestination(configured);
  if (!tagLoaded || !context || context.page_location !== `${window.location.origin}/ticket-uploaded` ||
      !destination || !window.fabsyAnalyticsInitialized || restarting ||
      getGoogleConsentChoice() !== 'accepted' || !googleTagMayLoadInDocument(window)) return false;
  queue('event', 'conversion', {
    send_to: destination,
    value: 50,
    currency: 'CAD',
    ...context,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  return true;
}

export function sendGooglePageView(): void {
  const context = currentGooglePageContext();
  if (!context || !configured.ga4Id) return;
  const pageKey = `${context.page_location}${window.location.search}`;
  if (lastPageLocation === pageKey) return;
  if (dispatchGoogleMeasurement('page_view', { send_to: configured.ga4Id })) lastPageLocation = pageKey;
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
  if (!context) return;
  const available = currentGoogleMeasurementConfig();
  const previous = document.referrer ? new URL(document.referrer) : null;
  const adsAllowed = publicGoogleAdsMeasurementUrl(new URL(window.location.href)) &&
    (!previous || previous.origin !== window.location.origin || publicGoogleAdsMeasurementUrl(previous));
  const config: PaidPurchaseConfig = adsAllowed ? available : { ga4Id: available.ga4Id };
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
  // Never remove this marker in the same document: an Ads script's listeners
  // may remain after failure/removal. Navigation must retire that document.
  if (config.adsId) window.fabsyGoogleAdsInitialized = true;
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
    analytics_storage: 'granted', ad_storage: config.adsId ? 'granted' : 'denied',
    ad_user_data: config.adsId ? 'granted' : 'denied', ad_personalization: 'denied',
  });
  queue('set', {
    allow_google_signals: false, allow_ad_personalization_signals: false,
    ads_data_redaction: true, url_passthrough: false, ...context,
  });
  queue('js', new Date());
  const options = { ...context, send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false };
  if (config.ga4Id) queue('config', config.ga4Id, { ...options, ...googleCampaignParameters(window.location.href, document.referrer) });
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
