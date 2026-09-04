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
import { clearFunnelSessionState } from '@/lib/funnelSessionStorage';
import {
  clearConsentedMarketingAttribution,
  clearMarketingAttribution,
} from '@/lib/marketingAttribution';

/**
 * Document lifetime observer, independent of route children. A full navigation
 * can be slow or stall after the Router has hidden its old route. Until this
 * document is replaced, its loaded or pending measurement tags still need immediate
 * retirement on withdrawal, loss of durable consent, or expiry.
 */
export default function GoogleMeasurementGuardian() {
  useEffect(() => {
    let expiryTimer: number | undefined;
    let previousFabsyChoice = getFabsyFunnelConsentChoice();
    const recheck = (
      retireNonAcceptedFirstPartyState = false,
      auditUnknownFirstPartyState = false,
    ) => {
      window.clearTimeout(expiryTimer);
      recheckGoogleMeasurementConsent();
      recheckMetaMeasurementConsent();
      const fabsyChoice = getFabsyFunnelConsentChoice();
      const lostAcceptedGrant = previousFabsyChoice === 'accepted' && fabsyChoice === 'unknown';
      if (fabsyChoice === 'declined' ||
          (retireNonAcceptedFirstPartyState && fabsyChoice !== 'accepted')) {
        // This observer remains mounted even on secure routes where the
        // acquisition tracker is intentionally absent. Retire both durable and
        // document-only attribution here so a later consent grant cannot revive
        // campaign data after a refusal, cross-tab removal, or expiry. An
        // initial unknown choice is deliberately not retired: current-page
        // campaign data may remain memory-only until the visitor decides.
        clearMarketingAttribution();
        clearFunnelSessionState(window.sessionStorage);
        requestMetaCheckoutAttributionWithdrawal();
      } else if (auditUnknownFirstPartyState && fabsyChoice === 'unknown') {
        // A browser may wake after the saved grant expired or was removed while
        // this document was suspended, so no storage event or live timer is
        // guaranteed. Always retire state from the earlier grant. Preserve only
        // the current document's undecided, memory-only first touch so a fresh
        // visitor can still choose whether to retain the campaign that opened
        // this page.
        if (lostAcceptedGrant) clearMarketingAttribution();
        else clearConsentedMarketingAttribution();
        clearFunnelSessionState(window.sessionStorage);
        requestMetaCheckoutAttributionWithdrawal();
      }
      previousFabsyChoice = fabsyChoice;
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
      if (document.visibilityState === 'visible') recheck(false, true);
    };
    const onProviderStateChanged = () => recheck();
    const onFabsyConsentChanged = () => recheck(true);
    window.addEventListener(GOOGLE_CONTEXT_READY, onProviderStateChanged);
    window.addEventListener(GOOGLE_CONSENT_CHANGED, onProviderStateChanged);
    window.addEventListener(META_CONSENT_CHANGED, onProviderStateChanged);
    window.addEventListener(FABSY_FUNNEL_CONSENT_CHANGED, onFabsyConsentChanged);
    window.addEventListener('storage', onStorage);
    const onPageShow = () => recheck(false, true);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisible);
    recheck(false, true);
    return () => {
      window.clearTimeout(expiryTimer);
      window.removeEventListener(GOOGLE_CONTEXT_READY, onProviderStateChanged);
      window.removeEventListener(GOOGLE_CONSENT_CHANGED, onProviderStateChanged);
      window.removeEventListener(META_CONSENT_CHANGED, onProviderStateChanged);
      window.removeEventListener(FABSY_FUNNEL_CONSENT_CHANGED, onFabsyConsentChanged);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return null;
}
