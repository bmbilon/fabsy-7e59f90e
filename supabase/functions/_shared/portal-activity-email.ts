import { sendWorkspaceEmail } from "./google-workspace-email.ts";
import { internalNotificationDelivery } from "./resend-email.ts";

export interface PortalActivityEvent {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  occurred_at: string;
  payload: Record<string, unknown>;
}

interface EmailAttachment {
  filename: string;
  content: string;
}

const EVENT_LABELS: Record<string, string> = {
  intake_created: "New portal intake",
  review_consent_signed: "Review consent signed",
  representation_consent_signed: "Representation consent signed",
  payment_paid: "Payment confirmed",
  payment_failed: "Payment failed",
  payment_expired: "Checkout expired",
  payment_refunded: "Payment refunded",
  payment_disputed: "Payment disputed",
  idr_intake_completed: "Insurance report intake completed",
  abstract_uploaded: "Driver abstract uploaded",
  outcome_survey_submitted: "Outcome survey submitted",
  client_instruction_recorded: "Client instruction recorded",
  referral_profile_saved: "Referral payout profile saved",
  pro_licence_verified: "Professional licence verified",
  pro_licence_unverified: "Professional licence could not be verified",
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function text(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function eventLabel(eventType: string) {
  return EVENT_LABELS[eventType] || eventType.replaceAll("_", " ");
}

function money(cents: unknown) {
  const amount = Number(cents);
  if (!Number.isSafeInteger(amount) || amount < 0) return null;
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount / 100);
}

export function consentTicketReference(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9 -]+$/.test(value.trim())) {
    throw new Error("consent_ticket_reference_required");
  }
  const ticket = value.trim().toUpperCase().replace(/[ -]/g, "");
  if (!/^[A-Z0-9]{5,30}$/.test(ticket) || !/[0-9]/.test(ticket)) {
    throw new Error("consent_ticket_reference_required");
  }
  return ticket;
}

export function portalActivitySubject(event: PortalActivityEvent) {
  if (event.event_type === "representation_consent_signed") {
    const tickets = Array.isArray(event.payload.ticket_numbers)
      ? event.payload.ticket_numbers.map(consentTicketReference)
      : [consentTicketReference(event.payload.ticket_number)];
    if (!tickets.length) throw new Error("consent_ticket_reference_required");
    return `Ticket ${
      [...new Set(tickets)].join(", ")
    } — Representation consent received`;
  }
  const name = text(event.payload.client_name);
  const ticket = text(event.payload.ticket_number);
  const detail = name || (ticket ? `ticket ${ticket}` : null);
  return `[Fabsy Portal] ${eventLabel(event.event_type)}${
    detail ? ` — ${detail}` : ""
  }`;
}

export function renderPortalActivityHtml(
  event: PortalActivityEvent,
  siteUrl: string,
) {
  const payload = event.payload || {};
  const rows: Array<[string, string | null]> = [
    ["Customer", text(payload.client_name)],
    ["Customer email", text(payload.client_email)],
    ["Ticket", text(payload.ticket_number)],
    ["Date of birth", text(payload.client_date_of_birth)],
    ["Product", text(payload.product)],
    ["Payment subtotal", money(payload.amount_cents)],
    ["Status", text(payload.status)],
    ["Decision", text(payload.decision)],
    ["Source", text(payload.intake_source)],
    [
      "Disclosure lookup",
      text(payload.disclosure_lookup_type)?.replaceAll("_", " ") || null,
    ],
    ["Driver licence / plate", text(payload.disclosure_lookup_value)],
    [
      "Occurred",
      new Date(event.occurred_at).toLocaleString("en-CA", {
        timeZone: "America/Edmonton",
        dateStyle: "medium",
        timeStyle: "long",
      }),
    ],
  ];
  const visibleRows = rows.filter((row): row is [string, string] =>
    Boolean(row[1])
  );
  const submissionId = text(payload.submission_id);
  const adminUrl = submissionId
    ? `${siteUrl.replace(/\/$/, "")}/admin/submissions/${
      encodeURIComponent(submissionId)
    }`
    : `${siteUrl.replace(/\/$/, "")}/admin`;

  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#172033">
    <div style="border-bottom:4px solid #7c3aed;padding-bottom:16px">
      <p style="margin:0;color:#6d28d9;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Fabsy portal activity</p>
      <h1 style="font-size:24px;line-height:1.25;margin:8px 0 0">${
    escapeHtml(eventLabel(event.event_type))
  }</h1>
    </div>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:22px 0">
      ${
    visibleRows.map(([label, value]) =>
      `<tr><td style="padding:8px 12px 8px 0;color:#64748b;vertical-align:top;width:145px">${
        escapeHtml(label)
      }</td><td style="padding:8px 0;font-weight:600">${
        escapeHtml(value)
      }</td></tr>`
    ).join("")
  }
    </table>
    ${
    event.event_type === "representation_consent_signed"
      ? `<p style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:14px">${
        payload.signature_method === "manual_scan"
          ? "The client-provided signed scan and consent audit PDF are attached. Receiving these files does not confirm staff approval of the signature."
          : "The signed consent PDF is attached to this email."
      }</p>`
      : ""
  }
    <p style="margin:26px 0"><a href="${
    escapeHtml(adminUrl)
  }" style="background:#7c3aed;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:700">Open Fabsy admin</a></p>
    <p style="color:#64748b;font-size:12px;line-height:1.5">Event ${
    escapeHtml(event.id)
  } · ${escapeHtml(event.entity_type)} ${escapeHtml(event.entity_id || "")}</p>
  </div>`;
}

export async function sendPortalActivityEmail(
  event: PortalActivityEvent,
  siteUrl: string,
  attachments: EmailAttachment[] = [],
) {
  const delivery = internalNotificationDelivery();
  const result = await sendWorkspaceEmail({
    from: "Fabsy Portal <hello@fabsy.ca>",
    reply_to: "hello@fabsy.ca",
    ...delivery,
    subject: portalActivitySubject(event),
    html: renderPortalActivityHtml(event, siteUrl),
    attachments,
  }, `portal-activity/${event.id}`);
  return result.id;
}
