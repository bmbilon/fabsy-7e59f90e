import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import DashboardQueue from '@/components/admin/DashboardQueue';
import type { DashboardQueue as QueueData, QueueFilter } from '@/lib/admin/dashboard';

export default function CaseQueueSection({ userId, role, trials = false }: { userId?: string; role?: string | null; trials?: boolean }) {
  const [filter, setFilter] = useState<QueueFilter>(trials ? 'trial' : 'submitted');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [offset, setOffset] = useState(0);
  useEffect(() => { const timer = setTimeout(() => { setDebounced(search); setOffset(0); }, 250); return () => clearTimeout(timer); }, [search]);
  const queue = useQuery({
    queryKey: ['admin-dashboard-queue', userId, filter, debounced, offset],
    enabled: !!userId && (role === 'admin' || role === 'case_manager'),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc('admin_dashboard_queue', { p_filter: filter, p_search: debounced, p_offset: offset }).abortSignal(signal);
      if (error || !data) throw new Error('Could not load cases');
      return data as unknown as QueueData;
    },
    refetchInterval: 30_000, refetchIntervalInBackground: false, gcTime: 0,
  });
  return <DashboardQueue data={queue.data} loading={queue.isPending || search !== debounced} error={queue.isError}
    filter={filter} setFilter={value => { setFilter(value); setOffset(0); }} search={search} setSearch={setSearch}
    offset={offset} setOffset={setOffset} range={null} clearRange={() => {}} retry={() => void queue.refetch()} trials={trials} />;
}
