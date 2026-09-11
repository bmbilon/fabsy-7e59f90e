import { getOpenAIAdsConsentChoice } from './googleConsent';
import {
  markMeasurementTagPending,
  measurementProviderMayLoadInDocument,
} from './measurementNavigation';
import { validUtmValue } from './acquisitionParameters';

declare global {
  interface Window {
    oaiq?: ((...args: unknown[]) => void) & { q?: unknown[][] };
    fabsyOpenAIAdsInitialized?: boolean;
    fabsyMeasurementReloadRequested?: boolean;
  }
}

export const OPENAI_ADS_MEASUREMENT_READY = 'fabsy:openai-ads-measurement-ready';
export const OPENAI_ADS_PIXEL_ID = 'QbJtdpTVT8DTb7BcRq7jY5';

interface OpenAIAdsEnvironment {
  PROD?: boolean;
  VITE_OPENAI_ADS_MEASUREMENT_ENABLED?: string;
  VITE_OPENAI_ADS_PIXEL_ID?: string;
}

export function openAIAdsMeasurementConfig(env: OpenAIAdsEnvironment, origin: string): { pixelId?: string } {
  return env.PROD === true && env.VITE_OPENAI_ADS_MEASUREMENT_ENABLED === 'true' &&
      env.VITE_OPENAI_ADS_PIXEL_ID === OPENAI_ADS_PIXEL_ID &&
      ['https://fabsy.ca', 'https://www.fabsy.ca'].includes(origin)
    ? { pixelId: env.VITE_OPENAI_ADS_PIXEL_ID }
    : {};
}

export function currentOpenAIAdsMeasurementConfig(): { pixelId?: string } {
  if (typeof window === 'undefined') return {};
  return openAIAdsMeasurementConfig(import.meta.env, window.location.origin);
}

export function publicOpenAIAdsMeasurementUrl(url: URL): boolean {
  if (url.username || url.password || url.hash) return false;
  const path = url.pathname.replace(/\/$/, '');
  if (path === '/ticket-uploaded') return !url.search;
  if (path !== '/rapid-resolution') return false;
  const allowed = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'oppref']);
  const values = new Map<string, string>();
  for (const [key, value] of url.searchParams) {
    if (!allowed.has(key) || values.has(key)) return false;
    const valid = key === 'oppref'
      ? /^[A-Za-z0-9_-]{1,512}$/.test(value)
      : validUtmValue(value);
    if (!valid) return false;
    values.set(key, value);
  }
  return values.size >= 5 && values.size <= 6 && values.get('utm_source') === 'openai' &&
    values.get('utm_medium') === 'cpc' && Boolean(values.get('utm_campaign')) &&
    Boolean(values.get('utm_content')) && Boolean(values.get('oppref'));
}

function safeReferrer(referrer: string, current: URL): boolean {
  if (!referrer) return true;
  try {
    const previous = new URL(referrer);
    if (previous.protocol !== 'https:' || previous.username || previous.password ||
        previous.search || previous.hash) return false;
    // A browser may disclose only the external origin for an ad click. A
    // same-origin referrer must itself be one of the reviewed OpenAI pages.
    return previous.origin === current.origin
      ? publicOpenAIAdsMeasurementUrl(previous)
      : previous.pathname === '/';
  } catch {
    return false;
  }
}

function safePage(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  try {
    const url = new URL(window.location.href);
    return ['https://fabsy.ca', 'https://www.fabsy.ca'].includes(url.origin) &&
      publicOpenAIAdsMeasurementUrl(url) && safeReferrer(document.referrer, url) &&
      measurementProviderMayLoadInDocument('openai', window);
  } catch {
    return false;
  }
}

let activeScript: HTMLScriptElement | null = null;
let documentTouched = false;
let restarting = false;
let tagLoaded = false;

function queue(...args: unknown[]): void {
  window.oaiq?.(...args);
}

export function initializeOpenAIAdsMeasurement(): void {
  const config = currentOpenAIAdsMeasurementConfig();
  if (restarting || window.fabsyOpenAIAdsInitialized || !config.pixelId ||
      getOpenAIAdsConsentChoice() !== 'accepted' || !safePage() ||
      !markMeasurementTagPending('openai', window)) return;
  documentTouched = true;
  const command = ((...args: unknown[]) => command.q!.push(args)) as NonNullable<Window['oaiq']>;
  command.q = [];
  window.oaiq = command;
  queue('consent', false);
  queue('init', { pixelId: config.pixelId });
  queue('consent', true);
  window.fabsyOpenAIAdsInitialized = true;
  const script = document.createElement('script');
  activeScript = script;
  script.id = 'fabsy-openai-ads-pixel';
  script.async = true;
  script.referrerPolicy = 'no-referrer';
  script.src = 'https://bzrcdn.openai.com/sdk/oaiq.min.js';
  script.onload = () => {
    if (restarting || getOpenAIAdsConsentChoice() !== 'accepted' || !safePage()) return;
    tagLoaded = true;
    window.dispatchEvent(new Event(OPENAI_ADS_MEASUREMENT_READY));
  };
  script.onerror = () => {
    tagLoaded = false;
    script.remove();
    activeScript = null;
    window.fabsyOpenAIAdsInitialized = false;
    window.oaiq = undefined;
  };
  document.head.appendChild(script);
}

export function dispatchOpenAIAdsTicketUploadConversion(): boolean {
  if (!tagLoaded || !window.fabsyOpenAIAdsInitialized || !window.oaiq || restarting ||
      getOpenAIAdsConsentChoice() !== 'accepted' || !safePage()) return false;
  queue('measure', 'lead_created', {
    type: 'customer_action',
    amount: 5000,
    currency: 'CAD',
  }, { opt_out: true });
  return true;
}

export function recheckOpenAIAdsMeasurementConsent(): void {
  if (getOpenAIAdsConsentChoice() === 'accepted') {
    initializeOpenAIAdsMeasurement();
    return;
  }
  if (window.oaiq) queue('consent', false);
  tagLoaded = false;
  if (!documentTouched || restarting) return;
  restarting = true;
  if (activeScript) {
    activeScript.onload = null;
    activeScript.onerror = null;
  }
  window.oaiq = () => undefined;
  if (!window.fabsyMeasurementReloadRequested) {
    window.fabsyMeasurementReloadRequested = true;
    window.location.reload();
  }
}
