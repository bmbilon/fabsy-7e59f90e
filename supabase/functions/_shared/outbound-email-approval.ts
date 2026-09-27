import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { buildWorkspaceMime, sendWorkspaceEmail, type WorkspaceEmailPayload } from './google-workspace-email.ts';
import { prepareClientEmail } from './notification-locale.ts';
import { EMAIL_TEMPLATES, registerEmailTemplates, type EmailTemplateKey } from './email-template-registry.ts';

export type ApprovalSource = 'prosecutor_offer' | 'disclosure_notice' | 'case_update';
export async function freezeReviewPayload(source: WorkspaceEmailPayload, ticket: string): Promise<WorkspaceEmailPayload> {
  if (!/^[A-Z0-9]{5,30}$/.test(ticket) || !/\d/.test(ticket)) throw new Error('VERIFIED_TICKET_REQUIRED');
  const { localization, ...plain } = source;
  const payload = structuredClone(localization ? prepareClientEmail(plain, localization) : plain);
  if (payload.to.length !== 1 || /@(?:[^@.]+\.)*(?:gov\.ab\.ca|alberta\.ca)$/i.test(payload.to[0])) throw new Error('CLIENT_RECIPIENT_REQUIRED');
  // No hidden recipients or MIME-routing headers outside the reviewed envelope.
  for (const key of Object.keys(payload.headers || {})) {
    if (!/^(?:X-Fabsy-[\w-]+|Content-Language|In-Reply-To|References)$/i.test(key)) throw new Error('UNREVIEWED_EMAIL_HEADER');
  }
  if (!payload.subject.startsWith(`Ticket ${ticket} `)) payload.subject = `Ticket ${ticket} — ${payload.subject}`;
  await buildWorkspaceMime(payload, 'approval-validation');
  return payload;
}
export async function queueEmailApproval(db: SupabaseClient, source: {kind: ApprovalSource; id: string; submissionId: string; ticket: string; templateKey?: EmailTemplateKey}, payload: WorkspaceEmailPayload) {
  const templateKey = source.templateKey || (source.kind === 'disclosure_notice' ? 'disclosure_acknowledged' : source.kind === 'prosecutor_offer' ? 'prosecutor_offer' : null);
  if (templateKey) {
    const template = EMAIL_TEMPLATES.find(t => t.key === templateKey);
    if (!template) throw new Error('UNKNOWN_EMAIL_TEMPLATE');
    await registerEmailTemplates(db);
    // SQL renders the registered copy from independently loaded source facts.
    // The caller's body/recipient cannot become an automatically approved slot.
    const { data, error } = await db.rpc('queue_template_email', {
      p_key: template.key, p_version: template.version, p_kind: source.kind, p_source: source.id,
      p_submission: source.submissionId, p_ticket: source.ticket,
    });
    if (error || !data?.id) throw new Error('EMAIL_TEMPLATE_QUEUE_FAILED');
    return data;
  }
  const frozen = await freezeReviewPayload(payload, source.ticket);
  const {data, error} = await db.rpc('queue_outbound_email', {p_kind: source.kind, p_source: source.id, p_submission: source.submissionId, p_ticket: source.ticket, p_payload: frozen});
  if (error || !data?.id) throw new Error('EMAIL_APPROVAL_QUEUE_FAILED');
  return data;
}
export async function processApprovedEmails(db: SupabaseClient, id: string | null = null, deliver = sendWorkspaceEmail) {
  const {data, error} = await db.rpc('claim_approved_email', {p_id: id});
  if (error) throw new Error('APPROVED_EMAIL_CLAIM_FAILED');
  const item = data?.[0];
  if (!item) return {sent: 0};
  // No loop/retry after a Gmail write. A missing receipt is held for reconciliation.
  let receipt;
  try {
    if (item.status !== 'sending' || !item.approved_by || item.approved_hash !== item.payload_hash || item.payload.localization) throw new Error('INVALID_APPROVAL_RECEIPT');
    receipt = await deliver(item.payload, `approved-email/${item.id}`);
  } catch {
    const saved = await db.rpc('finish_approved_email', {p_id: item.id, p_claim: item.claim_token, p_error: 'No confirmed Gmail receipt.'});
    if (saved.error || saved.data !== true) throw new Error('EMAIL_UNCERTAIN_RECEIPT_SAVE_FAILED');
    return {sent: 0, uncertain: 1};
  }
  const saved = await db.rpc('finish_approved_email', {p_id: item.id, p_claim: item.claim_token, p_provider_id: receipt.id, p_thread_id: receipt.threadId || null});
  // Do not replace a known success with a failed result if saving the receipt fails.
  // The claim remains held and expires to uncertain, never back to sendable.
  if (saved.error || saved.data !== true) throw new Error('EMAIL_SENT_RECEIPT_SAVE_FAILED');
  return {sent: 1};
}
