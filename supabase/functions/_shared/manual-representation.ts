import {
  CONSENT_AUTHORIZATION_LINES, CONSENT_PRIVACY_LINES,
  INTAKE_CONSENT_LABEL, NO_PLEA_INSTRUCTION, NOT_GUILTY_PLEA_LABEL,
  PHOTO_RADAR_CONSENT_AUTHORIZATION_LINES, type IntakeConsent,
} from "./intake-consent.ts";

export type ManualTicketType = "officer_issued" | "photo_radar";
export type ManualPaymentState = "not_started" | "open" | "paid" | "unavailable";
export const CHECKOUT_CONSENT_VERSION = "emailed-ticket-checkout-v1";
export const CHECKOUT_PLEA_INSTRUCTION = "I instruct Fabsy to enter a not-guilty plea and request disclosure for the ticket identified above.";
export const INTAKE_CONSENT_CONFIRMATION = "I am the person named above or an authorized representative of the organization named above. By checking this box and submitting, I electronically accept this authorization, the Terms of Service and Privacy Policy for this ticket.";
export { INTAKE_CONSENT_LABEL, NOT_GUILTY_PLEA_LABEL };

export function checkoutAuthorization(ticketType: ManualTicketType): readonly string[] {
  const lines = ticketType === "photo_radar" ? PHOTO_RADAR_CONSENT_AUTHORIZATION_LINES : CONSENT_AUTHORIZATION_LINES;
  return lines.map(line => line === "• Enter a not-guilty plea for this notice and request and review disclosure"
    ? "• Request and review disclosure; any plea requires my specific instruction" : line);
}

type CheckoutIdentity = Pick<ManualRepresentationRow, "id" | "first_name" | "last_name" | "ticket_number" | "ticket_type">;

export function parseCheckoutConsent(value: unknown, row: CheckoutIdentity, now = new Date()): IntakeConsent {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (input.accepted !== true || input.method !== "checkbox" || input.version !== CHECKOUT_CONSENT_VERSION || typeof input.pleadNotGuilty !== "boolean") {
    throw new Error("Review the authorization and check the consent box before continuing.");
  }
  return {
    version: CHECKOUT_CONSENT_VERSION, accepted: true, method: "checkbox", acceptedAt: now.toISOString(),
    name: `${row.first_name} ${row.last_name}`, ticketSubmissionId: row.id, ticketNumber: row.ticket_number,
    label: INTAKE_CONSENT_LABEL, confirmation: INTAKE_CONSENT_CONFIRMATION,
    authorization: checkoutAuthorization(row.ticket_type), privacy: CONSENT_PRIVACY_LINES,
    pleadNotGuilty: input.pleadNotGuilty, pleaLabel: NOT_GUILTY_PLEA_LABEL,
    pleaInstruction: input.pleadNotGuilty ? CHECKOUT_PLEA_INSTRUCTION : NO_PLEA_INSTRUCTION,
  };
}

export function checkoutConsentMatches(row: CheckoutIdentity & { intake_consent?: IntakeConsent | null }): boolean {
  const stored = row.intake_consent;
  if (!stored || stored.version !== CHECKOUT_CONSENT_VERSION || stored.accepted !== true || stored.method !== "checkbox" || typeof stored.pleadNotGuilty !== "boolean") return false;
  const expected = parseCheckoutConsent(stored, row);
  return stored.name === expected.name && stored.ticketSubmissionId === expected.ticketSubmissionId && stored.ticketNumber === expected.ticketNumber &&
    stored.confirmation === expected.confirmation && JSON.stringify(stored.authorization) === JSON.stringify(expected.authorization);
}

export interface ManualRepresentationCreateInput {
  firstName: string;
  lastName: string;
  email: string;
  ticketNumber: string;
  ticketType: ManualTicketType;
  violation: string;
  violationDate: string | null;
  registeredOwnerOnOffenceDate: "yes" | null;
}

export interface ManualRepresentationRow {
  id: string;
  client_id: string;
  first_name: string;
  last_name: string;
  email: string;
  ticket_number: string;
  violation: string;
  violation_date: string | null;
  ticket_type: ManualTicketType;
  registered_owner_on_offence_date: string | null;
  consent_form_path: string | null;
  status: string;
  intake_consent?: IntakeConsent | null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") throw new Error(`${label} is required.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw new Error(`${label} is invalid.`);
  return normalized;
}

export function parseManualRepresentationCreate(raw: Record<string, unknown>): ManualRepresentationCreateInput {
  const firstName = text(raw.firstName, "First name", 100);
  const lastName = text(raw.lastName, "Last name", 100);
  const email = text(raw.email, "Email", 255).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new Error("Email is invalid.");
  const ticketNumber = text(raw.ticketNumber, "Ticket number", 50).toUpperCase();
  const ticketType = raw.ticketType;
  if (ticketType !== "officer_issued" && ticketType !== "photo_radar") {
    throw new Error("Choose an officer-issued ticket or Photo Radar notice.");
  }
  const violation = typeof raw.violation === "string" && raw.violation.trim()
    ? text(raw.violation, "Violation", 500)
    : "See ticket supplied by email";
  const violationDate = typeof raw.violationDate === "string" && raw.violationDate.trim()
    ? text(raw.violationDate, "Ticket date", 10)
    : null;
  if (violationDate && (!DATE_PATTERN.test(violationDate) || Number.isNaN(Date.parse(`${violationDate}T00:00:00Z`)))) {
    throw new Error("Ticket date is invalid.");
  }
  if (ticketType === "photo_radar" && raw.registeredOwnerOnOffenceDate !== "yes") {
    throw new Error("Confirm that the client was the registered owner on the offence date.");
  }
  return {
    firstName,
    lastName,
    email,
    ticketNumber,
    ticketType,
    violation,
    violationDate,
    registeredOwnerOnOffenceDate: ticketType === "photo_radar" ? "yes" : null,
  };
}

export function buildManualRepresentationLinks(siteUrl: string, submissionId: string, accessToken: string) {
  const origin = new URL(siteUrl);
  const build = (path: string) => {
    const url = new URL(path, origin);
    url.hash = new URLSearchParams({ case: submissionId, token: accessToken }).toString();
    return url.toString();
  };
  return {
    checkoutUrl: build("/representation-payment"),
    consentUrl: build("/representation-payment"),
    paymentUrl: build("/representation-payment"),
  };
}

export function publicManualRepresentationRecord(row: ManualRepresentationRow, paymentState: ManualPaymentState) {
  const photoRadar = row.ticket_type === "photo_radar";
  return {
    submissionId: row.id,
    clientId: row.client_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    ticketNumber: row.ticket_number,
    violation: row.violation,
    violationDate: row.violation_date,
    ticketType: row.ticket_type,
    registeredOwnerOnOffenceDate: photoRadar ? row.registered_owner_on_offence_date : null,
    consentSigned: Boolean(row.consent_form_path),
    consentAccepted: checkoutConsentMatches(row),
    pleadNotGuilty: row.intake_consent?.pleadNotGuilty ?? null,
    paymentState,
    priceCad: photoRadar ? 79 : 198,
    priceLabel: photoRadar ? "$79 CAD plus 5% GST ($82.95 total)" : "$198 CAD plus applicable GST",
  };
}
