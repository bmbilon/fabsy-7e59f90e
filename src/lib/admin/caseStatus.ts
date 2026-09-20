export const CASE_STAGES = [
  ['partial', 'Partial intake'],
  ['paid', 'Paid'],
  ['disclosure_requested', 'Disclosure requested'],
  ['crown_offer_received', 'Crown offer received'],
  ['done_reduced', 'Done — ticket reduced'],
  ['done_withdrawn', 'Done — ticket voided/withdrawn'],
  ['trial_proceeding', 'Crown offer rejected — client proceeding to trial'],
  ['trial_date_pending', 'Trial date pending'],
  ['trial_date_set', 'Trial date set'],
  ['trial_concluded_reduced', 'Trial concluded — ticket reduced'],
  ['trial_concluded_upheld', 'Trial concluded — ticket upheld'],
] as const;
export type CaseStage = typeof CASE_STAGES[number][0];
export type TicketKind = 'draft' | 'submission';
export interface CaseStatus {
  kind: TicketKind;
  ticket_id: string;
  stage: CaseStage | null;
  version: number;
}
export const isTrialStage = (stage: string | null | undefined) => Boolean(stage?.startsWith('trial_'));
export const isCompletedStage = (stage: string | null | undefined) => Boolean(stage?.startsWith('done_') || stage?.startsWith('trial_concluded_'));
export const caseStageLabel = (stage: string | null | undefined) => CASE_STAGES.find(([value]) => value === stage)?.[1];
