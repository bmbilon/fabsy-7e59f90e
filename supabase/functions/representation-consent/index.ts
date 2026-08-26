import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import {
  type ConsentAccessDenial,
  consentAccessDenial,
  type ConsentAccessRecord,
  signedUrlLifetimeSeconds,
} from "./access.ts";
import {
  fileExtension,
  MANUAL_SCAN_ALLOWED_TYPES,
  MANUAL_SCAN_MAX_BYTES,
  type ManualScanContentType,
  manualScanDescriptor,
  matchesDeclaredMagic,
  safeManualTempPath,
} from "./manual-scan.ts";
import {
  validOptionalAptoPhone,
  validOptionalAptoPostalCode,
  validOptionalAptoProvince,
} from "./client-fields.ts";
import { buildConsentText, CONSENT_TEXT_VERSION } from "./consent-text.ts";
import { createSignedConsentPdf } from "./signed-pdf.ts";

const SIGNED_PDF_URL_SECONDS = 600;
const MANUAL_UPLOAD_GRANT_SECONDS = 15 * 60;
const CONSENT_PDF_BUCKET = "consent-forms";
const MANUAL_SCAN_BUCKET = "representation-consent-scans";
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
type AdminConsentAccessRow = {
  status: string;
  expires_at: string;
  access_revoked_at: string | null;
};
type AdminManualUploadRow = {
  id: string;
  invite_id: string;
  temp_path: string;
  expected_content_type: string;
  expected_size_bytes: number;
  expires_at: string;
  status: "issued" | "claimed" | "consumed" | "expired";
  created_at: string;
};
type AdminManualReviewRow = {
  invite_id: string;
  status: "pending" | "approved" | "rejected" | "requires_reupload";
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
};
type AdminDatabase = {
  public: {
    Tables: {
      representation_consent_invites: {
        Row: AdminConsentAccessRow;
        Insert: AdminConsentAccessRow;
        Update: Partial<AdminConsentAccessRow>;
        Relationships: [];
      };
      representation_consent_manual_uploads: {
        Row: AdminManualUploadRow;
        Insert: AdminManualUploadRow;
        Update: Partial<AdminManualUploadRow>;
        Relationships: [];
      };
      representation_consent_manual_reviews: {
        Row: AdminManualReviewRow;
        Insert: AdminManualReviewRow;
        Update: Partial<AdminManualReviewRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      resolve_representation_consent_invite: {
        Args: JsonRecord;
        Returns: JsonRecord | null;
      };
      claim_representation_consent_invite_v2: {
        Args: JsonRecord;
        Returns: JsonRecord | null;
      };
      finalize_representation_consent_invite_v2: {
        Args: JsonRecord;
        Returns: JsonRecord | null;
      };
      release_representation_consent_invite_claim: {
        Args: JsonRecord;
        Returns: boolean;
      };
      issue_representation_consent_manual_upload: {
        Args: JsonRecord;
        Returns: JsonRecord | null;
      };
      expire_representation_consent_manual_uploads: {
        Args: JsonRecord;
        Returns: JsonRecord | null;
      };
      abandon_representation_consent_manual_upload: {
        Args: JsonRecord;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
type SupabaseAdmin = ReturnType<typeof createClient<AdminDatabase>>;

interface InviteRow extends JsonRecord, ConsentAccessRecord {
  id: string;
  status: "pending" | "signing" | "completed" | "revoked" | "expired";
  expires_at: string;
  access_revoked_at: string | null;
  access_revocation_reason: string | null;
  client_legal_name: string;
  client_first_name: string | null;
  client_last_name: string | null;
  client_email: string;
  client_phone: string | null;
  client_date_of_birth: string | null;
  client_address: string | null;
  client_city: string | null;
  client_province: string | null;
  client_postal_code: string | null;
  client_drivers_license: string | null;
  ticket_number: string;
  ticket_numbers: string[];
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
  representative_first_name: string;
  representative_last_name: string;
  representative_firm: string;
  representative_phone: string;
  representative_mailing_address: string | null;
  representative_city: string | null;
  representative_province: string;
  representative_postal_code: string | null;
  government_form_code: string;
  government_form_revision: string;
  government_form_sha256: string;
  government_form_url: string;
  pending_signature_method: "typed" | "manual_scan" | null;
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
  pending_manual_signed_name: string | null;
  pending_manual_signed_date: string | null;
  pending_manual_scan_source_path: string | null;
  pending_manual_scan_source_sha256: string | null;
  pending_manual_scan_source_content_type: ManualScanContentType | null;
  pending_manual_scan_source_size: number | null;
  pending_manual_scan_pdf_path: string | null;
  pending_manual_scan_pdf_sha256: string | null;
  pending_manual_scan_uploaded_at: string | null;
  pending_manual_scan_review_status: "pending" | null;
  signed_at: string | null;
  signature_method: "typed" | "manual_scan" | null;
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
  manual_signed_name: string | null;
  manual_signed_date: string | null;
  manual_scan_source_path: string | null;
  manual_scan_source_sha256: string | null;
  manual_scan_source_content_type: ManualScanContentType | null;
  manual_scan_source_size: number | null;
  manual_scan_pdf_path: string | null;
  manual_scan_pdf_sha256: string | null;
  manual_scan_uploaded_at: string | null;
  manual_scan_review_status: "pending" | "approved" | "rejected" | null;
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
  const configured =
    (Deno.env.get("REPRESENTATION_CONSENT_ALLOWED_ORIGINS") || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function isAllowedOrigin(origin: string | null) {
  return Boolean(origin && configuredOrigins().has(origin));
}

function responseHeaders(origin: string | null) {
  const allowedOrigin = origin && isAllowedOrigin(origin)
    ? origin
    : "https://fabsy.ca";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
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
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin),
  });
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
  // Preserved as an empty audit field for backward-compatible database RPCs.
  // Driver's licence is not an APTO13348 consent field and is not collected.
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
    throw new RequestError(
      `${label} is invalid.`,
      400,
      "invalid_client_details",
    );
  }
  const normalized = cleanLine(value);
  if (normalized.length < minLength || normalized.length > maxLength) {
    throw new RequestError(
      `${label} is invalid.`,
      400,
      "invalid_client_details",
    );
  }
  return normalized;
}

function optionalClientText(value: unknown, label: string, maxLength: number) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value !== "string" || containsControlCharacter(value)) {
    throw new RequestError(
      `${label} is invalid.`,
      400,
      "invalid_client_details",
    );
  }
  const normalized = cleanLine(value);
  if (normalized.length > maxLength) {
    throw new RequestError(
      `${label} is invalid.`,
      400,
      "invalid_client_details",
    );
  }
  return normalized;
}

function validIsoDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
}

function validateClientFormData(value: unknown): ValidatedClientFormData {
  const form = record(value);
  const phone = optionalClientText(form.phone, "Phone number", 30);
  if (!validOptionalAptoPhone(phone)) {
    throw new RequestError(
      "Phone number is invalid.",
      400,
      "invalid_client_details",
    );
  }

  const dateOfBirth = typeof form.dateOfBirth === "string"
    ? form.dateOfBirth
    : "";
  const today = new Date().toISOString().slice(0, 10);
  if (
    !validIsoDate(dateOfBirth) || dateOfBirth < "1900-01-01" ||
    dateOfBirth > today
  ) {
    throw new RequestError(
      "Date of birth is invalid.",
      400,
      "invalid_client_details",
    );
  }

  const address = requiredClientText(form.address, "Street address", 1, 160);
  const city = requiredClientText(form.city, "City", 1, 80);
  const province = optionalClientText(form.province, "Province", 80);
  const postalCode = optionalClientText(form.postalCode, "Postal code", 12)
    .toUpperCase();
  if (
    !validOptionalAptoProvince(province) ||
    !validOptionalAptoPostalCode(postalCode)
  ) {
    throw new RequestError(
      "Postal code is invalid.",
      400,
      "invalid_client_details",
    );
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
    throw new RequestError(
      "Signature time is invalid. Refresh the page and try again.",
      400,
      "invalid_client_details",
    );
  }

  return {
    phone,
    dateOfBirth,
    address,
    city,
    province,
    postalCode,
    driversLicense: "",
    signedAt: signedAtDate.toISOString(),
  };
}

async function sha256Hex(value: string | Uint8Array) {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value;
  const input = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
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
    throw new RequestError(
      "Consent invitation not found.",
      404,
      "invite_not_found",
    );
  }
  return token;
}

async function requestBody(req: Request) {
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > 12_000) {
    throw new RequestError("Request is too large.", 413, "request_too_large");
  }
  const raw = await req.text();
  if (!raw || raw.length > 12_000) {
    throw new RequestError("A JSON request body is required.");
  }
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
  const { data, error } = await admin.rpc(
    "resolve_representation_consent_invite",
    {
      p_token_hash: tokenHash,
    },
  );
  if (error) throw error;
  return data ? inviteRow(data) : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string =>
      typeof entry === "string" && Boolean(entry)
    )
    : [];
}

async function removeManualTempPaths(
  admin: SupabaseAdmin,
  paths: string[],
  required: boolean,
) {
  if (!paths.length) return true;
  const safePaths = paths.filter((path) =>
    path.startsWith("temporary/") && !path.includes("..") && path.length <= 500
  );
  if (safePaths.length !== paths.length) {
    if (required) throw new Error("Stored temporary scan path is invalid.");
    return false;
  }
  const { error } = await admin.storage.from(MANUAL_SCAN_BUCKET).remove(
    safePaths,
  );
  if (error) {
    if (required) {
      throw new RequestError(
        "A previous secure upload could not be rotated. Try again shortly.",
        503,
        "manual_upload_cleanup_failed",
      );
    }
    console.error(
      "[representation-consent] failed to remove expired temporary scans",
    );
    return false;
  }
  return true;
}

async function cleanupExpiredManualTemps(
  admin: SupabaseAdmin,
  tokenHash: string,
  required = false,
) {
  const { data, error } = await admin.rpc(
    "expire_representation_consent_manual_uploads",
    {
      p_token_hash: tokenHash,
    },
  );
  if (error) {
    if (required) throw error;
    console.error(
      "[representation-consent] failed to expire temporary scan grants",
    );
    return false;
  }
  return removeManualTempPaths(
    admin,
    stringArray(record(data).paths),
    required,
  );
}

async function abandonManualTemp(
  admin: SupabaseAdmin,
  tokenHash: string,
  path: string,
) {
  const { data: abandoned, error } = await admin.rpc(
    "abandon_representation_consent_manual_upload",
    { p_token_hash: tokenHash, p_temp_path: path },
  );
  if (error) {
    console.error(
      "[representation-consent] failed to abandon a temporary scan grant",
    );
    return;
  }
  if (abandoned === true) {
    await removeManualTempPaths(admin, [path], false);
  } else {
    await cleanupExpiredManualTemps(admin, tokenHash, false);
  }
}

function publicInvite(invite: InviteRow) {
  const completed = invite.status === "completed";
  return {
    client: {
      legalName: cleanLine(invite.client_legal_name),
      firstName: optionalLine(invite.client_first_name),
      lastName: optionalLine(invite.client_last_name),
      email: cleanLine(invite.client_email),
      phone: optionalLine(
        completed ? invite.signed_client_phone : invite.client_phone,
      ),
      dateOfBirth: optionalLine(
        completed
          ? invite.signed_client_date_of_birth
          : invite.client_date_of_birth,
      ),
      address: optionalLine(
        completed ? invite.signed_client_address : invite.client_address,
      ),
      city: optionalLine(
        completed ? invite.signed_client_city : invite.client_city,
      ),
      province: optionalLine(
        completed ? invite.signed_client_province : invite.client_province,
      ),
      postalCode: optionalLine(
        completed
          ? invite.signed_client_postal_code
          : invite.client_postal_code,
      ),
    },
    matter: {
      ticketNumber: cleanLine(invite.ticket_number),
      ticketNumbers: Array.isArray(invite.ticket_numbers)
        ? invite.ticket_numbers.map(cleanLine).filter(Boolean)
        : [cleanLine(invite.ticket_number)].filter(Boolean),
      charge: cleanLine(invite.charge_description),
      offenceDate: optionalLine(invite.offence_date_text),
      courtLocation: optionalLine(invite.court_location),
      courtDate: optionalLine(invite.court_date_text),
      details: optionalLine(invite.matter_details),
    },
    expiresAt: invite.expires_at,
  };
}

function publicRepresentative(invite: InviteRow) {
  return {
    firstName: cleanLine(invite.representative_first_name),
    lastName: cleanLine(invite.representative_last_name),
    firm: cleanLine(invite.representative_firm),
    phone: cleanLine(invite.representative_phone),
    mailingAddress: optionalLine(invite.representative_mailing_address),
    city: optionalLine(invite.representative_city),
    province: cleanLine(invite.representative_province),
    postalCode: optionalLine(invite.representative_postal_code),
  };
}

function publicGovernmentForm(invite: InviteRow) {
  return {
    code: cleanLine(invite.government_form_code),
    revision: cleanLine(invite.government_form_revision),
    sha256: cleanLine(invite.government_form_sha256),
    sourceUrl: cleanLine(invite.government_form_url),
    officialUrl: cleanLine(invite.government_form_url),
    securityClassification: "Protected B when completed",
    typedConsentReplacesOfficialForm: false,
  };
}

function publicFormData(invite: InviteRow) {
  const completed = invite.status === "completed";
  return {
    phone: optionalLine(
      completed ? invite.signed_client_phone : invite.client_phone,
    ),
    dateOfBirth: optionalLine(
      completed
        ? invite.signed_client_date_of_birth
        : invite.client_date_of_birth,
    ),
    address: optionalLine(
      completed ? invite.signed_client_address : invite.client_address,
    ),
    city: optionalLine(
      completed ? invite.signed_client_city : invite.client_city,
    ),
    province: optionalLine(
      completed ? invite.signed_client_province : invite.client_province,
    ),
    postalCode: optionalLine(
      completed ? invite.signed_client_postal_code : invite.client_postal_code,
    ),
    signedAt: completed ? invite.client_reported_signed_at : null,
  };
}

function validPdfPath(invite: InviteRow) {
  const path = String(invite.pdf_path || "");
  return path.startsWith(`standalone/${invite.id}/`) && path.endsWith(".pdf") &&
    !path.includes("..");
}

function unavailableRequestError(status: ConsentAccessDenial) {
  const expired = status === "expired";
  return new RequestError(
    expired
      ? "This consent invitation has expired. Contact Fabsy for a new link."
      : "This consent invitation is no longer available. Contact Fabsy if you need assistance.",
    410,
    expired ? "invite_expired" : "invite_revoked",
  );
}

function assertInviteAccess(invite: ConsentAccessRecord) {
  const denial = consentAccessDenial(invite);
  if (denial) throw unavailableRequestError(denial);
}

async function currentInviteAccess(admin: SupabaseAdmin, inviteId: string) {
  const { data, error } = await admin
    .from("representation_consent_invites")
    .select("status, expires_at, access_revoked_at")
    .eq("id", inviteId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new RequestError(
      "Consent invitation not found.",
      404,
      "invite_not_found",
    );
  }
  const access = data as ConsentAccessRecord;
  assertInviteAccess(access);
  return access;
}

async function signedStorageUrl(
  admin: SupabaseAdmin,
  invite: InviteRow,
  bucket: string,
  path: string,
) {
  // Refresh only access-control fields immediately before minting. This keeps
  // revocation checks independent of any earlier PII-bearing invite snapshot.
  const access = await currentInviteAccess(admin, invite.id);
  const expiresIn = signedUrlLifetimeSeconds(
    access.expires_at,
    Date.now(),
    SIGNED_PDF_URL_SECONDS,
  );
  if (expiresIn < 1) throw unavailableRequestError("expired");
  if (!path || path.includes("..")) {
    throw new Error("Stored consent PDF path is invalid.");
  }
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn, { download: true });
  if (error || !data?.signedUrl) {
    throw error || new Error("Consent PDF link could not be created.");
  }
  return { url: data.signedUrl, expiresIn };
}

async function signedPdfUrl(admin: SupabaseAdmin, invite: InviteRow) {
  if (!validPdfPath(invite)) {
    throw new Error("Stored consent PDF path is invalid.");
  }
  return signedStorageUrl(
    admin,
    invite,
    CONSENT_PDF_BUCKET,
    String(invite.pdf_path),
  );
}

async function pendingResponse(invite: InviteRow) {
  assertInviteAccess(invite);
  const consentText = buildConsentText(invite);
  const consentTextHash = await sha256Hex(consentText);
  return {
    status: "pending",
    invite: publicInvite(invite),
    representative: publicRepresentative(invite),
    governmentForm: publicGovernmentForm(invite),
    formData: publicFormData(invite),
    consent: {
      version: CONSENT_TEXT_VERSION,
      text: consentText,
      hash: consentTextHash,
      requiredSignature: cleanLine(invite.client_legal_name),
    },
    signature: {
      defaultMethod: "typed",
      allowedMethods: ["typed", "manual_scan"],
      manualUpload: {
        maxBytes: MANUAL_SCAN_MAX_BYTES,
        allowedTypes: [...MANUAL_SCAN_ALLOWED_TYPES],
      },
    },
  };
}

async function currentManualReview(
  admin: SupabaseAdmin,
  invite: InviteRow,
) {
  if (invite.signature_method !== "manual_scan") return null;
  const { data, error } = await admin
    .from("representation_consent_manual_reviews")
    .select("status, reviewed_at")
    .eq("invite_id", invite.id)
    .maybeSingle();
  if (error) throw error;
  return data || {
    status: invite.manual_scan_review_status || "pending",
    reviewed_at: null,
  };
}

async function completedResponse(admin: SupabaseAdmin, invite: InviteRow) {
  assertInviteAccess(invite);
  const consentText = String(invite.signed_consent_text || "");
  const consentVersion = String(invite.signed_consent_text_version || "");
  const consentHash = String(invite.signed_consent_text_hash || "");
  if (
    !invite.signed_at ||
    !invite.signature_method ||
    !consentText ||
    !consentVersion ||
    !SHA256_PATTERN.test(consentHash) ||
    await sha256Hex(consentText) !== consentHash
  ) {
    throw new Error("Completed consent audit record is invalid.");
  }
  // Mint and re-check access before constructing any PII-bearing response.
  const pdf = await signedPdfUrl(admin, invite);
  const manualReview = await currentManualReview(admin, invite);
  let manualScanPdf: { url: string; expiresIn: number } | null = null;
  if (invite.signature_method === "manual_scan") {
    const path = String(invite.manual_scan_pdf_path || "");
    if (!path.startsWith(`manual/${invite.id}/`) || !path.endsWith(".pdf")) {
      throw new Error("Completed manual scan path is invalid.");
    }
    manualScanPdf = await signedStorageUrl(
      admin,
      invite,
      MANUAL_SCAN_BUCKET,
      path,
    );
  }
  return {
    status: "completed",
    readOnly: true,
    invite: publicInvite(invite),
    representative: publicRepresentative(invite),
    governmentForm: publicGovernmentForm(invite),
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
      signatureMethod: invite.signature_method,
      pdfUrl: pdf.url,
      pdfUrlExpiresIn: pdf.expiresIn,
      pdfSha256: invite.pdf_sha256,
      manualSignedName: invite.manual_signed_name,
      manualSignedDate: invite.manual_signed_date,
      manualScanPdfUrl: manualScanPdf?.url || null,
      manualScanPdfUrlExpiresIn: manualScanPdf?.expiresIn || null,
      manualScanPdfSha256: invite.manual_scan_pdf_sha256,
      manualScanReviewStatus: manualReview?.status || null,
      manualScanReviewedAt: manualReview?.reviewed_at || null,
    },
  };
}

function unavailableResponse(
  origin: string | null,
  status: ConsentAccessDenial,
) {
  const expired = status === "expired";
  return json(origin, {
    status,
    error: expired
      ? "This consent invitation has expired. Contact Fabsy for a new link."
      : "This consent invitation is no longer available. Contact Fabsy if you need assistance.",
    code: expired ? "invite_expired" : "invite_revoked",
  }, 410);
}

async function handleGet(
  origin: string,
  admin: SupabaseAdmin,
  tokenHash: string,
) {
  await cleanupExpiredManualTemps(admin, tokenHash, false);
  const invite = await resolveInvite(admin, tokenHash);
  if (!invite) {
    throw new RequestError(
      "Consent invitation not found.",
      404,
      "invite_not_found",
    );
  }
  const accessDenial = consentAccessDenial(invite);
  if (accessDenial) return unavailableResponse(origin, accessDenial);
  if (invite.status === "signing") {
    return json(origin, {
      status: "processing",
      error: "This consent is being finalized. Try this link again shortly.",
      code: "consent_processing",
      retryAfter: 3,
    }, 409);
  }
  if (invite.status === "completed") {
    return json(origin, await completedResponse(admin, invite));
  }
  return json(origin, await pendingResponse(invite));
}

async function createManualScanPdf(
  bytes: Uint8Array,
  contentType: ManualScanContentType,
) {
  // Preserve uploaded PDF bytes exactly. Images are flattened into a one-page,
  // letter-size PDF suitable for staff upload to TTDS.
  if (contentType === "application/pdf") return bytes;
  const document = await PDFDocument.create();
  const image = contentType === "image/jpeg"
    ? await document.embedJpg(bytes)
    : await document.embedPng(bytes);
  if (
    !image.width || !image.height || image.width * image.height > 30_000_000
  ) {
    throw new RequestError(
      "The scan image dimensions are invalid.",
      400,
      "invalid_manual_scan",
    );
  }
  const page = document.addPage([612, 792]);
  const maximumWidth = 564;
  const maximumHeight = 744;
  const scale = Math.min(
    maximumWidth / image.width,
    maximumHeight / image.height,
    1,
  );
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, {
    x: (612 - width) / 2,
    y: (792 - height) / 2,
    width,
    height,
  });
  document.setTitle("Signed representation consent scan");
  document.setAuthor("Fabsy Traffic Ticket Services");
  document.setCreator("Fabsy secure consent service");
  document.setProducer("Fabsy secure consent service");
  return document.save({ useObjectStreams: false });
}

async function handleCreateManualUpload(
  origin: string,
  admin: SupabaseAdmin,
  tokenHash: string,
  body: JsonRecord,
) {
  await cleanupExpiredManualTemps(admin, tokenHash, false);
  const invite = await resolveInvite(admin, tokenHash);
  if (!invite) {
    throw new RequestError(
      "Consent invitation not found.",
      404,
      "invite_not_found",
    );
  }
  const accessDenial = consentAccessDenial(invite);
  if (accessDenial) return unavailableResponse(origin, accessDenial);
  if (invite.status === "completed") {
    return json(origin, await completedResponse(admin, invite));
  }
  if (invite.status === "signing") {
    return json(origin, {
      status: "processing",
      error: "This consent is being finalized. Try this link again shortly.",
      code: "consent_processing",
      retryAfter: 3,
    }, 409);
  }

  const consentText = buildConsentText(invite);
  const consentTextHash = await sha256Hex(consentText);
  if (cleanLine(body.consentTextHash).toLowerCase() !== consentTextHash) {
    throw new RequestError(
      "The consent terms changed. Review the current consent before uploading.",
      409,
      "consent_version_changed",
    );
  }
  const descriptor = manualScanDescriptor(body.file);
  if (!descriptor) {
    throw new RequestError(
      "Upload one PDF, JPEG, or PNG file no larger than 10 MB.",
      400,
      "invalid_manual_scan",
    );
  }

  const uploadId = crypto.randomUUID();
  const extension = fileExtension(descriptor.contentType);
  const path = `temporary/${invite.id}/${uploadId}/upload.${extension}`;
  const inviteExpiryMs = Date.parse(invite.expires_at);
  const expiresAtMs = Math.min(
    inviteExpiryMs,
    Date.now() + MANUAL_UPLOAD_GRANT_SECONDS * 1000,
  );
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    return unavailableResponse(origin, "expired");
  }
  const expiresAt = new Date(expiresAtMs).toISOString();
  const { data: grantData, error: grantError } = await admin.rpc(
    "issue_representation_consent_manual_upload",
    {
      p_token_hash: tokenHash,
      p_upload_id: uploadId,
      p_temp_path: path,
      p_content_type: descriptor.contentType,
      p_size_bytes: descriptor.size,
      p_expires_at: expiresAt,
    },
  );
  if (grantError) throw grantError;
  const grant = record(grantData);
  const grantResult = String(grant.result || "");
  if (grantResult === "expired" || grantResult === "revoked") {
    return unavailableResponse(origin, grantResult as ConsentAccessDenial);
  }
  if (grantResult === "completed") {
    const completedInvite = await resolveInvite(admin, tokenHash);
    if (completedInvite?.status === "completed") {
      return json(origin, await completedResponse(admin, completedInvite));
    }
  }
  if (grantResult === "processing") {
    return json(origin, {
      status: "processing",
      error: "This consent is being finalized. Try this link again shortly.",
      code: "consent_processing",
      retryAfter: 3,
    }, 409);
  }
  if (grantResult === "upload_limit") {
    throw new RequestError(
      "The secure upload attempt limit has been reached. Contact Fabsy for a new link.",
      429,
      "manual_upload_limit",
    );
  }
  if (grantResult !== "issued" || grant.temp_path !== path) {
    throw new RequestError(
      "The secure upload could not be prepared.",
      409,
      "manual_upload_not_issued",
    );
  }

  try {
    await removeManualTempPaths(
      admin,
      stringArray(grant.replaced_temp_paths),
      true,
    );
  } catch (error) {
    await abandonManualTemp(admin, tokenHash, path);
    throw error;
  }

  const { data, error } = await admin.storage
    .from(MANUAL_SCAN_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });
  if (error || !data?.token) {
    await abandonManualTemp(admin, tokenHash, path);
    throw error || new Error("Manual scan upload could not be created.");
  }
  const { data: activeGrant, error: activeGrantError } = await admin
    .from("representation_consent_manual_uploads")
    .select("status")
    .eq("id", uploadId)
    .eq("invite_id", invite.id)
    .maybeSingle();
  if (activeGrantError) {
    await abandonManualTemp(admin, tokenHash, path);
    throw activeGrantError;
  }
  if (activeGrant?.status !== "issued") {
    await removeManualTempPaths(admin, [path], false);
    throw new RequestError(
      "A newer secure upload replaced this attempt. Try again.",
      409,
      "manual_upload_rotated",
    );
  }
  return json(origin, {
    status: "upload_ready",
    upload: {
      bucket: MANUAL_SCAN_BUCKET,
      path,
      token: data.token,
      maxBytes: MANUAL_SCAN_MAX_BYTES,
      allowedTypes: [...MANUAL_SCAN_ALLOWED_TYPES],
      expiresAt,
    },
  });
}

async function handleSubmit(
  req: Request,
  origin: string,
  admin: SupabaseAdmin,
  tokenHash: string,
  body: JsonRecord,
) {
  await cleanupExpiredManualTemps(admin, tokenHash, false);
  const currentInvite = await resolveInvite(admin, tokenHash);
  if (!currentInvite) {
    throw new RequestError(
      "Consent invitation not found.",
      404,
      "invite_not_found",
    );
  }
  const accessDenial = consentAccessDenial(currentInvite);
  if (accessDenial) return unavailableResponse(origin, accessDenial);
  if (currentInvite.status === "completed") {
    return json(origin, await completedResponse(admin, currentInvite));
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
    throw new RequestError(
      "Accept the representation consent before signing.",
      400,
      "consent_not_accepted",
    );
  }

  const signatureMethod = cleanLine(body.signatureMethod) || "typed";
  if (signatureMethod !== "typed" && signatureMethod !== "manual_scan") {
    throw new RequestError(
      "Choose a valid signature method.",
      400,
      "invalid_signature_method",
    );
  }
  const signature = normalizedSignature(
    signatureMethod === "manual_scan"
      ? body.manualSignedName
      : body.digitalSignature,
  );
  if (!signature || signature.length > 200) {
    throw new RequestError(
      "Enter the full legal name shown on the consent.",
      400,
      "signature_required",
    );
  }
  if (signature !== normalizedSignature(currentInvite.client_legal_name)) {
    throw new RequestError(
      "Enter the full legal name exactly as shown on the consent.",
      400,
      "signature_mismatch",
    );
  }
  const formData = validateClientFormData(body.formData);

  const consentText = buildConsentText(currentInvite);
  const consentTextHash = await sha256Hex(consentText);
  const displayedHash = cleanLine(body.consentTextHash).toLowerCase();
  if (
    !SHA256_PATTERN.test(displayedHash) || displayedHash !== consentTextHash
  ) {
    throw new RequestError(
      "The consent terms changed before signing. Review the current consent and try again.",
      409,
      "consent_version_changed",
    );
  }

  const claimId = crypto.randomUUID();
  let manualSignedDate: string | null = null;
  let manualTempPath: string | null = null;
  let manualSourcePath: string | null = null;
  let manualSourceHash: string | null = null;
  let manualContentType: ManualScanContentType | null = null;
  let manualSourceSize: number | null = null;
  let manualPdfPath: string | null = null;
  let manualPdfHash: string | null = null;
  let manualSourceBytes: Uint8Array | null = null;
  let manualPdfBytes: Uint8Array | null = null;

  if (signatureMethod === "manual_scan") {
    manualSignedDate = typeof body.manualSignedDate === "string"
      ? body.manualSignedDate
      : "";
    if (!validIsoDate(manualSignedDate)) {
      throw new RequestError(
        "Enter the date shown on the signed document.",
        400,
        "invalid_manual_scan",
      );
    }
    const scan = record(body.manualScan);
    const descriptor = manualScanDescriptor({
      name: "upload",
      contentType: scan.contentType,
      size: scan.size,
    });
    manualTempPath = cleanLine(scan.path);
    if (!descriptor || !safeManualTempPath(currentInvite.id, manualTempPath)) {
      if (safeManualTempPath(currentInvite.id, manualTempPath)) {
        await abandonManualTemp(admin, tokenHash, manualTempPath);
      }
      throw new RequestError(
        "The uploaded signature file is invalid.",
        400,
        "invalid_manual_scan",
      );
    }
    manualContentType = descriptor.contentType;
    const { data: scanBlob, error: scanDownloadError } = await admin.storage
      .from(MANUAL_SCAN_BUCKET)
      .download(manualTempPath);
    if (scanDownloadError || !scanBlob) {
      await abandonManualTemp(admin, tokenHash, manualTempPath);
      throw new RequestError(
        "Upload the signed document before submitting.",
        400,
        "manual_scan_missing",
      );
    }
    manualSourceBytes = new Uint8Array(await scanBlob.arrayBuffer());
    if (
      manualSourceBytes.byteLength !== descriptor.size ||
      manualSourceBytes.byteLength > MANUAL_SCAN_MAX_BYTES ||
      !matchesDeclaredMagic(manualSourceBytes, manualContentType)
    ) {
      await abandonManualTemp(admin, tokenHash, manualTempPath);
      throw new RequestError(
        "The uploaded file type or size does not match.",
        400,
        "invalid_manual_scan",
      );
    }
    manualSourceSize = manualSourceBytes.byteLength;
    manualSourceHash = await sha256Hex(manualSourceBytes);
    try {
      manualPdfBytes = await createManualScanPdf(
        manualSourceBytes,
        manualContentType,
      );
    } catch (error) {
      await abandonManualTemp(admin, tokenHash, manualTempPath);
      if (error instanceof RequestError) throw error;
      throw new RequestError(
        "The uploaded signature file could not be read.",
        400,
        "invalid_manual_scan",
      );
    }
    manualPdfHash = await sha256Hex(manualPdfBytes);
    const sourceExtension = fileExtension(manualContentType);
    manualSourcePath =
      `manual/${currentInvite.id}/${claimId}/source.${sourceExtension}`;
    manualPdfPath = `manual/${currentInvite.id}/${claimId}/signed-scan.pdf`;
  }

  const { data: claimData, error: claimError } = await admin.rpc(
    "claim_representation_consent_invite_v2",
    {
      p_token_hash: tokenHash,
      p_claim_id: claimId,
      p_accepted: true,
      p_signature_method: signatureMethod,
      p_digital_signature: signatureMethod === "typed" ? signature : null,
      p_manual_signed_name: signatureMethod === "manual_scan"
        ? signature
        : null,
      p_manual_signed_date: manualSignedDate,
      p_manual_scan_temp_path: manualTempPath,
      p_manual_scan_source_path: manualSourcePath,
      p_manual_scan_source_sha256: manualSourceHash,
      p_manual_scan_source_content_type: manualContentType,
      p_manual_scan_source_size: manualSourceSize,
      p_manual_scan_pdf_path: manualPdfPath,
      p_manual_scan_pdf_sha256: manualPdfHash,
      p_manual_scan_uploaded_at: signatureMethod === "manual_scan"
        ? new Date().toISOString()
        : null,
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
  if (!claimData) {
    throw new RequestError(
      "Consent invitation not found.",
      404,
      "invite_not_found",
    );
  }
  const claim = record(claimData);
  const claimResult = String(claim.result || "");
  const claimedInvite = inviteRow(claim.invite);

  if (claimResult === "completed") {
    if (manualTempPath) {
      await abandonManualTemp(admin, tokenHash, manualTempPath);
    }
    return json(origin, await completedResponse(admin, claimedInvite));
  }
  if (claimResult === "expired" || claimResult === "revoked") {
    if (manualTempPath) {
      await abandonManualTemp(admin, tokenHash, manualTempPath);
    }
    return unavailableResponse(origin, claimResult as ConsentAccessDenial);
  }
  if (claimResult === "processing") {
    if (manualTempPath) {
      await abandonManualTemp(admin, tokenHash, manualTempPath);
    }
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
  if (claimResult === "invalid_manual_scan") {
    if (manualTempPath) {
      await abandonManualTemp(admin, tokenHash, manualTempPath);
    }
    throw new RequestError(
      "The uploaded signature file is invalid or its upload window expired.",
      400,
      "invalid_manual_scan",
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
    throw new RequestError(
      "Consent could not be signed.",
      409,
      "consent_not_claimed",
    );
  }

  const uploadedConsentPaths: string[] = [];
  const uploadedScanPaths: string[] = [];
  let finalized = false;
  try {
    if (signatureMethod === "manual_scan") {
      if (
        !manualSourceBytes || !manualPdfBytes || !manualSourcePath ||
        !manualPdfPath || !manualContentType
      ) {
        throw new Error("Claimed manual scan data is incomplete.");
      }
      const { error: sourceUploadError } = await admin.storage
        .from(MANUAL_SCAN_BUCKET)
        .upload(manualSourcePath, manualSourceBytes, {
          contentType: manualContentType,
          cacheControl: "0",
          upsert: false,
        });
      if (sourceUploadError) throw sourceUploadError;
      uploadedScanPaths.push(manualSourcePath);
      const { error: normalizedUploadError } = await admin.storage
        .from(MANUAL_SCAN_BUCKET)
        .upload(manualPdfPath, manualPdfBytes, {
          contentType: "application/pdf",
          cacheControl: "0",
          upsert: false,
        });
      if (normalizedUploadError) throw normalizedUploadError;
      uploadedScanPaths.push(manualPdfPath);
    }

    const pdfBytes = await createSignedConsentPdf(claimedInvite);
    const pdfHash = await sha256Hex(pdfBytes);
    const pdfPath =
      `standalone/${claimedInvite.id}/${claimId}/signed-consent.pdf`;
    const { error: uploadError } = await admin.storage
      .from(CONSENT_PDF_BUCKET)
      .upload(pdfPath, pdfBytes, {
        contentType: "application/pdf",
        cacheControl: "0",
        upsert: false,
      });
    if (uploadError) throw uploadError;
    uploadedConsentPaths.push(pdfPath);

    const { data: finalizeData, error: finalizeError } = await admin.rpc(
      "finalize_representation_consent_invite_v2",
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
    await cleanupExpiredManualTemps(admin, tokenHash, false);
    if (manualTempPath) {
      const { error: cleanupError } = await admin.storage.from(
        MANUAL_SCAN_BUCKET,
      ).remove([manualTempPath]);
      if (cleanupError) {
        console.error(
          "[representation-consent] failed to clean up a consumed temporary scan",
        );
      }
    }
    return json(
      origin,
      await completedResponse(admin, inviteRow(finalize.invite)),
    );
  } catch (error) {
    if (!finalized) {
      const { data: released, error: releaseError } = await admin.rpc(
        "release_representation_consent_invite_claim",
        {
          p_token_hash: tokenHash,
          p_claim_id: claimId,
        },
      );
      if (releaseError) {
        console.error(
          "[representation-consent] failed to release a signing claim",
        );
      }
      // Delete only after the database confirms this exact claim was released.
      // If finalization committed but its response was lost, release returns
      // false and the now-authoritative completed PDF must be preserved.
      if (released === true) {
        if (uploadedConsentPaths.length) {
          const { error: cleanupError } = await admin.storage.from(
            CONSENT_PDF_BUCKET,
          ).remove(uploadedConsentPaths);
          if (cleanupError) {
            console.error(
              "[representation-consent] failed to clean up an unfinalized audit PDF",
            );
          }
        }
        if (uploadedScanPaths.length) {
          const { error: cleanupError } = await admin.storage.from(
            MANUAL_SCAN_BUCKET,
          ).remove(uploadedScanPaths);
          if (cleanupError) {
            console.error(
              "[representation-consent] failed to clean up unfinalized scan copies",
            );
          }
        }
      }
    }
    throw error;
  }
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    return json(origin, {
      error: "Origin is not allowed.",
      code: "origin_not_allowed",
    }, 403);
  }
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: responseHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json(origin, {
      error: "Method not allowed.",
      code: "method_not_allowed",
    }, 405);
  }

  try {
    const body = await requestBody(req);
    const action = cleanLine(body.action);
    if (
      action !== "get" && action !== "submit" &&
      action !== "create_manual_upload"
    ) {
      throw new RequestError(
        "Action must be get, create_manual_upload, or submit.",
      );
    }
    const token = bearerToken(req);
    const tokenHash = await sha256Hex(token);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Consent service configuration is incomplete.");
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (action === "get") return await handleGet(origin!, admin, tokenHash);
    if (action === "create_manual_upload") {
      return await handleCreateManualUpload(origin!, admin, tokenHash, body);
    }
    return await handleSubmit(req, origin!, admin, tokenHash, body);
  } catch (error: unknown) {
    const requestError = error instanceof RequestError ? error : null;
    if (!requestError) {
      const message = error instanceof Error ? error.message : "unknown error";
      console.error(`[representation-consent] ${message.slice(0, 300)}`);
    }
    return json(origin, {
      error: requestError?.message ||
        "Consent service is temporarily unavailable.",
      code: requestError?.code || "consent_service_error",
    }, requestError?.status || 500);
  }
});
