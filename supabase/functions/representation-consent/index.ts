import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  PDFDocument,
  PDFPage,
  PDFFont,
  rgb,
  StandardFonts,
} from "https://esm.sh/pdf-lib@1.17.1";

// Bump this whenever buildConsentText changes. Completed invitations retain the
// exact text/version/hash they signed, independent of later deployments.
const CONSENT_TEXT_VERSION = "standalone-representation-consent-v1-2026-08-25";
const SIGNED_PDF_URL_SECONDS = 600;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,200}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://fabsy.ca",
  "https://www.fabsy.ca",
  "https://fabsy-execom.vercel.app",
  "http://localhost:4173",
  "http://localhost:5173",
  "http://localhost:8080",
]);

type JsonRecord = Record<string, unknown>;
type SupabaseAdmin = ReturnType<typeof createClient>;

interface InviteRow extends JsonRecord {
  id: string;
  status: "pending" | "signing" | "completed" | "revoked" | "expired";
  expires_at: string;
  client_legal_name: string;
  client_email: string;
  client_phone: string | null;
  client_date_of_birth: string | null;
  client_address: string | null;
  client_city: string | null;
  client_province: string | null;
  client_postal_code: string | null;
  client_drivers_license: string | null;
  ticket_number: string;
  charge_description: string;
  offence_date_text: string | null;
  court_location: string | null;
  court_date_text: string | null;
  matter_details: string | null;
  base_fee_cents: number;
  fee_currency: string;
  tax_terms: string;
  success_fee_percent: number | string;
  success_fee_waived: boolean;
  additional_fee_terms: string | null;
  additional_authorization_terms: string | null;
  pending_signed_at: string | null;
  pending_digital_signature: string | null;
  pending_client_phone: string | null;
  pending_client_date_of_birth: string | null;
  pending_client_address: string | null;
  pending_client_city: string | null;
  pending_client_province: string | null;
  pending_client_postal_code: string | null;
  pending_client_drivers_license: string | null;
  pending_client_reported_signed_at: string | null;
  pending_consent_text: string | null;
  pending_consent_text_version: string | null;
  pending_consent_text_hash: string | null;
  signed_at: string | null;
  digital_signature: string | null;
  signed_client_phone: string | null;
  signed_client_date_of_birth: string | null;
  signed_client_address: string | null;
  signed_client_city: string | null;
  signed_client_province: string | null;
  signed_client_postal_code: string | null;
  signed_client_drivers_license: string | null;
  client_reported_signed_at: string | null;
  signed_consent_text: string | null;
  signed_consent_text_version: string | null;
  signed_consent_text_hash: string | null;
  pdf_path: string | null;
  pdf_sha256: string | null;
}

class RequestError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "invalid_request",
  ) {
    super(message);
  }
}

function configuredOrigins() {
  const configured = (Deno.env.get("REPRESENTATION_CONSENT_ALLOWED_ORIGINS") || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function isAllowedOrigin(origin: string | null) {
  return Boolean(origin && configuredOrigins().has(origin));
}

function responseHeaders(origin: string | null) {
  const allowedOrigin = origin && isAllowedOrigin(origin) ? origin : "https://fabsy.ca";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
  };
}

function json(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(origin) });
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function inviteRow(value: unknown): InviteRow {
  return record(value) as InviteRow;
}

function cleanLine(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function optionalLine(value: unknown) {
  const normalized = cleanLine(value);
  return normalized || null;
}

function normalizedSignature(value: unknown) {
  return cleanLine(value);
}

function containsControlCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const characterCode = value.charCodeAt(index);
    if (characterCode < 32 || characterCode === 127) return true;
  }
  return false;
}

interface ValidatedClientFormData {
  phone: string;
  dateOfBirth: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  driversLicense: string;
  signedAt: string;
}

function requiredClientText(
  value: unknown,
  label: string,
  minLength: number,
  maxLength: number,
) {
  if (typeof value !== "string" || containsControlCharacter(value)) {
    throw new RequestError(`${label} is invalid.`, 400, "invalid_client_details");
  }
  const normalized = cleanLine(value);
  if (normalized.length < minLength || normalized.length > maxLength) {
    throw new RequestError(`${label} is invalid.`, 400, "invalid_client_details");
  }
  return normalized;
}

function validIsoDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
}

function validateClientFormData(value: unknown): ValidatedClientFormData {
  const form = record(value);
  const phone = requiredClientText(form.phone, "Phone number", 7, 30);
  const digitCount = phone.replace(/\D/g, "").length;
  if (!/^[0-9+(). -]+$/.test(phone) || digitCount < 10 || digitCount > 15) {
    throw new RequestError("Phone number is invalid.", 400, "invalid_client_details");
  }

  const dateOfBirth = typeof form.dateOfBirth === "string" ? form.dateOfBirth : "";
  const today = new Date().toISOString().slice(0, 10);
  if (!validIsoDate(dateOfBirth) || dateOfBirth < "1900-01-01" || dateOfBirth > today) {
    throw new RequestError("Date of birth is invalid.", 400, "invalid_client_details");
  }

  const address = requiredClientText(form.address, "Street address", 1, 160);
  const city = requiredClientText(form.city, "City", 1, 80);
  const province = requiredClientText(form.province, "Province", 1, 80);
  const postalCode = requiredClientText(form.postalCode, "Postal code", 3, 12).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9 -]*[A-Z0-9]$/.test(postalCode)) {
    throw new RequestError("Postal code is invalid.", 400, "invalid_client_details");
  }
  const driversLicense = requiredClientText(form.driversLicense, "Driver's licence number", 3, 40);
  if (!/^[A-Za-z0-9][A-Za-z0-9 .'-]*[A-Za-z0-9]$/.test(driversLicense)) {
    throw new RequestError("Driver's licence number is invalid.", 400, "invalid_client_details");
  }

  const signedAtValue = typeof form.signedAt === "string" ? form.signedAt : "";
  const signedAtDate = new Date(signedAtValue);
  const now = Date.now();
  if (
    !signedAtValue ||
    Number.isNaN(signedAtDate.getTime()) ||
    signedAtDate.getTime() < now - 24 * 60 * 60 * 1000 ||
    signedAtDate.getTime() > now + 10 * 60 * 1000
  ) {
    throw new RequestError("Signature time is invalid. Refresh the page and try again.", 400, "invalid_client_details");
  }

  return {
    phone,
    dateOfBirth,
    address,
    city,
    province,
    postalCode,
    driversLicense,
    signedAt: signedAtDate.toISOString(),
  };
}

function formatCad(centsValue: unknown, currencyValue: unknown) {
  const cents = Number(centsValue);
  const currency = cleanLine(currencyValue).toUpperCase() || "CAD";
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("Stored base fee is invalid.");
  const formatted = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return `${formatted} ${currency}`;
}

function formatPercent(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
    throw new Error("Stored success-fee percentage is invalid.");
  }
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function buildConsentText(invite: InviteRow) {
  const legalName = cleanLine(invite.client_legal_name);
  const email = cleanLine(invite.client_email);
  const ticketNumber = cleanLine(invite.ticket_number);
  const charge = cleanLine(invite.charge_description);
  const offenceDate = optionalLine(invite.offence_date_text);
  const courtLocation = optionalLine(invite.court_location);
  const courtDate = optionalLine(invite.court_date_text);
  const matterDetails = optionalLine(invite.matter_details);
  const taxTerms = cleanLine(invite.tax_terms);
  const baseFee = formatCad(invite.base_fee_cents, invite.fee_currency);
  const successFeePercent = formatPercent(invite.success_fee_percent);
  const additionalFeeTerms = optionalLine(invite.additional_fee_terms);
  const additionalAuthorizationTerms = optionalLine(invite.additional_authorization_terms);

  if (!legalName || !email || !ticketNumber || !charge || !taxTerms) {
    throw new Error("Stored invitation terms are incomplete.");
  }

  const clientLines = [
    `Client: ${legalName}`,
    `Email: ${email}`,
  ].filter(Boolean);
  const matterLines = [
    `Ticket or file number: ${ticketNumber}`,
    `Charge: ${charge}`,
    offenceDate ? `Offence date: ${offenceDate}` : null,
    courtLocation ? `Court location: ${courtLocation}` : null,
    courtDate ? `Court date: ${courtDate}` : null,
    matterDetails ? `Matter details: ${matterDetails}` : null,
  ].filter(Boolean);

  let successFeeLine: string;
  if (invite.success_fee_waived) {
    successFeeLine = `The usual success fee of ${successFeePercent}% of any fine reduction is waived in full for this matter. No percentage-based success fee will be charged.`;
  } else if (Number(invite.success_fee_percent) > 0) {
    successFeeLine = `A success fee equal to ${successFeePercent}% of any fine reduction achieved will apply. No success fee is payable if the fine is not reduced.`;
  } else {
    successFeeLine = "No percentage-based success fee will be charged for this matter.";
  }

  return [
    "CLIENT CONSENT FOR TRAFFIC TICKET REPRESENTATION",
    "",
    "CLIENT",
    ...clientLines,
    "",
    "MATTER",
    ...matterLines,
    "",
    "FEES",
    `Base representation fee: ${baseFee} ${taxTerms}.`,
    successFeeLine,
    additionalFeeTerms ? `Additional fee terms: ${additionalFeeTerms}` : null,
    "This consent does not authorize Fabsy to create a checkout, charge a payment method, or collect any amount not stated above.",
    "",
    "AUTHORIZATION",
    `I, ${legalName}, authorize Fabsy Traffic Ticket Defense ("Fabsy") and the traffic-ticket agent assigned by Fabsy to act for me on the matter identified above, within the scope permitted by applicable law and court rules.`,
    "I authorize Fabsy to:",
    "- request, receive, and review disclosure and other records for this matter;",
    "- communicate with the Crown, prosecutors, court staff, enforcement agencies, and other authorized participants about this matter;",
    "- discuss and negotiate possible resolutions with the Crown or prosecutor;",
    "- prepare and submit permitted forms, correspondence, and information for this matter;",
    "- attend court or arrange an authorized appearance for this matter; and",
    "- take other procedural steps I specifically instruct Fabsy to take within the permitted agent-services scope.",
    additionalAuthorizationTerms ? `Additional authorization terms: ${additionalAuthorizationTerms}` : null,
    "",
    "CLIENT INSTRUCTIONS AND ACKNOWLEDGEMENTS",
    "I understand that Fabsy provides traffic-ticket agent services and is not a law firm. Fabsy does not promise or guarantee a particular result.",
    "Fabsy will not enter or change a plea, accept a resolution, make an admission, or abandon a defence without my instructions.",
    "I will provide complete and accurate information, keep Fabsy informed of relevant changes, and respond promptly when my instructions are required.",
    "This consent is limited to the matter identified above. I may revoke it by written notice, subject to any steps reasonably required to notify the court, Crown, prosecutor, or other participant and to comply with applicable rules.",
    "Signing this consent does not extend a response date, payment date, court date, appeal period, or statutory deadline. I will continue to follow existing notices until Fabsy confirms in writing that it has assumed conduct of this matter.",
    "",
    "PRESCRIBED GOVERNMENT FORMS",
    "This document is Fabsy's client authorization. It does not replace any prescribed consent or representative-authorization form required by Alberta, the court, or the Traffic Ticket Digital Service. I understand that I may be asked to sign the applicable government form separately.",
    "",
    "PERSONAL INFORMATION CONSENT",
    "I consent to Fabsy collecting, using, and disclosing the personal information reasonably required to provide the authorized service, including exchanging that information with courts, prosecutors, enforcement agencies, service providers, and other authorized participants as needed for this matter or as required by law.",
    "",
    "ELECTRONIC SIGNATURE",
    "By affirmatively accepting this consent and typing my full legal name exactly as displayed above, I confirm that I have read and agree to this entire consent and intend my typed name to be my electronic signature.",
  ].filter((line): line is string => line !== null).join("\n");
}

async function sha256Hex(value: string | Uint8Array) {
  const input = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

function bearerToken(req: Request) {
  const authorization = req.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer ([A-Za-z0-9_-]+)$/);
  const token = match?.[1] || "";
  if (!TOKEN_PATTERN.test(token)) {
    throw new RequestError("Consent invitation not found.", 404, "invite_not_found");
  }
  return token;
}

async function requestBody(req: Request) {
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > 12_000) {
    throw new RequestError("Request is too large.", 413, "request_too_large");
  }
  const raw = await req.text();
  if (!raw || raw.length > 12_000) throw new RequestError("A JSON request body is required.");
  try {
    return record(JSON.parse(raw));
  } catch {
    throw new RequestError("A valid JSON request body is required.");
  }
}

function clientIp(req: Request) {
  const candidate = cleanLine(
    req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      (req.headers.get("x-forwarded-for") || "").split(",")[0],
  );
  return candidate && /^[0-9a-f:.]{2,100}$/i.test(candidate) ? candidate : null;
}

function safeUserAgent(req: Request) {
  const userAgent = cleanLine(req.headers.get("user-agent"));
  return userAgent ? userAgent.slice(0, 500) : null;
}

async function resolveInvite(admin: SupabaseAdmin, tokenHash: string) {
  const { data, error } = await admin.rpc("resolve_representation_consent_invite", {
    p_token_hash: tokenHash,
  });
  if (error) throw error;
  return data ? inviteRow(data) : null;
}

function publicInvite(invite: InviteRow) {
  const completed = invite.status === "completed";
  return {
    client: {
      legalName: cleanLine(invite.client_legal_name),
      email: cleanLine(invite.client_email),
      phone: optionalLine(completed ? invite.signed_client_phone : invite.client_phone),
      dateOfBirth: optionalLine(completed ? invite.signed_client_date_of_birth : invite.client_date_of_birth),
      address: optionalLine(completed ? invite.signed_client_address : invite.client_address),
      city: optionalLine(completed ? invite.signed_client_city : invite.client_city),
      province: optionalLine(completed ? invite.signed_client_province : invite.client_province),
      postalCode: optionalLine(completed ? invite.signed_client_postal_code : invite.client_postal_code),
      driversLicense: optionalLine(completed ? invite.signed_client_drivers_license : invite.client_drivers_license),
    },
    matter: {
      ticketNumber: cleanLine(invite.ticket_number),
      charge: cleanLine(invite.charge_description),
      offenceDate: optionalLine(invite.offence_date_text),
      courtLocation: optionalLine(invite.court_location),
      courtDate: optionalLine(invite.court_date_text),
      details: optionalLine(invite.matter_details),
    },
    fees: {
      baseFeeCents: Number(invite.base_fee_cents),
      currency: cleanLine(invite.fee_currency),
      taxTerms: cleanLine(invite.tax_terms),
      successFeePercent: Number(invite.success_fee_percent),
      successFeeWaived: Boolean(invite.success_fee_waived),
      additionalTerms: optionalLine(invite.additional_fee_terms),
    },
    expiresAt: invite.expires_at,
  };
}

function publicFormData(invite: InviteRow) {
  const completed = invite.status === "completed";
  return {
    phone: optionalLine(completed ? invite.signed_client_phone : invite.client_phone),
    dateOfBirth: optionalLine(completed ? invite.signed_client_date_of_birth : invite.client_date_of_birth),
    address: optionalLine(completed ? invite.signed_client_address : invite.client_address),
    city: optionalLine(completed ? invite.signed_client_city : invite.client_city),
    province: optionalLine(completed ? invite.signed_client_province : invite.client_province),
    postalCode: optionalLine(completed ? invite.signed_client_postal_code : invite.client_postal_code),
    driversLicense: optionalLine(completed ? invite.signed_client_drivers_license : invite.client_drivers_license),
    signedAt: completed ? invite.client_reported_signed_at : null,
  };
}

function validPdfPath(invite: InviteRow) {
  const path = String(invite.pdf_path || "");
  return path.startsWith(`standalone/${invite.id}/`) && path.endsWith(".pdf") && !path.includes("..");
}

async function signedPdfUrl(admin: SupabaseAdmin, invite: InviteRow) {
  if (!validPdfPath(invite)) throw new Error("Stored consent PDF path is invalid.");
  const { data, error } = await admin.storage
    .from("consent-forms")
    .createSignedUrl(String(invite.pdf_path), SIGNED_PDF_URL_SECONDS);
  if (error || !data?.signedUrl) throw error || new Error("Consent PDF link could not be created.");
  return data.signedUrl;
}

async function pendingResponse(invite: InviteRow) {
  const consentText = buildConsentText(invite);
  const consentTextHash = await sha256Hex(consentText);
  return {
    status: "pending",
    invite: publicInvite(invite),
    formData: publicFormData(invite),
    consent: {
      version: CONSENT_TEXT_VERSION,
      text: consentText,
      hash: consentTextHash,
      requiredSignature: cleanLine(invite.client_legal_name),
    },
  };
}

async function completedResponse(admin: SupabaseAdmin, invite: InviteRow) {
  const consentText = String(invite.signed_consent_text || "");
  const consentVersion = String(invite.signed_consent_text_version || "");
  const consentHash = String(invite.signed_consent_text_hash || "");
  if (
    !invite.signed_at ||
    !invite.digital_signature ||
    !consentText ||
    !consentVersion ||
    !SHA256_PATTERN.test(consentHash) ||
    await sha256Hex(consentText) !== consentHash
  ) {
    throw new Error("Completed consent audit record is invalid.");
  }
  return {
    status: "completed",
    readOnly: true,
    invite: publicInvite(invite),
    formData: publicFormData(invite),
    consent: {
      version: consentVersion,
      text: consentText,
      hash: consentHash,
      requiredSignature: cleanLine(invite.client_legal_name),
    },
    signed: {
      signedAt: invite.signed_at,
      clientReportedSignedAt: invite.client_reported_signed_at,
      digitalSignature: invite.digital_signature,
      pdfUrl: await signedPdfUrl(admin, invite),
      pdfUrlExpiresIn: SIGNED_PDF_URL_SECONDS,
      pdfSha256: invite.pdf_sha256,
    },
  };
}

function unavailableResponse(origin: string | null, status: InviteRow["status"]) {
  const expired = status === "expired";
  return json(origin, {
    status,
    error: expired
      ? "This consent invitation has expired. Contact Fabsy for a new link."
      : "This consent invitation is no longer available. Contact Fabsy if you need assistance.",
    code: expired ? "invite_expired" : "invite_revoked",
  }, 410);
}

function pdfSafe(value: unknown) {
  return String(value ?? "");
}

function wrapPdfText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = pdfSafe(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function createSignedPdf(invite: InviteRow) {
  const consentText = String(invite.pending_consent_text || "");
  const consentVersion = String(invite.pending_consent_text_version || "");
  const consentHash = String(invite.pending_consent_text_hash || "");
  const signature = String(invite.pending_digital_signature || "");
  const signedAt = String(invite.pending_signed_at || "");
  const clientReportedSignedAt = String(invite.pending_client_reported_signed_at || "");
  const signedClientDetails = {
    phone: String(invite.pending_client_phone || ""),
    dateOfBirth: String(invite.pending_client_date_of_birth || ""),
    address: String(invite.pending_client_address || ""),
    city: String(invite.pending_client_city || ""),
    province: String(invite.pending_client_province || ""),
    postalCode: String(invite.pending_client_postal_code || ""),
    driversLicense: String(invite.pending_client_drivers_license || ""),
  };
  if (!consentText || !consentVersion || !SHA256_PATTERN.test(consentHash) || !signature || !signedAt) {
    throw new Error("Claimed consent audit data is incomplete.");
  }
  if (!clientReportedSignedAt || Object.values(signedClientDetails).some((value) => !value)) {
    throw new Error("Claimed client-identification data is incomplete.");
  }
  if (await sha256Hex(consentText) !== consentHash) {
    throw new Error("Claimed consent text hash does not match.");
  }

  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 52;
  const contentWidth = pageWidth - margin * 2;
  const bottom = 58;
  let page: PDFPage;
  let y: number;

  const addPage = () => {
    page = document.addPage([pageWidth, pageHeight]);
    page.drawText("FABSY", {
      x: margin,
      y: pageHeight - 43,
      size: 15,
      font: bold,
      color: rgb(0.31, 0.12, 0.58),
    });
    page.drawText("Traffic Ticket Defense", {
      x: margin + 57,
      y: pageHeight - 41,
      size: 9,
      font: regular,
      color: rgb(0.34, 0.36, 0.42),
    });
    page.drawLine({
      start: { x: margin, y: pageHeight - 51 },
      end: { x: pageWidth - margin, y: pageHeight - 51 },
      thickness: 1,
      color: rgb(0.84, 0.81, 0.9),
    });
    y = pageHeight - 76;
  };

  const ensureSpace = (height: number) => {
    if (y - height < bottom) addPage();
  };

  const drawParagraph = (
    text: string,
    options: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; indent?: number; gapAfter?: number } = {},
  ) => {
    const selectedFont = options.font || regular;
    const size = options.size || 9.5;
    const indent = options.indent || 0;
    const lineHeight = size * 1.38;
    const lines = wrapPdfText(text, selectedFont, size, contentWidth - indent);
    for (const line of lines) {
      ensureSpace(lineHeight);
      page.drawText(line, {
        x: margin + indent,
        y,
        size,
        font: selectedFont,
        color: options.color || rgb(0.12, 0.14, 0.18),
      });
      y -= lineHeight;
    }
    y -= options.gapAfter ?? 4;
  };

  addPage();
  drawParagraph("SIGNED REPRESENTATION CONSENT", {
    font: bold,
    size: 17,
    color: rgb(0.31, 0.12, 0.58),
    gapAfter: 9,
  });
  drawParagraph(`Consent version: ${consentVersion}`, { size: 8.5, gapAfter: 1 });
  drawParagraph(`Consent text SHA-256: ${consentHash}`, { size: 8.5, gapAfter: 13 });

  drawParagraph("CLIENT IDENTIFICATION SUPPLIED AT SIGNING", {
    font: bold,
    size: 11.5,
    color: rgb(0.31, 0.12, 0.58),
    gapAfter: 6,
  });
  drawParagraph(`Full legal name: ${cleanLine(invite.client_legal_name)}`, { gapAfter: 2 });
  drawParagraph(`Email: ${cleanLine(invite.client_email)}`, { gapAfter: 2 });
  drawParagraph(`Phone: ${signedClientDetails.phone}`, { gapAfter: 2 });
  drawParagraph(`Date of birth: ${signedClientDetails.dateOfBirth}`, { gapAfter: 2 });
  drawParagraph(`Address: ${signedClientDetails.address}, ${signedClientDetails.city}, ${signedClientDetails.province} ${signedClientDetails.postalCode}`, { gapAfter: 2 });
  drawParagraph(`Driver's licence number: ${signedClientDetails.driversLicense}`, { gapAfter: 12 });

  for (const rawLine of consentText.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      y -= 6;
      continue;
    }
    const isHeading = /^[A-Z][A-Z ]+$/.test(line) && line.length <= 64;
    const isBullet = line.startsWith("- ");
    drawParagraph(line, {
      font: isHeading ? bold : regular,
      size: isHeading ? 11.5 : 9.5,
      color: isHeading ? rgb(0.31, 0.12, 0.58) : rgb(0.12, 0.14, 0.18),
      indent: isBullet ? 12 : 0,
      gapAfter: isHeading ? 6 : 3,
    });
  }

  ensureSpace(115);
  y -= 8;
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: rgb(0.84, 0.81, 0.9),
  });
  y -= 22;
  drawParagraph("ELECTRONIC SIGNATURE AUDIT", {
    font: bold,
    size: 11.5,
    color: rgb(0.31, 0.12, 0.58),
    gapAfter: 7,
  });
  drawParagraph(`Typed signature: ${signature}`, { font: bold, size: 10.5, gapAfter: 3 });
  drawParagraph(`Server-recorded signature time: ${signedAt}`, { size: 9, gapAfter: 3 });
  drawParagraph(`Client-reported signature time: ${clientReportedSignedAt}`, { size: 9, gapAfter: 3 });
  drawParagraph("The client affirmatively accepted the versioned consent above before submitting this electronic signature.", {
    size: 8.5,
    color: rgb(0.34, 0.36, 0.42),
  });

  const pages = document.getPages();
  pages.forEach((currentPage, index) => {
    currentPage.drawText(`Fabsy representation consent | Page ${index + 1} of ${pages.length}`, {
      x: margin,
      y: 29,
      size: 7.5,
      font: regular,
      color: rgb(0.45, 0.47, 0.52),
    });
  });
  document.setTitle(`Representation consent - ${pdfSafe(invite.ticket_number)}`);
  document.setAuthor("Fabsy Traffic Ticket Defense");
  document.setSubject("Signed traffic ticket representation consent");
  document.setCreator("Fabsy secure consent service");
  document.setProducer("Fabsy secure consent service");
  document.setCreationDate(new Date(signedAt));
  document.setModificationDate(new Date(signedAt));
  return document.save({ useObjectStreams: false });
}

async function handleGet(
  origin: string,
  admin: SupabaseAdmin,
  tokenHash: string,
) {
  const invite = await resolveInvite(admin, tokenHash);
  if (!invite) throw new RequestError("Consent invitation not found.", 404, "invite_not_found");
  if (invite.status === "expired" || invite.status === "revoked") {
    return unavailableResponse(origin, invite.status);
  }
  if (invite.status === "signing") {
    return json(origin, {
      status: "processing",
      error: "This consent is being finalized. Try this link again shortly.",
      code: "consent_processing",
      retryAfter: 3,
    }, 409);
  }
  if (invite.status === "completed") return json(origin, await completedResponse(admin, invite));
  return json(origin, await pendingResponse(invite));
}

async function handleSubmit(
  req: Request,
  origin: string,
  admin: SupabaseAdmin,
  tokenHash: string,
  body: JsonRecord,
) {
  const currentInvite = await resolveInvite(admin, tokenHash);
  if (!currentInvite) throw new RequestError("Consent invitation not found.", 404, "invite_not_found");
  if (currentInvite.status === "completed") {
    return json(origin, await completedResponse(admin, currentInvite));
  }
  if (currentInvite.status === "expired" || currentInvite.status === "revoked") {
    return unavailableResponse(origin, currentInvite.status);
  }
  if (currentInvite.status === "signing") {
    return json(origin, {
      status: "processing",
      error: "This consent is being finalized. Try this link again shortly.",
      code: "consent_processing",
      retryAfter: 3,
    }, 409);
  }
  if (body.accepted !== true) {
    throw new RequestError("Accept the representation consent before signing.", 400, "consent_not_accepted");
  }

  const signature = normalizedSignature(body.digitalSignature);
  if (!signature || signature.length > 200) {
    throw new RequestError("Type the full legal name shown on the consent.", 400, "signature_required");
  }
  if (signature !== normalizedSignature(currentInvite.client_legal_name)) {
    throw new RequestError(
      "Type the full legal name exactly as shown on the consent.",
      400,
      "signature_mismatch",
    );
  }
  const formData = validateClientFormData(body.formData);

  const consentText = buildConsentText(currentInvite);
  const consentTextHash = await sha256Hex(consentText);
  const displayedHash = cleanLine(body.consentTextHash).toLowerCase();
  if (!SHA256_PATTERN.test(displayedHash) || displayedHash !== consentTextHash) {
    throw new RequestError(
      "The consent terms changed before signing. Review the current consent and try again.",
      409,
      "consent_version_changed",
    );
  }

  const claimId = crypto.randomUUID();
  const { data: claimData, error: claimError } = await admin.rpc(
    "claim_representation_consent_invite",
    {
      p_token_hash: tokenHash,
      p_claim_id: claimId,
      p_accepted: true,
      p_digital_signature: signature,
      p_client_phone: formData.phone,
      p_client_date_of_birth: formData.dateOfBirth,
      p_client_address: formData.address,
      p_client_city: formData.city,
      p_client_province: formData.province,
      p_client_postal_code: formData.postalCode,
      p_client_drivers_license: formData.driversLicense,
      p_client_reported_signed_at: formData.signedAt,
      p_signing_ip: clientIp(req),
      p_signing_user_agent: safeUserAgent(req),
      p_consent_text: consentText,
      p_consent_text_version: CONSENT_TEXT_VERSION,
      p_consent_text_hash: consentTextHash,
    },
  );
  if (claimError) throw claimError;
  if (!claimData) throw new RequestError("Consent invitation not found.", 404, "invite_not_found");
  const claim = record(claimData);
  const claimResult = String(claim.result || "");
  const claimedInvite = inviteRow(claim.invite);

  if (claimResult === "completed") {
    return json(origin, await completedResponse(admin, claimedInvite));
  }
  if (claimResult === "expired" || claimResult === "revoked") {
    return unavailableResponse(origin, claimResult as InviteRow["status"]);
  }
  if (claimResult === "processing") {
    return json(origin, {
      status: "processing",
      error: "This consent is being finalized. Try this link again shortly.",
      code: "consent_processing",
      retryAfter: 3,
    }, 409);
  }
  if (claimResult === "signature_mismatch") {
    throw new RequestError(
      "Type the full legal name exactly as shown on the consent.",
      400,
      "signature_mismatch",
    );
  }
  if (claimResult === "invalid_client_details") {
    throw new RequestError(
      "The client information could not be verified. Review every required field and try again.",
      400,
      "invalid_client_details",
    );
  }
  if (claimResult !== "claimed" || !claimedInvite.id) {
    throw new RequestError("Consent could not be signed.", 409, "consent_not_claimed");
  }

  let uploadedPath: string | null = null;
  let finalized = false;
  try {
    const pdfBytes = await createSignedPdf(claimedInvite);
    const pdfHash = await sha256Hex(pdfBytes);
    const pdfPath = `standalone/${claimedInvite.id}/representation-consent-${consentTextHash.slice(0, 16)}.pdf`;
    const { error: uploadError } = await admin.storage
      .from("consent-forms")
      .upload(pdfPath, pdfBytes, {
        contentType: "application/pdf",
        cacheControl: "0",
        upsert: true,
      });
    if (uploadError) throw uploadError;
    uploadedPath = pdfPath;

    const { data: finalizeData, error: finalizeError } = await admin.rpc(
      "finalize_representation_consent_invite",
      {
        p_token_hash: tokenHash,
        p_claim_id: claimId,
        p_pdf_path: pdfPath,
        p_pdf_sha256: pdfHash,
      },
    );
    if (finalizeError) throw finalizeError;
    const finalize = record(finalizeData);
    if (finalize.result !== "completed") {
      throw new RequestError(
        "Consent finalization timed out. Review the link before trying again.",
        409,
        "consent_finalize_conflict",
      );
    }
    finalized = true;
    return json(origin, await completedResponse(admin, inviteRow(finalize.invite)));
  } catch (error) {
    if (!finalized) {
      const { data: released, error: releaseError } = await admin.rpc("release_representation_consent_invite_claim", {
        p_token_hash: tokenHash,
        p_claim_id: claimId,
      });
      if (releaseError) console.error("[representation-consent] failed to release a signing claim");
      // Delete only after the database confirms this exact claim was released.
      // If finalization committed but its response was lost, release returns
      // false and the now-authoritative completed PDF must be preserved.
      if (released === true && uploadedPath) {
        const { error: cleanupError } = await admin.storage.from("consent-forms").remove([uploadedPath]);
        if (cleanupError) console.error("[representation-consent] failed to clean up an unfinalized PDF");
      }
    }
    throw error;
  }
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    return json(origin, { error: "Origin is not allowed.", code: "origin_not_allowed" }, 403);
  }
  if (req.method === "OPTIONS") return new Response(null, { headers: responseHeaders(origin) });
  if (req.method !== "POST") {
    return json(origin, { error: "Method not allowed.", code: "method_not_allowed" }, 405);
  }

  try {
    const body = await requestBody(req);
    const action = cleanLine(body.action);
    if (action !== "get" && action !== "submit") {
      throw new RequestError("Action must be get or submit.");
    }
    const token = bearerToken(req);
    const tokenHash = await sha256Hex(token);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Consent service configuration is incomplete.");
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (action === "get") return await handleGet(origin!, admin, tokenHash);
    return await handleSubmit(req, origin!, admin, tokenHash, body);
  } catch (error: unknown) {
    const requestError = error instanceof RequestError ? error : null;
    if (!requestError) {
      const message = error instanceof Error ? error.message : "unknown error";
      console.error(`[representation-consent] ${message.slice(0, 300)}`);
    }
    return json(origin, {
      error: requestError?.message || "Consent service is temporarily unavailable.",
      code: requestError?.code || "consent_service_error",
    }, requestError?.status || 500);
  }
});
