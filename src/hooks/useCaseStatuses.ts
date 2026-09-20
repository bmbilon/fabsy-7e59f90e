import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CaseStatus, TicketKind } from '@/lib/admin/caseStatus';

export function useCaseStatuses(userId: string | undefined, role: string | null) {
  return useQuery({
    queryKey: ['admin-case-statuses', userId],
    enabled: !!userId && (role === 'admin' || role === 'case_manager'),
    queryFn: async ({ signal }) => {
      const rows: CaseStatus[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from('admin_ticket_case_status').select('kind,ticket_id,stage,version')
          .order('kind').order('ticket_id').range(offset, offset + 999).abortSignal(signal);
        if (error) throw error;
        rows.push(...data as CaseStatus[]);
        if (data.length < 1000) return rows;
      }
    },
    refetchInterval: 30_000, refetchIntervalInBackground: false, gcTime: 0,
  });
}
export function resolveCaseStatus(rows: CaseStatus[] | undefined, kind: TicketKind, ticketId: string, linkedId?: string | null): CaseStatus | undefined {
  if (!rows) return undefined;
  const submissionId = kind === 'submission' ? ticketId : linkedId;
  const draftId = kind === 'draft' ? ticketId : linkedId;
  const saved = rows.find(row => row.kind === 'submission' && row.ticket_id === submissionId)
    || rows.find(row => row.kind === 'draft' && row.ticket_id === draftId);
  return { kind, ticket_id: ticketId, stage: saved?.stage || null, version: saved?.version || 0 };
}
