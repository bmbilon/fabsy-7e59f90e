export const LIVE_WINDOW_SECONDS = 90;
export const HEARTBEAT_MS = 30_000;
export const SESSION_IDLE_MS = 30 * 60_000;
export const LIVE_STAGE_EVENT = "fabsy:live-stage";
export const SESSION_KEY = "fabsy.live-session.v1";

export const SOURCES = [
  "Direct",
  "Google",
  "Bing",
  "Facebook",
  "Instagram",
  "ChatGPT",
  "Perplexity",
  "Other referral",
] as const;
export type VisitorSource = (typeof SOURCES)[number];
export type VisitorStage = "browsing" | "intake" | "review";
export type VisitorDevice = "mobile" | "tablet" | "desktop";

const publicPaths = new Set([
  "/",
  "/rapid-resolution",
  "/photo-radar",
  "/pro-drivers",
  "/fleet",
  "/refer",
  "/how-it-works",
  "/about",
  "/about/comparison",
  "/services",
  "/testimonials",
  "/faq",
  "/founder",
  "/ai-info",
  "/privacy-policy",
  "/terms-of-service",
  "/terms-of-purchase",
  "/insurance-damage-report",
  "/blog",
  "/contact",
  "/submit-ticket",
  "/ticket-form",
  "/free-ticket-check",
  "/hubs/alberta-tickets-101",
  "/hubs/photo-radar-vs-officer-issued",
  "/hubs/demerits-and-insurance",
  "/hubs/court-options-and-deadlines",
  "/hubs/city-specific-quirks",
]);

export function livePage(pathname: unknown): string | null {
  if (
    typeof pathname !== "string" ||
    pathname.length > 180 ||
    /[?#%\\\s]/.test(pathname)
  )
    return null;
  const path = pathname.replace(/\/$/, "") || "/";
  const base =
    path.replace(/^\/(?:en|pa|tl|zh-hans|zh-hant|ar|es|hi)(?=\/|$)/, "") || "/";
  // Public article slugs contain words. Never collect unknown or tokenized routes.
  const article = /^\/(?:blog|content)\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/.exec(
    base,
  );
  const privateId =
    article &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      article[1],
    );
  if (publicPaths.has(base) || (article && !privateId)) return path;
  return null;
}

export function pageStage(page: string, requested?: unknown): VisitorStage {
  if (/\/(?:submit-ticket|ticket-form|free-ticket-check|fleet)$/.test(page)) {
    return requested === "review" ? "review" : "intake";
  }
  return "browsing";
}

export function visitorSource(referrer: string): VisitorSource {
  if (!referrer) return "Direct";
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    if (host === "fabsy.ca" || host === "www.fabsy.ca") return "Direct";
    const is = (domain: string) =>
      host === domain || host.endsWith(`.${domain}`);
    if (/^(?:www\.)?google\.(?:com|ca|co\.uk)$/.test(host)) return "Google";
    if (is("bing.com")) return "Bing";
    if (is("facebook.com") || is("fb.com")) return "Facebook";
    if (is("instagram.com")) return "Instagram";
    if (is("chatgpt.com") || is("chat.openai.com")) return "ChatGPT";
    if (is("perplexity.ai")) return "Perplexity";
    return "Other referral";
  } catch {
    return "Direct";
  }
}

export function visitorDevice(agent: string): VisitorDevice {
  if (/ipad|tablet|android(?!.*mobile)/i.test(agent)) return "tablet";
  return /mobile|iphone|ipod/i.test(agent) ? "mobile" : "desktop";
}

export function isBot(agent: string): boolean {
  return (
    !agent ||
    /bot\b|crawler|spider|headless|lighthouse|playwright|puppeteer|prerender/i.test(
      agent,
    )
  );
}

export interface BrowserSession {
  id: string;
  lastSeen: number;
  source: VisitorSource;
}
export function nextSession(
  raw: string | null,
  now: number,
  source: VisitorSource,
  newId: () => string,
): BrowserSession {
  try {
    const prior = JSON.parse(raw || "null") as BrowserSession | null;
    if (
      prior &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        prior.id,
      ) &&
      Number.isFinite(prior.lastSeen) &&
      now >= prior.lastSeen &&
      now - prior.lastSeen < SESSION_IDLE_MS &&
      SOURCES.includes(prior.source)
    )
      return { ...prior, lastSeen: now };
  } catch {
    /* Storage may be unavailable or malformed. */
  }
  return { id: newId(), lastSeen: now, source };
}

export interface Visitor {
  id: string;
  page: string;
  stage: VisitorStage;
  source: VisitorSource;
  device: VisitorDevice;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  started_at: string;
  last_seen_at: string;
}
export interface LiveSnapshot {
  generated_at: string;
  collection_started_at: string;
  window_seconds: number;
  active: number;
  sessions_today: number;
  submissions_today: number;
  paid_cases_today: number;
  stages: Record<VisitorStage, number>;
  visitors: Visitor[];
  visitors_truncated: boolean;
  locations: Array<{
    city: string | null;
    region: string | null;
    country: string | null;
    latitude: number | null;
    longitude: number | null;
    count: number;
  }>;
  pages: Array<{ page: string; count: number }>;
  sources: Array<{ source: VisitorSource; count: number }>;
  timeline: Array<{ minute: string; sessions: number }>;
}

export function locationLabel(location: {
  city: string | null;
  region: string | null;
  country: string | null;
}) {
  return (
    [location.city, location.region, location.country]
      .filter(Boolean)
      .join(", ") || "Location unavailable"
  );
}
