import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { captureMarketingAttribution } from '@/lib/marketingAttribution';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fabsyAnalyticsInitialized?: boolean;
  }
}

const PRODUCTION_GA4_MEASUREMENT_ID = 'G-26G8CMWTKY';

function getGa4MeasurementId() {
  const configuredId = import.meta.env.VITE_GA4_MEASUREMENT_ID as string | undefined;
  return configuredId || (import.meta.env.PROD ? PRODUCTION_GA4_MEASUREMENT_ID : undefined);
}

function isPrivateAnalyticsRoute(pathname: string) {
  return pathname.startsWith('/portal') ||
    pathname.startsWith('/admin') ||
    pathname === '/insurance-damage-report/intake';
}

function isDebugAnalyticsSession() {
  return new URLSearchParams(window.location.search).get('ga_debug') === '1';
}

// Lightweight analytics loader for GA4 and optional Google Ads
// Set env vars in .env or environment: 
// - VITE_GA4_MEASUREMENT_ID=G-XXXXXXXX
// - VITE_GADS_ID=AW-XXXXXXXXXX (optional)
export default function Analytics() {
  const location = useLocation();

  useEffect(() => {
    if (isPrivateAnalyticsRoute(location.pathname) || window.fabsyAnalyticsInitialized) return;
    const gaId = getGa4MeasurementId();
    const adsId = import.meta.env.VITE_GADS_ID as string | undefined;

    if (!gaId && !adsId) return; // nothing to load

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag(..._args: unknown[]) {
      // Google expects each command to be queued as the function's arguments object.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer?.push(arguments);
    };

    // One gtag.js loader can configure both GA4 and Google Ads destinations.
    const loaderId = gaId || adsId;
    if (loaderId && !document.getElementById('fabsy-google-tag')) {
      const s = document.createElement('script');
      s.id = 'fabsy-google-tag';
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${loaderId}`;
      document.head.appendChild(s);
      window.gtag?.('js', new Date());
    }

    if (gaId) {
      window.gtag('config', gaId, {
        send_page_view: false,
        debug_mode: isDebugAnalyticsSession(),
      });

      const attribution = captureMarketingAttribution(
        window.location.search,
        location.pathname,
        document.referrer,
      );
      if (attribution.llm_source || attribution.utm_source) {
        window.gtag('set', 'user_properties', {
          acquisition_source: attribution.llm_source || attribution.utm_source,
        });
      }
      if (attribution.llm_source) {
        try {
          const sessionKey = `fabsy-llm-referral:${attribution.llm_source}:${attribution.landing_page || location.pathname}`;
          if (!window.sessionStorage.getItem(sessionKey)) {
            window.gtag('event', 'llm_referral', {
              llm_source: attribution.llm_source,
              landing_page: attribution.landing_page || location.pathname,
              referrer_host: attribution.referrer_host,
            });
            window.sessionStorage.setItem(sessionKey, '1');
          }
        } catch {
          // Analytics continues when session storage is unavailable.
        }
      }
    }

    if (adsId) {
      window.gtag('config', adsId);
    }
    window.fabsyAnalyticsInitialized = true;
  }, [location.pathname]);

  // Send a GA4 page_view on SPA route change
  useEffect(() => {
    const gaId = getGa4MeasurementId();
    const gtag = window.gtag;
    if (gaId && typeof gtag === 'function' && !isPrivateAnalyticsRoute(location.pathname)) {
      const pageLocation = `${window.location.origin}${location.pathname}`;
      const attribution = captureMarketingAttribution(
        window.location.search,
        location.pathname,
        document.referrer,
      );
      gtag('event', 'page_view', {
        page_location: pageLocation,
        page_path: location.pathname,
        page_title: document.title,
        llm_source: attribution.llm_source,
        first_landing_page: attribution.landing_page,
        debug_mode: isDebugAnalyticsSession(),
      });
    }
  }, [location]);

  return null;
}
