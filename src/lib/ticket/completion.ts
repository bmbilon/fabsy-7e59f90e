import type { FormData } from "@/components/TicketForm";
import { initialFormData } from "./initialFormData";
import { hydrateIntakeDraftData, isIntakeDraftAccessToken, type IntakeDraftRecord } from "./intakeDraft";

export const COMPLETION_STORAGE_KEY = "fabsy.ticket-completion.v1";
export type CompletionAccess = { token: string; candidate?: string };

export function completionAccess(hash: string, storage: Pick<Storage, "getItem">): CompletionAccess | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  // An invalid explicit link must never fall back to a different saved client.
  if (params.has("access")) {
    const token = params.get("access");
    return isIntakeDraftAccessToken(token) ? { token } : null;
  }
  try {
    const saved = JSON.parse(storage.getItem(COMPLETION_STORAGE_KEY) || "null");
    if (!isIntakeDraftAccessToken(saved?.token)) return null;
    return { token: saved.token, ...(isIntakeDraftAccessToken(saved.candidate) ? { candidate: saved.candidate } : {}) };
  } catch { return null; }
}

export function completionFormData(record: IntakeDraftRecord): FormData {
  return {
    ...initialFormData,
    ...hydrateIntakeDraftData(record.draftData),
    email: record.contact.email,
    phone: record.contact.phone,
    albertaConfirmed: record.albertaConfirmed,
    contactPermission: record.contactPermission,
    ticketImage: null,
    consentGiven: false,
    digitalSignature: "",
  } as FormData;
}

export function completionErrors(data: FormData): string[] {
  const fields = [
    [data.firstName, "First name"], [data.lastName, "Last name"],
    [data.driversLicense, "Driver's licence number"], [data.address, "Mailing address"],
    [data.city, "City"], [data.province, "Province"], [data.postalCode, "Postal code"],
    [data.ticketNumber, "Ticket number"], [data.offenceDescription || data.violation, "Offence"],
    [data.fineAmount, "Ticket fine"],
  ];
  const missing = fields.filter(([value]) => !value?.trim()).map(([, label]) => label);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) missing.push("Valid email");
  if (!/^\+?[\d ()-]+$/.test(data.phone) || data.phone.replace(/\D/g, "").length < 7) missing.push("Valid phone number");
  if (!data.dateOfBirth || !Number.isFinite(data.dateOfBirth.getTime()) || data.dateOfBirth > new Date()) missing.push("Date of birth");
  if (data.ticketType === "photo_radar" && data.registeredOwnerOnOffenceDate !== "yes") missing.push("Registered-owner confirmation");
  if (data.vehicleSeized || data.agentRepresentationPermitted === false) missing.push("Contact Fabsy to confirm service eligibility");
  if (!data.consentGiven) missing.push("Consent agreement");
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-CA");
  if (normalize(data.digitalSignature) !== normalize(`${data.firstName} ${data.lastName}`) || !data.digitalSignature.trim()) missing.push("Signature matching your full legal name");
  return missing;
}
