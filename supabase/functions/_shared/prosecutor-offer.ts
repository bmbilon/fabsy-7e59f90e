import { getFabsyEmailSignature, getFabsyEmailSignatureText } from "./email-signature.ts";
import { authenticatedCrown, emailBodyText, escapeHtml, type IncomingEmail } from "./disclosure-confirmation.ts";

export function parseOfferNotice(mail: IncomingEmail) {
  if (mail.from?.email?.toLowerCase() !== "noreply@gov.ab.ca" || mail.subject?.trim().toLowerCase() !== "prosecutor response") return null;
  const reasons: string[] = [];
  if (!authenticatedCrown(mail).ok) reasons.push("Crown sender authentication could not be verified.");
  if (!mail.to?.some(r => r.email?.toLowerCase() === "hello@fabsy.ca")) reasons.push("Recipient is not hello@fabsy.ca.");
  const text = emailBodyText(mail);
  const tickets = [...new Set([...text.matchAll(/\bYour ticket\s+([A-Z]{1,3}\d{6,12}[A-Z]?)\s+was reviewed\b/gi)].map(m => m[1].toUpperCase()))];
  if (tickets.length !== 1) reasons.push("Ticket number is missing or ambiguous.");
  const rawLinks = [...(mail.html || "").matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(m => m[1].replaceAll("&amp;", "&"));
  rawLinks.push(...(mail.text || "").match(/https:\/\/[^\s<>"']+/g) || []);
  const links = [...new Set(rawLinks.flatMap(link => {
    try {
      const u = new URL(link);
      if (u.origin !== "https://traffictickets.alberta.ca" || u.username || u.password || u.pathname !== "/dispute-response" || u.hash) return [];
      if ([...u.searchParams.keys()].some(k => k !== "uuid") || u.searchParams.getAll("uuid").length !== 1) return [];
      const id = u.searchParams.get("uuid") || "";
      return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) ? [id.toLowerCase()] : [];
    } catch { return []; }
  }))];
  if (links.length !== 1) reasons.push("Official response link is missing or ambiguous.");
  return {
    ticket_number: tickets.length === 1 ? tickets[0] : null,
    offer_id: links.length === 1 ? links[0] : null,
    authenticated: reasons.length === 0,
    review_reason: reasons.join(" ") || "Open the Crown response and verify its terms. Unattended portal retrieval is not available.",
  };
}

export interface OfferTerms {
  original_total: number;
  offered_total: number;
  charge: string;
  demerits: number;
  due_date: string;
  trial_date: string | null;
  deadline_source: string;
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function formatOfferDraft(ticket: string, recipient: string, terms: OfferTerms, now = new Date()) {
  if (!/^[A-Z]{1,3}\d{6,12}[A-Z]?$/.test(ticket) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient)) throw new Error("Offer case match is invalid.");
  for (const amount of [terms.original_total, terms.offered_total]) {
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > 100000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001) throw new Error("Verify the fine totals.");
  }
  if (!Number.isInteger(terms.demerits) || terms.demerits < 0 || terms.demerits > 99 || typeof terms.charge !== "string" || !terms.charge.trim() || terms.charge.length > 2000 || /[\x00-\x1f]/.test(terms.charge)) throw new Error("Verify the charge and demerits.");
  if (!validDate(terms.due_date) || (terms.trial_date && !validDate(terms.trial_date)) || !terms.deadline_source?.trim()) throw new Error("A verified response deadline and source are required.");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const cutoff = terms.trial_date ? new Date(Date.parse(terms.trial_date) - 8 * 86400000).toISOString().slice(0, 10) : terms.due_date;
  if (terms.due_date < today || cutoff < today) throw new Error("The verified offer deadline has passed. Review the current offer.");
  const money = (n: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);
  const date = (d: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" }).format(new Date(d));
  const saving = Math.round((terms.original_total - terms.offered_total) * 100) / 100;
  const body = `Hello,\n\nThe prosecutor has offered a fine of ${money(terms.offered_total)} CAD for ticket ${ticket}. The original fine was ${money(terms.original_total)}${saving > 0 ? `, so this saves you ${money(saving)}` : ""}.\n\nThe offered charge is: ${terms.charge.trim()}. The offer shows ${terms.demerits} demerit points.\n\nAccepting this offer means pleading guilty to that charge. Please reply to confirm whether you want to accept the ${money(terms.offered_total)} offer, or decline it and discuss next steps. We will wait for your instructions before taking either action.\n\nThe updated response due date is ${date(terms.due_date)}. ${terms.trial_date ? `With the trial scheduled for ${date(terms.trial_date)}, acceptance is required no later than ${date(cutoff)}, and no later than the response due date.` : "If a trial date is scheduled, the offer must also be accepted no later than eight days before the trial."}\n\nThank you,\nThe Fabsy Team`;
  return { from: "Fabsy <hello@fabsy.ca>", reply_to: "hello@fabsy.ca", to: [recipient], subject: `Ticket ${ticket} — Prosecutor offer: your decision required`, text: body + "\n\n" + getFabsyEmailSignatureText({ signOff: false, includeServiceOffer: false }), html: `<div>${escapeHtml(body).replaceAll("\n", "<br>")}${getFabsyEmailSignature({ signOff: false, includeServiceOffer: false })}</div>` };
}
