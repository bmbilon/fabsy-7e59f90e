import {
  localizedPublicPath,
  parsePreferredLocale,
  type PreferredLocale,
} from "./locale-policy.ts";
import {
  DRAFT_ACCESS_TOKEN_PATTERN,
  UUID_PATTERN,
} from "./ticket-intake-draft.ts";

export const MAX_RESUME_DELIVERY_ATTEMPTS = 5;

export type ResumeDeliveryChannel = "email" | "sms";
export type ResumeDeliveryStatus = "pending" | "sending" | "sent" | "failed";
export type ResumeDeliveryFailureCode =
  | "configuration_missing"
  | "request_rejected"
  | "rate_limited"
  | "outcome_unknown";

export interface ResumeDeliveryRowState {
  ticket_uploaded_at: string | null;
  resume_delivery_status: ResumeDeliveryStatus;
  resume_delivery_channel: ResumeDeliveryChannel | null;
  resume_delivery_sent_at: string | null;
  resume_delivery_attempt_count: number;
}

export interface PublicResumeDeliveryState {
  status: ResumeDeliveryStatus;
  channel: ResumeDeliveryChannel | null;
  sentAt: string | null;
  canRetry: boolean;
  mode: "manual" | "automatic";
}

export interface ResumeDeliveryAttemptResult {
  outcome: "sent" | "failed" | "indeterminate";
  failureCode: ResumeDeliveryFailureCode | null;
}

export interface ResumeDeliveryConfiguration {
  siteUrl?: string;
  resendApiKey?: string;
  resendFrom?: string;
  resendReplyTo?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioPhoneNumber?: string;
}

export interface ResumeDeliveryAttempt {
  draftId: string;
  generation: number;
  accessToken: string;
  channel: ResumeDeliveryChannel;
  recipient: string;
  preferredLocale: PreferredLocale;
  configuration: ResumeDeliveryConfiguration;
  fetcher?: typeof fetch;
}

export function resumeDeliveryEnabled(value: string | undefined): boolean {
  return value === "true";
}

export async function safeResumeDeliveryAttempt(
  attempt: () => Promise<ResumeDeliveryAttemptResult>,
): Promise<ResumeDeliveryAttemptResult> {
  try {
    return await attempt();
  } catch {
    return { outcome: "indeterminate", failureCode: "outcome_unknown" };
  }
}

export async function preserveConfirmedDraftOnDeliveryFailure<T>(
  confirmed: T,
  attempt: () => Promise<T>,
): Promise<T> {
  try {
    return await attempt();
  } catch {
    return confirmed;
  }
}

function siteOrigin(configured: string | undefined): string {
  let parsed: URL;
  try {
    parsed = new URL(configured || "https://fabsy.ca");
  } catch {
    throw new Error("SITE_URL is invalid.");
  }
  const local = parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
    throw new Error("SITE_URL must use HTTPS.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("SITE_URL must not contain credentials.");
  }
  return parsed.origin;
}

export function ticketIntakeResumeUrl(
  configuredSiteUrl: string | undefined,
  preferredLocale: unknown,
  accessToken: string,
): string {
  if (!DRAFT_ACCESS_TOKEN_PATTERN.test(accessToken)) {
    throw new Error("The draft access capability is invalid.");
  }
  const locale = parsePreferredLocale(preferredLocale);
  const url = new URL(
    localizedPublicPath(locale, "/submit-ticket"),
    `${siteOrigin(configuredSiteUrl)}/`,
  );
  url.hash = new URLSearchParams({ resume: accessToken }).toString();
  return url.toString();
}

export function publicResumeDeliveryState(
  row: ResumeDeliveryRowState,
  automaticEnabled = false,
): PublicResumeDeliveryState {
  const attempts = Number(row.resume_delivery_attempt_count);
  return {
    status: row.resume_delivery_status,
    channel: row.resume_delivery_channel,
    sentAt: row.resume_delivery_sent_at,
    canRetry: automaticEnabled && (
      (row.resume_delivery_status === "pending" &&
        Boolean(row.ticket_uploaded_at)) ||
      (row.resume_delivery_status === "failed" &&
        Number.isInteger(attempts) && attempts < MAX_RESUME_DELIVERY_ATTEMPTS)
    ),
    mode: automaticEnabled ? "automatic" : "manual",
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character] || character);
}

export function renderTicketIntakeResumeEmail(resumeUrl: string): string {
  const safeUrl = escapeHtml(resumeUrl);
  return `<!doctype html>
<html lang="en" dir="ltr">
  <body style="margin:0;background:#f8fafc;color:#0f172a;font-family:Arial,sans-serif">
    <div style="max-width:600px;margin:0 auto;padding:32px 20px">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
        <h1 style="font-size:24px;margin:0 0 16px">Your ticket upload is saved</h1>
        <p style="font-size:16px;line-height:1.6;margin:0 0 20px">Continue your private Fabsy ticket intake using the secure link below.</p>
        <p style="margin:0 0 20px"><a href="${safeUrl}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px">Continue your ticket intake</a></p>
        <p style="font-size:14px;line-height:1.6;color:#475569;margin:0">This private link expires with your saved intake. Do not forward it. Uploading a ticket or receiving this link does not authorize Fabsy to act for you.</p>
      </div>
    </div>
  </body>
</html>`;
}

export function renderTicketIntakeResumeSms(resumeUrl: string): string {
  return `Fabsy: Your Alberta ticket upload is saved. Continue your private intake: ${resumeUrl} Do not forward this link. This is not authorization for Fabsy to act.`;
}

export function twilioRecipient(phone: string): string {
  if (/^\d{10}$/.test(phone)) return `+1${phone}`;
  if (/^1\d{10}$/.test(phone)) return `+${phone}`;
  return phone;
}

function configurationFailure(): ResumeDeliveryAttemptResult {
  return { outcome: "failed", failureCode: "configuration_missing" };
}

function responseFailure(status: number): ResumeDeliveryAttemptResult {
  if (status === 429) {
    return { outcome: "failed", failureCode: "rate_limited" };
  }
  if (status >= 400 && status < 500 && status !== 409) {
    return { outcome: "failed", failureCode: "request_rejected" };
  }
  return { outcome: "indeterminate", failureCode: "outcome_unknown" };
}

async function sendResumeEmail(
  attempt: ResumeDeliveryAttempt,
  resumeUrl: string,
): Promise<ResumeDeliveryAttemptResult> {
  const {
    resendApiKey,
    resendFrom = "Fabsy <hello@fabsy.ca>",
    resendReplyTo = "hello@fabsy.ca",
  } = attempt.configuration;
  if (!resendApiKey) return configurationFailure();
  const fetcher = attempt.fetcher || fetch;
  let response: Response;
  try {
    response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key":
          `ticket-intake-resume/${attempt.draftId}/${attempt.generation}`,
      },
      body: JSON.stringify({
        from: resendFrom,
        reply_to: resendReplyTo,
        to: [attempt.recipient],
        subject: "Your secure Fabsy ticket intake link",
        html: renderTicketIntakeResumeEmail(resumeUrl),
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { outcome: "indeterminate", failureCode: "outcome_unknown" };
  }
  if (!response.ok) return responseFailure(response.status);
  const result = await response.json().catch(() => null) as
    | { id?: unknown }
    | null;
  return typeof result?.id === "string" && result.id.length > 0
    ? { outcome: "sent", failureCode: null }
    : { outcome: "indeterminate", failureCode: "outcome_unknown" };
}

async function sendResumeSms(
  attempt: ResumeDeliveryAttempt,
  resumeUrl: string,
): Promise<ResumeDeliveryAttemptResult> {
  const { twilioAccountSid, twilioAuthToken, twilioPhoneNumber } =
    attempt.configuration;
  if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
    return configurationFailure();
  }
  const fetcher = attempt.fetcher || fetch;
  let response: Response;
  try {
    response = await fetcher(
      `https://api.twilio.com/2010-04-01/Accounts/${
        encodeURIComponent(twilioAccountSid)
      }/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${
            btoa(`${twilioAccountSid}:${twilioAuthToken}`)
          }`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: twilioRecipient(attempt.recipient),
          From: twilioPhoneNumber,
          Body: renderTicketIntakeResumeSms(resumeUrl),
        }).toString(),
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    // Twilio's Messages create endpoint has no retry idempotency guarantee. A
    // transport failure can mean the message was accepted, so it must remain
    // indeterminate instead of becoming eligible for another send.
    return { outcome: "indeterminate", failureCode: "outcome_unknown" };
  }
  if (!response.ok) return responseFailure(response.status);
  const result = await response.json().catch(() => null) as
    | { sid?: unknown }
    | null;
  return typeof result?.sid === "string" && /^SM[0-9a-f]{32}$/i.test(result.sid)
    ? { outcome: "sent", failureCode: null }
    : { outcome: "indeterminate", failureCode: "outcome_unknown" };
}

export async function deliverTicketIntakeResume(
  attempt: ResumeDeliveryAttempt,
): Promise<ResumeDeliveryAttemptResult> {
  if (!UUID_PATTERN.test(attempt.draftId)) {
    throw new Error("The draft identifier is invalid.");
  }
  if (!Number.isSafeInteger(attempt.generation) || attempt.generation < 1) {
    throw new Error("The resume delivery generation is invalid.");
  }
  if (!attempt.recipient || attempt.recipient.length > 255) {
    throw new Error("The resume delivery recipient is invalid.");
  }
  const preferredLocale = parsePreferredLocale(attempt.preferredLocale);
  const resumeUrl = ticketIntakeResumeUrl(
    attempt.configuration.siteUrl,
    preferredLocale,
    attempt.accessToken,
  );
  return attempt.channel === "email"
    ? await sendResumeEmail(attempt, resumeUrl)
    : await sendResumeSms(attempt, resumeUrl);
}
