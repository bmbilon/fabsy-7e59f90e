import { useEffect } from 'react';
import { GOOGLE_CONTEXT_READY, recheckGoogleMeasurementConsent } from '@/lib/googleMeasurement';
import {
  clearTemporaryGoogleConsent, googleConsentRemainingMilliseconds,
  GOOGLE_CONSENT_CHANGED, GOOGLE_CONSENT_STORAGE_KEY,
} from '@/lib/googleConsent';

/**
 * Document lifetime observer, independent of route children. A full navigation
 * can be slow or stall after the Router has hidden its old route. Until this
 * document is replaced, its loaded or pending Google tag still needs immediate
 * retirement on withdrawal, loss of durable consent, or expiry.
 */
export default function GoogleMeasurementGuardian() {
  useEffect(() => {
    let expiryTimer: number | undefined;
    const recheck = () => {
      window.clearTimeout(expiryTimer);
      recheckGoogleMeasurementConsent();
      const remaining = googleConsentRemainingMilliseconds();
      if (remaining !== null) {
        // Browsers clamp larger delays to 1ms; re-arm in safe chunks. At expiry
        // retire any Google-touched document and refresh the consent UI.
        expiryTimer = window.setTimeout(() => window.dispatchEvent(new Event(GOOGLE_CONSENT_CHANGED)), Math.min(remaining + 1, 2_147_483_647));
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== GOOGLE_CONSENT_STORAGE_KEY && event.key !== null) return;
      clearTemporaryGoogleConsent();
      window.dispatchEvent(new Event(GOOGLE_CONSENT_CHANGED));
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') recheck();
    };
    window.addEventListener(GOOGLE_CONTEXT_READY, recheck);
    window.addEventListener(GOOGLE_CONSENT_CHANGED, recheck);
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', recheck);
    document.addEventListener('visibilitychange', onVisible);
    recheck();
    return () => {
      window.clearTimeout(expiryTimer);
      window.removeEventListener(GOOGLE_CONTEXT_READY, recheck);
      window.removeEventListener(GOOGLE_CONSENT_CHANGED, recheck);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', recheck);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return null;
}
