import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Lightweight analytics loader for GA4 and optional Google Ads
// Set env vars in .env or environment: 
// - VITE_GA4_MEASUREMENT_ID=G-XXXXXXXX
// - VITE_GADS_ID=AW-XXXXXXXXXX (optional)
export default function Analytics() {
  const location = useLocation();

  useEffect(() => {
    const gaId = (import.meta as any).env?.VITE_GA4_MEASUREMENT_ID as string | undefined;
    const adsId = (import.meta as any).env?.VITE_GADS_ID as string | undefined;

    if (!gaId && !adsId) return; // nothing to load

    (window as any).dataLayer = (window as any).dataLayer || [];
    (window as any).gtag = (window as any).gtag || function gtag(){
      (window as any).dataLayer.push(arguments);
    };

    // Load GA4 script
    if (gaId) {
      const s = document.createElement('script');
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
      document.head.appendChild(s);
      (window as any).gtag('js', new Date());
      (window as any).gtag('config', gaId, {
        send_page_view: false,
      });
    }

    // Load Google Ads script
    if (adsId) {
      const s2 = document.createElement('script');
      s2.async = true;
      s2.src = `https://www.googletagmanager.com/gtag/js?id=${adsId}`;
      document.head.appendChild(s2);
      (window as any).gtag('config', adsId);
    }
  }, []);

  // Send a GA4 page_view on SPA route change
  useEffect(() => {
    const gaId = (import.meta as any).env?.VITE_GA4_MEASUREMENT_ID as string | undefined;
    const gtag = (window as any).gtag as undefined | ((...args: any[]) => void);
    if (gaId && typeof gtag === 'function') {
      gtag('event', 'page_view', {
        page_location: window.location.href,
        page_path: location.pathname + location.search,
        page_title: document.title,
      });
    }
  }, [location]);

  return null;
}
