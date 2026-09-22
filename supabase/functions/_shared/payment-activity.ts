// Operator alerts are independent of checkout fulfillment and case matching.
export interface ActivityCheckout {
  id: string;
  mode: string | null;
  livemode: boolean;
  payment_status: string;
  currency: string | null;
  amount_subtotal: number | null;
  amount_total: number | null;
  metadata: Record<string, string> | null;
  customer_email?: string | null;
  customer_details?: { email?: string | null; name?: string | null } | null;
  payment_intent?: string | { id?: string } | null;
  total_details?: { amount_tax?: number | null } | null;
}

const FABSY_KINDS = new Set([
  "photo_radar",
  "ticket_only",
  "ticket_with_addon",
  "ticket_assessment",
  "idr_standalone",
  "idr_addon",
]);
export function metadataIdentifiesFabsy(session: ActivityCheckout): boolean {
  return FABSY_KINDS.has(session.metadata?.fabsy_checkout_kind || "") ||
    Boolean(session.metadata?.idr_order_id);
}

export interface ActivityLineItem {
  price?: {
    id?: string;
    product?:
      | string
      | { deleted?: boolean; metadata?: Record<string, string> }
      | null;
  } | null;
}

export function lineItemsIdentifyFabsy(
  items: ActivityLineItem[],
  configuredPhotoRadarPrice: string,
): boolean {
  return items.some((item) => {
    const price = item.price;
    const product = price?.product;
    return Boolean(
      configuredPhotoRadarPrice && price?.id === configuredPhotoRadarPrice,
    ) ||
      (typeof product === "object" && product !== null && !product.deleted &&
        ["photo_radar", "ticket_representation", "insurance_damage_report"]
          .includes(product.metadata?.fabsy_product || ""));
  });
}

export function paymentActivityPayload(
  session: ActivityCheckout,
  eventId: string,
  occurredAt: string,
) {
  return {
    client_name: session.customer_details?.name || null,
    client_email: session.customer_details?.email || session.customer_email ||
      null,
    ticket_number: session.metadata?.ticket_number || null,
    product: session.metadata?.fabsy_checkout_kind || "Fabsy payment link",
    amount_cents: session.amount_subtotal,
    amount_total_cents: session.amount_total,
    tax_cents: session.total_details?.amount_tax,
    currency: session.currency,
    status: "paid",
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id,
    stripe_event_id: eventId,
    occurred_at: occurredAt,
    intake_source: "Stripe",
  };
}
