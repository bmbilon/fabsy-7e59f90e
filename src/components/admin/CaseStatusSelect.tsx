import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CASE_STAGES, isTrialStage, type CaseStatus, type TicketKind } from '@/lib/admin/caseStatus';

export default function CaseStatusSelect({ kind, ticketId, label, initial, fallback = 'Choose case status', disabled = false, onChanged }: {
  kind: TicketKind; ticketId: string; label: string; initial?: CaseStatus;
  fallback?: string; disabled?: boolean; onChanged?: () => void;
}) {
  const client = useQueryClient();
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState<CaseStatus>();
  const status = useQuery({
    queryKey: ['admin-case-status', kind, ticketId],
    enabled: !initial && !disabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_admin_ticket_case_status', { p_kind: kind, p_ticket_id: ticketId });
      if (error || !data) throw new Error('Status unavailable');
      return data as unknown as CaseStatus;
    },
    gcTime: 0,
  });
  useEffect(() => { setSaved(undefined); setMessage(''); }, [kind, ticketId]);
  const incoming = initial || status.data;
  const current = saved && (!incoming || saved.version >= incoming.version) ? saved : incoming;
  const change = async (stage: string) => {
    if (!current || busy.current || disabled) return;
    busy.current = true;
    setSaving(true); setFailed(false); setMessage('Saving…');
    try {
      const { data, error } = await supabase.rpc('set_admin_ticket_case_status', {
        p_kind: kind, p_ticket_id: ticketId, p_stage: stage, p_expected_version: current.version,
      });
      if (error || !data) throw error || new Error('No status returned');
      setSaved(data as unknown as CaseStatus);
      setMessage('Saved');
      void client.invalidateQueries({ queryKey: ['admin-dashboard-queue'] });
      void client.invalidateQueries({ queryKey: ['admin-case-status'] });
      void client.invalidateQueries({ queryKey: ['admin-case-statuses'] });
      onChanged?.();
    } catch (error) {
      const conflict = String((error as { message?: string })?.message).includes('CASE_STATUS_CHANGED');
      setFailed(true);
      setMessage(conflict ? 'Another staff member changed this status. Review it and try again.' : 'Status not saved. Please try again.');
      if (conflict) {
        const { data } = await supabase.rpc('get_admin_ticket_case_status', { p_kind: kind, p_ticket_id: ticketId });
        if (data) setSaved(data as unknown as CaseStatus);
      }
    } finally { busy.current = false; setSaving(false); }
  };
  const trial = isTrialStage(current?.stage);
  const groups = trial ? ['Trial matters', 'Case progress'] : ['Case progress', 'Trial matters'];
  return <div className="w-full min-w-0 sm:w-72" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <label className="block text-xs font-medium text-slate-600">
      Case status
      <select aria-label={`Case status for ${label}`} value={current?.stage || ''} disabled={disabled || saving || !current}
        onChange={event => void change(event.target.value)}
        className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:outline-blue-600 disabled:opacity-60">
        <option value="" disabled>{!current && !disabled ? 'Loading status…' : fallback}</option>
        {groups.map(group => <optgroup key={group} label={group}>
          {CASE_STAGES.filter(([value]) => isTrialStage(value) === (group === 'Trial matters')).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </optgroup>)}
      </select>
    </label>
    {message && <p role={failed ? 'alert' : 'status'} className={`mt-1 text-xs ${failed ? 'text-red-700' : 'text-slate-500'}`}>{message}</p>}
    {!initial && status.isError && <button type="button" className="mt-1 text-xs text-red-700 underline" onClick={() => void status.refetch()}>Status unavailable. Retry</button>}
  </div>;
}
