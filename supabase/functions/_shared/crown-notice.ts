import { authenticatedCrown, emailBodyText, type IncomingEmail } from './disclosure-confirmation.ts';

const kinds: Record<string, string> = {
  'disclosure is now available': 'disclosure_available',
  'disclosure request submitted': 'disclosure_acknowledged',
  'trial date pending': 'trial_pending',
  'virtual trial request pending': 'trial_pending',
  'review received': 'review_acknowledged',
};

/** Email is evidence, never an instruction to execute arbitrary portal actions. */
export function parseCrownNotice(mail: IncomingEmail) {
  if (mail.from?.email?.toLowerCase() !== 'noreply@gov.ab.ca') return null;
  // Offers have their own existing identity, deduplication and draft pipeline.
  if (mail.subject?.trim().toLowerCase() === 'prosecutor response') return null;
  const text = emailBodyText(mail);
  const tickets = [...new Set([...text.matchAll(/\b[A-Z]{1,3}\d{6,12}[A-Z]?\b/g)].map(m => m[0]))];
  const kind = kinds[mail.subject?.trim().toLowerCase() || ''] || 'unknown';
  const reasons: string[] = [];
  if (!authenticatedCrown(mail).ok) reasons.push('Crown sender authentication could not be verified.');
  if (!mail.to?.some(r => r.email?.toLowerCase() === 'hello@fabsy.ca')) reasons.push('Recipient is not hello@fabsy.ca.');
  if (tickets.length !== 1) reasons.push('Exact ticket number is missing or ambiguous.');
  const ticket = tickets.length === 1 ? tickets[0] : null;
  const links = [...(mail.html || '').matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(m => m[1].replaceAll('&amp;', '&'));
  links.push(...(mail.text || '').match(/https:\/\/[^\s<>"']+/g) || []);
  const matchingLinks = [...new Set(links.filter(link => {
    try {
      const url = new URL(link);
      return url.origin === 'https://traffictickets.alberta.ca' && !url.username && !url.password && !url.hash
        && url.pathname === '/ticket-number-search' && url.searchParams.getAll('ticketNumber').length === 1
        && [...url.searchParams.keys()].every(k => k === 'ticketNumber') && url.searchParams.get('ticketNumber') === ticket;
    } catch { return false; }
  }))];
  if (kind === 'disclosure_available' && matchingLinks.length !== 1) reasons.push('Disclosure ticket link is missing or ambiguous.');
  if (kind === 'unknown') reasons.push('This Crown notice has no supported automatic action.');
  return {kind, ticket_number: ticket, authenticated: reasons.length === 0,
    source_url: matchingLinks.length === 1 ? matchingLinks[0] : null,
    subject: String(mail.subject || '').slice(0, 300),
    occurred_at: Number.isFinite(Date.parse(mail.date || '')) ? new Date(mail.date!).toISOString() : null,
    review_reason: reasons.join(' ') || null};
}
