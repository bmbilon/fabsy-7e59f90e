import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Capture gclid and UTM params; set as GA4 user_properties; store in localStorage for later use
export default function AcquisitionTracker() {
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const data: Record<string, string> = {};
    const keys = [
      'gclid',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
    ];
    let found = false;
    keys.forEach((k) => {
      const val = params.get(k);
      if (val) {
        data[k] = val;
        found = true;
      }
    });
    if (found) {
      const payload = {
        ...data,
        ts: Date.now(),
        path: location.pathname + location.search,
      };
      try {
        localStorage.setItem('fabsy_marketing', JSON.stringify(payload));
      } catch {}

      // Set GA4 user_properties if available
      const gtag = (window as any).gtag as undefined | ((...args: any[]) => void);
      if (typeof gtag === 'function') {
        try {
          gtag('set', 'user_properties', data);
        } catch {}
      }
    }
  }, [location]);

  return null;
}
