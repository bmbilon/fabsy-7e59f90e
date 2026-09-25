import { formatCents, LTB_ISSUE_LABELS } from "./ltb-intake-core.ts";

/**
 * Staff alert for a new LTB intake, sent to the owning practice's alert
 * recipients. Same claim / freeze / send / finish contract as the ticket
 * upload alerts: a frozen payload is resent byte for byte with the same
 * idempotency key, and never to recipients the practice has since removed.
 */

export type LtbCaseSnapshot = {
  caseId: string;
  caseNumber: string;
  practiceId: string;
  practiceName: string;
  adminBaseUrl: string;
  recipients: string[];
  clientName?: string | null;
  organizationName?: string | null;
  email?: string | null;
  phone?: string | null;
  registrationStatus?: string | null;
  returningClient?: boolean | null;
  issue?: string | null;
  noticeServed?: string | null;
  unitCity?: string | null;
  rentalUnitAddress?: string | null;
  tenantNames?: string[] | null;
  rentAmountCents?: number | null;
  rentPeriod?: string | null;
  arrearsClaimedCents?: number | null;
  arrearsReportedText?: string | null;
  noticeForm?: string | null;
  noticeServedOn?: string | null;
  noticeTerminationDate?: string | null;
  reviewStatus?: string | null;
  reviewNotes?: string | null;
  documentCount?: number | null;
  createdAt?: string | null;
};

export type LtbIntakeAlert = {
  id: string;
  case_id: string;
  claim_id: string;
  case_snapshot: LtbCaseSnapshot;
};

export type LtbAlertEmail = {
  from: string;
  to: string[];
  subject: string;
  html: string;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, character =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

const SERVED: Record<string, string> = { yes: "Yes", no: "Not yet", unsure: "Not sure" };

export function validRecipients(recipients: unknown): string[] {
  if (!Array.isArray(recipients)) return [];
  return recipients.filter((value): value is string =>
    typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)).slice(0, 5);
}

export function renderLtbAlertEmail(alert: LtbIntakeAlert): LtbAlertEmail {
  const s = alert.case_snapshot;
  const issue = LTB_ISSUE_LABELS[s.issue || "other"] || "Something else";
  const who = [s.clientName, s.organizationName].filter(Boolean).join(" · ") || "Name not provided";
  const received = s.createdAt
    ? new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Toronto" })
      .format(new Date(s.createdAt))
    : "";
  const rent = s.rentAmountCents != null ? `${formatCents(s.rentAmountCents)}${s.rentPeriod ? ` ${s.rentPeriod}` : ""}` : "";
  const arrears = s.arrearsClaimedCents != null ? formatCents(s.arrearsClaimedCents)
    : s.arrearsReportedText ? `${s.arrearsReportedText} (as typed by the client)` : "";
  const notice = [s.noticeForm, s.noticeServedOn && `served ${s.noticeServedOn}`,
    s.noticeTerminationDate && `terminates ${s.noticeTerminationDate}`].filter(Boolean).join(" · ");
  const ready = s.reviewStatus === "ready";
  const row = (label: string, value: string | null | undefined) =>
    `<tr><th align="left" style="padding:7px 16px 7px 0;vertical-align:top;font-weight:600;white-space:nowrap">${label}</th><td style="padding:7px 0">${
      escapeHtml(value || "Not provided")}</td></tr>`;
  const link = `${s.adminBaseUrl.replace(/\/$/, "")}/admin/ltb/cases/${encodeURIComponent(s.caseId)}`;
  return {
    from: "Fabsy Case Desk <hello@fabsy.ca>",
    to: validRecipients(s.recipients),
    subject: `New LTB file ${s.caseNumber} · ${issue}${s.unitCity ? ` · ${s.unitCity}` : ""}${ready ? "" : " · needs review"}`,
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#17221c;line-height:1.5"><main style="max-width:640px;margin:24px auto;padding:24px">
<p style="margin:0;color:#4b5b52;font-size:13px">${escapeHtml(s.practiceName)}</p>
<h1 style="font-size:22px;margin:4px 0 16px">New landlord file ${escapeHtml(s.caseNumber)}</h1>
<p style="margin:0 0 16px;padding:10px 12px;background:${ready ? "#dce8de" : "#f6e6a8"}">${ready
      ? "Documents were read and the key details are in. Confirm them against the originals before acting."
      : "Needs review. Something is missing, unclear or conflicting. See the notes below."}</p>
<table role="presentation" style="border-collapse:collapse;width:100%;font-size:14px">
${row("Client", who)}${row("Email", s.email)}${row("Phone", s.phone)}${
      row("Client record", s.returningClient ? "Returning registered client" : "New or unconfirmed")}${
      row("Issue", issue)}${row("Notice served", SERVED[s.noticeServed || ""] || "")}${
      row("Rental unit", [s.rentalUnitAddress, s.unitCity].filter(Boolean).join(", "))}${
      row("Tenants", (s.tenantNames || []).join(", "))}${row("Rent", rent)}${row("Arrears", arrears)}${
      row("Notice", notice)}${row("Documents", String(s.documentCount ?? 0))}${row("Received (Toronto)", received)}
</table>
${s.reviewNotes ? `<h2 style="font-size:15px;margin:20px 0 6px">Review notes</h2><p style="white-space:pre-wrap;margin:0;font-size:14px">${escapeHtml(s.reviewNotes)}</p>` : ""}
<p style="margin-top:24px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#17221c;color:#fff;padding:12px 18px;text-decoration:none">Open the file</a></p>
<p style="color:#6e7d74;font-size:12px">Sent by Fabsy case software on behalf of ${escapeHtml(s.practiceName)}. Sign in to view documents. Details read from uploads are suggestions until confirmed. This email is not a retainer and does not mean any work has started.</p>
</main></body></html>`,
  };
}

export class LtbAlertSendError extends Error {
  constructor(public code: string, public permanent = false) {
    super(code);
  }
}

export async function sendLtbAlertEmail(
  apiKey: string,
  payload: LtbAlertEmail,
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
        "Idempotency-Key": `ltb-intake/${alertId}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new LtbAlertSendError("provider_network_error");
  }
  const result = await response.json().catch(() => ({})) as { id?: string };
  if (!response.ok) {
    const permanent = response.status >= 400 && response.status < 500 && ![408, 409, 425, 429].includes(response.status);
    throw new LtbAlertSendError(`provider_http_${response.status}`, permanent);
  }
  if (typeof result.id !== "string" || !result.id) throw new LtbAlertSendError("provider_response_invalid");
  return result.id;
}

export type LtbAlertDependencies = {
  claim: () => Promise<LtbIntakeAlert[]>;
  freeze: (alert: LtbIntakeAlert, email: LtbAlertEmail) => Promise<LtbAlertEmail>;
  send: (email: LtbAlertEmail, id: string) => Promise<string>;
  finish: (
    alert: LtbIntakeAlert,
    status: "sent" | "retry" | "failed",
    providerId: string | null,
    failureCode: string | null,
  ) => Promise<boolean>;
};

export async function processLtbIntakeAlerts(deps: LtbAlertDependencies) {
  const result = { claimed: 0, sent: 0, retry: 0, failed: 0, recordingFailed: 0 };
  const alerts = await deps.claim();
  result.claimed = alerts.length;
  for (const alert of alerts) {
    let status: "sent" | "retry" | "failed" = "retry";
    let providerId: string | null = null;
    let failureCode: string | null = null;
    try {
      const rendered = renderLtbAlertEmail(alert);
      if (!rendered.to.length) throw new LtbAlertSendError("recipients_missing", true);
      const payload = await deps.freeze(alert, rendered);
      // Never resume a frozen email to a recipient list the snapshot no longer holds.
      const expected = validRecipients(alert.case_snapshot.recipients);
      if (!Array.isArray(payload.to) || payload.to.length !== expected.length ||
          payload.to.some((recipient, index) => recipient !== expected[index])) {
        throw new LtbAlertSendError("recipient_policy_changed", true);
      }
      providerId = await deps.send(payload, alert.id);
      status = "sent";
    } catch (error) {
      if (error instanceof LtbAlertSendError) {
        failureCode = error.code;
        status = error.permanent ? "failed" : "retry";
      } else {
        failureCode = "alert_processing_error";
        status = "retry";
      }
    }
    try {
      const recorded = await deps.finish(alert, status, providerId, failureCode);
      if (!recorded) result.recordingFailed += 1;
      else result[status] += 1;
    } catch {
      result.recordingFailed += 1;
    }
  }
  return result;
}
