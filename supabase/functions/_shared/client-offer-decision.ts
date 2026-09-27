import { getFabsyEmailSignature, getFabsyEmailSignatureText } from "./email-signature.ts";
import { emailBodyText, escapeHtml, normalizeTicket, type IncomingEmail } from "./disclosure-confirmation.ts";

const headers = (mail: IncomingEmail, name: string): string[] => {
  const value = mail.headers?.[name];
  return Array.isArray(value) ? value : value ? [value] : [];
};

/** Only the newly written text is eligible. HTML quotations retain boundaries. */
export function clientReplyText(mail: IncomingEmail): string {
  const source = mail.text?.trim() ? mail.text : (mail.html || "")
    .split(/<blockquote\b|<[^>]+class=["'][^"']*(?:gmail_quote|yahoo_quoted)|<[^>]+id=["'](?:divRplyFwdMsg|replyForwardMsg)/i)[0]
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|tr)>/gi, "\n")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]*>/g, "");
  const lines = source.replaceAll("\r", "").split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(?:>|On\b.*wrote:|[-_]{2,}\s*(?:Original|Forwarded) message|Begin forwarded message:|From:)/i.test(lines[i])) break;
    // Gmail may wrap its quote attribution across several lines.
    if (/^\s*On\b/i.test(lines[i]) && /wrote:/.test(lines.slice(i, i + 4).join(" "))) break;
    kept.push(lines[i]);
  }
  return emailBodyText({ text: kept.join("\n") });
}

export function authenticatedClient(mail: IncomingEmail): boolean {
  const domain = mail.from?.email?.toLowerCase().split("@")[1];
  const evidence = headers(mail, "authentication-results")[0] || "";
  if (!domain || !/^mx\.google\.com\s*;/i.test(evidence)) return false;
  // Require receiving Gmail's DMARC result aligned to the actual From domain.
  return evidence.split(";").slice(1).some(clause => /\bdmarc=pass\b/i.test(clause) &&
    clause.match(/\bheader\.from=([^\s;]+)/i)?.[1]?.toLowerCase() === domain);
}

export function parseClientOfferDecision(mail: IncomingEmail) {
  const sender = mail.from?.email?.toLowerCase() || "";
  if (!sender || sender === "hello@fabsy.ca" || sender.endsWith("@gov.ab.ca")) return null;
  const text = clientReplyText(mail);
  // Keep review candidates including "yes" replies, but ignore unrelated correspondence.
  if (!/\b(?:accept|acceptance|decline|reject|offer|proceed|go ahead|yes)\b/i.test(text)) return null;
  const tickets = [...new Set([...`${mail.subject || ""} ${text}`.matchAll(/\b[A-Z]{1,3}[ -]?\d(?:[ -]?\d){5,11}[ -]?[A-Z]?\b/gi)]
    .map(match => normalizeTicket(match[0])))];
  const reasons: string[] = [];
  const authenticated = authenticatedClient(mail);
  if (!authenticated) reasons.push("Client sender authentication needs review.");
  if (!mail.to?.some(item => item.email?.toLowerCase() === "hello@fabsy.ca")) reasons.push("Recipient is not hello@fabsy.ca.");
  if (tickets.length !== 1) reasons.push("An exact, unambiguous ticket number is required.");
  if (headers(mail, "auto-submitted").some(value => value.toLowerCase() !== "no") || headers(mail, "precedence").some(value => /bulk|list|junk/i.test(value))) reasons.push("Automatic/list message requires review.");
  if (/^(?:fwd?|fw):/i.test(mail.subject || "")) reasons.push("Forwarded authorization requires review.");
  if (text.length > 8000) reasons.push("Long reply requires review.");
  const decisionText = text.replace(/\b(?:please )?let me know if you need anything (?:further|else)(?: from me)?[.!]?/gi, "");
  const cautious = /\b(?:not|don't|do not|cannot|can't|won't|wouldn't|decline|reject|withdraw|cancel|instead|however|but|unless|if|provided|assuming|condition|maybe|might|consider|thinking|before|wait|hold|discuss|negotiate|less|lower|or)\b|\?/i.test(decisionText.replaceAll("’", "'"));
  // A narrow positive grammar only identifies candidates; it cannot authorize submission.
  const explicit = /\bI (?:would like to|want to|wish to|agree to|will) accept\b|\bI accept\b|\bplease (?:proceed with (?:the )?acceptance|accept (?:the |this )?(?:reduced |prosecutor'?s? |Crown'?s? )*(?:\$[\d,.]+ )?offer)\b/i.test(text);
  const amounts = [...text.matchAll(/\b(?:accept|accepting)\s+(?:(?:the|this|reduced|prosecutor'?s?|Crown'?s?)\s+)*\$([\d,]+(?:\.\d{1,2})?)\s+(?:offer|fine|penalty)\b/gi)]
    .map(match => Math.round(Number(match[1].replaceAll(",", "")) * 100));
  const unique = [...new Set(amounts)];
  const amount = unique.length === 1 && unique[0] > 0 && unique[0] <= 10_000_000 ? unique[0] : null;
  if (cautious || !explicit) reasons.push("Decision is ambiguous, conditional, negative or needs clarification.");
  if (amount === null) reasons.push("The accepted offer amount is not explicit and unique.");
  return {
    ticket_number: tickets.length === 1 ? tickets[0] : null,
    sender, authenticated, decision: reasons.length ? "needs_review" : "accept_candidate",
    accepted_amount_cents: amount, reply_text: text.slice(0, 8000),
    rfc_message_id: mail["message-id"] || null,
    in_reply_to: headers(mail, "in-reply-to")[0] || null,
    review_reason: reasons.join(" ") || null,
  };
}

export interface AcceptanceReceipt {
  ticket_number: string;
  accepted: boolean;
  receipt_reference: string;
  evidence_reference: string;
  fine_amount_cents: number;
  balance_due_cents: number;
  payment_due_date: string;
  attendance: "not_required" | "required" | "unknown";
}

/** Pure preview only. The caller must verify and persist the portal receipt first. */
export function formatAcceptanceConfirmation(ticket: string, recipient: string, receipt: AcceptanceReceipt) {
  if (!/^[A-Z]{1,3}\d{6,12}[A-Z]?$/.test(ticket) || receipt.ticket_number !== ticket ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient)) throw new Error("EXACT_RECEIPT_CASE_REQUIRED");
  if (receipt.accepted !== true || !receipt.receipt_reference?.trim() || !receipt.evidence_reference?.trim()) throw new Error("ACCEPTANCE_RECEIPT_REQUIRED");
  for (const value of [receipt.fine_amount_cents, receipt.balance_due_cents]) {
    if (!Number.isInteger(value) || value < 0 || value > 10_000_000) throw new Error("VERIFIED_PORTAL_AMOUNTS_REQUIRED");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receipt.payment_due_date) || !Number.isFinite(Date.parse(receipt.payment_due_date)) ||
    new Date(receipt.payment_due_date).toISOString().slice(0, 10) !== receipt.payment_due_date) throw new Error("VERIFIED_PAYMENT_DATE_REQUIRED");
  if (receipt.attendance !== "not_required") throw new Error("ATTENDANCE_DISPOSITION_REQUIRES_REVIEW");
  const money = (cents: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
  const date = new Intl.DateTimeFormat("en-CA", { dateStyle: "long", timeZone: "UTC" }).format(new Date(receipt.payment_due_date));
  const text = `Hello,\n\nWe have accepted the Crown's offer for ticket ${ticket}, as you instructed. The government portal confirms the acceptance.\n\nThe fine is ${money(receipt.fine_amount_cents)} CAD. The portal shows ${money(receipt.balance_due_cents)} CAD remaining to pay by ${date}. Pay through Alberta's official Traffic Tickets Digital Service: https://traffictickets.alberta.ca/\n\nThe portal confirms that you no longer need to attend a hearing or trial for this ticket.\n\nThank you,\nThe Fabsy Team`;
  return { from: "Fabsy <hello@fabsy.ca>", reply_to: "hello@fabsy.ca", to: [recipient], subject: `Ticket ${ticket} — Offer accepted and fine payment details`, text: text + "\n\n" + getFabsyEmailSignatureText({ signOff: false, includeServiceOffer: false }), html: `<div>${escapeHtml(text).replaceAll("\n", "<br>")}${getFabsyEmailSignature({ signOff: false, includeServiceOffer: false })}</div>` };
}
