import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { GOOGLE_CONTEXT_READY, initializeGoogleMeasurement } from '@/lib/googleMeasurement';

// Destinations stay disabled until the explicit build gate passes privacy QA.
export default function Analytics() {
  const location = useLocation();
  useEffect(() => {
    window.addEventListener(GOOGLE_CONTEXT_READY, initializeGoogleMeasurement);
    initializeGoogleMeasurement();
    return () => window.removeEventListener(GOOGLE_CONTEXT_READY, initializeGoogleMeasurement);
  }, [location.pathname, location.search, location.hash]);
  return null;
}
