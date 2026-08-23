export const MARKETING_STORAGE_KEY = "fabsy_marketing_v2";
const LEGACY_MARKETING_STORAGE_KEY = "fabsy_marketing";

export const MARKETING_ATTRIBUTION_KEYS = [
  "gclid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "llm_source",
  "referrer_host",
  "landing_page",
  "first_touch_at",
] as const;

const LLM_SOURCE_PATTERNS = [
  { source: "chatgpt", patterns: ["chatgpt.com", "chat.openai.com", "openai"] },
  { source: "perplexity", patterns: ["perplexity.ai", "perplexity"] },
  { source: "claude", patterns: ["claude.ai", "claude"] },
  { source: "gemini", patterns: ["gemini.google.com", "bard.google.com", "gemini", "bard"] },
  { source: "copilot", patterns: ["copilot.microsoft.com", "copilot"] },
] as const;

export type MarketingAttribution = Partial<Record<(typeof MARKETING_ATTRIBUTION_KEYS)[number], string>>;

function safeHost(value: string) {
  if (!value) return "";
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function detectLlmSource(utmSource: string, referrerHost: string) {
  const candidates = [utmSource.toLowerCase(), referrerHost.toLowerCase()];
  return LLM_SOURCE_PATTERNS.find(({ patterns }) =>
    patterns.some((pattern) => candidates.some((candidate) => candidate.includes(pattern)))
  )?.source;
}

export function readMarketingAttribution(): MarketingAttribution {
  if (typeof window === "undefined") return {};
  try {
    const serialized = window.localStorage.getItem(MARKETING_STORAGE_KEY) ||
      window.localStorage.getItem(LEGACY_MARKETING_STORAGE_KEY) ||
      "{}";
    const stored = JSON.parse(serialized) as Record<string, unknown>;
    return MARKETING_ATTRIBUTION_KEYS.reduce<MarketingAttribution>((safe, key) => {
      const value = stored[key];
      if (typeof value === "string" && value) safe[key] = value;
      return safe;
    }, {});
  } catch {
    return {};
  }
}

export function captureMarketingAttribution(search: string, pathname: string, referrer: string) {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(search);
  const existing = readMarketingAttribution();
  const hasCampaignParameter = MARKETING_ATTRIBUTION_KEYS
    .slice(0, 6)
    .some((key) => Boolean(params.get(key)?.trim()));
  if (existing.first_touch_at && !hasCampaignParameter) return existing;

  const currentHost = window.location.hostname.toLowerCase().replace(/^www\./, "");
  const candidateReferrerHost = safeHost(referrer);
  const referrerHost = candidateReferrerHost && candidateReferrerHost !== currentHost
    ? candidateReferrerHost
    : "";
  const utmSource = params.get("utm_source")?.trim() || "";
  const llmSource = detectLlmSource(utmSource, referrerHost);
  const captured: MarketingAttribution = {};

  for (const key of MARKETING_ATTRIBUTION_KEYS.slice(0, 6)) {
    const value = params.get(key)?.trim();
    if (value) captured[key] = value.slice(0, 250);
  }
  if (llmSource) captured.llm_source = llmSource;
  if (referrerHost) captured.referrer_host = referrerHost.slice(0, 250);

  const hasAcquisitionSignal = Boolean(
    captured.gclid || captured.utm_source || captured.referrer_host || captured.llm_source
  );
  if (!hasAcquisitionSignal) return existing;

  captured.landing_page = pathname.slice(0, 250);
  captured.first_touch_at = new Date().toISOString();
  try {
    window.localStorage.setItem(MARKETING_STORAGE_KEY, JSON.stringify(captured));
  } catch {
    // Attribution must never block the page in privacy-focused browser modes.
  }
  return captured;
}
