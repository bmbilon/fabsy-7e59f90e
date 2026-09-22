export type ManualTicketType = "officer_issued" | "photo_radar";
export type ManualPaymentState = "not_started" | "open" | "paid" | "unavailable";

export interface ManualRepresentationRecord {
  submissionId: string;
  clientId: string;
  firstName: string;
  lastName: string;
  email: string;
  ticketNumber: string;
  violation: string;
  violationDate: string | null;
  ticketType: ManualTicketType;
  registeredOwnerOnOffenceDate: "yes" | null;
  consentSigned: boolean;
  consentAccepted: boolean;
  pleadNotGuilty: boolean | null;
  paymentState: ManualPaymentState;
  priceCad: number;
  priceLabel: string;
}

export interface ManualRepresentationCredentials {
  submissionId: string;
  accessToken: string;
}

const CREDENTIAL_KEY = "fabsy-manual-representation-link-v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,200}$/;

function validCredentials(value: unknown): value is ManualRepresentationCredentials {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ManualRepresentationCredentials>;
  return typeof candidate.submissionId === "string" && UUID_PATTERN.test(candidate.submissionId) &&
    typeof candidate.accessToken === "string" && TOKEN_PATTERN.test(candidate.accessToken);
}

export function captureManualRepresentationCredentials(search: string, hash = ""): ManualRepresentationCredentials | null {
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const params = fragment.has("case") || fragment.has("token") ? fragment : new URLSearchParams(search);
  const hasLinkParams = params.has("case") || params.has("token");
  const candidate = { submissionId: params.get("case") || "", accessToken: params.get("token") || "" };
  if (validCredentials(candidate)) {
    const credentials = { submissionId: candidate.submissionId.toLowerCase(), accessToken: candidate.accessToken };
    try { window.sessionStorage.setItem(CREDENTIAL_KEY, JSON.stringify(credentials)); } catch { /* Link still works in memory. */ }
    return credentials;
  }
  if (hasLinkParams) return null;
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(CREDENTIAL_KEY) || "null");
    return validCredentials(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function manualRepresentationUrl(path: "/representation-consent" | "/representation-payment", credentials: ManualRepresentationCredentials) {
  const params = new URLSearchParams({ case: credentials.submissionId, token: credentials.accessToken });
  return `${path}?${params.toString()}`;
}

export async function functionInvokeMessage(error: unknown, fallback: string) {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    const body = await context.clone().json().catch(() => null) as { error?: unknown } | null;
    if (typeof body?.error === "string" && body.error.trim()) return body.error;
  }
  if (error instanceof Error && error.message && !/^Failed to send a request to the Edge Function/i.test(error.message)) {
    return error.message;
  }
  return fallback;
}
