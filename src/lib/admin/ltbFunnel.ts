/** Ontario LTB case funnel for practice staff. Presentation only. */

export const LTB_STAGES = [
  ['new_intake', 'New intake'],
  ['under_review', 'Under review'],
  ['quoted', 'Fee quoted'],
  ['retained', 'Retained'],
  ['notice_served', 'Notice served'],
  ['filed', 'Application filed'],
  ['hearing_scheduled', 'Hearing scheduled'],
  ['order_issued', 'Order issued'],
  ['closed', 'Closed'],
  ['declined', 'Declined'],
] as const;

export type LtbStage = typeof LTB_STAGES[number][0];

export const LTB_OUTCOMES = [
  ['order_obtained', 'Order obtained'],
  ['settled', 'Settled / payment plan'],
  ['tenant_paid', 'Tenant paid in full'],
  ['withdrawn', 'Withdrawn by client'],
  ['dismissed', 'Application dismissed'],
  ['other', 'Other'],
] as const;

export const LTB_ISSUE_LABELS: Record<string, string> = {
  arrears: 'Unpaid rent',
  persistent_late: 'Persistent late payment',
  n12_own_use: 'Own or family use (N12)',
  n5_damage: 'Damage (N5)',
  n5_conduct: 'Interference or conduct (N5)',
  hearing_scheduled: 'Hearing already scheduled',
  other: 'Something else',
};

export const ltbStageLabel = (stage: string | null | undefined) =>
  LTB_STAGES.find(([value]) => value === stage)?.[1] || 'Unknown stage';

export interface LtbCaseRow {
  id: string;
  case_number: string;
  stage: LtbStage;
  issue: string;
  intake_review_status: 'pending_scan' | 'scanning' | 'needs_review' | 'ready';
  notice_form: string | null;
  notice_termination_date: string | null;
  returning_client: boolean;
  unit_city: string | null;
  arrears_claimed_cents: number | null;
  arrears_reported_text: string | null;
  created_at: string;
  stage_changed_at: string;
  ltb_clients: {
    first_name: string | null;
    last_name: string | null;
    organization_name: string | null;
    email: string;
    phone: string | null;
    registration_status: 'provisional' | 'registered' | 'verified';
  } | null;
}

export interface LtbCard {
  id: string;
  caseNumber: string;
  stage: LtbStage;
  name: string;
  email: string;
  phone: string;
  issue: string;
  city: string;
  amount: string;
  flags: string[];
  updatedAt: string;
}

export function formatCents(cents: number | null | undefined): string {
  return typeof cents === 'number' && Number.isFinite(cents)
    ? `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '';
}

/** Calendar date in Toronto, where LTB deadlines run. */
export function torontoToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(now);
}

export function l1FileFrom(terminationDate: string | null): string | null {
  if (!terminationDate || !/^\d{4}-\d{2}-\d{2}$/.test(terminationDate)) return null;
  return new Date(Date.parse(`${terminationDate}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

export function buildLtbBoard(rows: LtbCaseRow[], today = torontoToday()): LtbCard[] {
  return rows.map(row => {
    const client = row.ltb_clients;
    const person = [client?.first_name, client?.last_name].filter(Boolean).join(' ').trim();
    const flags: string[] = [];
    if (row.intake_review_status === 'needs_review') flags.push('Needs review');
    if (row.intake_review_status === 'pending_scan' || row.intake_review_status === 'scanning') flags.push('Reading documents');
    if (row.returning_client) flags.push('Returning client');
    if (client?.registration_status === 'provisional') flags.push('Unregistered');
    const fileFrom = l1FileFrom(row.notice_termination_date);
    if (row.stage === 'notice_served' && row.notice_form === 'N4' && fileFrom && today >= fileFrom) flags.push('Ready to file L1');
    return {
      id: row.id,
      caseNumber: row.case_number,
      stage: row.stage,
      name: client?.organization_name || person || 'Name pending',
      email: client?.email || '',
      phone: client?.phone || '',
      issue: LTB_ISSUE_LABELS[row.issue] || 'Something else',
      city: row.unit_city || '',
      amount: formatCents(row.arrears_claimed_cents) || row.arrears_reported_text || '',
      flags,
      updatedAt: row.stage_changed_at || row.created_at,
    };
  }).sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) || a.caseNumber.localeCompare(b.caseNumber));
}

export function filterLtbCards(cards: LtbCard[], query: string): LtbCard[] {
  const search = query.trim().toLocaleLowerCase();
  if (!search) return cards;
  return cards.filter(card => [card.name, card.email, card.phone, card.caseNumber, card.city, card.issue]
    .some(value => value.toLocaleLowerCase().includes(search)));
}
