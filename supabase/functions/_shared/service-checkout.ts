import offers from "../../../src/config/offers.json" with { type: "json" };
import { checkoutAuthorization } from "./manual-representation.ts";
import { CONSENT_PRIVACY_LINES, NO_PLEA_INSTRUCTION, type IntakeConsent } from "./intake-consent.ts";

export const SERVICE_CONSENT_VERSION = "universal-service-consent-v1";
export const SERVICE_TERMS_VERSION = "universal-service-purchase-v1";
export const SERVICE_PRODUCTS = [
  { key: "photo_radar", name: offers.photoRadar.name, cents: offers.photoRadar.priceCents, representation: true, report: false, description: "For a photo radar or red-light camera notice mailed to the registered owner." },
  { key: "rapid_resolution", name: offers.rapidResolution.name, cents: offers.rapidResolution.priceCents, representation: true, report: false, description: "Pre-trial help with an officer-issued Alberta traffic ticket." },
  { key: "insurance_report", name: offers.insuranceReport.name, cents: offers.insuranceReport.priceCents, representation: false, report: true, description: "Personalized insurance impact and renewal planning research." },
  { key: "bundle", name: offers.bundle.name, cents: offers.bundle.priceCents, representation: true, report: true, description: "Rapid Resolution and the Insurance Impact Report together." },
] as const;
export type ServiceProductKey = typeof SERVICE_PRODUCTS[number]["key"];
export type ServiceMode = "both" | "consent" | "payment";
export function serviceProduct(value: unknown) {
  const product = SERVICE_PRODUCTS.find(item => item.key === value);
  if (!product) throw new Error("Choose one of the listed services.");
  return { ...product, gstCents: Math.round(product.cents * 0.05), totalCents: Math.round(product.cents * 1.05) };
}
export const SERVICE_CONFIRMATION = "I am the person requesting this service or an authorized representative of the person or organization identified in this request. I electronically accept this authorization, the Terms of Purchase, Terms of Service and Privacy Policy for this order.";
export const SERVICE_PLEA = "I instruct Fabsy to enter a not-guilty plea and request disclosure for the one ticket supplied with this order or identified by me using this email. Fabsy must confirm which ticket this order covers before acting.";
export const SERVICE_PURCHASE_TERMS = "I agree to the Terms of Purchase, Terms of Service and Privacy Policy for the selected service. Government fines and trial representation are separate.";
export function serviceAuthorization(key: ServiceProductKey): readonly string[] {
  const product = serviceProduct(key);
  const lines: string[] = ["This authorization applies to this service order and the one ticket or report request supplied with it or identified by me using my purchase email.", "Fabsy must confirm the ticket and the person or organization concerned before taking action on a ticket."];
  if (product.representation) lines.push(...checkoutAuthorization(key === "photo_radar" ? "photo_radar" : "officer_issued").map(line => line.replace(/for the ticket above/g, "for the ticket covered by this order").replace(/notice above/g, "notice covered by this order")));
  if (product.report) lines.push("I authorize Fabsy to use the documents and information I provide to prepare the Insurance Impact & Renewal Planning Report.", offers.insuranceReport.disclaimer);
  if (key === "bundle") lines.push(`The combined order costs $${offers.bundle.priceCad} CAD plus 5% GST.`);
  return lines;
}
const bounded = (value: unknown, label: string, max: number, optional = false) => {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if ((!optional && !text) || text.length > max || /[\u0000-\u001f]/.test(text)) throw new Error(`Enter a valid ${label}.`);
  return text;
};
export function parseServiceOrder(raw: Record<string, unknown>, now = new Date()) {
  const product = serviceProduct(raw.product);
  const mode = raw.mode as ServiceMode;
  if (!["both", "consent", "payment"].includes(mode)) throw new Error("Choose consent and payment, consent only, or payment only.");
  const name = bounded(raw.name, "full name", 200);
  const email = bounded(raw.email, "email address", 255).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  const representedName = bounded(raw.representedName, "person or organization name", 200, true) || name;
  const ticketNumber = bounded(raw.ticketNumber, "ticket number", 50, true).toUpperCase();
  if (raw.termsAccepted !== true) throw new Error("Accept the purchase terms before continuing.");
  if (mode !== "payment" && (raw.consentAccepted !== true || raw.consentVersion !== SERVICE_CONSENT_VERSION || typeof raw.pleadNotGuilty !== "boolean")) throw new Error("Review and accept the authorization before continuing.");
  if (product.key === "photo_radar" && mode !== "payment" && raw.registeredOwner !== true) throw new Error("Confirm that the person or organization was the registered owner on the offence date.");
  const consent: IntakeConsent | null = mode === "payment" ? null : {
    version: SERVICE_CONSENT_VERSION, accepted: true, method: "checkbox", acceptedAt: now.toISOString(), name,
    ...(ticketNumber ? { ticketNumber } : {}), label: product.representation ? "I consent for Fabsy to fight my ticket" : "I authorize Fabsy to prepare my report",
    confirmation: SERVICE_CONFIRMATION + (product.key === "photo_radar" ? " I confirm that I, or the person or organization I represent, was the registered owner on the offence date." : ""), authorization: serviceAuthorization(product.key), privacy: CONSENT_PRIVACY_LINES,
    pleadNotGuilty: product.representation && raw.pleadNotGuilty === true, pleaLabel: "I plead not guilty",
    pleaInstruction: product.representation && raw.pleadNotGuilty === true ? SERVICE_PLEA : NO_PLEA_INSTRUCTION,
  };
  return { product: product.key, mode, name, email, represented_name: representedName, ticket_number: ticketNumber || null,
    subtotal_cents: product.cents, gst_cents: product.gstCents, total_cents: product.totalCents, consent,
    purchase_terms: { version: SERVICE_TERMS_VERSION, accepted: true, acceptedAt: now.toISOString(), text: SERVICE_PURCHASE_TERMS },
    registered_owner: product.key === "photo_radar" && raw.registeredOwner === true };
}

export interface ServicePaymentOrder { id: string; product: string; email: string; subtotal_cents: number; gst_cents: number; total_cents: number; stripe_session_id: string | null; checkout_attempt: number; }
export function validateServicePayment(order: ServicePaymentOrder, session: {
  id: string; mode: string | null; payment_status: string; status?: string | null; currency: string | null;
  amount_subtotal: number | null; amount_total: number | null; metadata: Record<string, string> | null;
  customer_email?: string | null; customer_details?: { email?: string | null } | null;
  total_details?: { amount_tax?: number | null; amount_discount?: number | null } | null;
}) {
  if (session.metadata?.fabsy_checkout_kind !== "service_order" || session.metadata.service_order_id !== order.id || session.metadata.product !== order.product ||
      session.metadata.checkout_attempt !== String(order.checkout_attempt) || (order.stripe_session_id && session.id !== order.stripe_session_id) ||
      session.mode !== "payment" || session.payment_status !== "paid" || session.status !== "complete" || session.currency !== "cad" ||
      session.amount_subtotal !== order.subtotal_cents || session.amount_total !== order.total_cents || session.total_details?.amount_tax !== order.gst_cents ||
      (session.total_details?.amount_discount || 0) !== 0 || String(session.customer_details?.email || session.customer_email || "").trim().toLowerCase() !== order.email) {
    throw new Error("The payment does not match its service order.");
  }
}
