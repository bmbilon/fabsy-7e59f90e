import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

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
      gtag('event', 'page_view', {
        page_location: pageLocation,
        page_path: location.pathname,
        page_title: document.title,
        debug_mode: isDebugAnalyticsSession(),
      });
    }
  }, [location]);

  return null;
}
