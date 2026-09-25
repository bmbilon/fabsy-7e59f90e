import type { CaseStatus } from './caseStatus';

export const FUNNEL_STAGES = [
  ['ticket_submitted', 'Ticket submitted'],
  ['consent_submitted', 'Consent submitted'],
  ['paid', 'Paid'],
  ['disclosure_requested', 'Disclosure requested'],
  ['crown_offer_received', 'Crown offer received'],
  ['proceeding_to_trial', 'Proceeding to trial'],
  ['closed_resolved', 'Closed resolved'],
  ['closed_refunded', 'Closed refunded'],
  ['expired_lapsed', 'Expired/lapsed'],
] as const;

export type FunnelStage = typeof FUNNEL_STAGES[number][0];

export interface FunnelSubmission {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  ticket_number: string;
  violation: string;
  status: string;
  consent_form_path: string | null;
  representation_paid_at: string | null;
  assessment_paid_at: string | null;
  referral_refunded_at: string | null;
  case_outcome: string | null;
  service_type: string;
  ticket_type: string;
  created_at: string;
  deleted_at: string | null;
}

export interface FunnelIntake {
  id: string;
  draft_data: { firstName?: string; lastName?: string; ticketNumber?: string; violation?: string };
  email: string | null;
  phone: string | null;
  status: string;
  converted_submission_id: string | null;
  ticket_uploaded_at: string | null;
  staff_follow_up_status: string;
  expires_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FunnelCase {
  key: string;
  id: string;
  kind: 'draft' | 'submission';
  stage: FunnelStage;
  name: string;
  email: string;
  phone: string;
  ticketNumber: string;
  violation: string;
  detail: string;
  updatedAt: string;
  caseStatus?: CaseStatus;
  href?: string;
  linkedIntakeId?: string;
}

function staffStage(stage: CaseStatus['stage']): FunnelStage | undefined {
  if (stage === 'lapsed_expired') return 'expired_lapsed';
  if (stage?.startsWith('done_') || stage?.startsWith('trial_concluded_')) return 'closed_resolved';
  if (stage?.startsWith('trial_')) return 'proceeding_to_trial';
  if (stage === 'partial') return 'ticket_submitted';
  if (stage === 'paid' || stage === 'disclosure_requested' || stage === 'crown_offer_received') return stage;
}

/** Presentation only: never writes consent, payment, outcomes or case stages. */
export function buildCaseFunnel(
  submissions: FunnelSubmission[], intakes: FunnelIntake[], statuses: CaseStatus[] | undefined, now = Date.now(),
): FunnelCase[] {
  const statusByKey = new Map(statuses?.map(row => [`${row.kind}:${row.ticket_id}`, row]));
  const intakeBySubmission = new Map(intakes.filter(row => row.converted_submission_id).map(row => [row.converted_submission_id, row]));
  // Include deleted submissions in this set so their linked draft cannot reappear.
  const submissionIds = new Set(submissions.map(row => row.id));
  const result: FunnelCase[] = [];
  for (const sub of submissions) {
    if (sub.deleted_at) continue;
    const linked = intakeBySubmission.get(sub.id);
    const saved = statusByKey.get(`submission:${sub.id}`) || statusByKey.get(`draft:${linked?.id}`);
    const tracked = staffStage(saved?.stage);
    // A refund/discount flag alone does not establish that an active case closed.
    const refundedClosure = sub.status === 'refunded' || sub.referral_refunded_at && (tracked === 'closed_resolved' || !tracked && (sub.status === 'completed' || sub.case_outcome));
    const stage = refundedClosure ? 'closed_refunded' : tracked
      || (sub.status === 'completed' || sub.case_outcome ? 'closed_resolved'
        : sub.representation_paid_at || sub.assessment_paid_at ? 'paid'
        : sub.consent_form_path ? 'consent_submitted' : 'ticket_submitted');
    result.push({
      key: `submission:${sub.id}`, id: sub.id, kind: 'submission', stage,
      name: `${sub.first_name} ${sub.last_name}`.trim(),
      email: sub.email, phone: sub.phone, ticketNumber: sub.ticket_number, violation: sub.violation,
      detail: sub.service_type === 'ticket_insurance_assessment' ? 'Legacy Ticket Triage' : sub.ticket_type === 'photo_radar' ? 'Photo radar · ATE' : 'Officer-issued ticket',
      updatedAt: sub.created_at, linkedIntakeId: linked?.id,
      href: sub.service_type === 'ticket_insurance_assessment' ? `/admin/assessments/${sub.id}` : `/admin/submissions/${sub.id}`,
      caseStatus: statuses ? { kind: 'submission', ticket_id: sub.id, stage: saved?.stage || null, version: saved?.version || 0 } : undefined,
    });
  }
  for (const intake of intakes) {
    if (intake.deleted_at || intake.converted_submission_id && submissionIds.has(intake.converted_submission_id)) continue;
    const saved = statusByKey.get(`draft:${intake.id}`);
    // A staff-managed matter remains active after its resume link expires.
    const managed = saved?.stage && saved.stage !== 'partial';
    if (!managed && intake.staff_follow_up_status === 'dismissed') continue;
    const expired = !managed && (intake.status === 'expired' || Date.parse(intake.expires_at) <= now);
    result.push({
      key: `draft:${intake.id}`, id: intake.id, kind: 'draft',
      stage: expired ? 'expired_lapsed' : staffStage(saved?.stage) || 'ticket_submitted',
      name: [intake.draft_data?.firstName, intake.draft_data?.lastName].filter(Boolean).join(' ').trim(),
      email: intake.email || '', phone: intake.phone || '', ticketNumber: intake.draft_data?.ticketNumber || '',
      violation: intake.draft_data?.violation || '', updatedAt: intake.updated_at,
      detail: intake.ticket_uploaded_at ? 'Intake · ticket received' : 'Intake · awaiting ticket upload',
      caseStatus: statuses ? { kind: 'draft', ticket_id: intake.id, stage: saved?.stage || null, version: saved?.version || 0 } : undefined,
    });
  }
  return result.sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) || a.key.localeCompare(b.key));
}

export function filterFunnelCases(cases: FunnelCase[], query: string): FunnelCase[] {
  const search = query.trim().toLocaleLowerCase();
  return cases.filter(row => [row.name, row.email, row.phone, row.ticketNumber, row.violation].some(value => value.toLocaleLowerCase().includes(search)));
}
