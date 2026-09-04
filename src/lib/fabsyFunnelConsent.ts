export type FabsyFunnelConsentChoice = 'unknown' | 'accepted' | 'declined';

export const FABSY_FUNNEL_CONSENT_CHANGED = 'fabsy:funnel-consent-changed';
export const FABSY_FUNNEL_CONSENT_STORAGE_KEY = 'fabsy:first-party-funnel-consent:v1';
export const FABSY_FUNNEL_CONSENT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

interface SavedConsent {
  version: 1;
  choice: 'accepted' | 'declined';
  savedAt: number;
}

let temporaryChoice: SavedConsent | null = null;
let writeProbeSequence = 0;

export function parseFabsyFunnelConsent(
  value: string | null,
  now = Date.now(),
): FabsyFunnelConsentChoice {
  if (!value || value.length > 512) return 'unknown';
  try {
    const saved: unknown = JSON.parse(value);
    if (!saved || typeof saved !== 'object') return 'unknown';
    const record = saved as Partial<SavedConsent>;
    if (record.version !== 1 || !['accepted', 'declined'].includes(record.choice ?? '') ||
        typeof record.savedAt !== 'number' || !Number.isFinite(record.savedAt) ||
        record.savedAt > now || now - record.savedAt >= FABSY_FUNNEL_CONSENT_MAX_AGE_MS) return 'unknown';
    return record.choice as 'accepted' | 'declined';
  } catch {
    return 'unknown';
  }
}

function savedValue(): string | null {
  if (typeof window === 'undefined') return null;
  if (temporaryChoice) return JSON.stringify(temporaryChoice);
  try {
    const value = window.localStorage.getItem(FABSY_FUNNEL_CONSENT_STORAGE_KEY);
    if (parseFabsyFunnelConsent(value) === 'accepted') {
      const probeKey = `${FABSY_FUNNEL_CONSENT_STORAGE_KEY}:write-check:${Date.now()}:${++writeProbeSequence}:${Math.random()}`;
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

export function getFabsyFunnelConsentChoice(): FabsyFunnelConsentChoice {
  return parseFabsyFunnelConsent(savedValue());
}

export function getFabsyFunnelConsentGrant(): { version: 1; savedAt: number } | null {
  const value = savedValue();
  if (parseFabsyFunnelConsent(value) !== 'accepted') return null;
  try {
    const record = JSON.parse(value!) as SavedConsent;
    return { version: 1, savedAt: record.savedAt };
  } catch {
    return null;
  }
}

export function fabsyFunnelConsentRemainingMilliseconds(now = Date.now()): number | null {
  const value = savedValue();
  if (parseFabsyFunnelConsent(value, now) === 'unknown') return null;
  const record = JSON.parse(value!) as SavedConsent;
  return Math.max(0, record.savedAt + FABSY_FUNNEL_CONSENT_MAX_AGE_MS - now);
}

export function clearTemporaryFabsyFunnelConsent(): void {
  temporaryChoice = null;
}

export function setFabsyFunnelConsentChoice(choice: 'accepted' | 'declined'): void {
  if (typeof window === 'undefined' || !['accepted', 'declined'].includes(choice)) return;
  const record: SavedConsent = { version: 1, choice, savedAt: Date.now() };
  const value = JSON.stringify(record);
  try {
    window.localStorage.setItem(FABSY_FUNNEL_CONSENT_STORAGE_KEY, value);
    if (window.localStorage.getItem(FABSY_FUNNEL_CONSENT_STORAGE_KEY) !== value) {
      throw new Error('Consent was not saved.');
    }
    temporaryChoice = null;
  } catch {
    temporaryChoice = record;
    if (choice === 'declined') {
      try { window.localStorage.removeItem(FABSY_FUNNEL_CONSENT_STORAGE_KEY); } catch { /* Non-consent remains the default. */ }
    }
  }
  window.dispatchEvent(new Event(FABSY_FUNNEL_CONSENT_CHANGED));
}
