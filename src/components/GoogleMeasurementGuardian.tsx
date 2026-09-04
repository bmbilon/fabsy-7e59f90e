import { useEffect } from 'react';
import { GOOGLE_CONTEXT_READY, recheckGoogleMeasurementConsent } from '@/lib/googleMeasurement';
import {
  clearTemporaryGoogleConsent, clearTemporaryMetaConsent,
  googleConsentRemainingMilliseconds, metaConsentRemainingMilliseconds,
  GOOGLE_CONSENT_CHANGED, GOOGLE_CONSENT_STORAGE_KEY,
  META_CONSENT_CHANGED, META_CONSENT_STORAGE_KEY,
} from '@/lib/googleConsent';
import { recheckMetaMeasurementConsent } from '@/lib/metaMeasurement';
import {
  clearTemporaryFabsyFunnelConsent,
  fabsyFunnelConsentRemainingMilliseconds,
  FABSY_FUNNEL_CONSENT_CHANGED,
  FABSY_FUNNEL_CONSENT_STORAGE_KEY,
  getFabsyFunnelConsentChoice,
} from '@/lib/fabsyFunnelConsent';
import { requestMetaCheckoutAttributionWithdrawal } from '@/lib/metaCheckoutWithdrawal';

/**
 * Document lifetime observer, independent of route children. A full navigation
 * can be slow or stall after the Router has hidden its old route. Until this
 * document is replaced, its loaded or pending measurement tags still need immediate
 * retirement on withdrawal, loss of durable consent, or expiry.
 */
export default function GoogleMeasurementGuardian() {
  useEffect(() => {
    let expiryTimer: number | undefined;
    const recheck = () => {
      window.clearTimeout(expiryTimer);
      recheckGoogleMeasurementConsent();
      recheckMetaMeasurementConsent();
      if (getFabsyFunnelConsentChoice() !== 'accepted') {
        requestMetaCheckoutAttributionWithdrawal();
      }
      const remaining = [
        googleConsentRemainingMilliseconds(),
        metaConsentRemainingMilliseconds(),
        fabsyFunnelConsentRemainingMilliseconds(),
      ]
        .filter((value): value is number => value !== null)
        .reduce<number | null>((soonest, value) => soonest === null ? value : Math.min(soonest, value), null);
      if (remaining !== null) {
        // Browsers clamp larger delays to 1ms; re-arm in safe chunks. At expiry
        // retire any touched document and refresh both provider states.
        expiryTimer = window.setTimeout(() => {
          window.dispatchEvent(new Event(GOOGLE_CONSENT_CHANGED));
          window.dispatchEvent(new Event(META_CONSENT_CHANGED));
          window.dispatchEvent(new Event(FABSY_FUNNEL_CONSENT_CHANGED));
        }, Math.min(remaining + 1, 2_147_483_647));
      }
    };
    const onStorage = (event: StorageEvent) => {
      const googleChanged = event.key === GOOGLE_CONSENT_STORAGE_KEY || event.key === null;
      const metaChanged = event.key === META_CONSENT_STORAGE_KEY || event.key === null;
      const fabsyChanged = event.key === FABSY_FUNNEL_CONSENT_STORAGE_KEY || event.key === null;
      if (!googleChanged && !metaChanged && !fabsyChanged) return;

      // Clear every affected document-only fallback before dispatching either
      // event. localStorage.clear() reports a null key, so a synchronous
      // provider recheck must never see the other provider's stale choice.
      if (googleChanged) clearTemporaryGoogleConsent();
      if (metaChanged) clearTemporaryMetaConsent();
      if (fabsyChanged) clearTemporaryFabsyFunnelConsent();
      if (googleChanged) window.dispatchEvent(new Event(GOOGLE_CONSENT_CHANGED));
      if (metaChanged) window.dispatchEvent(new Event(META_CONSENT_CHANGED));
      if (fabsyChanged) window.dispatchEvent(new Event(FABSY_FUNNEL_CONSENT_CHANGED));
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') recheck();
    };
    window.addEventListener(GOOGLE_CONTEXT_READY, recheck);
    window.addEventListener(GOOGLE_CONSENT_CHANGED, recheck);
    window.addEventListener(META_CONSENT_CHANGED, recheck);
    window.addEventListener(FABSY_FUNNEL_CONSENT_CHANGED, recheck);
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', recheck);
    document.addEventListener('visibilitychange', onVisible);
    recheck();
    return () => {
      window.clearTimeout(expiryTimer);
      window.removeEventListener(GOOGLE_CONTEXT_READY, recheck);
      window.removeEventListener(GOOGLE_CONSENT_CHANGED, recheck);
      window.removeEventListener(META_CONSENT_CHANGED, recheck);
      window.removeEventListener(FABSY_FUNNEL_CONSENT_CHANGED, recheck);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', recheck);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return null;
}
