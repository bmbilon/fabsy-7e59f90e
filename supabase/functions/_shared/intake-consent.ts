import feeRefund from "../../../src/config/feeRefund.json" with { type: "json" };

export const INTAKE_CONSENT_VERSION = "ticket-upload-consent-v1";
export const INTAKE_CONSENT_LABEL = "I consent for Fabsy to fight my ticket";
export const INTAKE_CONSENT_CONFIRMATION = "I am the person named above. By checking this box and submitting, I electronically accept this authorization, the Terms of Service and Privacy Policy for this ticket.";
export const PHOTO_UPLOAD_CONSENT_VERSION = "photo-upload-consent-v3";
export const LEGACY_PHOTO_UPLOAD_CONSENT_VERSION = "photo-upload-consent-v2";
export const PHOTO_UPLOAD_CONSENT_CONFIRMATION = "I am the person named on the ticket I am submitting. By checking this box and submitting, I accept the authorization, Terms of Purchase, Terms of Service and Privacy Policy for this ticket.";
export const NOT_GUILTY_PLEA_LABEL = "I plead not guilty";
export const NOT_GUILTY_PLEA_INSTRUCTION = "I instruct Fabsy to enter a not-guilty plea and request disclosure for the ticket I am submitting.";
export const NO_PLEA_INSTRUCTION = "I have not authorized Fabsy to enter a plea. Fabsy must obtain my specific instruction before entering any plea.";

export interface IntakeConsent {
  version: string;
  accepted: true;
  method: "checkbox" | "typed";
  acceptedAt: string;
  name: string;
  label: string;
  confirmation: string;
  authorization: readonly string[];
  privacy: readonly string[];
  ticketSubmissionId?: string;
  ticketDocumentPath?: string;
  identitySource?: "uploaded_ticket_pending_review";
  // Only a versioned, submitted checkbox choice authorizes an automated plea.
  // Missing means the client was never asked; false must never become true.
  pleadNotGuilty?: boolean;
  pleaLabel?: string;
  pleaInstruction?: string;
}

export function parsePhotoUploadConsent(value: unknown, submissionId: string, ticketPath: string, now = new Date()): IntakeConsent {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (input.accepted !== true || input.method !== "checkbox" || ![PHOTO_UPLOAD_CONSENT_VERSION, LEGACY_PHOTO_UPLOAD_CONSENT_VERSION].includes(String(input.version))) {
    throw new IntakeConsentError("Check the consent box before submitting your ticket.");
  }
  const currentVersion = input.version === PHOTO_UPLOAD_CONSENT_VERSION;
  if (currentVersion && typeof input.pleadNotGuilty !== "boolean") {
    throw new IntakeConsentError("Review your not-guilty plea choice before submitting your ticket.");
  }
  return {
    version: String(input.version), accepted: true, method: "checkbox", acceptedAt: now.toISOString(),
    name: "", identitySource: "uploaded_ticket_pending_review", ticketSubmissionId: submissionId, ticketDocumentPath: ticketPath,
    label: INTAKE_CONSENT_LABEL, confirmation: PHOTO_UPLOAD_CONSENT_CONFIRMATION,
    authorization: currentVersion ? PHOTO_UPLOAD_AUTHORIZATION_LINES : LEGACY_PHOTO_UPLOAD_AUTHORIZATION_LINES, privacy: CONSENT_PRIVACY_LINES,
    ...(currentVersion ? {
      pleadNotGuilty: input.pleadNotGuilty as boolean,
      pleaLabel: NOT_GUILTY_PLEA_LABEL,
      pleaInstruction: input.pleadNotGuilty ? NOT_GUILTY_PLEA_INSTRUCTION : NO_PLEA_INSTRUCTION,
    } : {}),
  };
}

export class IntakeConsentError extends Error {
  status = 400;
}

export function parseIntakeConsent(value: unknown, name: string, photoRadar: boolean, now = new Date()): IntakeConsent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new IntakeConsentError("Check the consent box before submitting your ticket.");
  const consent = value as Record<string, unknown>;
  if (consent.accepted !== true || consent.version !== INTAKE_CONSENT_VERSION || !["checkbox", "typed"].includes(String(consent.method))) {
    throw new IntakeConsentError("Review the current authorization and check the consent box before submitting.");
  }
  const normalize = (text: string) => text.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-CA");
  if (!name.trim() || name.length > 200) throw new IntakeConsentError("Enter your full legal name.");
  if (consent.method === "typed" && (typeof consent.signature !== "string" || consent.signature.length > 200 || normalize(consent.signature) !== normalize(name))) {
    throw new IntakeConsentError("Type the same full legal name shown on the consent form.");
  }
  return {
    version: INTAKE_CONSENT_VERSION, accepted: true, method: consent.method as IntakeConsent["method"],
    acceptedAt: now.toISOString(), name, label: INTAKE_CONSENT_LABEL,
    confirmation: consent.method === "checkbox" ? INTAKE_CONSENT_CONFIRMATION : "I am the person named above. I agree to the authorization and intend my typed name to be my electronic signature.",
    authorization: photoRadar ? PHOTO_RADAR_CONSENT_AUTHORIZATION_LINES : CONSENT_AUTHORIZATION_LINES,
    privacy: CONSENT_PRIVACY_LINES,
  };
}

export const CONSENT_AUTHORIZATION_LINES = [
  "I authorize Fabsy Traffic Ticket Services and its designated agents to deliver",
  "Rapid Resolution for the ticket above, if accepted and within permitted agent scope.",
  "",
  "Within the scope permitted by applicable law and court or tribunal rules, I authorize",
  "Fabsy's agents to:",
  "• Request, receive, track, and review disclosure for this ticket",
  "• Communicate with court, prosecution, and government contacts where authorized",
  "• Prepare and submit a fact-specific prosecutor-review request",
  "• Receive and explain a Crown response and its stated consequences",
  "• Finalize a resolution only after receiving my case-specific instruction",
  "",
  "I understand that:",
  "• Fabsy is an agent service, not a law firm, and does not provide legal advice",
  "• Fabsy will not accept an offer or enter a plea without my specific instruction",
  "• Fabsy may access only information actually needed and lawfully available for this matter",
  "• Outcomes vary and Fabsy does not promise a particular result",
  "• Service-fee refund rights follow the written purchase terms for my order",
  `• ${feeRefund.declinedOfferText}`,
  "• Rapid Resolution costs $198 CAD plus GST; trial and government fines are separate",
  "• The 48-hour commitment starts after complete disclosure is received and matched",
  "• The 48-hour commitment excludes Crown response and final-outcome timing",
] as const;

export const PHOTO_RADAR_CONSENT_AUTHORIZATION_LINES = [
  "I authorize Fabsy Traffic Ticket Services and its designated agents to deliver",
  "Rapid Resolution: Photo Radar for the registered-owner notice above, if accepted.",
  "This service covers Alberta automated enforcement notices under TSA s.160(1).",
  "",
  "Within permitted agent scope, I specifically instruct and authorize Fabsy to:",
  "• Enter a not-guilty plea for this notice and request and review disclosure",
  "• Review the owner notice, images, site, timing and device records available",
  "• Pursue a Crown reduction or withdrawal based on the evidence",
  "• Explain each Crown response and obtain my decision on any proposed deal",
  "• Finalize a proposed resolution only after my case-specific approval",
  "",
  "I understand that:",
  "• Fabsy is an agent service, not a law firm, and does not provide legal advice",
  "• Under the current demerit schedule, an owner conviction under Traffic Safety Act s.160 receives no demerit points",
  "• No insurer, underwriting, or premium result is promised; an Insurance Impact Report is not included",
  "• The one-time service fee is $79 CAD plus 5% GST ($82.95 total) at checkout",
  "• No legal outcome is promised; service-fee refund rights follow my written purchase terms",
  `• ${feeRefund.declinedOfferText}`,
  "• There is no success fee and no trial representation; government fines are separate",
  "• Fabsy takes its next authorized step within 48 hours after complete disclosure",
  "• The 48-hour commitment excludes Crown response and final-outcome timing",
] as const;

export const CONSENT_PRIVACY_LINES = [
  "By signing this form, I consent to the processing of my personal information",
  "for this ticket matter, including controlled technology-assisted document analysis,",
  "as described in Fabsy's Privacy Policy. Fabsy may use only",
  "the information it actually accesses for the requested service and may disclose it",
  "to authorized service providers or public bodies when needed or required by law.",
] as const;

const LEGACY_PHOTO_UPLOAD_AUTHORIZATION_LINES = [
  "This authorization applies to the ticket file submitted with this acceptance.",
  "Fabsy will read the ticket and confirm any missing details before acting.",
  "The following terms apply according to the type of ticket in the uploaded file.",
  "", "FOR AN OFFICER-ISSUED TICKET:", ...CONSENT_AUTHORIZATION_LINES,
  "", "FOR A REGISTERED-OWNER CAMERA NOTICE:", ...PHOTO_RADAR_CONSENT_AUTHORIZATION_LINES,
] as const;

// The separate plea checkbox controls both ticket types in the combined flow.
// Preserve old wording only for old v2 clients; never infer their checkbox choice.
export const PHOTO_UPLOAD_AUTHORIZATION_LINES = LEGACY_PHOTO_UPLOAD_AUTHORIZATION_LINES.map(line =>
  line === "• Enter a not-guilty plea for this notice and request and review disclosure"
    ? "• Request and review disclosure; any plea requires my specific instruction"
    : line
);
