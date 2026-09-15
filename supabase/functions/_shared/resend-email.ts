import { prepareClientEmail, type NotificationLocaleContext } from "./notification-locale.ts";

export const FABSY_PRIMARY_NOTIFICATION_EMAIL = "hello@fabsy.ca";
export const FABSY_BACKUP_NOTIFICATION_EMAIL = "brett@execom.ca";

/**
 * Internal notices always address Fabsy first. Execom receives a blind backup
 * copy so it remains a redundancy path rather than the system of record.
 */
export const FABSY_INTERNAL_NOTIFICATION_DELIVERY = Object.freeze({
  to: Object.freeze([FABSY_PRIMARY_NOTIFICATION_EMAIL]),
  bcc: Object.freeze([FABSY_BACKUP_NOTIFICATION_EMAIL]),
});

export function internalNotificationDelivery() {
  return {
    to: [...FABSY_INTERNAL_NOTIFICATION_DELIVERY.to],
    bcc: [...FABSY_INTERNAL_NOTIFICATION_DELIVERY.bcc],
  };
}

interface ResendEmailPayload {
  from: string;
  to: string[];
  bcc?: string[];
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
