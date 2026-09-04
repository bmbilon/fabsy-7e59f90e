import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  captureMarketingAttribution,
  clearMarketingAttribution,
  persistPendingMarketingAttribution,
} from '@/lib/marketingAttribution';
import {
  FABSY_FUNNEL_CONSENT_CHANGED,
  getFabsyFunnelConsentChoice,
} from '@/lib/fabsyFunnelConsent';

// Capture campaign and external-referrer attribution before analytics page-view events fire.
export default function AcquisitionTracker() {
  const location = useLocation();

  useEffect(() => {
    captureMarketingAttribution(location.search, location.pathname, document.referrer);
  }, [location]);

  useEffect(() => {
    const onChoice = () => {
      if (getFabsyFunnelConsentChoice() === 'accepted') persistPendingMarketingAttribution();
      else clearMarketingAttribution();
    };
    window.addEventListener(FABSY_FUNNEL_CONSENT_CHANGED, onChoice);
    return () => window.removeEventListener(FABSY_FUNNEL_CONSENT_CHANGED, onChoice);
  }, []);

  return null;
}
