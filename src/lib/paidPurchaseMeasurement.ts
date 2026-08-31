import { paidCheckoutSummary, purchaseAdsDestination, type CheckoutReceipt } from "./checkoutReceipt";

export interface PaidPurchaseConfig {
  ga4Id?: string;
  adsId?: string;
  rrLabel?: string;
  photoLabel?: string;
}

/** The caller supplies public, sanitized context after its consent/readiness checks. */
export interface PaidPurchaseContext {
  page_location: string;
  page_referrer: string;
  page_title: string;
}

export interface PaidPurchaseStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** True means queued by the caller, not delivered or attributed by Google. */
export type PaidPurchaseDispatch = (eventName: string, params: Record<string, unknown>) => boolean;

const eligibleOrderTypes = new Set(["rapid_resolution", "rapid_resolution_bundle", "photo_radar"]);

/** Retain the reporter across renders; optional storage also deduplicates page reloads. */
export function createPaidPurchaseReporter(dispatch: PaidPurchaseDispatch, storage?: PaidPurchaseStorage) {
  const reported = new Set<string>();

  return function report(
    receipt: CheckoutReceipt | null | undefined,
    expectedSessionId: string | null | undefined,
    config: PaidPurchaseConfig,
    context: PaidPurchaseContext,
    productionEligible: boolean,
  ): string[] {
    if (!productionEligible || !receipt || typeof expectedSessionId !== "string" ||
        !/^cs_live_[A-Za-z0-9]+$/.test(expectedSessionId) || /\s/.test(expectedSessionId) ||
        receipt.id !== expectedSessionId ||
        (receipt as CheckoutReceipt & { livemode?: unknown }).livemode === false) return [];

    const paid = paidCheckoutSummary(receipt);
    if (!paid || !eligibleOrderTypes.has(paid.orderType)) return [];

    // Never spread receipt metadata, acquisition storage, or arbitrary context keys.
    const common = {
      transaction_id: paid.transactionId,
      order_type: paid.orderType,
      value: paid.serviceValue,
      currency: "CAD",
      page_location: context.page_location,
      page_referrer: context.page_referrer,
      page_title: context.page_title,
    };
    const queued: string[] = [];

    function queue(eventName: string, destination: string, params: Record<string, unknown>) {
      const key = `fabsy-paid-purchase:v1:${destination}:${paid!.transactionId}`;
      if (reported.has(key)) return;
      try {
        if (storage?.getItem(key) === "1") {
          reported.add(key);
          return;
        }
      } catch { /* Storage is optional; retain memory deduplication. */ }

      try {
        if (dispatch(eventName, { ...params, send_to: destination }) !== true) return;
      } catch { /* A failed dispatch stays eligible for a later readiness attempt. */
        return;
      }
      reported.add(key);
      try { storage?.setItem(key, "1"); } catch { /* Storage must not block a receipt. */ }
      queued.push(destination);
    }

    const ga4Id = config.ga4Id;
    if (ga4Id && /^G-[A-Z0-9]+$/.test(ga4Id) && !/\s/.test(ga4Id)) {
      queue("purchase", ga4Id, {
        ...common,
        tax: paid.tax,
        items: [{ item_id: paid.orderType, item_name: paid.name, quantity: 1, price: paid.serviceValue }],
      });
    }

    const adsDestination = purchaseAdsDestination(paid.orderType, {
      destinationId: config.adsId,
      officerPurchaseLabel: config.rrLabel,
      photoRadarPurchaseLabel: config.photoLabel,
    });
    if (adsDestination && !/\s/.test(adsDestination)) queue("conversion", adsDestination, common);
    return queued;
  };
}
