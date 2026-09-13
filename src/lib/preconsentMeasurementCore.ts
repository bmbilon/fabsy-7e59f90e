import { CLICK_ID_KEYS, UTM_KEYS, validClickId, validUtmValue } from './acquisitionParameters';

export const PRECONSENT_METRIC_EVENTS = [
  'paid_landing',
  'consent_accepted',
  'consent_declined',
  'consent_dismissed',
] as const;

export type PreconsentMetricEvent = (typeof PRECONSENT_METRIC_EVENTS)[number];
export type PreconsentPageKey = 'home' | 'rapid_resolution' | 'photo_radar' | 'pro_drivers';

export interface PreconsentMetricPayload {
  eventName: PreconsentMetricEvent;
  pageKey: PreconsentPageKey;
  locale: 'en' | 'pa' | 'tl' | 'zh-hans' | 'zh-hant' | 'ar' | 'hi' | 'es';
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  clickIdKind: '' | 'gclid' | 'gbraid' | 'wbraid' | 'fbclid';
}

const locales = new Set<PreconsentMetricPayload['locale']>([
  'en', 'pa', 'tl', 'zh-hans', 'zh-hant', 'ar', 'hi', 'es',
]);
const pageKeys = new Map<string, PreconsentPageKey>([
  ['/', 'home'],
  ['/rapid-resolution', 'rapid_resolution'],
  ['/photo-radar', 'photo_radar'],
  ['/pro-drivers', 'pro_drivers'],
]);
const paidSources = new Set(['meta', 'facebook', 'instagram', 'google', 'openai']);
const paidMedia = new Set(['cpc', 'ppc', 'paid', 'paid_social', 'paid-social']);
const approvedCampaigns = new Set([
  'rr_ab_en_creative_20260831',
  'rr_ab_multilingual_20260906',
  'rr_google_profit_20260913',
  'rr-pilot-calgary-202608',
  'rr-pilot-edmonton-202608',
  'rr-pilot-alberta-202608',
]);
const approvedContents = new Set([
  'rr_relief_v1',
  'rr_flat_fee_v1',
  'rr_client_control_v1',
  'en_rsa_v1',
  'pa_rsa_v1',
  'tl_rsa_v1',
  'zh_hans_rsa_v1',
  'zh_hant_rsa_v1',
  'ar_rsa_v1',
  'es_rsa_v1',
  'hi_rsa_v1',
  'pa_rr_v1',
  'tl_rr_v1',
  'zh_hans_rr_v1',
  'zh_hant_rr_v1',
  'ar_rr_v1',
  'es_rr_v1',
  'hi_rr_v1',
]);

function singleSafeValue(url: URL, key: string, clickId = false): string | null {
  const values = url.searchParams.getAll(key);
  if (!values.length) return '';
  if (values.length !== 1) return null;
  const value = values[0].trim();
  return (clickId ? validClickId(value) : validUtmValue(value)) ? value : null;
}

/**
 * Reduces an ad URL to fixed page/locale fields and campaign labels. Raw click
 * IDs, full URLs, referrers, IPs and user agents never enter the returned data.
 */
export function preconsentMetricPayload(
  url: URL,
  eventName: PreconsentMetricEvent,
): PreconsentMetricPayload | null {
  if (!PRECONSENT_METRIC_EVENTS.includes(eventName)) return null;
  const cleanPath = url.pathname.replace(/\/+$/, '') || '/';
  const localeMatch = cleanPath.match(/^\/(en|pa|tl|zh-hans|zh-hant|ar|hi|es)(?=\/|$)/);
  const locale = (localeMatch?.[1] || 'en') as PreconsentMetricPayload['locale'];
  if (!locales.has(locale)) return null;
  const basePath = localeMatch ? cleanPath.slice(localeMatch[0].length) || '/' : cleanPath;
  const pageKey = pageKeys.get(basePath);
  if (!pageKey) return null;

  const utms = new Map<string, string>();
  for (const key of UTM_KEYS) {
    const value = singleSafeValue(url, key);
    if (value === null) return null;
    utms.set(key, value);
  }
  const clickKinds: Array<PreconsentMetricPayload['clickIdKind']> = [];
  for (const key of CLICK_ID_KEYS) {
    const value = singleSafeValue(url, key, true);
    if (value === null) return null;
    if (value) clickKinds.push(key);
  }
  if (clickKinds.length > 1) return null;

  const rawSource = (utms.get('utm_source') || '').toLowerCase();
  const rawMedium = (utms.get('utm_medium') || '').toLowerCase();
  const clickIdKind = clickKinds[0] || '';
  if (!clickIdKind && !paidSources.has(rawSource) && !paidMedia.has(rawMedium)) {
    return null;
  }

  const inferredSource = clickIdKind === 'fbclid' ? 'meta'
    : clickIdKind ? 'google'
      : 'other_paid';
  const utmSource = paidSources.has(rawSource) ? rawSource : inferredSource;
  const utmMedium = paidMedia.has(rawMedium) ? rawMedium : 'paid';
  const rawCampaign = utms.get('utm_campaign') || '';
  const rawContent = utms.get('utm_content') || '';

  return {
    eventName,
    pageKey,
    locale,
    utmSource,
    utmMedium,
    // Preserve only reviewed business labels. Unknown values still count under
    // source, locale and click-ID kind without entering storage.
    utmCampaign: approvedCampaigns.has(rawCampaign) ? rawCampaign : '',
    utmContent: approvedContents.has(rawContent) ? rawContent : '',
    clickIdKind,
  };
}

export function validPreconsentMetricPayload(value: unknown): value is PreconsentMetricPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  const expected = ['eventName', 'pageKey', 'locale', 'utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'clickIdKind'];
  if (Object.keys(body).length !== expected.length || expected.some(key => !(key in body))) return false;
  if (!PRECONSENT_METRIC_EVENTS.includes(body.eventName as PreconsentMetricEvent) ||
      ![...pageKeys.values()].includes(body.pageKey as PreconsentPageKey) ||
      !locales.has(body.locale as PreconsentMetricPayload['locale'])) return false;
  for (const key of ['utmSource', 'utmMedium', 'utmCampaign', 'utmContent'] as const) {
    if (typeof body[key] !== 'string' || (body[key] !== '' && !validUtmValue(body[key]))) return false;
  }
  if (!['meta', 'facebook', 'instagram', 'google', 'openai', 'other_paid'].includes(String(body.utmSource)) ||
      !['cpc', 'ppc', 'paid', 'paid_social', 'paid-social'].includes(String(body.utmMedium)) ||
      (body.utmCampaign !== '' && !approvedCampaigns.has(String(body.utmCampaign))) ||
      (body.utmContent !== '' && !approvedContents.has(String(body.utmContent))) ||
      typeof body.clickIdKind !== 'string' || !['', ...CLICK_ID_KEYS].includes(body.clickIdKind as never)) return false;
  return Boolean(
    body.clickIdKind ||
    paidSources.has(String(body.utmSource)) ||
    body.utmSource === 'other_paid' ||
    paidMedia.has(String(body.utmMedium)),
  );
}
