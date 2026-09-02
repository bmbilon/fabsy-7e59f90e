export const META_CAPI_EXPECTED_PIXEL_ID = "2917050565322500";
export const META_CAPI_GRAPH_VERSION = "v25.0";
export const META_CAPI_EVENT_SOURCE_URL = "https://fabsy.ca/rapid-resolution";
export const META_CAPI_CURRENCY = "CAD";

export const META_CAPI_CONTENT_IDS = [
  "rapid_resolution",
  "rapid_resolution_bundle",
] as const;

export type MetaCapiContentId = (typeof META_CAPI_CONTENT_IDS)[number];

const CHECKOUT_SESSION_PATTERN = /^cs_(?:test|live)_[A-Za-z0-9_]{8,240}$/;
const SESSION_HASH_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONSENT_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const META_BROWSER_ID_PATTERN = /^fb\.[0-9]{1,3}\.[0-9]{10,16}\.[A-Za-z0-9_-]{1,200}$/;
const MIN_MEASUREMENT_TIME_MS = Date.UTC(2024, 0, 1);
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const CONSENT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();

export interface MetaCapiRpcResult {
  data: unknown;
  error: unknown | null;
}

export interface MetaCapiRpcClient {
  rpc(
    functionName: string,
    parameters: Record<string, unknown>,
  ): PromiseLike<MetaCapiRpcResult>;
}

export interface MetaCheckoutAttributionInput {
  checkoutSessionId: string;
  consentGranted: boolean;
  consentVersion?: unknown;
  consentedAt?: unknown;
  fbp?: unknown;
  fbc?: unknown;
  /** Must come from the server request User-Agent header, never request JSON. */
  clientUserAgent?: unknown;
}

export interface MetaPurchaseEnqueueInput {
  checkoutSessionId: string;
  valueCents: number;
  /** The signed Stripe Event `created` value, in whole Unix seconds. */
  eventTimeEpochSeconds: number;
  contentId: MetaCapiContentId;
}

export type MetaAttributionResult =
  | { ok: true; recorded: true; cleared: false }
  | {
    ok: true;
    recorded: false;
    cleared: true;
    reason: "not_consented" | "insufficient_attribution";
  }
  | { ok: false; recorded: false; cleared: boolean; reason: MetaIntegrationFailure };

export type MetaPurchaseEnqueueResult =
  | { ok: true; queued: true; outboxId: string }
  | { ok: true; queued: false; reason: "no_consented_attribution" };

export type MetaIntegrationFailure =
  | "invalid_checkout_session"
  | "invalid_consent"
  | "invalid_user_agent"
  | "invalid_purchase"
  | "attribution_rpc_failed"
  | "clear_rpc_failed"
  | "enqueue_rpc_failed";

export interface MetaPurchaseClaim {
  outboxId: string;
  leaseToken: string;
  eventId: string;
  eventTimeEpoch: number;
  valueCents: number;
  currency: "CAD";
  contentId: MetaCapiContentId;
  fbp: string | null;
  fbc: string | null;
  clientUserAgent: string;
  attemptCount: number;
  leaseExpiresEpoch: number;
}

export interface MetaPurchaseLease {
  outboxId: string;
  leaseToken: string;
}

export interface MetaPurchaseEventPayload {
  data: [{
    event_name: "Purchase";
    event_time: number;
    event_id: string;
    action_source: "website";
    event_source_url: string;
    user_data: {
      client_user_agent: string;
      fbp?: string;
      fbc?: string;
    };
    custom_data: {
      currency: "CAD";
      value: number;
      content_ids: [MetaCapiContentId];
      content_type: "product";
    };
  }];
}

export class MetaCapiDeliveryError extends Error {
  readonly code: MetaIntegrationFailure;

  constructor(code: MetaIntegrationFailure) {
    super(code);
    this.name = "MetaCapiDeliveryError";
    this.code = code;
  }
}

function normalizeCheckoutSessionId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 255 ||
    !CHECKOUT_SESSION_PATTERN.test(value)
  ) {
    throw new MetaCapiDeliveryError("invalid_checkout_session");
  }
  return value;
}

function normalizeConsentVersion(value: unknown): string {
  if (typeof value !== "string") {
    throw new MetaCapiDeliveryError("invalid_consent");
  }
  const normalized = value.trim();
  if (!CONSENT_VERSION_PATTERN.test(normalized)) {
    throw new MetaCapiDeliveryError("invalid_consent");
  }
  return normalized;
}

function normalizeMeasurementTime(value: unknown, now = Date.now()): string {
  const parsed = value instanceof Date
    ? value.getTime()
    : typeof value === "number"
    ? value
    : typeof value === "string"
    ? Date.parse(value)
    : Number.NaN;
  if (
    !Number.isFinite(parsed) ||
    parsed < MIN_MEASUREMENT_TIME_MS ||
    now - parsed >= CONSENT_MAX_AGE_MS ||
    parsed > now + MAX_CLOCK_SKEW_MS
  ) {
    throw new MetaCapiDeliveryError("invalid_consent");
  }
  return new Date(parsed).toISOString();
}

export function sanitizeMetaBrowserId(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 255) return null;
  const normalized = value.trim();
  return META_BROWSER_ID_PATTERN.test(normalized) ? normalized : null;
}

export function sanitizeMetaUserAgent(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4096) return null;
  let printable = "";
  for (const character of value) {
    const code = character.codePointAt(0) || 0;
    printable += code <= 31 || (code >= 127 && code <= 159) ? " " : character;
  }
  const normalized = printable
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 512);
  if (!normalized) return null;
  return new TextEncoder().encode(normalized).byteLength <= 1024
    ? normalized
    : null;
}

export function isMetaCapiContentId(value: unknown): value is MetaCapiContentId {
  return value === "rapid_resolution" || value === "rapid_resolution_bundle";
}

export function isMetaCapiPurchaseValue(
  contentId: unknown,
  valueCents: unknown,
): contentId is MetaCapiContentId {
  return Number.isSafeInteger(valueCents) && (
    (contentId === "rapid_resolution" && (valueCents === 19_800 || valueCents === 15_840)) ||
    (contentId === "rapid_resolution_bundle" && (valueCents === 22_900 || valueCents === 18_320))
  );
}

export async function sha256CheckoutSessionId(value: unknown): Promise<string> {
  const sessionId = normalizeCheckoutSessionId(value);
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(sessionId));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function failureCode(error: unknown, fallback: MetaIntegrationFailure): MetaIntegrationFailure {
  return error instanceof MetaCapiDeliveryError ? error.code : fallback;
}

function emitSafeWarning(code: MetaIntegrationFailure): void {
  // Never pass the provider/database error object here: it can contain RPC
  // arguments. The code is from the closed union above and contains no user data.
  console.warn(`[meta-capi] ${code}`);
}

async function clearMetaAttribution(
  client: MetaCapiRpcClient,
  sessionHash: string,
): Promise<void> {
  try {
    const result = await client.rpc("clear_meta_checkout_attribution", {
      p_session_hash: sessionHash,
    });
    if (result.error || result.data !== true) {
      throw new MetaCapiDeliveryError("clear_rpc_failed");
    }
  } catch (error) {
    if (error instanceof MetaCapiDeliveryError) throw error;
    throw new MetaCapiDeliveryError("clear_rpc_failed");
  }
}

/** Required withdrawal/expiry cleanup for a raw, signed Stripe session id. */
export async function clearMetaCheckoutAttribution(
  client: MetaCapiRpcClient,
  checkoutSessionId: unknown,
): Promise<void> {
  const sessionHash = await sha256CheckoutSessionId(checkoutSessionId);
  await clearMetaAttribution(client, sessionHash);
}

/**
 * Called after Stripe creates or reuses a Checkout Session.
 *
 * A false consent value invokes the withdrawal RPC for that same hashed session.
 * All failures are contained so checkout creation remains available.
 */
export async function recordMetaCheckoutAttributionBestEffort(
  client: MetaCapiRpcClient,
  input: MetaCheckoutAttributionInput,
): Promise<MetaAttributionResult> {
  let sessionHash: string;
  try {
    sessionHash = await sha256CheckoutSessionId(input.checkoutSessionId);
  } catch (error) {
    const reason = failureCode(error, "invalid_checkout_session");
    emitSafeWarning(reason);
    return { ok: false, recorded: false, cleared: false, reason };
  }

  if (input.consentGranted !== true) {
    try {
      await clearMetaAttribution(client, sessionHash);
      return { ok: true, recorded: false, cleared: true, reason: "not_consented" };
    } catch {
      emitSafeWarning("clear_rpc_failed");
      return {
        ok: false,
        recorded: false,
        cleared: false,
        reason: "clear_rpc_failed",
      };
    }
  }

  try {
    const fbp = sanitizeMetaBrowserId(input.fbp);
    const fbc = sanitizeMetaBrowserId(input.fbc);
    if (!fbp && !fbc) {
      await clearMetaAttribution(client, sessionHash);
      return {
        ok: true,
        recorded: false,
        cleared: true,
        reason: "insufficient_attribution",
      };
    }
    const consentVersion = normalizeConsentVersion(input.consentVersion);
    const consentedAt = normalizeMeasurementTime(input.consentedAt);
    const clientUserAgent = sanitizeMetaUserAgent(input.clientUserAgent);
    if (!clientUserAgent) throw new MetaCapiDeliveryError("invalid_user_agent");

    const result = await client.rpc("record_meta_checkout_attribution", {
      p_session_hash: sessionHash,
      p_consent_version: consentVersion,
      p_consented_at: consentedAt,
      p_client_user_agent: clientUserAgent,
      p_fbp: fbp,
      p_fbc: fbc,
    });
    if (result.error || result.data !== true) {
      throw new MetaCapiDeliveryError("attribution_rpc_failed");
    }
    return { ok: true, recorded: true, cleared: false };
  } catch (error) {
    const reason = failureCode(error, "attribution_rpc_failed");
    // A malformed grant, an unusable server UA, or an uncertain record RPC
    // result cannot authorize a reusable checkout. The RPC might have committed
    // even when its response failed, so confirm withdrawal before returning.
    try {
      await clearMetaAttribution(client, sessionHash);
      emitSafeWarning(reason);
      return { ok: false, recorded: false, cleared: true, reason };
    } catch {
      emitSafeWarning("clear_rpc_failed");
      return { ok: false, recorded: false, cleared: false, reason: "clear_rpc_failed" };
    }
  }
}

/**
 * Called only after the signed payment webhook independently verifies a paid,
 * officer-issued Rapid Resolution checkout. A missing attribution is an
 * intentional no-op. Input or RPC failures throw a data-free error so the
 * webhook can fail and Stripe can retry it.
 */
export async function enqueueMetaPurchase(
  client: MetaCapiRpcClient,
  input: MetaPurchaseEnqueueInput,
): Promise<MetaPurchaseEnqueueResult> {
  const sessionHash = await sha256CheckoutSessionId(input.checkoutSessionId);
  if (
    !Number.isSafeInteger(input.valueCents) ||
    !isMetaCapiPurchaseValue(input.contentId, input.valueCents) ||
    !Number.isSafeInteger(input.eventTimeEpochSeconds) ||
    input.eventTimeEpochSeconds < MIN_MEASUREMENT_TIME_MS / 1000 ||
    input.eventTimeEpochSeconds > Math.floor((Date.now() + MAX_CLOCK_SKEW_MS) / 1000) ||
    !isMetaCapiContentId(input.contentId)
  ) {
    throw new MetaCapiDeliveryError("invalid_purchase");
  }
  const result = await client.rpc("enqueue_meta_capi_purchase", {
    p_session_hash: sessionHash,
    p_value_cents: input.valueCents,
    p_event_time: new Date(input.eventTimeEpochSeconds * 1000).toISOString(),
    p_content_id: input.contentId,
  });
  if (result.error) throw new MetaCapiDeliveryError("enqueue_rpc_failed");
  if (result.data === null) {
    return { ok: true, queued: false, reason: "no_consented_attribution" };
  }
  if (typeof result.data !== "string" || !UUID_PATTERN.test(result.data)) {
    throw new MetaCapiDeliveryError("enqueue_rpc_failed");
  }
  return { ok: true, queued: true, outboxId: result.data };
}

function readInteger(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value)
    ? Number(value)
    : Number.NaN;
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Validate the opaque reservation returned before any identifiers are read. */
export function parseMetaPurchaseLease(value: unknown): MetaPurchaseLease | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.outbox_id !== "string" || !UUID_PATTERN.test(row.outbox_id) ||
    typeof row.lease_token !== "string" || !UUID_PATTERN.test(row.lease_token)
  ) {
    return null;
  }
  return { outboxId: row.outbox_id, leaseToken: row.lease_token };
}

/** Validate the security-definer claim result again before any network call. */
export function parseMetaPurchaseClaim(value: unknown): MetaPurchaseClaim | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const eventTimeEpoch = readInteger(row.event_time_epoch);
  const valueCents = readInteger(row.value_cents);
  const attemptCount = readInteger(row.attempt_count);
  const leaseExpiresEpoch = readInteger(row.lease_expires_epoch);
  const fbp = row.fbp === null ? null : sanitizeMetaBrowserId(row.fbp);
  const fbc = row.fbc === null ? null : sanitizeMetaBrowserId(row.fbc);
  const userAgent = sanitizeMetaUserAgent(row.client_user_agent);
  if (
    typeof row.outbox_id !== "string" || !UUID_PATTERN.test(row.outbox_id) ||
    typeof row.lease_token !== "string" || !UUID_PATTERN.test(row.lease_token) ||
    typeof row.event_id !== "string" || !/^[0-9a-f]{64}$/.test(row.event_id) ||
    eventTimeEpoch === null || eventTimeEpoch < MIN_MEASUREMENT_TIME_MS / 1000 ||
    eventTimeEpoch > Math.floor((Date.now() + MAX_CLOCK_SKEW_MS) / 1000) ||
    valueCents === null || !isMetaCapiPurchaseValue(row.content_id, valueCents) ||
    row.currency !== META_CAPI_CURRENCY ||
    !isMetaCapiContentId(row.content_id) ||
    (row.fbp !== null && fbp === null) ||
    (row.fbc !== null && fbc === null) ||
    userAgent === null || userAgent !== row.client_user_agent ||
    attemptCount === null || attemptCount < 1 ||
    leaseExpiresEpoch === null || leaseExpiresEpoch <= Math.floor(Date.now() / 1000) ||
    leaseExpiresEpoch > Math.floor(Date.now() / 1000) + 300
  ) {
    return null;
  }
  return {
    outboxId: row.outbox_id,
    leaseToken: row.lease_token,
    eventId: row.event_id,
    eventTimeEpoch,
    valueCents,
    currency: "CAD",
    contentId: row.content_id,
    fbp,
    fbc,
    clientUserAgent: userAgent,
    attemptCount,
    leaseExpiresEpoch,
  };
}

export function buildMetaPurchasePayload(claim: MetaPurchaseClaim): MetaPurchaseEventPayload {
  const userData: MetaPurchaseEventPayload["data"][0]["user_data"] = {
    client_user_agent: claim.clientUserAgent,
  };
  if (claim.fbp) userData.fbp = claim.fbp;
  if (claim.fbc) userData.fbc = claim.fbc;
  return {
    data: [{
      event_name: "Purchase",
      event_time: claim.eventTimeEpoch,
      event_id: claim.eventId,
      action_source: "website",
      event_source_url: META_CAPI_EVENT_SOURCE_URL,
      user_data: userData,
      custom_data: {
        currency: "CAD",
        value: Number((claim.valueCents / 100).toFixed(2)),
        content_ids: [claim.contentId],
        content_type: "product",
      },
    }],
  };
}

export function isSessionHash(value: unknown): value is string {
  return typeof value === "string" && SESSION_HASH_PATTERN.test(value);
}
