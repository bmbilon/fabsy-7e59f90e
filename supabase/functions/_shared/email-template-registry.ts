import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { getFabsyEmailSignature, getFabsyEmailSignatureText } from './email-signature.ts';

// Revisions include the whole rendered signature. Changing any copy requires a
// new version; the database refuses to overwrite an existing revision.
const signature = getFabsyEmailSignature({ includeServiceOffer: false });
const signatureText = getFabsyEmailSignatureText({ includeServiceOffer: false });
const definition = (key: string, title: string, subject: string, paragraphs: string[], slots: Record<string, string>) => ({
  key, version: 1, title, slots,
  content: {
    subject: `Ticket {{ticket_number}} — ${subject}`,
    text: [...paragraphs, signatureText].join('\n\n'),
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;color:#1e293b;line-height:1.6">${paragraphs.map(p => `<p>${p}</p>`).join('')}${signature}</div>`,
  },
});
export const EMAIL_TEMPLATES = [
  definition('disclosure_acknowledged', 'Disclosure request confirmed', 'Disclosure request confirmed', [
    'Hello,',
    'The Crown confirmed receipt of the disclosure request for ticket {{ticket_number}} on {{confirmed_on}}.',
    "The Crown's recorded processing estimate is: {{timeframe_text}}",
    "This is the Crown's estimate, not a guaranteed delivery date. We will keep you updated as your file progresses.",
    'A disclosure request does not change the deadlines on your ticket.',
  ], { ticket_number: 'Exact normalized ticket', confirmed_on: 'Date on the authenticated Crown acknowledgement', timeframe_text: 'Processing estimate quoted from that acknowledgement' }),
  definition('disclosure_received', 'Disclosure received', 'Disclosure received', [
    'Hello,',
    'We have received the disclosure for ticket {{ticket_number}} and saved the evidence to your file.',
    'We will review it and keep you updated on the next step.',
  ], { ticket_number: 'Exact normalized ticket on the complete saved disclosure package' }),
  definition('prosecutor_review_submitted', 'Reduction/withdrawal requested', 'Reduction/withdrawal requested', [
    'Hello,',
    'We have requested a reduction or withdrawal for ticket {{ticket_number}} after reviewing the disclosure.',
    'The Crown has not agreed to a resolution yet. We will let you know when we receive its response.',
  ], { ticket_number: 'Exact normalized ticket on the saved government filing receipt' }),
  definition('prosecutor_offer', 'Verified prosecutor offer', 'Prosecutor offer: your decision required', [
    'Hello,',
    'The prosecutor has offered a fine of ${{offered_total}} CAD for ticket {{ticket_number}}. The original fine was ${{original_total}} CAD.',
    'The offered charge is: {{charge}}. The offer shows {{demerits}} demerit points.',
    'Accepting this offer means pleading guilty to that charge. To accept, please reply: I accept the ${{offered_total}} offer for ticket {{ticket_number}}. You can also decline or ask a question. We will wait for your instructions before taking action.',
    'The recorded response due date is {{due_date}}. Based on the current offer and any recorded trial date, acceptance must take place by {{accept_by}}. We will recheck the live offer before any acceptance.',
  ], { ticket_number: 'Exact normalized ticket', offered_total: 'Verified Crown fine', original_total: 'Verified original fine', charge: 'Verified offered charge, not a staff note', demerits: 'Verified offer demerits', due_date: 'Verified response deadline', accept_by: 'Earlier of response deadline and eight days before a recorded trial' }),
  definition('offer_accepted', 'Offer accepted — fine payment', 'Offer accepted — fine payment details', [
    'Hello,',
    "We have accepted the Crown's offer for ticket {{ticket_number}}, as you instructed. The government portal has confirmed the acceptance.",
    'The fine is ${{fine_total}} CAD. You must pay the remaining balance of ${{balance_due}} CAD by {{payment_due_date}}.',
    'Pay through Alberta’s official Traffic Tickets Digital Service: https://traffictickets.alberta.ca/',
    'These amounts and the new payment deadline are from the saved government acceptance receipt. The government fine is separate from the Fabsy service fee.',
  ], { ticket_number: 'Exact normalized ticket on the acceptance receipt', fine_total: 'Final fine confirmed by the government', balance_due: 'Unpaid government balance, not Fabsy fees', payment_due_date: 'New payment deadline on the acceptance receipt' }),
] as const;
export type EmailTemplateKey = 'disclosure_acknowledged' | 'disclosure_received' | 'prosecutor_review_submitted' | 'prosecutor_offer' | 'offer_accepted';

export async function registerEmailTemplates(db: SupabaseClient) {
  for (const template of EMAIL_TEMPLATES) {
    const { error } = await db.rpc('register_email_template', {
      p_key: template.key, p_version: template.version, p_title: template.title,
      p_content: template.content, p_slots: template.slots,
    });
    if (error) throw new Error('EMAIL_TEMPLATE_REGISTRATION_FAILED');
  }
}

export async function processTemplateLifecycleEmails(db: SupabaseClient) {
  await registerEmailTemplates(db);
  const received = await db.rpc('queue_disclosure_received_emails');
  if (received.error) throw new Error('DISCLOSURE_RECEIVED_TEMPLATE_QUEUE_FAILED');
  const accepted = await db.rpc('queue_accepted_offer_emails');
  if (accepted.error) throw new Error('ACCEPTED_OFFER_TEMPLATE_QUEUE_FAILED');
  return { disclosureReceived: received.data, offerAccepted: accepted.data };
}
