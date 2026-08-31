import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { initializeGoogleMeasurement } from '@/lib/googleMeasurement';

// Only route-triggered initialization/page views live here. Consent and expiry
// are watched by the persistent GoogleMeasurementGuardian in MeasurementRouter.
export default function Analytics() {
  const location = useLocation();
  useEffect(() => {
    initializeGoogleMeasurement();
  }, [location.pathname, location.search, location.hash]);
  return null;
}
