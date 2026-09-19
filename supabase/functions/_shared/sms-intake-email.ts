import {
  FABSY_INTERNAL_NOTIFICATION_DELIVERY,
  internalNotificationDelivery,
} from "./resend-email.ts";

export type SmsIntakeEmail = {
  id: string;
  inquiry_id: string;
  claim_id: string;
  snapshot: {
    fromNumber: string;
    toNumber: string;
    body: string;
    numMedia: number;
    receivedAt: string;
    inquiryId: string;
  };
};

export type SmsIntakeEmailPayload = {
  from: string;
  to: string[];
  bcc: string[];
  subject: string;
  html: string;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );

export function renderSmsIntakeEmail(
  alert: SmsIntakeEmail,
): SmsIntakeEmailPayload {
  const note = alert.snapshot;
  return {
    from: "Fabsy SMS <hello@fabsy.ca>",
    ...internalNotificationDelivery(),
    subject: `New SMS inquiry — ${alert.inquiry_id.slice(0, 8)}`,
    html:
      `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.5">
<h1>New SMS inquiry</h1>
<p>From: ${escapeHtml(note.fromNumber)}<br>To: ${
        escapeHtml(note.toNumber)
      }<br>Received: ${escapeHtml(note.receivedAt)}</p>
<blockquote style="white-space:pre-wrap">${
        escapeHtml(note.body || "No text supplied")
      }</blockquote>
${
        note.numMedia
          ? "<p>The sender included an attachment. Attachments are not downloaded or accepted for intake through SMS.</p>"
          : ""
      }
<p><a href="https://fabsy.ca/admin/sms">Open SMS inquiries</a> to see the current conversation and delivery status.</p>
<p>This is one notification for this inquiry. Follow-up messages remain in the staff inbox. An inquiry does not prove payment, advertising attribution or authorization to act.</p>
</body></html>`,
  };
}

export class SmsIntakeEmailSendError extends Error {
  constructor(public code: string, public permanent = false) {
    super(code);
  }
}

export async function sendSmsIntakeEmail(
  apiKey: string,
  payload: SmsIntakeEmailPayload,
  alertId: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  let response: Response;
  try {
    response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `sms-inquiry-${alertId}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    // Retry the same persisted bytes and provider key, never a fresh request.
    throw new SmsIntakeEmailSendError("provider_network_error");
  }
  const result = await response.json().catch(() => ({})) as { id?: string };
  if (!response.ok) {
    const permanent = response.status >= 400 && response.status < 500 &&
      ![408, 409, 425, 429].includes(response.status);
    throw new SmsIntakeEmailSendError(
      `provider_http_${response.status}`,
      permanent,
    );
  }
  if (typeof result.id !== "string" || !result.id) {
    throw new SmsIntakeEmailSendError("provider_response_invalid");
  }
  return result.id;
}

export type SmsIntakeEmailDependencies = {
  claim: () => Promise<SmsIntakeEmail[]>;
  freeze: (
    alert: SmsIntakeEmail,
    email: SmsIntakeEmailPayload,
  ) => Promise<SmsIntakeEmailPayload>;
  send: (email: SmsIntakeEmailPayload, id: string) => Promise<string>;
  finish: (
    alert: SmsIntakeEmail,
    status: "sent" | "retry" | "failed",
    providerId: string | null,
    failureCode: string | null,
  ) => Promise<boolean>;
};

export async function processSmsIntakeEmails(deps: SmsIntakeEmailDependencies) {
  const result = {
    claimed: 0,
    sent: 0,
    retry: 0,
    failed: 0,
    recordingFailed: 0,
  };
  const alerts = await deps.claim();
  result.claimed = alerts.length;
  for (const alert of alerts) {
    let status: "sent" | "retry" | "failed" = "retry";
    let providerId: string | null = null;
    let failureCode: string | null = null;
    try {
      const payload = await deps.freeze(
        alert,
        renderSmsIntakeEmail(alert),
      );
      // Do not resume a frozen email to an old/revoked recipient after policy changes.
      if (
        !Array.isArray(payload.to) ||
        payload.to.length !== FABSY_INTERNAL_NOTIFICATION_DELIVERY.to.length ||
        payload.to.some((recipient, index) =>
          recipient !== FABSY_INTERNAL_NOTIFICATION_DELIVERY.to[index]
        ) ||
        !Array.isArray(payload.bcc) ||
        payload.bcc.length !==
          FABSY_INTERNAL_NOTIFICATION_DELIVERY.bcc.length ||
        payload.bcc.some((recipient, index) =>
          recipient !== FABSY_INTERNAL_NOTIFICATION_DELIVERY.bcc[index]
        )
      ) {
        throw new SmsIntakeEmailSendError("frozen_recipient_changed", true);
      }
      providerId = await deps.send(payload, alert.id);
      status = "sent";
    } catch (error) {
      status = error instanceof SmsIntakeEmailSendError && error.permanent
        ? "failed"
        : "retry";
      failureCode = error instanceof SmsIntakeEmailSendError
        ? error.code
        : "sms_email_attempt_error";
    }
    try {
      if (await deps.finish(alert, status, providerId, failureCode)) {
        result[status]++;
      } else result.recordingFailed++;
    } catch {
      // The leased row remains recoverable with the same frozen email and key.
      result.recordingFailed++;
    }
  }
  return result;
}
