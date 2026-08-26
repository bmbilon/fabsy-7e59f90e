export type ConsentAccessDenial = "expired" | "revoked";

export interface ConsentAccessRecord {
  status: string;
  expires_at: string;
  access_revoked_at?: string | null;
}

/**
 * Fail closed for malformed expiry values. Post-completion access revocation
 * does not change the immutable `completed` consent status or signed audit.
 */
export function consentAccessDenial(
  invite: ConsentAccessRecord,
  nowMs = Date.now(),
): ConsentAccessDenial | null {
  if (invite.status === "expired") return "expired";
  if (invite.status === "revoked" || Boolean(invite.access_revoked_at)) {
    return "revoked";
  }
  const expiryMs = Date.parse(invite.expires_at);
  if (!Number.isFinite(expiryMs) || expiryMs <= nowMs) {
    return "expired";
  }
  return null;
}

/**
 * Supabase signed-URL lifetimes are whole seconds. Flooring ensures a URL can
 * never outlive the invitation even when the remaining lifetime is fractional.
 */
export function signedUrlLifetimeSeconds(
  expiresAt: string,
  nowMs = Date.now(),
  maximumSeconds = 600,
) {
  if (!Number.isSafeInteger(maximumSeconds) || maximumSeconds < 1) return 0;
  const expiryMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiryMs)) return 0;
  const remainingSeconds = Math.floor((expiryMs - nowMs) / 1000);
  return Math.max(0, Math.min(maximumSeconds, remainingSeconds));
}
