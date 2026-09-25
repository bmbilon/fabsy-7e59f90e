import { supabase } from '@/integrations/supabase/client';
import type { LtbCaseRow } from '@/lib/admin/ltbFunnel';

// The LTB tables and RPCs are newer than the generated client types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ltbDb = supabase as any;

export interface LtbPracticeAccess {
  practice_id: string;
  practice_name: string;
  member_role: 'licensee' | 'clerk' | 'fabsy_admin';
}

export async function fetchMyLtbPractices(): Promise<LtbPracticeAccess[]> {
  const { data, error } = await ltbDb.rpc('ltb_my_practices');
  if (error) throw error;
  return (data || []) as LtbPracticeAccess[];
}

export const LTB_BOARD_SELECT = 'id,case_number,stage,issue,intake_review_status,notice_form,notice_termination_date,' +
  'returning_client,unit_city,arrears_claimed_cents,arrears_reported_text,created_at,stage_changed_at,' +
  'ltb_clients(first_name,last_name,organization_name,email,phone,registration_status)';

export async function fetchLtbBoard(practiceId?: string): Promise<LtbCaseRow[]> {
  let query = ltbDb.from('ltb_cases').select(LTB_BOARD_SELECT)
    .order('created_at', { ascending: false }).limit(500);
  if (practiceId) query = query.eq('practice_id', practiceId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as LtbCaseRow[];
}

export async function setLtbCaseStage(caseId: string, stage: string, outcome?: string | null, note?: string | null) {
  const { error } = await ltbDb.rpc('ltb_set_case_stage', {
    p_case_id: caseId, p_stage: stage, p_outcome: outcome || null, p_note: note || null,
  });
  if (error) throw new Error(stageErrorMessage(error.message));
}

export function stageErrorMessage(message: string): string {
  if (message.includes('LTB_OUTCOME_REQUIRED')) return 'Choose an outcome before closing the file.';
  if (message.includes('LTB_CASE_NOT_FOUND')) return 'This file is not available to your account.';
  if (message.includes('LTB_REGISTRATION_INCOMPLETE')) return 'Add a name, mailing address and phone before confirming registration.';
  if (message.includes('LTB_IDENTITY_DOCUMENT_REQUIRED')) return 'Enter the ID document type you checked.';
  return 'The change could not be saved. Refresh and try again.';
}
