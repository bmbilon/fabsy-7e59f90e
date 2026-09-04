import { parsePreferredLocale, type PreferredLocale } from "./locale-policy.ts";

export const DRAFT_SCHEMA_VERSION = 1;
export const DRAFT_TTL_DAYS = 30;
export const MAX_DRAFT_BODY_BYTES = 64 * 1024;
export const MAX_DRAFT_DATA_BYTES = 48 * 1024;
export const MAX_TICKET_FILE_BYTES = 10 * 1024 * 1024;
export const DRAFT_ACCESS_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const TICKET_FILE_EXTENSIONS: Readonly<Record<string, string>> = Object
  .freeze({
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
  });

const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://fabsy.ca",
  "https://www.fabsy.ca",
  "https://fabsy-execom.vercel.app",
  "http://localhost:4173",
  "http://localhost:5173",
  "http://localhost:8080",
]);

type JsonRecord = Record<string, unknown>;
type DraftValueKind = "string" | "boolean" | "nullable_boolean" | "date";
type DraftFieldRule = Readonly<
  { kind: DraftValueKind; maxLength?: number; values?: readonly string[] }
>;

const STRING_RULE = (maxLength: number): DraftFieldRule => ({
  kind: "string",
  maxLength,
});
const BOOLEAN_RULE: DraftFieldRule = { kind: "boolean" };
const NULLABLE_BOOLEAN_RULE: DraftFieldRule = { kind: "nullable_boolean" };
const DATE_RULE: DraftFieldRule = { kind: "date", maxLength: 40 };

/** Flat, serializable form fields only. Files, signatures and bearer credentials never enter draft JSON. */
export const DRAFT_FIELD_RULES: Readonly<Record<string, DraftFieldRule>> =
  Object.freeze({
    ticketType: { kind: "string", values: ["officer_issued", "photo_radar"] },
    ticketTypeSource: {
      kind: "string",
      values: ["default", "entry", "upload", "manual"],
    },
    registeredOwnerOnOffenceDate: {
      kind: "string",
      values: ["", "yes", "sold_before", "stolen"],
    },
    firstName: STRING_RULE(100),
    lastName: STRING_RULE(100),
    email: STRING_RULE(255),
    phone: STRING_RULE(30),
    smsOptIn: BOOLEAN_RULE,
    address: STRING_RULE(500),
    city: STRING_RULE(100),
    province: STRING_RULE(100),
    postalCode: STRING_RULE(20),
    dateOfBirth: DATE_RULE,
    driversLicense: STRING_RULE(50),
    licenceClass: {
      kind: "string",
      values: ["1", "2", "3", "4", "5", "6", "7", "unknown"],
    },
    addressDifferentFromLicense: BOOLEAN_RULE,
    ticketNumber: STRING_RULE(50),
    plateNumber: STRING_RULE(20),
    issueDate: DATE_RULE,
    ticketDateManuallyEdited: BOOLEAN_RULE,
    location: STRING_RULE(200),
    officer: STRING_RULE(150),
    officerBadge: STRING_RULE(50),
    offenceSection: STRING_RULE(100),
    offenceSubSection: STRING_RULE(100),
    offenceDescription: STRING_RULE(500),
    violation: STRING_RULE(500),
    fineAmount: STRING_RULE(20),
    courtDate: DATE_RULE,
    courtJurisdiction: STRING_RULE(200),
    agentRepresentationPermitted: NULLABLE_BOOLEAN_RULE,
    vehicleSeized: BOOLEAN_RULE,
    pleaType: STRING_RULE(100),
    explanation: STRING_RULE(2500),
    circumstances: STRING_RULE(2500),
    witnesses: BOOLEAN_RULE,
    witnessDetails: STRING_RULE(2000),
    evidence: BOOLEAN_RULE,
    evidenceDetails: STRING_RULE(2000),
    priorTickets: STRING_RULE(1000),
    insuranceCompany: STRING_RULE(200),
    vehicleDetails: STRING_RULE(1000),
    additionalNotes: STRING_RULE(2000),
  });

export const SENSITIVE_DRAFT_FIELDS = new Set([
  "accessToken",
  "draftAccessToken",
  "sourceAssessmentAccessToken",
  "refAttributionToken",
  "digitalSignature",
  "consentGiven",
  "ticketImage",
  "driversLicenseImage",
  "file",
  "payment",
  "paymentIntent",
  "paymentMethod",
  "stripeCheckoutSessionId",
  "referral",
]);

export class DraftRequestError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "invalid_draft_request",
  ) {
    super(message);
    this.name = "DraftRequestError";
  }
}

export interface DraftContact {
  email: string | null;
  phone: string | null;
}

export interface TicketFileMetadata {
  contentType: keyof typeof TICKET_FILE_EXTENSIONS;
  extension: string;
  size: number;
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DraftRequestError(`${label} must be an object.`);
  }
  return value as JsonRecord;
}

export function assertAllowedKeys(
  value: JsonRecord,
  allowed: readonly string[],
  label = "Request",
) {
  const allowedKeys = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unknown.length) {
    throw new DraftRequestError(
      `${label} contains unsupported fields.`,
      400,
      "unsupported_draft_fields",
    );
  }
}

export function isAllowedTicketIntakeOrigin(
  origin: string | null,
  configured = "",
) {
  if (!origin) return true;
  if (DEFAULT_ALLOWED_ORIGINS.has(origin)) return true;
  return configured.split(",").map((value) => value.trim()).filter(Boolean)
    .includes(origin);
}

export function ticketIntakeResponseHeaders(
  origin: string | null,
  configured = "",
) {
  return {
    "Access-Control-Allow-Origin":
      origin && isAllowedTicketIntakeOrigin(origin, configured)
        ? origin
        : "https://fabsy.ca",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
  };
}

export function parseJsonBody(text: string): JsonRecord {
  if (new TextEncoder().encode(text).byteLength > MAX_DRAFT_BODY_BYTES) {
    throw new DraftRequestError(
      "The draft request is too large.",
      413,
      "draft_request_too_large",
    );
  }
  try {
    return record(JSON.parse(text), "Request");
  } catch (error) {
    if (error instanceof DraftRequestError) throw error;
    throw new DraftRequestError(
      "Request body must be valid JSON.",
      400,
      "invalid_json",
    );
  }
}

export function createDraftAccessToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

export function parseDraftAccessToken(value: unknown) {
  if (typeof value !== "string" || !DRAFT_ACCESS_TOKEN_PATTERN.test(value)) {
    throw new DraftRequestError(
      "The saved intake link is invalid.",
      403,
      "draft_access_denied",
    );
  }
  return value;
}

export function parseOptionalDraftId(value: unknown) {
  if (value === undefined) return null;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new DraftRequestError(
      "The saved intake link is invalid.",
      403,
      "draft_access_denied",
    );
  }
  return value.toLowerCase();
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest)).map((part) =>
    part.toString(16).padStart(2, "0")
  ).join("");
}

export async function requestFingerprint(secret: string, address: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(address),
  );
  return Array.from(new Uint8Array(digest)).map((part) =>
    part.toString(16).padStart(2, "0")
  ).join("");
}

export function requestAddress(req: Request) {
  return req.headers.get("cf-connecting-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown";
}

function normalizeEmail(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new DraftRequestError("Email is invalid.");
  }
  const email = value.trim().toLowerCase();
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new DraftRequestError("Email is invalid.");
  }
  return email;
}

function normalizePhone(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (
    typeof value !== "string" || value.length > 30 ||
    !/^[\d\s+().-]+$/.test(value)
  ) {
    throw new DraftRequestError("Phone is invalid.");
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    throw new DraftRequestError("Phone is invalid.");
  }
  return value.trim().startsWith("+") ? `+${digits}` : digits;
}

export function parseDraftContact(value: unknown): DraftContact {
  const contact = record(value, "Contact");
  assertAllowedKeys(contact, ["email", "phone"], "Contact");
  const normalized = {
    email: normalizeEmail(contact.email),
    phone: normalizePhone(contact.phone),
  };
  if (!normalized.email && !normalized.phone) {
    throw new DraftRequestError(
      "Enter an email address or phone number to save your progress.",
    );
  }
  return normalized;
}

export function mergeDraftContact(
  current: DraftContact,
  draftData: JsonRecord,
): DraftContact {
  const email = Object.hasOwn(draftData, "email")
    ? normalizeEmail(draftData.email)
    : current.email;
  const phone = Object.hasOwn(draftData, "phone")
    ? normalizePhone(draftData.phone)
    : current.phone;
  if (!email && !phone) {
    throw new DraftRequestError(
      "Keep an email address or phone number to save your progress.",
    );
  }
  return { email, phone };
}

export function parsePreferredDraftLocale(value: unknown): PreferredLocale {
  try {
    return parsePreferredLocale(value);
  } catch {
    throw new DraftRequestError(
      "preferredLocale must be one of en, pa, tl, zh-hans, zh-hant, ar, hi or es.",
      400,
      "invalid_preferred_locale",
    );
  }
}

export function parseTicketFileMetadata(value: unknown): TicketFileMetadata {
  const file = record(value, "File");
  assertAllowedKeys(file, ["contentType", "size"], "File");
  const contentType = typeof file.contentType === "string"
    ? file.contentType.trim().toLowerCase()
    : "";
  const extension = TICKET_FILE_EXTENSIONS[contentType];
  if (!extension) {
    throw new DraftRequestError(
      "Upload a PDF, JPG, PNG, WebP, HEIC or HEIF ticket file.",
    );
  }
  if (
    typeof file.size !== "number" || !Number.isInteger(file.size) ||
    file.size <= 0 || file.size > MAX_TICKET_FILE_BYTES
  ) {
    throw new DraftRequestError("The ticket file must be 10 MB or smaller.");
  }
  return { contentType, extension, size: file.size } as TicketFileMetadata;
}

function sanitizedDraftValue(
  key: string,
  value: unknown,
  rule: DraftFieldRule,
) {
  if (rule.kind === "boolean") {
    if (typeof value !== "boolean") {
      throw new DraftRequestError(`${key} is invalid.`);
    }
    return value;
  }
  if (rule.kind === "nullable_boolean") {
    if (value !== null && typeof value !== "boolean") {
      throw new DraftRequestError(`${key} is invalid.`);
    }
    return value;
  }
  if (typeof value !== "string") {
    throw new DraftRequestError(`${key} is invalid.`);
  }
  const normalized = value.trim();
  if (rule.maxLength && normalized.length > rule.maxLength) {
    throw new DraftRequestError(`${key} is too long.`);
  }
  if (rule.values && !rule.values.includes(normalized)) {
    throw new DraftRequestError(`${key} is invalid.`);
  }
  if (rule.kind === "date" && normalized) {
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      throw new DraftRequestError(`${key} is invalid.`);
    }
  }
  if (key === "email") return normalizeEmail(normalized) || "";
  if (key === "phone") return normalizePhone(normalized) || "";
  return normalized;
}

export function sanitizeDraftData(value: unknown): JsonRecord {
  const draft = record(value, "draftData");
  const sanitized: JsonRecord = {};
  for (const [key, fieldValue] of Object.entries(draft)) {
    if (SENSITIVE_DRAFT_FIELDS.has(key)) {
      throw new DraftRequestError(
        "draftData contains a signature, file or credential that cannot be saved.",
        400,
        "sensitive_draft_field",
      );
    }
    const rule = DRAFT_FIELD_RULES[key];
    if (!rule) {
      throw new DraftRequestError(
        "draftData contains unsupported fields.",
        400,
        "unsupported_draft_fields",
      );
    }
    sanitized[key] = sanitizedDraftValue(key, fieldValue, rule);
  }
  if (
    new TextEncoder().encode(JSON.stringify(sanitized)).byteLength >
      MAX_DRAFT_DATA_BYTES
  ) {
    throw new DraftRequestError(
      "The saved intake is too large.",
      413,
      "draft_data_too_large",
    );
  }
  return sanitized;
}

export function syncContactIntoDraftData(
  draftData: JsonRecord,
  contact: DraftContact,
) {
  return {
    ...draftData,
    ...(Object.hasOwn(draftData, "email")
      ? { email: contact.email || "" }
      : {}),
    ...(Object.hasOwn(draftData, "phone")
      ? { phone: contact.phone || "" }
      : {}),
  };
}

export function parseRevision(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new DraftRequestError("revision is invalid.");
  }
  return value;
}

export function parseDraftStep(
  value: unknown,
  label: "currentStep" | "completedStep",
) {
  const minimum = label === "currentStep" ? 1 : 0;
  if (
    typeof value !== "number" || !Number.isInteger(value) || value < minimum ||
    value > 6
  ) {
    throw new DraftRequestError(`${label} is invalid.`);
  }
  return value;
}

export function draftStoragePath(
  id: string,
  revision: number,
  extension: string,
) {
  if (
    !UUID_PATTERN.test(id) || !Number.isSafeInteger(revision) || revision < 1 ||
    !Object.values(TICKET_FILE_EXTENSIONS).includes(extension)
  ) {
    throw new DraftRequestError(
      "The private upload path is invalid.",
      400,
      "invalid_upload_path",
    );
  }
  return `${id.toLowerCase()}/representation-ticket-r${revision}.${extension}`;
}

export function storageObjectMatches(
  expected: { contentType: string; size: number },
  actual: { mimetype?: unknown; size?: unknown } | null | undefined,
) {
  return Boolean(
    actual &&
      actual.mimetype === expected.contentType &&
      typeof actual.size === "number" &&
      actual.size === expected.size,
  );
}

/** A replacement stays pending until its object is verified; the last confirmed
 * object remains the public draft document throughout a failed/interrupted upload. */
export function draftUploadVerificationTarget(row: {
  ticket_document_path: string;
  ticket_document_content_type: string;
  ticket_document_size_bytes: number;
  pending_ticket_document_path?: string | null;
  pending_ticket_document_content_type?: string | null;
  pending_ticket_document_size_bytes?: number | null;
}) {
  if (
    row.pending_ticket_document_path &&
    row.pending_ticket_document_content_type &&
    typeof row.pending_ticket_document_size_bytes === "number"
  ) {
    return {
      path: row.pending_ticket_document_path,
      contentType: row.pending_ticket_document_content_type,
      size: row.pending_ticket_document_size_bytes,
      replacement: true,
    } as const;
  }
  return {
    path: row.ticket_document_path,
    contentType: row.ticket_document_content_type,
    size: row.ticket_document_size_bytes,
    replacement: false,
  } as const;
}

export function discardedPendingObjectForCleanup(
  previousPendingPath: string | null,
  returned: {
    ticket_document_path: string;
    pending_ticket_document_path?: string | null;
  },
): string | null {
  if (
    !previousPendingPath ||
    returned.ticket_document_path === previousPendingPath ||
    returned.pending_ticket_document_path === previousPendingPath
  ) {
    return null;
  }
  return previousPendingPath;
}

export function draftCapabilityWasRotated(
  previousHash: string,
  returnedHash: string,
  candidateHash: string,
): boolean {
  return previousHash !== returnedHash && returnedHash === candidateHash;
}
