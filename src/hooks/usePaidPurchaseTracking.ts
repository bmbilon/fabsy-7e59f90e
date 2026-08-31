import { useEffect } from 'react';
import { createPaidPurchaseReporter } from '@/lib/paidPurchaseMeasurement';
import type { CheckoutReceipt } from '@/lib/checkoutReceipt';
import {
  currentGoogleMeasurementConfig, currentGooglePageContext,
  dispatchGoogleMeasurement, GOOGLE_MEASUREMENT_READY,
  removeCheckoutTokenFromUrl,
} from '@/lib/googleMeasurement';

// Retain memory deduplication across remounts; storage is optional.
const report = createPaidPurchaseReporter((eventName, params) => {
  // Hashing is asynchronous. A receipt may finish after this route unmounts;
  // require the same safe receipt page before the dispatcher rechecks consent.
  const current = currentGooglePageContext();
  if (!current || current.page_location !== params.page_location ||
      !/\/thank-you$/.test(new URL(current.page_location).pathname)) return false;
  return dispatchGoogleMeasurement(eventName, params);
}, {
  getItem: key => window.sessionStorage.getItem(key),
  setItem: (key, value) => window.sessionStorage.setItem(key, value),
});

export function usePaidPurchaseTracking(receipt: CheckoutReceipt | null, sessionId: string | null): void {
  useEffect(() => {
    removeCheckoutTokenFromUrl(sessionId);
  }, [sessionId]);

  useEffect(() => {
    const attempt = () => {
      const context = currentGooglePageContext();
      const config = currentGoogleMeasurementConfig();
      if (!context || !/\/thank-you$/.test(new URL(context.page_location).pathname)) return;
      void report(receipt, sessionId, config, context, Boolean(config.ga4Id || config.adsId))
        .catch(() => { /* Measurement must not interrupt a receipt or expose its token. */ });
    };
    window.addEventListener(GOOGLE_MEASUREMENT_READY, attempt);
    attempt();
    return () => window.removeEventListener(GOOGLE_MEASUREMENT_READY, attempt);
  }, [receipt, sessionId]);
}
