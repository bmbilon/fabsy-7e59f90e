export interface ConsentInviteCreateInput {
  firstName: string;
  lastName: string;
  email: string;
  ticketNumber: string;
  chargeDescription: string;
  offenceDateText: string | null;
  courtLocation: string | null;
  courtDateText: string | null;
  matterDetails: string | null;
  expiresInDays: number;
}

export interface ConsentInviteLinkRecord {
  id: string;
  status: string;
  expires_at: string;
  client_legal_name: string;
  client_email: string;
  ticket_number: string;
  ticket_numbers?: string[] | null;
  charge_description: string;
  created_at?: string;
  reissued_from_invite_id?: string | null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function containsControlCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function requiredText(
  value: unknown,
  label: string,
  maximum: number,
): string {
  if (typeof value !== "string" || containsControlCharacter(value)) {
    throw new Error(`${label} is required.`);
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > maximum) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function optionalText(value: unknown, label: string, maximum: number) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || containsControlCharacter(value)) {
    throw new Error(`${label} is invalid.`);
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length > maximum) throw new Error(`${label} is invalid.`);
  return normalized || null;
}

export function parseConsentInviteCreate(
  raw: Record<string, unknown>,
): ConsentInviteCreateInput {
  const firstName = requiredText(raw.firstName, "First name", 100);
  const lastName = requiredText(raw.lastName, "Last name", 100);
  const email = requiredText(raw.email, "Email", 320).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new Error("Email is invalid.");
  const ticketNumber = requiredText(raw.ticketNumber, "Ticket number", 120)
    .toUpperCase();
  const chargeDescription = requiredText(
    raw.chargeDescription,
    "Charge description",
    500,
  );
  const expiresInDays = raw.expiresInDays === undefined
    ? 7
    : Number(raw.expiresInDays);
  if (
    !Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 30
  ) {
    throw new Error("Expiry must be between 1 and 30 days.");
  }
  return {
    firstName,
    lastName,
    email,
    ticketNumber,
    chargeDescription,
    offenceDateText: optionalText(raw.offenceDateText, "Offence date", 100),
    courtLocation: optionalText(raw.courtLocation, "Court location", 200),
    courtDateText: optionalText(raw.courtDateText, "Court date", 100),
    matterDetails: optionalText(raw.matterDetails, "Matter details", 2_000),
    expiresInDays,
  };
}

export function parseConsentInviteReissue(raw: Record<string, unknown>) {
  const inviteId = typeof raw.inviteId === "string" ? raw.inviteId.trim() : "";
  if (!UUID_PATTERN.test(inviteId)) throw new Error("Invitation is invalid.");
  const expiresInDays = raw.expiresInDays === undefined
    ? 7
    : Number(raw.expiresInDays);
  if (
    !Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 30
  ) {
    throw new Error("Expiry must be between 1 and 30 days.");
  }
  return { inviteId, expiresInDays };
}

export function parseConsentInviteList(raw: Record<string, unknown>) {
  const limit = raw.limit === undefined ? 50 : Number(raw.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("List limit must be between 1 and 100.");
  }
  return { limit };
}

export function buildConsentInviteDelivery(
  siteUrl: string,
  token: string,
  invite: ConsentInviteLinkRecord,
) {
  const consentUrl = new URL("/representation-consent", siteUrl);
  consentUrl.hash = new URLSearchParams({ token }).toString();
  const expiry = new Date(invite.expires_at).toLocaleString("en-CA", {
    timeZone: "America/Edmonton",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const firstName = invite.client_legal_name.trim().split(/\s+/)[0] || "there";
  const emailSubject = `Fabsy consent request — ticket ${invite.ticket_number}`;
  const emailBody =
    `Hi ${firstName},\n\nPlease review and sign your Fabsy traffic ticket representation consent for ticket ${invite.ticket_number}:\n\n${consentUrl.toString()}\n\nThis private link expires ${expiry}. Do not forward it.\n\nThank you,\nFabsy Traffic Ticket Services`;
  const textMessage =
    `Fabsy: please review and sign your private consent for ticket ${invite.ticket_number}: ${consentUrl.toString()} (expires ${expiry}). Do not forward this link.`;
  return {
    inviteId: invite.id,
    status: invite.status,
    expiresAt: invite.expires_at,
    consentUrl: consentUrl.toString(),
    emailSubject,
    emailBody,
    textMessage,
  };
}

export function publicConsentInviteMetadata(invite: ConsentInviteLinkRecord) {
  return {
    inviteId: invite.id,
    status: invite.status,
    clientName: invite.client_legal_name,
    clientEmail: invite.client_email,
    ticketNumber: invite.ticket_number,
    ticketNumbers: Array.isArray(invite.ticket_numbers)
      ? invite.ticket_numbers
      : [invite.ticket_number],
    chargeDescription: invite.charge_description,
    expiresAt: invite.expires_at,
    createdAt: invite.created_at || null,
    reissuedFromInviteId: invite.reissued_from_invite_id || null,
  };
}
