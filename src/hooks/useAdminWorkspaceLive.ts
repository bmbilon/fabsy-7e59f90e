import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Realtime carries a revision only. Refetch data through its existing staff APIs. */
export function useAdminWorkspaceLive(userId: string | undefined, enabled: boolean) {
  const queries = useQueryClient();
  useEffect(() => {
    if (!userId || !enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        window.dispatchEvent(new Event('fabsy:workspace-updated'));
        void queries.invalidateQueries({ predicate: query => {
          const key = String(query.queryKey[0] || '');
          return key.startsWith('admin-') && key !== 'admin-dashboard-role';
        }});
      }, 200);
    };
    const channel = supabase.channel(`admin-workspace-${userId}`)
      .on('postgres_changes', {event: 'UPDATE', schema: 'public', table: 'admin_workspace_updates'}, refresh)
      .subscribe(status => { if (status === 'SUBSCRIBED') refresh(); });
    const foreground = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', foreground);
    window.addEventListener('online', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', foreground);
      window.removeEventListener('online', refresh);
      void supabase.removeChannel(channel);
    };
  }, [userId, enabled, queries]);
}
