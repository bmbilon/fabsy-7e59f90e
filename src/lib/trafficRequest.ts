import { livePage } from './live-view/core';
import { preconsentMetricPayload, reviewedCampaignLabel } from './preconsentMeasurementCore';
import { validClickId } from './acquisitionParameters';

export type TrafficChannel = 'Paid search' | 'Paid social' | 'Other paid' | 'Organic search' | 'Organic social' | 'AI referral' | 'Email' | 'Referral' | 'Direct / unknown';
export type TrafficDevice = 'mobile' | 'tablet' | 'desktop';
export interface TrafficRequestMetric {
  page: string;
  channel: TrafficChannel;
  source: string;
  campaign: string;
  device: TrafficDevice;
}

const knownSources = new Map([
  ['google', 'Google'], ['bing', 'Bing'], ['duckduckgo', 'DuckDuckGo'],
  ['facebook', 'Facebook'], ['meta', 'Meta'], ['instagram', 'Instagram'],
  ['linkedin', 'LinkedIn'], ['reddit', 'Reddit'], ['youtube', 'YouTube'],
  ['openai', 'ChatGPT'], ['chatgpt', 'ChatGPT'], ['perplexity', 'Perplexity'],
  ['claude', 'Claude'], ['email', 'Email'], ['newsletter', 'Email'],
]);

function referrerSource(referrer: string | null): { source: string; channel: TrafficChannel } | null {
  if (!referrer || referrer.length > 2048) return null;
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    if (host === 'fabsy.ca' || host === 'www.fabsy.ca') return null;
    const matches = (domain: string) => host === domain || host.endsWith(`.${domain}`);
    if (['google.com','google.ca','google.co.uk','google.com.au','google.co.in','google.de','google.fr'].some(matches)) return { source: 'Google', channel: 'Organic search' };
    if (matches('bing.com')) return { source: 'Bing', channel: 'Organic search' };
    if (matches('duckduckgo.com')) return { source: 'DuckDuckGo', channel: 'Organic search' };
    if (matches('facebook.com') || matches('fb.com')) return { source: 'Facebook', channel: 'Organic social' };
    if (matches('instagram.com')) return { source: 'Instagram', channel: 'Organic social' };
    if (matches('linkedin.com')) return { source: 'LinkedIn', channel: 'Organic social' };
    if (matches('reddit.com')) return { source: 'Reddit', channel: 'Organic social' };
    if (matches('youtube.com')) return { source: 'YouTube', channel: 'Organic social' };
    if (matches('chatgpt.com') || matches('chat.openai.com')) return { source: 'ChatGPT', channel: 'AI referral' };
    if (matches('perplexity.ai')) return { source: 'Perplexity', channel: 'AI referral' };
    if (matches('claude.ai')) return { source: 'Claude', channel: 'AI referral' };
    return { source: 'Other referral', channel: 'Referral' };
  } catch { return null; }
}

/** No identifiers, URLs, referrers, raw UTMs or user agents leave this reducer. */
export function trafficRequestMetric(url: URL, referrer: string | null, agent: string): TrafficRequestMetric | null {
  const page = livePage(url.pathname);
  if (!page) return null;
  const paid = preconsentMetricPayload(url, 'paid_landing');
  const campaignTags = url.searchParams.getAll('utm_campaign');
  const campaign = campaignTags.length === 1 ? reviewedCampaignLabel(campaignTags[0]) : '';
  const sourceTag = url.searchParams.getAll('utm_source');
  const mediumTag = url.searchParams.getAll('utm_medium');
  // Ambiguous labels must not override click evidence or referrer evidence.
  const taggedSource = sourceTag.length === 1 ? knownSources.get(sourceTag[0].toLowerCase()) : undefined;
  const medium = mediumTag.length === 1 ? mediumTag[0].toLowerCase() : '';
  const clickKinds = ['gclid', 'gbraid', 'wbraid', 'fbclid'].filter(key => {
    const values = url.searchParams.getAll(key);
    return values.length === 1 && validClickId(values[0]);
  });
  const paidMedium = ['cpc', 'ppc', 'paid', 'paid_social', 'paid-social'].includes(medium);
  // A bare fbclid also appears on organic Meta shares. It is not proof of an ad.
  const paidSignal = paidMedium || clickKinds.some(key => key !== 'fbclid') || Boolean(campaign && (taggedSource || paid));
  const referral = referrerSource(referrer);
  let source = 'Direct / unknown';
  let channel: TrafficChannel = 'Direct / unknown';
  if (paidSignal) {
    source = paid ? knownSources.get(paid.utmSource) || 'Other paid'
      : clickKinds[0] === 'fbclid' ? 'Meta'
      : clickKinds.length === 1 ? 'Google' : taggedSource || 'Other paid';
    channel = ['Google', 'Bing'].includes(source) ? 'Paid search'
      : ['Facebook', 'Meta', 'Instagram'].includes(source) ? 'Paid social' : 'Other paid';
  } else if (taggedSource && medium === 'email') {
    source = 'Email'; channel = 'Email';
  } else if (taggedSource && ['organic', 'social', 'referral'].includes(medium)) {
    source = taggedSource;
    channel = medium === 'organic' ? 'Organic search' : medium === 'social' ? 'Organic social' : 'Referral';
  } else if (referral) {
    ({ source, channel } = referral);
  }
  const device: TrafficDevice = /ipad|tablet|android(?!.*mobile)/i.test(agent) ? 'tablet'
    : /mobile|iphone|ipod/i.test(agent) ? 'mobile' : 'desktop';
  return { page, channel, source, campaign: paidSignal ? campaign : '', device };
}
