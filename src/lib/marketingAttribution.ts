import { CLICK_ID_KEYS, UTM_KEYS, validClickId, validUtmValue } from './acquisitionParameters';
import { getFabsyFunnelConsentChoice, getFabsyFunnelConsentGrant } from './fabsyFunnelConsent';

export const MARKETING_STORAGE_KEY = 'fabsy_marketing_v3';
export const RETIRED_MARKETING_STORAGE_KEYS = ['fabsy_marketing_v2', 'fabsy_marketing'] as const;

export const MARKETING_ATTRIBUTION_KEYS = [
  'gclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'llm_source',
  'referrer_host',
  'landing_page',
  'first_touch_at',
] as const;

const LLM_SOURCE_PATTERNS = [
  { source: 'chatgpt', patterns: ['chatgpt.com', 'chat.openai.com', 'openai'] },
  { source: 'perplexity', patterns: ['perplexity.ai', 'perplexity'] },
  { source: 'claude', patterns: ['claude.ai', 'claude'] },
  { source: 'gemini', patterns: ['gemini.google.com', 'bard.google.com', 'gemini', 'bard'] },
  { source: 'copilot', patterns: ['copilot.microsoft.com', 'copilot'] },
] as const;

const llmSources = new Set<string>(LLM_SOURCE_PATTERNS.map(({ source }) => source));
const attributionKeys = new Set<string>(MARKETING_ATTRIBUTION_KEYS);
const STORAGE_VERSION = 3;
const MAX_STORED_RECORD_BYTES = 5_000;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;

export type MarketingAttribution = Partial<Record<(typeof MARKETING_ATTRIBUTION_KEYS)[number], string>>;

interface StoredMarketingAttribution {
  version: 3;
  consentSavedAt: number;
  attribution: MarketingAttribution;
}

let pendingAttribution: MarketingAttribution = {};
let consentedMemoryAttribution: StoredMarketingAttribution | null = null;

function safeHost(value: string) {
  if (!value) return '';
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    return host.length <= 253 && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) &&
      !host.includes('..') ? host : '';
  } catch {
    return '';
  }
}

function safeLandingPage(value: string): boolean {
  return value.length >= 1 && value.length <= 250 && value.startsWith('/') &&
    !value.startsWith('//') && !/[\s?#\\]/.test(value);
}

function exactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every(key => allowed.has(key));
}

function validateAttribution(value: unknown, consentSavedAt: number, now = Date.now()): MarketingAttribution | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (!exactKeys(candidate, attributionKeys)) return null;
  const safe: MarketingAttribution = {};

  for (const key of CLICK_ID_KEYS) {
    const entry = candidate[key];
    if (entry === undefined) continue;
    if (typeof entry !== 'string' || !validClickId(entry)) return null;
    safe[key] = entry;
  }
  for (const key of UTM_KEYS) {
    const entry = candidate[key];
    if (entry === undefined) continue;
    if (typeof entry !== 'string' || !validUtmValue(entry)) return null;
    safe[key] = entry;
  }
  if (candidate.llm_source !== undefined) {
    if (typeof candidate.llm_source !== 'string' || !llmSources.has(candidate.llm_source)) return null;
    safe.llm_source = candidate.llm_source;
  }
  if (candidate.referrer_host !== undefined) {
    if (typeof candidate.referrer_host !== 'string' || safeHost(`https://${candidate.referrer_host}`) !== candidate.referrer_host) {
      return null;
    }
    safe.referrer_host = candidate.referrer_host;
  }
  if (typeof candidate.landing_page !== 'string' || !safeLandingPage(candidate.landing_page)) return null;
  safe.landing_page = candidate.landing_page;
  if (typeof candidate.first_touch_at !== 'string' || candidate.first_touch_at.length > 60) return null;
  const firstTouch = Date.parse(candidate.first_touch_at);
  if (!Number.isFinite(firstTouch) || firstTouch < consentSavedAt || firstTouch > now + MAX_FUTURE_CLOCK_SKEW_MS) return null;
  safe.first_touch_at = new Date(firstTouch).toISOString();

  const hasAcquisitionSignal = Boolean(
    safe.gclid || safe.gbraid || safe.wbraid || safe.fbclid || safe.utm_source ||
    safe.referrer_host || safe.llm_source,
  );
  return hasAcquisitionSignal ? safe : null;
}

function removeStorageKeys(keys: readonly string[]): void {
  if (typeof window === 'undefined') return;
  for (const key of keys) {
    try { window.localStorage.removeItem(key); } catch { /* Refusal remains effective in memory. */ }
  }
}

function retireLegacyAttribution(): void {
  removeStorageKeys(RETIRED_MARKETING_STORAGE_KEYS);
}

function readStoredAttribution(consentSavedAt: number): MarketingAttribution | null {
  try {
    const serialized = window.localStorage.getItem(MARKETING_STORAGE_KEY);
    if (!serialized) return null;
    if (serialized.length > MAX_STORED_RECORD_BYTES) throw new Error('record_too_large');
    const parsed: unknown = JSON.parse(serialized);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('record_invalid');
    const record = parsed as Record<string, unknown>;
    if (!exactKeys(record, new Set(['version', 'consentSavedAt', 'attribution'])) ||
        record.version !== STORAGE_VERSION || record.consentSavedAt !== consentSavedAt) {
      throw new Error('consent_mismatch');
    }
    const attribution = validateAttribution(record.attribution, consentSavedAt);
    if (!attribution) throw new Error('attribution_invalid');
    return attribution;
  } catch {
    removeStorageKeys([MARKETING_STORAGE_KEY]);
    return null;
  }
}

function storeConsentedAttribution(attribution: MarketingAttribution, consentSavedAt: number): MarketingAttribution {
  const safe = validateAttribution(attribution, consentSavedAt);
  if (!safe) return {};
  const record: StoredMarketingAttribution = { version: STORAGE_VERSION, consentSavedAt, attribution: safe };
  consentedMemoryAttribution = record;
  try {
    const serialized = JSON.stringify(record);
    window.localStorage.setItem(MARKETING_STORAGE_KEY, serialized);
    if (window.localStorage.getItem(MARKETING_STORAGE_KEY) !== serialized) throw new Error('storage_write_failed');
  } catch {
    // The consent-bound in-memory copy keeps this document functional without
    // weakening refusal or resurrecting data from an earlier consent grant.
  }
  return safe;
}

export function detectLlmSource(utmSource: string, referrerHost: string) {
  const candidates = [utmSource.toLowerCase(), referrerHost.toLowerCase()];
  return LLM_SOURCE_PATTERNS.find(({ patterns }) =>
    patterns.some(pattern => candidates.some(candidate => candidate.includes(pattern)))
  )?.source;
}

export function readMarketingAttribution(): MarketingAttribution {
  if (typeof window === 'undefined' || getFabsyFunnelConsentChoice() !== 'accepted') return {};
  const grant = getFabsyFunnelConsentGrant();
  if (!grant) return {};
  retireLegacyAttribution();
  if (consentedMemoryAttribution?.consentSavedAt === grant.savedAt) {
    const safe = validateAttribution(consentedMemoryAttribution.attribution, grant.savedAt);
    if (safe) return safe;
    consentedMemoryAttribution = null;
  }
  const stored = readStoredAttribution(grant.savedAt);
  if (!stored) return {};
  consentedMemoryAttribution = { version: STORAGE_VERSION, consentSavedAt: grant.savedAt, attribution: stored };
  return stored;
}

export function captureMarketingAttribution(search: string, pathname: string, referrer: string) {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(search);
  const grant = getFabsyFunnelConsentGrant();
  const accepted = Boolean(grant);
  const existing = accepted ? readMarketingAttribution() : pendingAttribution;
  const hasCampaignParameter = MARKETING_ATTRIBUTION_KEYS
    .slice(0, 9)
    .some(key => Boolean(params.get(key)?.trim()));
  if (existing.first_touch_at && !hasCampaignParameter) return existing;

  const currentHost = window.location.hostname.toLowerCase().replace(/^www\./, '');
  const candidateReferrerHost = safeHost(referrer);
  const referrerHost = candidateReferrerHost && candidateReferrerHost !== currentHost
    ? candidateReferrerHost
    : '';
  const utmSource = params.get('utm_source')?.trim() || '';
  const llmSource = detectLlmSource(utmSource, referrerHost);
  const captured: MarketingAttribution = {};

  for (const key of MARKETING_ATTRIBUTION_KEYS.slice(0, 9)) {
    const value = params.get(key)?.trim();
    if (!value) continue;
    const safe = (CLICK_ID_KEYS as readonly string[]).includes(key)
      ? validClickId(value)
      : (UTM_KEYS as readonly string[]).includes(key) && validUtmValue(value);
    if (safe) captured[key] = value.slice(0, 250);
  }
  if (llmSource) captured.llm_source = llmSource;
  if (referrerHost) captured.referrer_host = referrerHost;

  const hasAcquisitionSignal = Boolean(
    captured.gclid || captured.gbraid || captured.wbraid || captured.fbclid ||
    captured.utm_source || captured.referrer_host || captured.llm_source,
  );
  if (!hasAcquisitionSignal || !safeLandingPage(pathname)) return existing;

  captured.landing_page = pathname;
  captured.first_touch_at = new Date().toISOString();
  if (!accepted || !grant) {
    pendingAttribution = captured;
    return captured;
  }
  return storeConsentedAttribution(captured, grant.savedAt);
}

export function persistPendingMarketingAttribution(): MarketingAttribution {
  if (typeof window === 'undefined') return {};
  const grant = getFabsyFunnelConsentGrant();
  if (!grant) return {};
  if (!pendingAttribution.first_touch_at) return readMarketingAttribution();
  const captured = {
    ...pendingAttribution,
    // Pre-consent activity may guide the current session, but the durable
    // first-touch timestamp begins with the explicit first-party grant.
    first_touch_at: new Date(Math.max(grant.savedAt, Date.now())).toISOString(),
  };
  pendingAttribution = {};
  retireLegacyAttribution();
  return storeConsentedAttribution(captured, grant.savedAt);
}

export function clearMarketingAttribution(): void {
  pendingAttribution = {};
  consentedMemoryAttribution = null;
  removeStorageKeys([MARKETING_STORAGE_KEY, ...RETIRED_MARKETING_STORAGE_KEYS]);
}
