import {
  META_CAPI_EXPECTED_PIXEL_ID,
  META_CAPI_GRAPH_VERSION,
  sanitizeMetaBrowserId,
  sanitizeMetaUserAgent,
} from "./meta-capi.ts";

export const META_CAPI_LEAD_SOURCE_URL = "https://fabsy.ca/submit-ticket";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONSENT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface MetaLeadContext {
  consentVersion: "meta-measurement-v1";
  consentedAt: string;
  fbp?: string;
  fbc?: string;
}

export interface MetaLeadDeliveryInput {
  draftId: string;
  context: MetaLeadContext;
  clientUserAgent: string;
  eventTimeEpochSeconds?: number;
}

export interface MetaLeadEnvironment {
  enabled?: string;
  pixelId?: string;
  accessToken?: string;
}

type Fetcher = typeof fetch;

function validConsentTime(value: unknown, now = Date.now()): string | null {
  if (typeof value !== "string" || value.length > 60) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed < now - CONSENT_MAX_AGE_MS ||
      parsed > now + MAX_CLOCK_SKEW_MS) return null;
  return new Date(parsed).toISOString();
}

export function parseMetaLeadContext(value: unknown): MetaLeadContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).some((key) =>
    !["consentVersion", "consentedAt", "fbp", "fbc"].includes(key)
  )) return null;
  if (candidate.consentVersion !== "meta-measurement-v1") return null;
  const consentedAt = validConsentTime(candidate.consentedAt);
  if (!consentedAt) return null;
  const fbp = sanitizeMetaBrowserId(candidate.fbp);
  const fbc = sanitizeMetaBrowserId(candidate.fbc);
  if (!fbp && !fbc) return null;
  if ((candidate.fbp !== undefined && !fbp) ||
      (candidate.fbc !== undefined && !fbc)) return null;
  return {
    consentVersion: "meta-measurement-v1",
    consentedAt,
    ...(fbp ? { fbp } : {}),
    ...(fbc ? { fbc } : {}),
  };
}

function validEnvironment(environment: MetaLeadEnvironment): environment is Required<MetaLeadEnvironment> {
  const token = environment.accessToken || "";
  return environment.enabled === "true" &&
    environment.pixelId === META_CAPI_EXPECTED_PIXEL_ID &&
    token.length >= 20 && token.length <= 4096 && !/[\s\u0000-\u001f\u007f-\u009f]/.test(token);
}

async function leadEventId(draftId: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`fabsy-lead:${draftId}`),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function buildMetaLeadPayload(input: MetaLeadDeliveryInput) {
  if (!UUID_PATTERN.test(input.draftId)) throw new Error("invalid_lead");
  const context = parseMetaLeadContext(input.context);
  const userAgent = sanitizeMetaUserAgent(input.clientUserAgent);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const eventTime = input.eventTimeEpochSeconds ?? nowSeconds;
  if (!context || !userAgent || !Number.isSafeInteger(eventTime) ||
      eventTime < Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000) ||
      eventTime > nowSeconds + 300) throw new Error("invalid_lead");
  return {
    data: [{
      event_name: "Lead" as const,
      event_time: eventTime,
      event_id: await leadEventId(input.draftId),
      action_source: "website" as const,
      event_source_url: META_CAPI_LEAD_SOURCE_URL,
      user_data: {
        client_user_agent: userAgent,
        ...(context.fbp ? { fbp: context.fbp } : {}),
        ...(context.fbc ? { fbc: context.fbc } : {}),
      },
    }],
  };
}

/**
 * Send a standard Lead only after a real contact draft exists and the visitor
 * separately granted Meta measurement consent. Contact fields never enter the
 * provider payload. Failure is contained so lead capture cannot be blocked by
 * an advertising provider.
 */
export async function deliverMetaLeadBestEffort(
  environment: MetaLeadEnvironment,
  input: MetaLeadDeliveryInput,
  fetcher: Fetcher = fetch,
): Promise<boolean> {
  if (!validEnvironment(environment)) return false;
  let payload: Awaited<ReturnType<typeof buildMetaLeadPayload>>;
  try {
    payload = await buildMetaLeadPayload(input);
  } catch {
    return false;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetcher(
      `https://graph.facebook.com/${META_CAPI_GRAPH_VERSION}/${environment.pixelId}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${environment.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
    );
    if (!response.ok) return false;
    const result = await response.json().catch(() => null) as
      | { events_received?: unknown; error?: unknown }
      | null;
    return result?.events_received === 1 && !result.error;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
