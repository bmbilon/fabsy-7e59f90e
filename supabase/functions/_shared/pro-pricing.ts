// Money is always integer CAD cents. These prices apply to officer matters only.
export const PRO_COUPON = "PRO20";
export const PRO_PERCENT = 20;
export const OFFICER_CENTS = 19_800;
export const BUNDLE_ADDON_CENTS = 3_100;
export const PRO_PRICING_VERSION = "pro_drivers_2026_08";
export const ELIGIBLE_PRO_CLASSES = new Set(["1", "2", "4"]);

export function albertaCalendarDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export function normalizedLicenceClass(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  const result = value.trim().replace(/^class\s*/i, "");
  return /^[1-7]$/.test(result) ? result : "unknown";
}

export function isOfficerOrder(order: Record<string, unknown>): boolean {
  if (order.service_type !== "representation") return false;
  const kind = order.ticket_type ?? order.order_type ?? "officer";
  return kind === "officer" || kind === "officer_issued" || kind === "rapid_resolution";
}

export function proPricing(includeAddon: boolean, verified: boolean) {
  const subtotalCents = OFFICER_CENTS + (includeAddon ? BUNDLE_ADDON_CENTS : 0);
  const discountCents = verified ? subtotalCents * PRO_PERCENT / 100 : 0;
  return {
    subtotalCents,
    discountCents,
    netSubtotalCents: subtotalCents - discountCents,
    netAddonCents: includeAddon ? BUNDLE_ADDON_CENTS * (verified ? 0.8 : 1) : 0,
    coupon: verified ? PRO_COUPON : null,
  };
}

function normalizedIdentity(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFKD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^\p{L}\p{N}]/gu, "")
    : "";
}

export interface LicenceRead {
  documentType?: unknown;
  licenceClass?: unknown;
  classReadable?: unknown;
  province?: unknown;
  driversLicense?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  expiryDate?: unknown;
}

export function evaluateProLicence(
  read: LicenceRead,
  order: Record<string, unknown>,
  declaredClass: string,
  today = albertaCalendarDate(),
) {
  const readClass = normalizedLicenceClass(read.licenceClass);
  const province = typeof read.province === "string" ? read.province.trim().toLowerCase() : "";
  const expiry = typeof read.expiryDate === "string" ? read.expiryDate : "";
  const parsedExpiry = /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? new Date(expiry + "T00:00:00Z") : null;
  const expiryValid = parsedExpiry && !Number.isNaN(parsedExpiry.getTime()) && parsedExpiry.toISOString().slice(0, 10) === expiry;
  const identityMatches = [
    [read.driversLicense, order.drivers_license],
    [read.firstName, order.first_name],
    [read.lastName, order.last_name],
  ].every(([actual, expected]) => Boolean(normalizedIdentity(actual)) && normalizedIdentity(actual) === normalizedIdentity(expected));
  const reason = !isOfficerOrder(order) ? "officer_only"
    : !ELIGIBLE_PRO_CLASSES.has(declaredClass) ? "ineligible_class"
    : read.documentType !== "drivers_licence" || read.classReadable !== true ? "unreadable"
    : province !== "alberta" && province !== "ab" ? "not_alberta"
    : readClass !== declaredClass ? "class_mismatch"
    : !identityMatches ? "identity_mismatch"
    : !expiryValid || expiry < today ? "expiry_unverified"
    : "verified";
  return {
    verified: reason === "verified",
    reason,
    readClass: readClass === "unknown" ? null : readClass,
    jurisdiction: province === "alberta" || province === "ab" ? "AB" : null,
    identityMatches,
    expiresOn: expiryValid ? expiry : null,
  };
}

export interface ProPaymentSnapshot {
  pro_coupon?: unknown;
  pro_discount_cents?: unknown;
  pro_subtotal_cents?: unknown;
  pro_verification_id?: unknown;
}

export interface ProCheckoutSession {
  amount_subtotal: number | null;
  amount_total: number | null;
  total_details?: { amount_discount?: number | null; amount_tax?: number | null; amount_shipping?: number | null } | null;
  metadata?: Record<string, string> | null;
}

// The signed Stripe payload must agree with the immutable server reservation.
// Legacy sessions keep their existing validator; a new session cannot opt out.
export function validateProPayment(session: ProCheckoutSession, snapshot: ProPaymentSnapshot, includeAddon: boolean) {
  const metadata = session.metadata || {};
  const isNew = metadata.pro_pricing_version === PRO_PRICING_VERSION || snapshot.pro_subtotal_cents != null;
  if (!isNew) {
    if (metadata.pro_coupon || snapshot.pro_coupon || Number(snapshot.pro_discount_cents || 0)) {
      throw new Error("Pro discount requires a server pricing reservation.");
    }
    return { isNew: false, verified: false, netAddonCents: includeAddon ? BUNDLE_ADDON_CENTS : 0 };
  }
  const verified = snapshot.pro_coupon === PRO_COUPON;
  const expected = proPricing(includeAddon, verified);
  const taxCents = session.total_details?.amount_tax ?? 0;
  if (
    metadata.pro_pricing_version !== PRO_PRICING_VERSION ||
    (metadata.pro_coupon || "") !== (expected.coupon || "") ||
    (snapshot.pro_coupon != null && !verified) ||
    (verified && (!snapshot.pro_verification_id || metadata.pro_verification_id !== snapshot.pro_verification_id)) ||
    Number(snapshot.pro_subtotal_cents) !== expected.subtotalCents ||
    Number(snapshot.pro_discount_cents) !== expected.discountCents ||
    session.amount_subtotal !== expected.subtotalCents ||
    Number(session.total_details?.amount_discount || 0) !== expected.discountCents ||
    Number(session.total_details?.amount_shipping || 0) !== 0 ||
    !Number.isSafeInteger(taxCents) || taxCents < 0 ||
    session.amount_total !== expected.netSubtotalCents + taxCents
  ) throw new Error("Paid pro pricing does not match the verified reservation.");
  return { isNew: true, verified, netAddonCents: expected.netAddonCents };
}

export function proRefundAmount(session: ProCheckoutSession, includeAddon: boolean): { amountCents: number; discountCents: number; taxCents: number } {
  const expected = proPricing(includeAddon, true);
  const tax = session.total_details?.amount_tax ?? 0;
  if (
    session.amount_subtotal !== expected.subtotalCents ||
    Number(session.total_details?.amount_discount || 0) !== 0 ||
    Number(session.total_details?.amount_shipping || 0) !== 0 ||
    !Number.isSafeInteger(tax) || tax < 0 ||
    session.amount_total !== expected.subtotalCents + tax
  ) throw new Error("The original payment requires manual refund review.");
  const taxCents = Math.round(tax * PRO_PERCENT / 100);
  return { amountCents: expected.discountCents + taxCents, discountCents: expected.discountCents, taxCents };
}
