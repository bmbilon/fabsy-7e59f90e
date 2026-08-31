export type GoogleConsentChoice = 'unknown' | 'accepted' | 'declined';

export const GOOGLE_CONSENT_CHANGED = 'fabsy:google-consent-changed';
export const GOOGLE_CONSENT_STORAGE_KEY = 'fabsy:google-measurement-consent:v1';
export const GOOGLE_CONSENT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

interface SavedConsent {
  version: 1;
  choice: 'accepted' | 'declined';
  savedAt: number;
}

// A blocked browser store must not stop the site working. An explicit choice
// may apply to this document only; a new document then starts with no consent.
let temporaryChoice: SavedConsent | null = null;
let writeProbeSequence = 0;

export function parseGoogleConsent(value: string | null, now = Date.now()): GoogleConsentChoice {
  if (!value || value.length > 512) return 'unknown';
  try {
    const saved: unknown = JSON.parse(value);
    if (!saved || typeof saved !== 'object') return 'unknown';
    const record = saved as Partial<SavedConsent>;
    if (record.version !== 1 || !['accepted', 'declined'].includes(record.choice ?? '') ||
        typeof record.savedAt !== 'number' || !Number.isFinite(record.savedAt) ||
        record.savedAt > now || now - record.savedAt >= GOOGLE_CONSENT_MAX_AGE_MS) return 'unknown';
    return record.choice as 'accepted' | 'declined';
  } catch {
    return 'unknown';
  }
}

function savedConsentValue(): string | null {
  if (typeof window === 'undefined') return null;
  if (temporaryChoice) return JSON.stringify(temporaryChoice);
  try {
    const value = window.localStorage.getItem(GOOGLE_CONSENT_STORAGE_KEY);
    if (parseGoogleConsent(value) === 'accepted') {
      // A readable but now read-only store could retain stale acceptance after
      // a failed withdrawal. Trust persisted acceptance only while the browser
      // can record changes. A short-lived, data-free probe also detects silent
      // failed writes/removals without changing the saved choice or its age.
      const probeKey = `${GOOGLE_CONSENT_STORAGE_KEY}:write-check:${Date.now()}:${++writeProbeSequence}:${Math.random()}`;
      window.localStorage.setItem(probeKey, '1');
      if (window.localStorage.getItem(probeKey) !== '1') return null;
      window.localStorage.removeItem(probeKey);
      if (window.localStorage.getItem(probeKey) !== null) return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function getGoogleConsentChoice(): GoogleConsentChoice {
  return parseGoogleConsent(savedConsentValue());
}

/** Schedule retirement even when a tagged page remains open and foregrounded. */
export function googleConsentRemainingMilliseconds(now = Date.now()): number | null {
  const value = savedConsentValue();
  if (parseGoogleConsent(value, now) === 'unknown') return null;
  const record = JSON.parse(value!) as SavedConsent;
  return Math.max(0, record.savedAt + GOOGLE_CONSENT_MAX_AGE_MS - now);
}

export function clearTemporaryGoogleConsent(): void {
  temporaryChoice = null;
}

export function setGoogleConsentChoice(choice: 'accepted' | 'declined'): void {
  if (typeof window === 'undefined' || !['accepted', 'declined'].includes(choice)) return;
  const record: SavedConsent = { version: 1, choice, savedAt: Date.now() };
  const value = JSON.stringify(record);
  try {
    window.localStorage.setItem(GOOGLE_CONSENT_STORAGE_KEY, value);
    if (window.localStorage.getItem(GOOGLE_CONSENT_STORAGE_KEY) !== value) throw new Error('Consent was not saved.');
    temporaryChoice = null;
  } catch {
    temporaryChoice = record;
    if (choice === 'declined') {
      try { window.localStorage.removeItem(GOOGLE_CONSENT_STORAGE_KEY); } catch { /* Persisted acceptance also requires a writable store on read. */ }
    }
  }
  window.dispatchEvent(new Event(GOOGLE_CONSENT_CHANGED));
}
