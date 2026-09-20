/** A phone approval grants one prepared portal session permission, never a blanket waiver. */
export const DISCLOSURE_APPROVAL_SCOPE = "Accept the Alberta Traffic Tickets Digital Service Terms of Use for this prepared case, then enter the client's not-guilty plea and request disclosure using the signed consent. Use hello@fabsy.ca for Brett Bilon / Fabsy Traffic Ticket Services and leave the defendant email blank.";
export const DISCLOSURE_APPROVAL_TTL_MS = 30 * 60 * 1000;
export const DISCLOSURE_ADMIN_PHONE = "+14036695353"; // Existing verified Brett recipient in send-notification.
export const APPROVAL_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export async function approvalHash(value: string | ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", typeof value === "string" ? new TextEncoder().encode(value) : value);
  return Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
}

export function newApprovalToken(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function normalizeApprovalTicket(value: unknown): string {
  return typeof value === "string" ? value.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
}

export function validateTermsUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("Terms URL is required.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "traffictickets.alberta.ca" || url.username || url.password || url.port) {
    throw new Error("Terms must come from the Alberta traffic portal.");
  }
  return url.href;
}

export function approvalPublicSummary(row: Record<string, unknown>, now = Date.now()) {
  const expired = new Date(String(row.expires_at)).getTime() <= now;
  return {
    status: expired && ["creating", "pending", "approved"].includes(String(row.status)) ? "expired" : row.status,
    case_label: row.case_label,
    ticket_suffix: String(row.ticket_number).slice(-4),
    scope: row.scope,
    terms_url: row.terms_url,
    terms_version: row.terms_version,
    terms_text: row.terms_text,
    terms_sha256: row.terms_sha256,
    expires_at: row.expires_at,
    decided_at: row.decided_at,
  };
}
