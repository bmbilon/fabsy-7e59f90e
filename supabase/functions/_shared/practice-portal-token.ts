/**
 * Client portal tokens: ahp1.{clientId}.{iat}.{exp}.{sig}
 *
 * iat and exp are unix seconds, exp - iat is at most 31 days, and
 * sig = base64url(HMAC-SHA256(secret, "ahp1.{clientId}.{iat}.{exp}")).
 * Web Crypto only (no Deno or Node APIs), so the same module signs links in
 * the notice worker, verifies them in practice-portal and runs in the Node
 * test suite. Revocation (ltb_clients.portal_revoked_before) is checked by the
 * caller against the session row with portalTokenRevoked().
 */

export const PORTAL_TOKEN_VERSION = "ahp1";
export const PORTAL_TOKEN_MAX_LIFETIME_SECONDS = 31 * 86_400;
export const PORTAL_SECRET_MIN_LENGTH = 32;
/** Tolerated clock difference for an iat slightly ahead of this server. */
const CLOCK_SKEW_SECONDS = 300;

export interface PortalTokenClaims {
  clientId: string;
  /** Issued at, unix seconds. */
  iat: number;
  /** Expires at, unix seconds. */
  exp: number;
}

export class PortalTokenError extends Error {
  constructor(public code: "signing_secret_missing" | "token_claims_invalid") {
    super(code);
  }
}

const CLIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SECONDS = /^[1-9]\d{0,11}$/;
const SIGNATURE = /^[A-Za-z0-9_-]{43}$/;
const encoder = new TextEncoder();

let cachedKey: { secret: string; key: Promise<CryptoKey> } | null = null;

function hmacKey(secret: string): Promise<CryptoKey> {
  if (cachedKey?.secret !== secret) {
    cachedKey = {
      secret,
      key: crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
    };
  }
  return cachedKey.key;
}

export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signature(secret: string, payload: string): Promise<string> {
  const digest = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload));
  return base64url(new Uint8Array(digest));
}

/** Compares two strings without an early exit on the first difference. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

function validClaims(claims: PortalTokenClaims): boolean {
  return CLIENT_ID.test(claims.clientId) && Number.isSafeInteger(claims.iat) && Number.isSafeInteger(claims.exp) &&
    claims.iat > 0 && claims.exp > claims.iat && claims.exp - claims.iat <= PORTAL_TOKEN_MAX_LIFETIME_SECONDS;
}

export async function signPortalToken(secret: string, claims: PortalTokenClaims): Promise<string> {
  if (typeof secret !== "string" || secret.length < PORTAL_SECRET_MIN_LENGTH) {
    throw new PortalTokenError("signing_secret_missing");
  }
  const normalized = { ...claims, clientId: String(claims.clientId || "").toLowerCase() };
  if (!validClaims(normalized)) throw new PortalTokenError("token_claims_invalid");
  const payload = `${PORTAL_TOKEN_VERSION}.${normalized.clientId}.${normalized.iat}.${normalized.exp}`;
  return `${payload}.${await signature(secret, payload)}`;
}

/** Signs a token valid for `days` from `issuedAt` (unix seconds; defaults to now). */
export function issuePortalToken(
  secret: string, clientId: string, options: { issuedAt?: number; days: number; nowMs?: number },
): Promise<string> {
  const iat = options.issuedAt ?? Math.floor((options.nowMs ?? Date.now()) / 1000);
  return signPortalToken(secret, { clientId, iat, exp: iat + Math.round(options.days * 86_400) });
}

/**
 * Returns the claims of a well-formed, correctly signed, unexpired token, or
 * null. Every rejection looks the same to the caller.
 */
export async function verifyPortalToken(
  secret: string, token: unknown, nowMs: number = Date.now(),
): Promise<PortalTokenClaims | null> {
  if (typeof secret !== "string" || secret.length < PORTAL_SECRET_MIN_LENGTH) return null;
  if (typeof token !== "string" || token.length > 200) return null;
  const parts = token.split(".");
  if (parts.length !== 5) return null;
  const [version, clientId, iatText, expText, sig] = parts;
  if (version !== PORTAL_TOKEN_VERSION || !CLIENT_ID.test(clientId) || !SECONDS.test(iatText) ||
      !SECONDS.test(expText) || !SIGNATURE.test(sig)) return null;
  const claims = { clientId, iat: Number(iatText), exp: Number(expText) };
  const now = Math.floor(nowMs / 1000);
  if (!validClaims(claims) || claims.exp <= now || claims.iat > now + CLOCK_SKEW_SECONDS) return null;
  const expected = await signature(secret, `${version}.${clientId}.${iatText}.${expText}`);
  return constantTimeEqual(sig, expected) ? claims : null;
}

/**
 * True when access was revoked after the token was issued. A revocation time
 * that cannot be read fails closed.
 */
export function portalTokenRevoked(claims: PortalTokenClaims, revokedBefore: unknown): boolean {
  if (revokedBefore === null || revokedBefore === undefined || revokedBefore === "") return false;
  const revokedAt = Date.parse(String(revokedBefore));
  return !Number.isFinite(revokedAt) || claims.iat * 1000 < revokedAt;
}
