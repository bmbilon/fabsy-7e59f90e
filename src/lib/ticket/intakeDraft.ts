import { supabase } from "@/integrations/supabase/client";

export const INTAKE_DRAFT_STORAGE_KEY = "fabsy.ticket-intake-capability.v1";
export const INTAKE_DRAFT_RESUME_PARAMETER = "resume";

const ACCESS_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type IntakeDraftCapability = {
  draftId: string;
  accessToken: string;
  expiresAt: string;
};

export type IntakeDraftContact = {
  email: string;
  phone: string;
};

export type IntakeDraftUpload = {
  bucket: "assessment-tickets";
  path: string;
  token: string;
  contentType: string;
  maxBytes: number;
};

export type IntakeDraftResumeDelivery = {
  status: "pending" | "sending" | "sent" | "failed";
  channel: "email" | "sms" | null;
  sentAt: string | null;
  canRetry: boolean;
  mode: "manual" | "automatic";
};

export type IntakeDraftRecord = {
  draftId: string;
  revision: number;
  contact: IntakeDraftContact;
  albertaConfirmed: boolean;
  contactPermission: boolean;
  preferredLocale: string;
  currentStep: number;
  completedStep: number;
  draftData: Record<string, unknown>;
  ticketDocumentPath: string;
  ticketUploadedAt: string | null;
  hasPendingTicketUpload: boolean;
  status: string;
  expiresAt: string;
  convertedSubmissionId?: string | null;
  clientId?: string | null;
  resumeDelivery: IntakeDraftResumeDelivery;
  accessToken?: string;
  upload?: IntakeDraftUpload;
};

export type IntakeDraftStatus = "idle" | "loading" | "saving" | "saved" | "error";

const DRAFT_DATA_KEYS = [
  "ticketType", "ticketTypeSource", "registeredOwnerOnOffenceDate",
  "firstName", "lastName", "email", "phone", "smsOptIn", "address",
  "city", "province", "postalCode", "dateOfBirth", "driversLicense",
  "licenceClass", "addressDifferentFromLicense", "ticketNumber", "plateNumber",
  "issueDate", "ticketDateManuallyEdited", "location", "officer", "officerBadge",
  "offenceSection", "offenceSubSection", "offenceDescription", "violation",
  "fineAmount", "courtDate", "courtJurisdiction", "agentRepresentationPermitted",
  "vehicleSeized", "pleaType", "explanation", "circumstances", "witnesses",
  "witnessDetails", "evidence", "evidenceDetails", "priorTickets",
  "insuranceCompany", "vehicleDetails", "additionalNotes",
] as const;

function serializableValue(value: unknown): unknown {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number" || value === null) return value;
  return undefined;
}

/**
 * Create the intentionally narrow server-side draft payload. File objects,
 * signatures, consent, assessment capabilities and referral tokens never cross
 * this boundary.
 */
export function serializeIntakeDraftData(formData: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of DRAFT_DATA_KEYS) {
    const value = serializableValue(formData[key]);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

export function hydrateIntakeDraftData(raw: Record<string, unknown>): Record<string, unknown> {
  const hydrated = serializeIntakeDraftData(raw);
  for (const key of ["dateOfBirth", "issueDate", "courtDate"] as const) {
    const value = hydrated[key];
    if (typeof value !== "string" || !value) continue;
    const date = new Date(value);
    hydrated[key] = Number.isFinite(date.getTime()) ? date : undefined;
  }
  // A saved authorization is never restored. The customer must review and sign
  // the current consent text in the current session.
  return { ...hydrated, consentGiven: false, digitalSignature: "" };
}

export function isIntakeDraftAccessToken(value: unknown): value is string {
  return typeof value === "string" && ACCESS_TOKEN_PATTERN.test(value);
}

export function isIntakeDraftCapability(value: unknown): value is IntakeDraftCapability {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<IntakeDraftCapability>;
  return typeof candidate.draftId === "string" && UUID_PATTERN.test(candidate.draftId)
    && isIntakeDraftAccessToken(candidate.accessToken)
    && typeof candidate.expiresAt === "string"
    && Number.isFinite(Date.parse(candidate.expiresAt))
    && Date.parse(candidate.expiresAt) > Date.now();
}

export function readStoredIntakeDraft(storage: Pick<Storage, "getItem" | "removeItem"> = localStorage): IntakeDraftCapability | null {
  try {
    const value = JSON.parse(storage.getItem(INTAKE_DRAFT_STORAGE_KEY) || "null") as unknown;
    if (isIntakeDraftCapability(value)) return value;
  } catch {
    // Remove malformed state below.
  }
  try {
    storage.removeItem(INTAKE_DRAFT_STORAGE_KEY);
  } catch {
    // Storage can be blocked by browser privacy settings. The caller can still
    // retain a newly validated capability in memory for the active tab.
  }
  return null;
}

export function rememberIntakeDraft(capability: IntakeDraftCapability, storage: Pick<Storage, "setItem"> = localStorage): void {
  if (!isIntakeDraftCapability(capability)) throw new Error("The saved intake link is invalid or expired.");
  storage.setItem(INTAKE_DRAFT_STORAGE_KEY, JSON.stringify(capability));
}

export function forgetIntakeDraft(storage: Pick<Storage, "removeItem"> = localStorage): void {
  try {
    storage.removeItem(INTAKE_DRAFT_STORAGE_KEY);
  } catch {
    // Expired server access still wins even when browser storage is blocked.
  }
}

export function resumeTokenFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const token = params.get(INTAKE_DRAFT_RESUME_PARAMETER);
  return isIntakeDraftAccessToken(token) ? token : null;
}

export function stripResumeTokenFromUrl(location: Pick<Location, "pathname" | "search" | "hash">): string {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  params.delete(INTAKE_DRAFT_RESUME_PARAMETER);
  const hash = params.toString();
  return `${location.pathname}${location.search}${hash ? `#${hash}` : ""}`;
}

export function resumeUrl(capability: IntakeDraftCapability, location: Pick<Location, "origin" | "pathname">): string {
  if (!isIntakeDraftCapability(capability)) throw new Error("The saved intake link is invalid or expired.");
  return `${location.origin}${location.pathname}#${INTAKE_DRAFT_RESUME_PARAMETER}=${encodeURIComponent(capability.accessToken)}`;
}

async function functionError(error: unknown, fallback: string): Promise<Error> {
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: Response }).context;
    if (context instanceof Response) {
      try {
        const body = await context.clone().json() as { error?: unknown };
        if (typeof body.error === "string" && body.error.trim()) return new Error(body.error);
      } catch {
        // Use the provider error below.
      }
    }
  }
  return new Error(error instanceof Error && error.message ? error.message : fallback);
}

export async function invokeIntakeDraft(body: Record<string, unknown>): Promise<IntakeDraftRecord> {
  const { data, error } = await supabase.functions.invoke("ticket-intake-draft", { body });
  if (error || !data?.success || !data?.draftId || !Number.isInteger(data?.revision)) {
    throw await functionError(error, typeof data?.error === "string" ? data.error : "Your saved intake could not be updated.");
  }
  return data as IntakeDraftRecord;
}

export async function uploadIntakeTicket(upload: IntakeDraftUpload, file: File): Promise<void> {
  if (upload.bucket !== "assessment-tickets") throw new Error("The private ticket upload destination is invalid.");
  if (file.size > upload.maxBytes) throw new Error("The selected ticket file is too large.");
  const { error } = await supabase.storage
    .from(upload.bucket)
    .uploadToSignedUrl(upload.path, upload.token, file, { contentType: upload.contentType, upsert: false });
  if (error) throw new Error("Your intake was saved, but the private ticket upload did not finish. Please try again.");
}
