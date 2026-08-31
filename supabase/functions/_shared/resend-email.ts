import { prepareClientEmail, type NotificationLocaleContext } from "./notification-locale.ts";

interface ResendEmailPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
  reply_to?: string;
  localization?: NotificationLocaleContext;
}

export async function sendResendEmail(
  apiKey: string,
  payload: ResendEmailPayload,
  idempotencyKey: string,
) {
  if (!apiKey) throw new Error("RESEND_API_KEY is unavailable.");
  if (!idempotencyKey || idempotencyKey.length > 256) {
    throw new Error("The email idempotency key is invalid.");
  }

  const { localization, ...englishPayload } = payload;
  const outgoing = localization ? prepareClientEmail(englishPayload, localization) : englishPayload;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(outgoing),
  });
  const result = await response.json().catch(() => ({})) as {
    id?: string;
    message?: string;
  };
  if (!response.ok || !result.id) {
    throw new Error(result.message || `Resend rejected the email with status ${response.status}.`);
  }
  return result.id;
}
