import type {
  MetaCapiContentId,
  MetaPurchaseEnqueueInput,
} from "./meta-capi.ts";

const RAPID_RESOLUTION_PRICING_VERSION = "rapid_resolution_2026_08";
const PRO_PRICING_VERSION = "pro_drivers_2026_08";
const PRO_COUPON = "PRO20";
const RAPID_RESOLUTION_CENTS = 19_800;
const BUNDLE_ADDON_CENTS = 3_100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIVE_CHECKOUT_SESSION_PATTERN = /^cs_live_[A-Za-z0-9_]{8,240}$/;

type SignedCheckoutEventType =
  | "checkout.session.completed"
  | "checkout.session.async_payment_succeeded";

export interface MetaPurchaseSignedEvent {
  type: unknown;
  created: unknown;
  livemode: unknown;
}

export interface MetaPurchaseCheckoutSession {
  id: unknown;
  livemode: unknown;
  mode: unknown;
  payment_status: unknown;
  status?: unknown;
  currency: unknown;
  amount_subtotal: unknown;
  amount_total: unknown;
  client_reference_id: unknown;
  total_details?: {
    amount_discount?: unknown;
    amount_tax?: unknown;
    amount_shipping?: unknown;
  } | null;
  metadata: Record<string, string> | null;
}

interface CurrentMetaProduct {
  contentId: MetaCapiContentId;
  checkoutKind: "ticket_only" | "ticket_with_addon";
  subtotalCents: number;
  discountCents: 0 | 3960 | 4580;
  valueCents: 15_840 | 18_320 | 19_800 | 22_900;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function ownText(
  metadata: Record<string, string>,
  key: string,
): string | null {
  return Object.prototype.hasOwnProperty.call(metadata, key) &&
      typeof metadata[key] === "string"
    ? metadata[key]
    : null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function exactCurrentProduct(
  metadata: Record<string, string>,
): CurrentMetaProduct | null {
  const checkoutKind = ownText(metadata, "fabsy_checkout_kind");
  const contentId = ownText(metadata, "fabsy_product");
  if (
    (checkoutKind !== "ticket_only" && checkoutKind !== "ticket_with_addon") ||
    (contentId !== "rapid_resolution" &&
      contentId !== "rapid_resolution_bundle") ||
    (checkoutKind === "ticket_only" && contentId !== "rapid_resolution") ||
    (checkoutKind === "ticket_with_addon" &&
      contentId !== "rapid_resolution_bundle")
  ) {
    return null;
  }

  const isBundle = checkoutKind === "ticket_with_addon";
  const subtotalCents = RAPID_RESOLUTION_CENTS +
    (isBundle ? BUNDLE_ADDON_CENTS : 0);
  const coupon = ownText(metadata, "pro_coupon");
  const proDiscountCents = ownText(metadata, "pro_discount_cents");
  const proVerificationId = ownText(metadata, "pro_verification_id");
  const isPro = coupon === PRO_COUPON;
  const discountCents = isPro ? subtotalCents * 20 / 100 : 0;

  if (
    (coupon !== "" && coupon !== PRO_COUPON) ||
    proDiscountCents !== String(discountCents) ||
    (isPro ? !isUuid(proVerificationId) : proVerificationId !== "")
  ) {
    return null;
  }

  if (isBundle) {
    if (
      ownText(metadata, "idr_type") !== "addon" ||
      ownText(metadata, "idr_checkout_kind") !== "ticket_with_addon" ||
      ownText(metadata, "idr_price_cents") !== String(BUNDLE_ADDON_CENTS) ||
      !isUuid(ownText(metadata, "idr_order_id")) ||
      !isUuid(ownText(metadata, "idr_client_id"))
    ) {
      return null;
    }
  } else if (
    ownText(metadata, "idr_type") !== null ||
    ownText(metadata, "idr_checkout_kind") !== null ||
    ownText(metadata, "idr_price_cents") !== null ||
    ownText(metadata, "idr_order_id") !== null ||
    ownText(metadata, "idr_client_id") !== null
  ) {
    return null;
  }

  const valueCents = subtotalCents - discountCents;
  if (
    valueCents !== 19_800 &&
    valueCents !== 15_840 &&
    valueCents !== 22_900 &&
    valueCents !== 18_320
  ) {
    return null;
  }
  return {
    contentId,
    checkoutKind,
    subtotalCents,
    discountCents: discountCents as CurrentMetaProduct["discountCents"],
    valueCents,
  };
}

/**
 * Converts a verified, signed Stripe checkout event into the only Meta Purchase
 * variants currently released. Returning null is a deliberate fail-closed
 * exclusion: it never turns an unknown/test/future product into ad measurement.
 */
export function currentMetaPurchaseFromSignedCheckout(
  event: MetaPurchaseSignedEvent,
  session: MetaPurchaseCheckoutSession,
): MetaPurchaseEnqueueInput | null {
  if (
    (event.type !== "checkout.session.completed" &&
      event.type !== "checkout.session.async_payment_succeeded") ||
    event.livemode !== true ||
    session.livemode !== true ||
    typeof session.id !== "string" ||
    !LIVE_CHECKOUT_SESSION_PATTERN.test(session.id) ||
    session.mode !== "payment" ||
    session.payment_status !== "paid" ||
    session.status !== "complete" ||
    session.currency !== "cad" ||
    !Number.isSafeInteger(event.created) ||
    Number(event.created) < 1
  ) {
    return null;
  }

  const metadata = session.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const product = exactCurrentProduct(metadata);
  if (!product) return null;

  const submissionId = ownText(metadata, "ticket_submission_id");
  const sourceAssessmentId = ownText(metadata, "source_assessment_id");
  const checkoutIntentId = ownText(metadata, "checkout_intent_id");
  const clientId = ownText(metadata, "client_id");
  if (
    !isUuid(checkoutIntentId) ||
    !isUuid(submissionId) ||
    ownText(metadata, "submission_id") !== submissionId ||
    !isUuid(clientId) ||
    session.client_reference_id !== submissionId ||
    !/^[1-9]\d{0,8}$/.test(ownText(metadata, "checkout_attempt") || "") ||
    ownText(metadata, "fabsy_pricing_version") !==
      RAPID_RESOLUTION_PRICING_VERSION ||
    ownText(metadata, "pro_pricing_version") !== PRO_PRICING_VERSION ||
    ownText(metadata, "ticket_type") !== "officer_issued" ||
    ownText(metadata, "order_type") !== "rapid_resolution" ||
    ownText(metadata, "review_path") !== "standard" ||
    ownText(metadata, "ticket_base_cents") !==
      String(RAPID_RESOLUTION_CENTS) ||
    (ownText(metadata, "representation_includes_assessment") !== "true" &&
      ownText(metadata, "representation_includes_assessment") !== "false") ||
    (sourceAssessmentId !== null && !isUuid(sourceAssessmentId))
  ) {
    return null;
  }
  if (
    product.checkoutKind === "ticket_with_addon" &&
    (ownText(metadata, "idr_order_id") !== checkoutIntentId ||
      ownText(metadata, "idr_client_id") !== clientId)
  ) {
    return null;
  }

  const amountDiscount = session.total_details?.amount_discount ?? 0;
  const amountTax = session.total_details?.amount_tax;
  const amountShipping = session.total_details?.amount_shipping ?? 0;
  if (
    session.amount_subtotal !== product.subtotalCents ||
    amountDiscount !== product.discountCents ||
    amountShipping !== 0 ||
    !isSafeNonNegativeInteger(amountTax) ||
    !Number.isSafeInteger(session.amount_total) ||
    session.amount_total !== product.subtotalCents -
        product.discountCents + amountTax ||
    session.amount_total - amountTax !== product.valueCents
  ) {
    return null;
  }

  return {
    checkoutSessionId: session.id,
    valueCents: product.valueCents,
    eventTimeEpochSeconds: event.created as number,
    contentId: product.contentId,
  };
}
