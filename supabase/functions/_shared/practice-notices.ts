/**
 * Client update emails and staff alerts from the practice_notices outbox
 * (ARCHITECTURE.md 3.5 and 4.3). Same claim / freeze / send / finish contract
 * as ltb-intake-alert.ts: a frozen payload is resent byte for byte with the
 * same idempotency key, and never to recipients the notice no longer holds.
 *
 * Client emails carry only the practice brand. Every dynamic value is
 * escaped, and each client email links into the portal with a token signed
 * for 30 days from the notice's created_at, so a re-render is identical.
 */
import { cleanText } from "./ltb-intake-core.ts";
import {
  CLIENT_NOTICE_KINDS,
  type ClientNoticeKind,
  formatLongDate,
  isArea,
  matterTitle,
  outcomeDef,
  PORTAL_LINK_DAYS,
  type PracticeArea,
  STAFF_NOTICE_KINDS,
  stageDef,
  type StaffNoticeKind,
} from "./practice-catalog.ts";
import { isEmail, isUuid } from "./practice-intake-core.ts";
import { keyDateList } from "./practice-portal-core.ts";
import { issuePortalToken, PORTAL_SECRET_MIN_LENGTH, PortalTokenError } from "./practice-portal-token.ts";

export type PracticeNoticeSnapshot = {
  practice?: {
    id?: string;
    name?: string;
    displayName?: string | null;
    licenseeName?: string | null;
    phone?: string | null;
    publicEmail?: string | null;
    siteUrl?: string | null;
    clientEmailFrom?: string | null;
    clientReplyTo?: string | null;
    noticeFrom?: string | null;
  };
  client?: {
    id?: string;
    firstName?: string | null;
    lastName?: string | null;
    organizationName?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  file?: {
    area?: string;
    id?: string;
    number?: string;
    stage?: string;
    outcome?: string | null;
    issue?: string | null;
    ticketType?: string | null;
    category?: string | null;
    city?: string | null;
    createdAt?: string | null;
    reviewStatus?: string | null;
    documentCount?: number | null;
    clientNotes?: string | null;
    reviewNotes?: string | null;
    keyDates?: Record<string, string | null> | null;
    request?: { message?: string | null; at?: string | null } | null;
  } | null;
};

/** A claimed practice_notices row (the columns the worker uses). */
export type PracticeNotice = {
  id: string;
  claim_id: string;
  kind: string;
  audience?: string | null;
  practice_id?: string | null;
  area?: string | null;
  case_id?: string | null;
  client_id?: string | null;
  detail?: Record<string, unknown> | null;
  snapshot: PracticeNoticeSnapshot;
  recipients?: string[] | null;
  created_at: string;
};

export type PracticeNoticeEmail = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  reply_to?: string;
};

export class PracticeNoticeError extends Error {
  constructor(public code: string, public permanent = false) {
    super(code);
  }
}

export const STAFF_DEFAULT_FROM = "Fabsy Case Desk <hello@fabsy.ca>";
export const RETAINER_LINE = "Representation begins only after a written retainer.";

export const CLIENT_HEADLINES: Record<Exclude<ClientNoticeKind, "stage_changed">, string> = {
  intake_received: "We have your file",
  documents_requested: "We need a document from you",
  document_shared: "A new document is in your file",
  upload_invite: "Upload your documents",
  portal_link: "Your secure link",
};

const CTA_LABELS: Record<ClientNoticeKind, string> = {
  intake_received: "Open your file",
  stage_changed: "Open your file",
  documents_requested: "Upload documents",
  document_shared: "View the document",
  upload_invite: "Upload documents",
  portal_link: "Open your files",
};

const COLOR = {
  page: "#f7f1e8",
  card: "#ffffff",
  plum: "#1d1032",
  plum600: "#673b86",
  gold: "#b28d54",
  gold600: "#9a7641",
  ivory: "#fffdf9",
  ink: "#261d2c",
  ink2: "#54465d",
  line: "#ded3c8",
};
const SERIF = "Georgia,'Times New Roman',Times,serif";
const SANS = "Arial,Helvetica,sans-serif";

export function isClientNoticeKind(kind: unknown): kind is ClientNoticeKind {
  return (CLIENT_NOTICE_KINDS as readonly unknown[]).includes(kind);
}

export function isStaffNoticeKind(kind: unknown): kind is StaffNoticeKind {
  return (STAFF_NOTICE_KINDS as readonly unknown[]).includes(kind);
}

export const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, character =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

/** Escaped text with line breaks kept. */
const multiline = (value: string) => escapeHtml(value).replace(/\r?\n/g, "<br>");

const str = (value: unknown) => typeof value === "string" ? value.trim() : "";

/** A single-line header value (no CR/LF), or "". */
function headerValue(value: unknown, max = 200): string {
  const text = str(value);
  return text && text.length <= max && !/[\r\n]/.test(text) ? text : "";
}

const SENDER = /^(?:[^<>@\r\n]*<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/;
function sender(value: unknown): string {
  const text = headerValue(value);
  return SENDER.test(text) ? text : "";
}

/** https origin without a trailing slash, or "". */
function siteOrigin(value: unknown): string {
  const text = str(value).replace(/\/+$/, "");
  return /^https:\/\/[a-z0-9.-]+(?::\d{2,5})?$/i.test(text) ? text.toLowerCase() : "";
}

export function validRecipients(recipients: unknown): string[] {
  if (!Array.isArray(recipients)) return [];
  return recipients.filter((value): value is string => typeof value === "string" && isEmail(value))
    .map(value => value.toLowerCase()).slice(0, 5);
}

/**
 * Who a notice may be sent to: the client alone for client notices (and only
 * when the stored recipients agree), the stored practice list for staff ones.
 */
export function expectedRecipients(notice: PracticeNotice): string[] {
  if (isClientNoticeKind(notice.kind)) {
    const email = str(notice.snapshot?.client?.email).toLowerCase();
    if (!isEmail(email)) return [];
    if (Array.isArray(notice.recipients)) {
      const stored = validRecipients(notice.recipients);
      if (stored.length !== 1 || stored[0] !== email) return [];
    }
    return [email];
  }
  return validRecipients(notice.recipients);
}

function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `tel:+1${digits}` : digits.length ? `tel:+${digits}` : "";
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

// ---------------------------------------------------------------------------
// Client emails
// ---------------------------------------------------------------------------

type PracticeBrand = {
  displayName: string;
  legalName: string;
  licenseeName: string;
  phone: string;
  publicEmail: string;
  siteUrl: string;
};

type ClientContent = {
  subject: string;
  preheader: string;
  eyebrow: string;
  headline: string;
  greeting: string;
  paragraphs: string[];
  quote: { label: string; text: string } | null;
  keyDates: { label: string; date: string }[];
  keyDateNote: string;
  /** Paragraphs after the quote and key dates, just above the button. */
  closing: string[];
  cta: { label: string; url: string };
  linkNote: string;
  brand: PracticeBrand;
};

function brandOf(snapshot: PracticeNoticeSnapshot, siteUrl: string): PracticeBrand {
  const practice = snapshot.practice || {};
  const displayName = cleanText(practice.displayName, 120) || cleanText(practice.name, 120) || "AnderHue Paralegal";
  return {
    displayName,
    legalName: cleanText(practice.name, 200) || displayName,
    licenseeName: cleanText(practice.licenseeName, 120),
    phone: cleanText(practice.phone, 40),
    publicEmail: isEmail(str(practice.publicEmail)) ? str(practice.publicEmail) : "",
    siteUrl,
  };
}

/** The portal link for a client notice, signed for 30 days from created_at. */
export async function clientNoticeLink(notice: PracticeNotice, signingSecret: string, siteUrl: string): Promise<string> {
  if (typeof signingSecret !== "string" || signingSecret.length < PORTAL_SECRET_MIN_LENGTH) {
    throw new PracticeNoticeError("signing_secret_missing", true);
  }
  const createdMs = Date.parse(str(notice.created_at));
  const clientId = str(notice.snapshot?.client?.id || notice.client_id).toLowerCase();
  const file = notice.snapshot?.file;
  if (!Number.isFinite(createdMs) || !isUuid(clientId) ||
      (notice.kind !== "portal_link" && (!file || !isArea(file.area) || !isUuid(file.id)))) {
    throw new PracticeNoticeError("snapshot_invalid", true);
  }
  let token: string;
  try {
    token = await issuePortalToken(signingSecret, clientId, {
      issuedAt: Math.floor(createdMs / 1000), days: PORTAL_LINK_DAYS,
    });
  } catch (error) {
    const code = error instanceof PortalTokenError && error.code === "signing_secret_missing"
      ? "signing_secret_missing" : "snapshot_invalid";
    throw new PracticeNoticeError(code, true);
  }
  if (notice.kind === "portal_link") return `${siteUrl}/files#t=${token}`;
  return `${siteUrl}/files/${file!.area}/${str(file!.id).toLowerCase()}#t=${token}`;
}

function buildClientContent(notice: PracticeNotice, kind: ClientNoticeKind, brand: PracticeBrand, url: string): ClientContent {
  const snapshot = notice.snapshot || {};
  const detail = notice.detail || {};
  const firstName = cleanText(snapshot.client?.firstName, 100);
  const greeting = firstName ? `Hello ${firstName},` : "Hello,";
  const linkNote = `This link is personal to you and works for ${PORTAL_LINK_DAYS} days. Please do not forward this email.`;
  // Staff messages may be written by a clerk, so they are attributed to the practice.
  const noteLabel = `A note from ${brand.displayName}`;
  const message = cleanQuote(detail.message);

  if (kind === "portal_link") {
    const paragraphs = [
      `Here is your secure link to your files with ${brand.displayName}.`,
      "If you did not ask for this link, you can ignore this email.",
    ];
    return {
      subject: `Your secure link · ${brand.displayName}`, preheader: paragraphs[0], eyebrow: "Your files",
      headline: CLIENT_HEADLINES.portal_link, greeting, paragraphs, quote: null, keyDates: [], keyDateNote: "",
      closing: [], cta: { label: CTA_LABELS.portal_link, url }, linkNote, brand,
    };
  }

  const file = snapshot.file || {};
  const area = file.area as PracticeArea;
  const number = cleanText(file.number, 40);
  const currentStage = str(file.stage) || "new_intake";
  const title = matterTitle(area, { issue: file.issue, ticket_type: file.ticketType, category: file.category });
  const eyebrow = `${title} · File ${number}`;
  const dates = keyDateList(file.keyDates);
  let headline = "";
  let paragraphs: string[] = [];
  let closing: string[] = [];
  let quote: ClientContent["quote"] = null;
  let showDates = false;

  switch (kind) {
    case "intake_received": {
      headline = CLIENT_HEADLINES.intake_received;
      const count = Number(file.documentCount);
      paragraphs = [
        stageDef(area, currentStage)?.clientNext || stageDef(area, "new_intake")!.clientNext,
        Number.isInteger(count) && count > 0
          ? `We received ${plural(count, "document")} with your file.`
          : "You can add documents to your file at any time with the button below.",
      ];
      showDates = true;
      break;
    }
    case "stage_changed": {
      const stage = str(detail.stage) || currentStage;
      const def = stageDef(area, stage);
      if (!def) throw new PracticeNoticeError("stage_unknown", true);
      headline = def.clientLabel;
      const outcome = str(detail.outcome) || str(file.outcome);
      const outcomeLabel = stage === "closed" && outcome && outcome !== "other"
        ? outcomeDef(area, outcome)?.clientLabel : "";
      if (outcomeLabel) headline = `${def.clientLabel}: ${outcomeLabel}`;
      paragraphs = [def.clientNext];
      quote = message ? { label: noteLabel, text: message } : null;
      showDates = stage !== "closed";
      break;
    }
    case "documents_requested": {
      headline = CLIENT_HEADLINES.documents_requested;
      const request = message || cleanQuote(file.request?.message);
      paragraphs = request
        ? ["Please send us the following so we can move your file forward."]
        : ["Please open your file to see which document we need."];
      quote = request ? { label: "What we need", text: request } : null;
      closing = ["Use the button below to upload it securely. Photos taken with your phone are fine."];
      break;
    }
    case "document_shared": {
      headline = CLIENT_HEADLINES.document_shared;
      const name = cleanText(detail.documentName, 200);
      paragraphs = [name ? `We added a document to your file: ${name}.` : "We added a document to your file."];
      quote = message ? { label: noteLabel, text: message } : null;
      closing = ["Open your file to view or download it."];
      break;
    }
    case "upload_invite": {
      headline = CLIENT_HEADLINES.upload_invite;
      paragraphs = [`We have opened file ${number} for you.`];
      quote = message ? { label: noteLabel, text: message } : null;
      closing = ["Use the button below to upload your documents securely. Photos taken with your phone are fine."];
      break;
    }
  }

  const keyDates = showDates ? dates.map(({ label, date }) => ({ label, date })) : [];
  const keyDateNote = keyDates.length && dates.some(entry => entry.key === "optionDeadline")
    ? "The response deadline is an estimate. Always go by the date printed on your ticket."
    : "";
  return {
    subject: `${number} · ${headline}`, preheader: paragraphs[0], eyebrow, headline, greeting, paragraphs, quote,
    keyDates, keyDateNote, closing, cta: { label: CTA_LABELS[kind], url }, linkNote, brand,
  };
}

function cleanQuote(value: unknown): string {
  if (typeof value !== "string") return "";
  // deno-lint-ignore no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\r\n?/g, "\n").trim().slice(0, 1000); // eslint-disable-line no-control-regex
}

function clientHtml(content: ClientContent): string {
  const { brand } = content;
  const label = `margin:0 0 8px;font-family:${SANS};font-size:12px;line-height:18px;letter-spacing:1px;text-transform:uppercase;color:${COLOR.ink2};`;
  const quote = content.quote
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:4px 0 20px;">
<tr><td style="background-color:${COLOR.page};border-left:3px solid ${COLOR.gold};padding:14px 18px;">
<p style="${label}margin-bottom:6px;">${escapeHtml(content.quote.label)}</p>
<p style="margin:0;font-family:${SERIF};font-size:17px;line-height:26px;color:${COLOR.ink};">${multiline(content.quote.text)}</p>
</td></tr></table>`
    : "";
  const keyDates = content.keyDates.length
    ? `<p style="${label}margin-top:8px;">Key dates</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border-bottom:1px solid ${COLOR.line};margin:0 0 ${content.keyDateNote ? 8 : 20}px;">
${content.keyDates.map(entry => `<tr><td style="padding:10px 12px 10px 0;border-top:1px solid ${COLOR.line};font-family:${SANS};font-size:15px;line-height:22px;color:${COLOR.ink2};">${
      escapeHtml(entry.label)}</td><td align="right" style="padding:10px 0;border-top:1px solid ${COLOR.line};font-family:${SANS};font-size:15px;line-height:22px;font-weight:bold;color:${COLOR.ink};white-space:nowrap;">${
      escapeHtml(formatLongDate(entry.date))}</td></tr>`).join("\n")}
</table>${content.keyDateNote
      ? `\n<p style="margin:0 0 20px;font-size:13px;line-height:20px;color:${COLOR.ink2};">${escapeHtml(content.keyDateNote)}</p>`
      : ""}`
    : "";
  const contact = [
    brand.phone && telHref(brand.phone)
      ? `<a href="${escapeHtml(telHref(brand.phone))}" style="color:${COLOR.ink2};text-decoration:underline;">${escapeHtml(brand.phone)}</a>`
      : "",
    brand.publicEmail
      ? `<a href="mailto:${escapeHtml(brand.publicEmail)}" style="color:${COLOR.ink2};text-decoration:underline;">${escapeHtml(brand.publicEmail)}</a>`
      : "",
  ].filter(Boolean).join(" · ");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLOR.page};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${COLOR.page};">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.page}" style="width:100%;background-color:${COLOR.page};">
<tr><td align="center" style="padding:24px 12px 32px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td bgcolor="${COLOR.plum}" style="background-color:${COLOR.plum};padding:20px 28px;border-radius:6px 6px 0 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="56" height="56" align="center" valign="middle" style="width:56px;height:56px;"><img src="${
    escapeHtml(`${brand.siteUrl}/crest-email.png`)}" width="56" height="56" alt="${
    escapeHtml(brand.displayName)}" style="display:block;width:56px;height:56px;margin:0 auto;border:0;outline:none;text-decoration:none;"></td>
<td style="padding-left:16px;vertical-align:middle;font-family:${SERIF};font-size:20px;line-height:26px;color:${COLOR.ivory};">${escapeHtml(brand.displayName)}</td>
</tr></table>
</td></tr>
<tr><td bgcolor="${COLOR.card}" style="background-color:${COLOR.card};padding:32px 28px 28px;border:1px solid ${COLOR.line};border-top:0;border-radius:0 0 6px 6px;font-family:${SANS};font-size:16px;line-height:25px;color:${COLOR.ink};">
<p style="margin:0 0 8px;font-family:${SANS};font-size:12px;line-height:18px;letter-spacing:1px;text-transform:uppercase;color:${COLOR.plum600};">${escapeHtml(content.eyebrow)}</p>
<h1 style="margin:0 0 20px;font-family:${SERIF};font-size:28px;line-height:34px;font-weight:normal;color:${COLOR.plum};">${escapeHtml(content.headline)}</h1>
<p style="margin:0 0 16px;">${escapeHtml(content.greeting)}</p>
${content.paragraphs.map(paragraph => `<p style="margin:0 0 16px;">${multiline(paragraph)}</p>`).join("\n")}
${quote}${keyDates}${content.closing.map(paragraph => `<p style="margin:0 0 16px;">${multiline(paragraph)}</p>`).join("\n")}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 0;">
<tr><td align="center" bgcolor="${COLOR.gold}" style="border-radius:6px;background-color:${COLOR.gold};">
<a href="${escapeHtml(content.cta.url)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 28px;border:1px solid ${COLOR.gold600};border-radius:6px;font-family:${SANS};font-size:16px;line-height:20px;font-weight:bold;color:${COLOR.plum};text-decoration:none;">${
    escapeHtml(content.cta.label)}</a>
</td></tr></table>
<p style="margin:16px 0 0;font-size:13px;line-height:20px;color:${COLOR.ink2};">${escapeHtml(content.linkNote)}</p>
</td></tr>
<tr><td style="padding:24px 28px 0;font-family:${SANS};font-size:13px;line-height:20px;color:${COLOR.ink2};">
<p style="margin:0 0 4px;font-family:${SERIF};font-size:16px;line-height:22px;color:${COLOR.plum};">${escapeHtml(brand.displayName)}</p>
${contact ? `<p style="margin:0 0 4px;">${contact}</p>\n` : ""}<p style="margin:0 0 12px;">${escapeHtml(brand.legalName)}</p>
<p style="margin:0;">${escapeHtml(RETAINER_LINE)}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function clientText(content: ClientContent): string {
  const { brand } = content;
  const lines = [content.headline, content.eyebrow, "", content.greeting, ""];
  for (const paragraph of content.paragraphs) lines.push(paragraph, "");
  if (content.quote) lines.push(`${content.quote.label}:`, content.quote.text, "");
  if (content.keyDates.length) {
    lines.push("Key dates");
    for (const entry of content.keyDates) lines.push(`${entry.label}: ${formatLongDate(entry.date)}`);
    if (content.keyDateNote) lines.push(content.keyDateNote);
    lines.push("");
  }
  for (const paragraph of content.closing) lines.push(paragraph, "");
  lines.push(`${content.cta.label}: ${content.cta.url}`, "", content.linkNote, "", "--", brand.displayName);
  const contact = [brand.phone, brand.publicEmail].filter(Boolean).join(" · ");
  if (contact) lines.push(contact);
  lines.push(brand.legalName, RETAINER_LINE);
  return lines.join("\n");
}

async function renderClientNotice(
  notice: PracticeNotice, kind: ClientNoticeKind, signingSecret: string,
): Promise<PracticeNoticeEmail> {
  const snapshot = notice.snapshot && typeof notice.snapshot === "object" ? notice.snapshot : {};
  const from = sender(snapshot.practice?.clientEmailFrom);
  const replyTo = headerValue(snapshot.practice?.clientReplyTo);
  if (!from || !isEmail(replyTo)) throw new PracticeNoticeError("sender_missing", true);
  const siteUrl = siteOrigin(snapshot.practice?.siteUrl);
  if (!siteUrl) throw new PracticeNoticeError("snapshot_invalid", true);
  const to = expectedRecipients(notice);
  if (!to.length) throw new PracticeNoticeError("recipients_missing", true);
  if (kind !== "portal_link") {
    const file = snapshot.file;
    if (!file || !isArea(file.area) || !isUuid(file.id) || !cleanText(file.number, 40)) {
      throw new PracticeNoticeError("snapshot_invalid", true);
    }
  }
  const url = await clientNoticeLink(notice, signingSecret, siteUrl);
  const content = buildClientContent({ ...notice, snapshot }, kind, brandOf(snapshot, siteUrl), url);
  return {
    from, to, reply_to: replyTo,
    subject: cleanText(content.subject, 250),
    html: clientHtml(content),
    text: clientText(content),
  };
}

// ---------------------------------------------------------------------------
// Staff alerts
// ---------------------------------------------------------------------------

const STAFF_FILE_NOUN: Record<PracticeArea, string> = { ltb: "landlord file", traffic: "traffic file", general: "file" };

function staffRow(label: string, value: string | null | undefined) {
  return `<tr><th align="left" style="width:38%;padding:7px 16px 7px 0;vertical-align:top;font-weight:600">${
    escapeHtml(label)}</th><td style="padding:7px 0;word-break:break-word">${escapeHtml(value || "Not provided")}</td></tr>`;
}

function renderStaffNotice(notice: PracticeNotice, kind: StaffNoticeKind): PracticeNoticeEmail {
  const snapshot = notice.snapshot && typeof notice.snapshot === "object" ? notice.snapshot : {};
  const practice = snapshot.practice || {};
  const client = snapshot.client || {};
  const file = snapshot.file || {};
  const to = expectedRecipients(notice);
  if (!to.length) throw new PracticeNoticeError("recipients_missing", true);
  const siteUrl = siteOrigin(practice.siteUrl);
  const area = file.area;
  const number = cleanText(file.number, 40);
  if (!siteUrl || !isArea(area) || !isUuid(file.id) || !number) throw new PracticeNoticeError("snapshot_invalid", true);

  const practiceName = cleanText(practice.name, 200) || cleanText(practice.displayName, 120) || "the practice";
  const title = matterTitle(area, { issue: file.issue, ticket_type: file.ticketType, category: file.category });
  const who = [[cleanText(client.firstName, 100), cleanText(client.lastName, 100)].filter(Boolean).join(" "),
    cleanText(client.organizationName, 200)].filter(Boolean).join(" · ") || "Name not provided";
  const city = cleanText(file.city, 100);
  const link = `${siteUrl}/admin/files/${area}/${str(file.id).toLowerCase()}`;
  const received = file.createdAt && Number.isFinite(Date.parse(file.createdAt))
    ? new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Toronto" })
      .format(new Date(file.createdAt))
    : "";
  const dates = keyDateList(file.keyDates);
  const block = (heading: string, value: string) => value
    ? `<h2 style="font-size:15px;margin:20px 0 6px">${escapeHtml(heading)}</h2><p style="white-space:pre-wrap;margin:0;font-size:14px">${
      escapeHtml(value)}</p>`
    : "";

  let subject: string;
  let heading: string;
  let banner = "";
  let rows: string;
  let blocks: string;
  const text: string[] = [];
  if (kind === "staff_new_intake") {
    const ready = file.reviewStatus === "ready";
    const clientNotes = typeof file.clientNotes === "string" ? file.clientNotes.trim().slice(0, 2000) : "";
    const reviewNotes = typeof file.reviewNotes === "string" ? file.reviewNotes.trim().slice(0, 4000) : "";
    heading = `New ${STAFF_FILE_NOUN[area]} ${number}`;
    subject = `${heading} · ${title}${city ? ` · ${city}` : ""}${ready ? "" : " · needs review"}`;
    const bannerText = ready
      ? "Documents were read and the key details are in. Confirm them against the originals before acting."
      : `Needs review. Something is missing, unclear or conflicting. ${
        reviewNotes ? "See the notes below." : "The review notes are on the file."}`;
    banner = `<p style="margin:0 0 16px;padding:10px 12px;background:${ready ? "#dce8de" : "#f6e6a8"}">${escapeHtml(bannerText)}</p>`;
    const count = Number(file.documentCount);
    rows = [
      staffRow("Client", who),
      staffRow("Email", cleanText(client.email, 254)),
      client.phone !== undefined ? staffRow("Phone", cleanText(client.phone, 40)) : "",
      staffRow("Matter", title),
      staffRow(area === "general" ? "Client city" : "City", city),
      ...dates.map(entry => staffRow(entry.label, `${formatLongDate(entry.date)} (${entry.date})`)),
      staffRow("Documents", String(Number.isInteger(count) ? count : 0)),
      staffRow("Received (Toronto)", received),
    ].join("");
    blocks = block("Client's notes", clientNotes) + block("Review notes", reviewNotes);
    text.push(bannerText, "", `Client: ${who}`, `Email: ${cleanText(client.email, 254) || "Not provided"}`,
      `Matter: ${title}`, `City: ${city || "Not provided"}`,
      ...dates.map(entry => `${entry.label}: ${entry.date}`),
      `Documents: ${Number.isInteger(count) ? count : 0}`, `Received (Toronto): ${received || "Not provided"}`);
    if (clientNotes) text.push("", "Client's notes:", clientNotes);
    if (reviewNotes) text.push("", "Review notes:", reviewNotes);
  } else {
    const detail = notice.detail || {};
    const count = Number(detail.count);
    const added = Number.isInteger(count) && count > 0 ? `Client added ${plural(count, "document")}` : "Client added documents";
    heading = `New client documents on ${number}`;
    subject = `${number} · ${added}`;
    const note = typeof detail.note === "string" ? detail.note.trim().slice(0, 1000) : "";
    rows = [
      staffRow("Client", who),
      staffRow("Email", cleanText(client.email, 254)),
      staffRow("File", `${number} · ${title}`),
      staffRow("Stage", stageDef(area, str(file.stage))?.staffLabel || ""),
      staffRow("Documents added", Number.isInteger(count) && count > 0 ? String(count) : ""),
    ].join("");
    blocks = block("Client's note", note);
    text.push(`${added} to ${number} (${title}).`, `Client: ${who}`, `Email: ${cleanText(client.email, 254) || "Not provided"}`);
    if (note) text.push("", "Client's note:", note);
  }
  const footer = `Sent by Fabsy case software on behalf of ${practiceName}. Sign in to view documents. Details read from uploads are suggestions until confirmed. This email is not a retainer and does not mean any work has started.`;
  return {
    from: sender(practice.noticeFrom) || STAFF_DEFAULT_FROM,
    to,
    subject: cleanText(subject, 250),
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#17221c;line-height:1.5"><main style="max-width:640px;margin:24px auto;padding:24px">
<p style="margin:0;color:#4b5b52;font-size:13px">${escapeHtml(practiceName)}</p>
<h1 style="font-size:22px;margin:4px 0 16px">${escapeHtml(heading)}</h1>
${banner}<table role="presentation" style="border-collapse:collapse;width:100%;font-size:14px">
${rows}
</table>
${blocks}
<p style="margin-top:24px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#17221c;color:#fff;padding:12px 18px;text-decoration:none">Open the file</a></p>
<p style="color:#6e7d74;font-size:12px">${escapeHtml(footer)}</p>
</main></body></html>`,
    text: [heading, "", ...text, "", `Open the file: ${link}`, "", footer].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Rendering, sending and processing
// ---------------------------------------------------------------------------

export async function renderPracticeNotice(
  notice: PracticeNotice, options: { signingSecret: string },
): Promise<PracticeNoticeEmail> {
  if (!notice || typeof notice !== "object") throw new PracticeNoticeError("notice_invalid", true);
  if (isClientNoticeKind(notice.kind)) {
    if (notice.audience && notice.audience !== "client") throw new PracticeNoticeError("audience_mismatch", true);
    return await renderClientNotice(notice, notice.kind, options.signingSecret);
  }
  if (isStaffNoticeKind(notice.kind)) {
    if (notice.audience && notice.audience !== "staff") throw new PracticeNoticeError("audience_mismatch", true);
    return renderStaffNotice(notice, notice.kind);
  }
  throw new PracticeNoticeError("kind_unknown", true);
}

export async function sendPracticeNoticeEmail(
  apiKey: string,
  payload: PracticeNoticeEmail,
  noticeId: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  let response: Response;
  try {
    response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `practice-notice/${noticeId}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new PracticeNoticeError("provider_network_error");
  }
  const result = await response.json().catch(() => ({})) as { id?: string };
  if (!response.ok) {
    const permanent = response.status >= 400 && response.status < 500 && ![408, 409, 425, 429].includes(response.status);
    throw new PracticeNoticeError(`provider_http_${response.status}`, permanent);
  }
  if (typeof result.id !== "string" || !result.id) throw new PracticeNoticeError("provider_response_invalid");
  return result.id;
}

export type PracticeNoticeStatus = "sent" | "retry" | "failed";

export type PracticeNoticeDependencies = {
  claim: () => Promise<PracticeNotice[]>;
  freeze: (notice: PracticeNotice, email: PracticeNoticeEmail) => Promise<PracticeNoticeEmail>;
  send: (email: PracticeNoticeEmail, id: string) => Promise<string>;
  finish: (
    notice: PracticeNotice,
    status: PracticeNoticeStatus,
    providerId: string | null,
    failureCode: string | null,
  ) => Promise<boolean>;
  /** PRACTICE_PORTAL_SIGNING_SECRET, for the portal links in client emails. */
  signingSecret: string;
};

export async function processPracticeNotices(deps: PracticeNoticeDependencies) {
  const result = { claimed: 0, sent: 0, retry: 0, failed: 0, recordingFailed: 0 };
  const notices = await deps.claim();
  result.claimed = notices.length;
  for (const notice of notices) {
    let status: PracticeNoticeStatus = "retry";
    let providerId: string | null = null;
    let failureCode: string | null = null;
    try {
      const rendered = await renderPracticeNotice(notice, { signingSecret: deps.signingSecret });
      if (!rendered.to.length) throw new PracticeNoticeError("recipients_missing", true);
      const payload = await deps.freeze(notice, rendered);
      // Never resume a frozen email to a recipient list the notice no longer holds.
      const expected = expectedRecipients(notice);
      if (!payload || !Array.isArray(payload.to) || payload.to.length !== expected.length ||
          payload.to.some((recipient, index) => recipient !== expected[index])) {
        throw new PracticeNoticeError("recipient_policy_changed", true);
      }
      providerId = await deps.send(payload, notice.id);
      status = "sent";
    } catch (error) {
      if (error instanceof PracticeNoticeError) {
        failureCode = error.code;
        status = error.permanent ? "failed" : "retry";
      } else {
        failureCode = "notice_processing_error";
        status = "retry";
      }
    }
    try {
      const recorded = await deps.finish(notice, status, providerId, failureCode);
      if (!recorded) result.recordingFailed += 1;
      else result[status] += 1;
    } catch {
      result.recordingFailed += 1;
    }
  }
  return result;
}
