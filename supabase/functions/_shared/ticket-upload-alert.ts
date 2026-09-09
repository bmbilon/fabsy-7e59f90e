export type UploadAlert = {
  id: string;
  draft_id: string;
  uploaded_at: string;
  claim_id: string;
  contact_snapshot: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    preferredLocale?: string | null;
  };
};

export type UploadAlertEmail = {
  from: string;
  to: string[];
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

export function renderUploadAlertEmail(
  alert: UploadAlert,
  recipient: string,
): UploadAlertEmail {
  const contact = alert.contact_snapshot;
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ")
    .trim();
  const uploaded = new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Edmonton",
  }).format(new Date(alert.uploaded_at));
  const detail = (label: string, value: string | null | undefined) =>
    `<tr><th align="left" style="padding:8px 16px 8px 0;vertical-align:top">${label}</th><td style="padding:8px 0">${
      escapeHtml(value || "Not provided yet")
    }</td></tr>`;
  return {
    from: "Fabsy <hello@fabsy.ca>",
    to: [recipient],
    subject: `Ticket uploaded — intake ${alert.draft_id.slice(0, 8)}`,
    html:
      `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.5"><main style="max-width:620px;margin:24px auto;padding:24px">
<h1 style="font-size:24px">A ticket has been uploaded</h1>
<p>A customer has uploaded a ticket and provided contact details. You can follow up even if they have not finished the intake or payment.</p>
<table role="presentation" style="border-collapse:collapse;width:100%">
${detail("Name", name)}${detail("Email", contact.email)}${
        detail("Phone", contact.phone)
      }${detail("Language", contact.preferredLocale)}${
        detail("Uploaded (Edmonton)", uploaded)
      }${detail("Intake reference", alert.draft_id)}
</table>
<p style="margin-top:24px"><a href="https://fabsy.ca/admin/cases" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px">Open the staff intake queue</a></p>
<p>Look under <strong>Incomplete ticket intakes</strong>. If the customer has since completed their submission, find them in the submitted cases below. The queue shows current status; these contact details were saved when the upload was confirmed.</p>
<p style="color:#64748b;font-size:12px">Fabsy internal upload notification. Sign in to view the private ticket. This email does not indicate payment or authorization to act on the ticket.</p>
</main></body></html>`,
  };
}

export class UploadAlertSendError extends Error {
  constructor(public code: string, public permanent = false) {
    super(code);
  }
}

export async function sendUploadAlertEmail(
  apiKey: string,
  payload: UploadAlertEmail,
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
        "Idempotency-Key": `ticket-upload/${alertId}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    // Retry the same persisted bytes and provider key, never a fresh request.
    throw new UploadAlertSendError("provider_network_error");
  }
  const result = await response.json().catch(() => ({})) as { id?: string };
  if (!response.ok) {
    const permanent = response.status >= 400 && response.status < 500 &&
      ![408, 409, 425, 429].includes(response.status);
    throw new UploadAlertSendError(
      `provider_http_${response.status}`,
      permanent,
    );
  }
  if (typeof result.id !== "string" || !result.id) {
    throw new UploadAlertSendError("provider_response_invalid");
  }
  return result.id;
}

export type UploadAlertDependencies = {
  recipient: string;
  verifyRecipient: () => Promise<boolean>;
  claim: () => Promise<UploadAlert[]>;
  freeze: (
    alert: UploadAlert,
    email: UploadAlertEmail,
  ) => Promise<UploadAlertEmail>;
  send: (email: UploadAlertEmail, id: string) => Promise<string>;
  finish: (
    alert: UploadAlert,
    status: "sent" | "retry" | "failed",
    providerId: string | null,
    failureCode: string | null,
  ) => Promise<boolean>;
};

export async function processTicketUploadAlerts(deps: UploadAlertDependencies) {
  if (!deps.recipient || !await deps.verifyRecipient()) {
    throw new Error("upload_alert_recipient_not_verified_admin");
  }
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
        renderUploadAlertEmail(alert, deps.recipient),
      );
      // Do not resume a frozen email to an old/revoked recipient after config changes.
      if (payload.to.length !== 1 || payload.to[0] !== deps.recipient) {
        throw new UploadAlertSendError("frozen_recipient_changed", true);
      }
      providerId = await deps.send(payload, alert.id);
      status = "sent";
    } catch (error) {
      status = error instanceof UploadAlertSendError && error.permanent
        ? "failed"
        : "retry";
      failureCode = error instanceof UploadAlertSendError
        ? error.code
        : "upload_alert_attempt_error";
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
