/** Product rules shared by intake, checkout and the verified payment webhook. */
export const PHOTO_RADAR_PRODUCT = {
  name: "Rapid Resolution: Photo Radar",
  priceCents: 7900,
  gstCents: 395,
  totalCents: 8295,
  pricingVersion: "photo_radar_2026_08",
} as const;

export type TicketType = "photo_radar" | "officer_issued";
export type RegisteredOwnerAnswer = "yes" | "sold_before" | "stolen";

export class ProductRequestError extends Error {
  readonly status = 400;
}

export function parseTicketClassification(input: Record<string, unknown>) {
  const ticketType = input.ticket_type ?? "officer_issued";
  if (ticketType !== "photo_radar" && ticketType !== "officer_issued") {
    throw new ProductRequestError("Choose an officer-issued ticket or a registered-owner camera notice.");
  }
  const answer = input.registered_owner_on_offence_date;
  if (ticketType === "photo_radar" && !["yes", "sold_before", "stolen"].includes(String(answer))) {
    throw new ProductRequestError("Tell us whether this vehicle was registered to you on the offence date.");
  }
  const source = input.ticket_type_source ?? "manual";
  if (!["upload", "manual", "entry", "default"].includes(String(source))) {
    throw new ProductRequestError("Ticket classification source is invalid.");
  }
  return {
    ticket_type: ticketType as TicketType,
    ticket_type_source: source as "upload" | "manual" | "entry" | "default",
    registered_owner_on_offence_date: ticketType === "photo_radar" ? answer as RegisteredOwnerAnswer : null,
    order_type: ticketType === "photo_radar" ? "photo_radar" : "rapid_resolution",
    review_path: ticketType === "photo_radar" ? "ate" : "standard",
  };
}

/** Classification is suggested only from owner-liability evidence, never a red-light label alone. */
export function detectOwnerNotice(evidence: Record<string, unknown>): {
  ticket_type: TicketType | null;
  ticket_type_evidence: string[];
} {
  const text = [evidence.ownerNoticeWording, evidence.offenceDescription, evidence.offenseDescription,
    evidence.offenceSection, evidence.offenceSubSection, evidence.rawText].filter((value) => typeof value === "string").join(" ");
  const reasons: string[] = [];
  if (/owner\s+of\s+(?:a\s+)?motor\s+vehicle\s+involved\s+in/i.test(text)) reasons.push("Registered-owner offence wording");
  if (/\b160\s*\(\s*1\s*\)/.test(text) || (String(evidence.offenceSection).trim() === "160" && /^\(?1\)?$/.test(String(evidence.offenceSubSection).trim()))) reasons.push("Traffic Safety Act s.160(1) wording");
  if (evidence.mailedNoticeFormat === true && evidence.automatedEnforcementNotice === true) reasons.push("Mailed automated-enforcement notice format");
  return { ticket_type: reasons.length ? "photo_radar" : null, ticket_type_evidence: reasons };
}

export function ticketCheckoutProduct(stored: { ticket_type?: unknown; registered_owner_on_offence_date?: unknown }, includeIdrAddon: boolean) {
  if (stored.ticket_type !== undefined && stored.ticket_type !== null && stored.ticket_type !== "officer_issued" && stored.ticket_type !== "photo_radar") {
    throw new ProductRequestError("The stored ticket type needs review before checkout.");
  }
  const isPhotoRadar = stored.ticket_type === "photo_radar";
  if (isPhotoRadar && includeIdrAddon) {
    throw new ProductRequestError("An Insurance Impact Report cannot be added to Photo Radar. No insurer, underwriting, or premium result is promised.");
  }
  if (isPhotoRadar && !["yes", "sold_before", "stolen"].includes(String(stored.registered_owner_on_offence_date))) {
    throw new ProductRequestError("Complete the registered-owner question before checkout.");
  }
  return {
    isPhotoRadar,
    intentType: isPhotoRadar ? "photo_radar" : includeIdrAddon ? "addon" : "ticket",
    checkoutKind: isPhotoRadar ? "photo_radar" : includeIdrAddon ? "ticket_with_addon" : "ticket_only",
    expectedAmountCents: isPhotoRadar ? 7900 : includeIdrAddon ? 3100 : 19800,
    baseCents: isPhotoRadar ? 7900 : 19800,
    product: isPhotoRadar ? "photo_radar" : includeIdrAddon ? "rapid_resolution_bundle" : "rapid_resolution",
    reviewPath: isPhotoRadar ? "ate" : "standard",
  } as const;
}

export interface PhotoRadarPaidSession {
  mode: string | null;
  payment_status: string;
  currency: string | null;
  amount_subtotal: number | null;
  amount_total: number | null;
  total_details?: { amount_tax?: number | null; amount_discount?: number | null } | null;
  metadata: Record<string, string> | null;
}

export function validatePhotoRadarPaidSession(session: PhotoRadarPaidSession) {
  const metadata = session.metadata || {};
  if (session.mode !== "payment" || session.payment_status !== "paid" || session.currency?.toLowerCase() !== "cad" ||
      session.amount_subtotal !== 7900 || session.amount_total !== 8295 ||
      session.total_details?.amount_tax !== 395 || Number(session.total_details?.amount_discount || 0) !== 0 ||
      metadata.fabsy_checkout_kind !== "photo_radar" || metadata.fabsy_product !== "photo_radar" ||
      metadata.ticket_type !== "photo_radar" || metadata.review_path !== "ate" ||
      metadata.ticket_base_cents !== "7900" || metadata.gst_cents !== "395" || metadata.total_cents !== "8295" ||
      metadata.idr_order_id || metadata.idr_type || metadata.representation_includes_assessment === "true") {
    throw new Error("Photo Radar payment must match the reserved $79 plus $3.95 GST product without an insurance report.");
  }
}
