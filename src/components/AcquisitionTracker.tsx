import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { captureMarketingAttribution } from '@/lib/marketingAttribution';

// Capture campaign and external-referrer attribution before analytics page-view events fire.
export default function AcquisitionTracker() {
  const location = useLocation();

  useEffect(() => {
    captureMarketingAttribution(location.search, location.pathname, document.referrer);
  }, [location]);

  return null;
}
