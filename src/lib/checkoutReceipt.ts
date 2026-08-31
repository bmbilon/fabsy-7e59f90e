export interface CheckoutReceipt {
  id?: string;
  mode?: string;
  payment_status?: string;
  currency?: string;
  amount_subtotal?: number;
  amount_total?: number;
  order_type?: string;
  pro_discount_applied?: boolean;
  total_details?: { amount_tax?: number; amount_discount?: number };
}

const productNames: Record<string, string> = {
  photo_radar: "Rapid Resolution: Photo Radar",
  rapid_resolution: "Rapid Resolution",
  rapid_resolution_bundle: "Rapid Resolution Bundle",
};

/** A return URL is not a receipt. Use only the server-confirmed paid response. */
export function paidCheckoutSummary(receipt: CheckoutReceipt | null | undefined) {
  if (!receipt || receipt.payment_status !== "paid" || receipt.mode !== "payment" ||
      !/^cs_(?:test_|live_)[A-Za-z0-9]+$/.test(receipt.id || "") ||
      /\s/.test(receipt.id || "") || receipt.currency?.toLowerCase() !== "cad" ||
      !Object.prototype.hasOwnProperty.call(productNames, receipt.order_type || "")) return null;
  const total = receipt.amount_total;
  const tax = receipt.total_details?.amount_tax;
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(tax) || total! < 0 || tax! < 0 || tax! > total!) return null;
  const subtotal = receipt.amount_subtotal;
  const discount = receipt.total_details?.amount_discount ?? 0;
  if (!Number.isSafeInteger(subtotal) || !Number.isSafeInteger(discount) || discount < 0 ||
      subtotal! - discount + tax! !== total) return null;
  const photoRadar = receipt.order_type === "photo_radar";
  if (photoRadar && (subtotal !== 7900 || discount !== 0 || tax !== 395 || total !== 8295)) return null;
  return {
    transactionId: receipt.id!, orderType: receipt.order_type!, name: productNames[receipt.order_type!],
    photoRadar, total: total! / 100, tax: tax! / 100,
    // Revenue is the discounted service amount; GST is a separate tax field.
    serviceValue: (total! - tax!) / 100,
    discount: discount / 100,
    proDiscountApplied: receipt.pro_discount_applied === true,
  };
}

/** Keep the camera experiment out of the officer-ticket bidding goal. */
export function purchaseAdsDestination(orderType: string, config: {
  destinationId?: string;
  officerPurchaseLabel?: string;
  photoRadarPurchaseLabel?: string;
}): string | null {
  if (!/^AW-\d+$/.test(config.destinationId || "") || /\s/.test(config.destinationId || "")) return null;
  const photo = orderType === "photo_radar";
  if (!photo && orderType !== "rapid_resolution" && orderType !== "rapid_resolution_bundle") return null;
  const label = photo ? config.photoRadarPurchaseLabel : config.officerPurchaseLabel;
  if (!label || !/^[A-Za-z0-9_-]+$/.test(label) || /\s/.test(label)) return null;
  if (photo && label === config.officerPurchaseLabel) return null;
  return `${config.destinationId}/${label}`;
}
