export const REFERRAL_DRAFT_STORAGE_KEY = "fabsy-referral-draft-v1";
export const REFERRAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const REFERRAL_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

export interface ReferralAttribution {
  code: string;
  attributedAt: string;
  expiresAt: string;
  attributionToken: string;
}

export type ReferralStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function normalizeReferralCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

/** A browser validity check only. The server must verify the signed token. */
export function parseReferralAttribution(value: unknown, now = Date.now()): ReferralAttribution | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const code = normalizeReferralCode(candidate.code);
  if (!code || typeof candidate.attributedAt !== "string" || typeof candidate.expiresAt !== "string") return null;
  const attributedAt = Date.parse(candidate.attributedAt);
  const expiresAt = Date.parse(candidate.expiresAt);
  if (!Number.isFinite(now) || !Number.isFinite(attributedAt) || !Number.isFinite(expiresAt)) return null;
  if (attributedAt > now || expiresAt <= now || expiresAt <= attributedAt || expiresAt > attributedAt + REFERRAL_WINDOW_MS) return null;
  if (typeof candidate.attributionToken !== "string" || candidate.attributionToken.length < 20 || candidate.attributionToken.length > 8192 || /\s/.test(candidate.attributionToken)) return null;
  return {
    code,
    attributedAt: new Date(attributedAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    attributionToken: candidate.attributionToken,
  };
}

export function readReferralDraft(storage: ReferralStorage | null, now = Date.now()): ReferralAttribution | null {
  if (!storage) return null;
  try {
    const stored = JSON.parse(storage.getItem(REFERRAL_DRAFT_STORAGE_KEY) || "null");
    const referral = stored?.version === 1 ? parseReferralAttribution(stored.referral, now) : null;
    if (stored && !referral) storage.removeItem(REFERRAL_DRAFT_STORAGE_KEY);
    return referral;
  } catch {
    // Referral attribution is optional; blocked or malformed storage must not
    // prevent a driver from completing the intake.
    return null;
  }
}

export function writeReferralDraft(storage: ReferralStorage | null, value: unknown, now = Date.now()): ReferralAttribution | null {
  const referral = parseReferralAttribution(value, now);
  if (!referral) return null;
  try {
    // Deliberately project only these fields. Never serialize the intake,
    // licence image, identity details or a client-supplied verification flag.
    storage?.setItem(REFERRAL_DRAFT_STORAGE_KEY, JSON.stringify({ version: 1, referral }));
  } catch {
    // The browser controller retains attribution in memory when storage fails.
  }
  return referral;
}

export function latestReferralAttribution(values: unknown[], now = Date.now()): ReferralAttribution | null {
  return values.reduce<ReferralAttribution | null>((latest, value) => {
    const next = parseReferralAttribution(value, now);
    return next && (!latest || Date.parse(next.attributedAt) >= Date.parse(latest.attributedAt)) ? next : latest;
  }, null);
}

export function referralCodeFromLocation(location: { pathname: string; search: string }): string | null {
  const query = new URLSearchParams(location.search);
  if (query.has("ref")) return normalizeReferralCode(query.get("ref"));
  const match = /^\/r\/([^/]+)\/?$/.exec(location.pathname);
  if (!match) return null;
  try {
    return normalizeReferralCode(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

export class ReferralCaptureError extends Error {
  constructor(readonly reason: "invalid" | "unavailable") {
    super(reason === "invalid" ? "This referral code could not be verified." : "Referral verification is temporarily unavailable.");
  }
}

/** Keep the last requested touch when network responses arrive out of order. */
export function createReferralCaptureController(options: {
  read: () => ReferralAttribution | null;
  write: (referral: ReferralAttribution) => void;
  clear: () => void;
  request: (code: string) => Promise<unknown>;
  now?: () => number;
}) {
  let revision = 0;
  let appliedRevision = 0;
  const pending = new Map<string, Promise<unknown>>();
  return {
    async capture(input: unknown, force = false): Promise<ReferralAttribution | null> {
      const code = normalizeReferralCode(input);
      if (!code) throw new ReferralCaptureError("invalid");
      const requestRevision = ++revision;
      const now = options.now ?? Date.now;
      const existing = parseReferralAttribution(options.read(), now());
      // Navigation or reloading the same link must not extend its 30-day life.
      if (!force && existing?.code === code) {
        appliedRevision = requestRevision;
        return existing;
      }
      let request = pending.get(code);
      if (!request) {
        request = options.request(code);
        pending.set(code, request);
        void request.finally(() => {
          if (pending.get(code) === request) pending.delete(code);
        }).catch(() => { /* The awaiting caller handles a failed capture. */ });
      }
      let response: unknown;
      try {
        response = await request;
      } catch (error) {
        throw error instanceof ReferralCaptureError ? error : new ReferralCaptureError("unavailable");
      }
      const captured = parseReferralAttribution(response, now());
      if (!captured || captured.code !== code) throw new ReferralCaptureError("invalid");
      if (requestRevision < appliedRevision) return options.read();
      appliedRevision = requestRevision;
      options.write(captured);
      return captured;
    },
    clear() {
      appliedRevision = ++revision;
      options.clear();
    },
  };
}
