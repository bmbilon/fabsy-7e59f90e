import { useEffect } from 'react';
import { createPaidPurchaseReporter } from '@/lib/paidPurchaseMeasurement';
import type { CheckoutReceipt } from '@/lib/checkoutReceipt';
import {
  currentGoogleMeasurementConfig, currentGooglePageContext,
  dispatchGoogleMeasurement, GOOGLE_MEASUREMENT_READY,
  removeCheckoutTokenFromUrl,
} from '@/lib/googleMeasurement';

// Retain memory deduplication across remounts; storage is optional.
const report = createPaidPurchaseReporter(dispatchGoogleMeasurement, {
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
      report(receipt, sessionId, config, context, Boolean(config.ga4Id || config.adsId));
    };
    window.addEventListener(GOOGLE_MEASUREMENT_READY, attempt);
    attempt();
    return () => window.removeEventListener(GOOGLE_MEASUREMENT_READY, attempt);
  }, [receipt, sessionId]);
}
