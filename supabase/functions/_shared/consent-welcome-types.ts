export type ConsentWelcomeJob = { id: string; claim_id: string; source_type: "submission" | "invite"; submission_id: string | null; invite_id: string | null };
export type ConsentCheckout = {
  id: string; client_id: string | null; ticket_submission_id: string | null;
  checkout_kind: string; status: string; stripe_checkout_session_id: string | null;
};
export type ConsentWelcomeContext = {
  eligible: boolean; reason?: string; retryable?: boolean; source_fingerprint?: string;
  id?: string; source_type?: "submission" | "invite"; submission_id?: string | null; invite_id?: string | null;
  recipient?: string; first_name?: string | null; last_name?: string | null; preferred_locale?: unknown;
  ticket_number?: string; ticket_numbers?: string[] | null; ticket_document_path?: string | null; ticket_document_bucket?: string; ticket_upload_required?: boolean;
  ticket_document_owner_id?: string | null; source_assessment_id?: string | null;
  consent_form_path?: string; consent_bucket?: string; consent_sha256?: string | null;
  signature_method?: string; completed_at?: string; manual_scan_pdf_path?: string | null;
  manual_scan_pdf_sha256?: string | null; manual_scan_bucket?: string;
  client_id?: string | null; submission_status?: string; representation_paid_at?: string | null; payment_recorded?: boolean; payment_unknown?: boolean;
  checkout_sessions?: ConsentCheckout[]; representation_checkout_session_id?: string | null; representation_payment_intent_id?: string | null;
  payment_link?: { code: string; expires_at: string; checkout_intent_id: string; stripe_checkout_session_id: string } | null;
};
export type ConsentWelcomePayment = { state: "paid" | "unpaid" | "unknown"; paymentUrl: string | null };
export type ConsentWelcomeAttachment = { filename: string; content: string; content_type: "application/pdf" };
export type ConsentDocumentFingerprint = { path: string; sha256: string };
export type ConsentWelcomeDocuments = { attachments: ConsentWelcomeAttachment[]; fingerprints: ConsentDocumentFingerprint[] };
export type ConsentWelcomeEmail = {
  from: string; to: string[]; reply_to: string; subject: string; html: string; text: string;
  headers: Record<string, string>; attachments: ConsentWelcomeAttachment[];
};
export class ConsentWelcomeError extends Error {
  constructor(public code: string, public permanent = false) { super(code); }
}
export const WELCOME_VERSION = "consent-welcome-v1";
export const SHA256 = /^[a-f0-9]{64}$/;
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function welcomeTicketNumbers(context: ConsentWelcomeContext): string[] {
  const values = Array.isArray(context.ticket_numbers) && context.ticket_numbers.length ? context.ticket_numbers : [context.ticket_number];
  if (!values.length || values.length > 20) throw new ConsentWelcomeError("welcome_ticket_number_unavailable");
  return values.map(value => {
    if (typeof value !== "string" || !/^[A-Za-z0-9 -]+$/.test(value.trim())
      || /^(unknown|pending|unavailable|tbd|na)(?:\b|[0-9_-])/i.test(value.trim())) throw new ConsentWelcomeError("welcome_ticket_number_unavailable");
    const normalized = value.trim().toUpperCase().replace(/[ -]/g, "");
    if (!/^[A-Z0-9]{5,30}$/.test(normalized) || !/[0-9]/.test(normalized)) throw new ConsentWelcomeError("welcome_ticket_number_unavailable");
    return value.trim();
  });
}
export async function consentWelcomeHash(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
