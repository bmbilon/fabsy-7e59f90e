/** Incoming email is untrusted data. No links, instructions or attachments are executed. */
export interface ImprovEmail {
  from?: { email?: string };
  to?: { email?: string }[];
  subject?: string;
  "message-id"?: string;
  date?: string;
  text?: string;
  html?: string;
  headers?: Record<string, string | string[]>;
}

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
const headerValues = (mail: ImprovEmail, name: string): string[] => {
  const entry = Object.entries(mail.headers || {}).find(([key]) => key.toLowerCase() === name);
  return entry ? (Array.isArray(entry[1]) ? entry[1] : [entry[1]]).filter(v => typeof v === "string") : [];
};

export function emailBodyText(mail: ImprovEmail): string {
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

export function authenticatedCrown(mail: ImprovEmail): { ok: boolean; evidence: string } {
  // Only the receiving service's first Authentication-Results header is trusted.
  // Never accept an arbitrary nested/forwarded header or DKIM-Signature by itself.
  const evidence = headerValues(mail, "authentication-results")[0] || "";
  if (!/^mx[12]\.improvmx\.com\s*;/i.test(evidence)) return { ok: false, evidence };
  const clauses = evidence.split(";").slice(1);
  const ok = clauses.some(clause => /\bdmarc=pass\b/i.test(clause) && /\bheader\.from=gov\.ab\.ca(?:\s|;|$)/i.test(clause))
    || clauses.some(clause => /\bdkim=pass\b/i.test(clause) && /\bheader\.(?:d|i)=@?gov\.ab\.ca(?:\s|;|$)/i.test(clause));
  return { ok, evidence: evidence.slice(0, 2000) };
}

export async function parseConfirmation(mail: ImprovEmail, now = new Date()): Promise<ParsedConfirmation | null> {
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
  if (!timeframe) errors.push("timeframe_missing_or_ambiguous");
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
  confirmed_on: string;
  timeframe_text: string;
  submission_id: string;
}

/** Version 1 is frozen per outbox row before delivery. No promotional content. */
export function disclosureNotice(snapshot: NoticeSnapshot) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(snapshot.recipient)
    || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.confirmed_on)
    || !/^[0-9a-f-]{36}$/i.test(snapshot.submission_id)) throw new Error("Invalid notice snapshot");
  const date = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${snapshot.confirmed_on}T12:00:00Z`));
  return {
    from: "Fabsy <hello@fabsy.ca>", to: [snapshot.recipient], reply_to: "hello@fabsy.ca",
    subject: `Disclosure request confirmed — ticket ${snapshot.ticket_number}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;color:#1e293b;line-height:1.6">
<h1 style="font-size:24px">Your disclosure request is confirmed</h1>
<p>Hello ${escapeHtml(snapshot.first_name || "there")},</p>
<p>The Crown confirmed receipt of the disclosure request for ticket <strong>${escapeHtml(snapshot.ticket_number)}</strong> on <strong>${escapeHtml(date)}</strong>.</p>
<p>The Crown's stated timeframe is:</p><blockquote style="border-left:3px solid #3b82f6;padding-left:16px">${escapeHtml(snapshot.timeframe_text)}</blockquote>
<p>This is the Crown's estimate. The disclosure itself has not yet been received. We will keep you updated as your file progresses.</p>
<p>A disclosure request does not change the deadlines on your ticket.</p>
<p><a href="https://fabsy.ca/portal/cases/${snapshot.submission_id}">View your case update</a></p>
<p>Fabsy<br><a href="mailto:hello@fabsy.ca">hello@fabsy.ca</a><br>(825) 793-2279</p></div>`,
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
