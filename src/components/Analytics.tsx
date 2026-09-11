import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { initializeGoogleMeasurement } from '@/lib/googleMeasurement';
import { initializeMetaMeasurement } from '@/lib/metaMeasurement';
import { initializeOpenAIAdsMeasurement } from '@/lib/openAIAdsMeasurement';

// Only route-triggered initialization/page views live here. Consent and expiry
// are watched by the persistent measurement guardian in MeasurementRouter.
export default function Analytics() {
  const location = useLocation();
  useEffect(() => {
    initializeGoogleMeasurement();
    initializeMetaMeasurement();
    initializeOpenAIAdsMeasurement();
  }, [location.pathname, location.search, location.hash]);
  return null;
}
