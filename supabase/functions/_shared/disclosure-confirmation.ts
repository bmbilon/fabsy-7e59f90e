import { getFabsyEmailSignature, getFabsyEmailSignatureText } from "./email-signature.ts";
/** Incoming email is untrusted data. No links, instructions or attachments are executed. */
export interface IncomingEmail {
  from?: { email?: string };
  to?: { email?: string }[];
  subject?: string;
  "message-id"?: string;
  date?: string;
  text?: string;
  html?: string;
  headers?: Record<string, string | string[]>;
}

/** @deprecated The inbox transport is now Google Workspace. */
export type ImprovEmail = IncomingEmail;

export interface ParsedConfirmation {
  source_message_id: string;
  sender: string;
  ticket_number: string | null;
  confirmed_at: string | null;
  timeframe_text: string | null;
  body_excerpt: string;
  authentication_result: string;
  parse_error: string | null;
}

export const normalizeTicket = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
const headerValues = (mail: IncomingEmail, name: string): string[] => {
  const entry = Object.entries(mail.headers || {}).find(([key]) => key.toLowerCase() === name);
  return entry ? (Array.isArray(entry[1]) ? entry[1] : [entry[1]]).filter(v => typeof v === "string") : [];
};

export function emailBodyText(mail: IncomingEmail): string {
  const source = typeof mail.text === "string" && mail.text.trim() ? mail.text : (mail.html || "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  return source.replace(/&#(x[0-9a-f]+|\d+);/gi, (full, value: string) => {
    const code = value[0].toLowerCase() === "x" ? parseInt(value.slice(1), 16) : Number(value);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : full;
  }).replace(/&(nbsp|amp|lt|gt|quot|apos);/gi, (_, name: string) =>
    ({ nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[name.toLowerCase()] || " ")
    .replace(/\s+/g, " ").trim();
}

export function authenticatedCrown(mail: IncomingEmail): { ok: boolean; evidence: string } {
  // Only the receiving service's first Authentication-Results header is trusted.
  // Never accept an arbitrary nested/forwarded header or DKIM-Signature by itself.
  const evidence = headerValues(mail, "authentication-results")[0] || "";
  if (!/^mx\.google\.com\s*;/i.test(evidence)) return { ok: false, evidence };
  const clauses = evidence.split(";").slice(1);
  const ok = clauses.some(clause => /\bdmarc=pass\b/i.test(clause) && /\bheader\.from=gov\.ab\.ca(?:\s|;|$)/i.test(clause))
    || clauses.some(clause => /\bdkim=pass\b/i.test(clause) && /\bheader\.(?:d|i)=@?gov\.ab\.ca(?:\s|;|$)/i.test(clause));
  return { ok, evidence: evidence.slice(0, 2000) };
}

export async function parseConfirmation(mail: IncomingEmail, now = new Date()): Promise<ParsedConfirmation | null> {
  const sender = String(mail.from?.email || "").trim().toLowerCase();
  if (sender !== "noreply@gov.ab.ca" || String(mail.subject || "").trim().toLowerCase() !== "disclosure request submitted") return null;
  const body = emailBodyText(mail);
  const auth = authenticatedCrown(mail);
  const errors: string[] = [];
  const recipients = (Array.isArray(mail.to) ? mail.to : []).map(value => String(value.email || "").trim().toLowerCase());
  if (!recipients.includes("hello@fabsy.ca")) errors.push("recipient_not_hello");
  if (!auth.ok) errors.push("sender_authentication_unverified");
  if (!/your request for disclosure has been received/i.test(body)) errors.push("receipt_wording_missing");
  const tickets = [...body.matchAll(/disclosure request for ticket\s+([a-z][a-z0-9 -]{5,24}?)\s+was submitted\b/gi)]
    .map(match => normalizeTicket(match[1]));
  const uniqueTickets = [...new Set(tickets)];
  const ticket = uniqueTickets.length === 1 && /^[A-Z]{1,3}\d{6,12}[A-Z]?$/.test(uniqueTickets[0]) ? uniqueTickets[0] : null;
  if (!ticket) errors.push("ticket_missing_or_ambiguous");
  const sentences = [...body.matchAll(/(?:Please note that\s+)?disclosure\s+(?:can|may|will|typically|usually|is expected to)\s+(?:take|takes|be available)[^.!?]{1,180}[.!?]/gi)]
    .map(match => match[0].trim()).filter(value => /\b(?:days?|weeks?|months?)\b/i.test(value)
      && /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i.test(value));
  const timeframe = sentences.length === 1 ? sentences[0] : null;
  // A request acknowledgement is valid without an estimate. Keep uncertain
  // timeframe wording null; client notices never infer a delivery timeline.
  const date = typeof mail.date === "string" ? new Date(mail.date) : new Date(NaN);
  const validDate = Number.isFinite(date.getTime());
  if (!validDate) errors.push("confirmation_date_missing");
  else if (date.getTime() > now.getTime() + 10 * 60_000 || date.getTime() < now.getTime() - 7 * 86400_000) errors.push("confirmation_date_outside_live_window");
  let messageId = String(mail["message-id"] || headerValues(mail, "message-id")[0] || "").trim();
  if (!messageId || messageId.length > 500) {
    errors.push("message_id_missing_or_invalid");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${sender}\n${mail.date}\n${body}`));
    messageId = "missing:" + [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  }
  return { source_message_id: messageId, sender, ticket_number: ticket,
    confirmed_at: validDate ? date.toISOString() : null, timeframe_text: timeframe,
    body_excerpt: body.slice(0, 12000), authentication_result: auth.evidence,
    parse_error: errors.length ? errors.join(", ") : null };
}

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, ch =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[ch]!);

export interface NoticeSnapshot {
  recipient: string;
  first_name: string;
  ticket_number: string;
  confirmed_on?: string;
  timeframe_text?: string | null;
  submission_id: string;
}

/** Verified request receipt; dates and estimates come only from the saved source. */
export function disclosureNotice(snapshot: NoticeSnapshot) {
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(snapshot.recipient)
    || !/^[A-Z0-9]{5,30}$/.test(snapshot.ticket_number) || !/\d/.test(snapshot.ticket_number)
    || !/^[0-9a-f-]{36}$/i.test(snapshot.submission_id)) throw new Error("Invalid notice snapshot");
  let date: string | null = null;
  if (snapshot.confirmed_on) {
    const parsed = new Date(`${snapshot.confirmed_on}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.confirmed_on) || !Number.isFinite(parsed.getTime())
      || parsed.toISOString().slice(0, 10) !== snapshot.confirmed_on) throw new Error("Invalid confirmation date");
    date = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(parsed);
  }
  const greeting = snapshot.first_name || "there";
  const caseUrl = `https://fabsy.ca/portal/cases/${snapshot.submission_id}`;
  const timeframe = snapshot.timeframe_text?.trim();
  const receipt = date
    ? `The Crown confirmed receipt of the disclosure request for ticket ${snapshot.ticket_number} on ${date}.`
    : `We’ve requested disclosure of evidence from the Crown for ticket ${snapshot.ticket_number}.`;
  const estimate = timeframe
    ? `The Crown's stated timeframe is:\n${timeframe}\n\nThis is the Crown's estimate, not a guaranteed delivery date.`
    : "A processing timeframe has not been confirmed. We will share the Crown's estimate when it is available.";
  const next = "The disclosure itself has not yet been received. We will review the evidence when it becomes available and keep you updated as your file progresses.";
  const deadline = "A disclosure request does not change the deadlines on your ticket.";
  return {
    from: "The Fabsy Team <hello@fabsy.ca>", to: [snapshot.recipient], reply_to: "hello@fabsy.ca",
    subject: `Ticket ${snapshot.ticket_number} — ${date ? "Disclosure request confirmed" : "Disclosure requested"}`,
    text: [`Hello ${greeting},`, receipt, estimate, next, deadline, `View your case update: ${caseUrl}`, getFabsyEmailSignatureText({ includeServiceOffer: false })].join("\n\n"),
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;color:#1e293b;line-height:1.6">
<h1 style="font-size:24px">${date ? "Your disclosure request is confirmed" : "Disclosure requested"}</h1>
<p>Hello ${escapeHtml(greeting)},</p>
<p>${escapeHtml(receipt)}</p>
${timeframe ? `<p>The Crown's stated timeframe is:</p><blockquote style="border-left:3px solid #3b82f6;padding-left:16px">${escapeHtml(timeframe)}</blockquote><p>This is the Crown's estimate, not a guaranteed delivery date.</p>` : `<p>${escapeHtml(estimate)}</p>`}
<p>${escapeHtml(next)}</p><p>${deadline}</p>
<p><a href="${caseUrl}">View your case update</a></p>
${getFabsyEmailSignature({ includeServiceOffer: false })}</div>`,
  };
}

export async function readBoundedJson(req: Request, maxBytes = 262144): Promise<unknown> {
  if (!req.body || Number(req.headers.get("content-length") || 0) > maxBytes) throw new Error("payload_too_large");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new Error("payload_too_large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const value = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("invalid_payload");
  return value;
}

export async function secretMatches(actual: string, expected: string): Promise<boolean> {
  if (!actual || expected.length < 32) return false;
  const hash = (value: string) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [a, b] = await Promise.all([hash(actual), hash(expected)]);
  return new Uint8Array(a).reduce((different, byte, index) => different | (byte ^ new Uint8Array(b)[index]), 0) === 0;
}
