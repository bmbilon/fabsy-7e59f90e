import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import './staff.css';
import AccessGate from './AccessGate';
import BoardPage from './BoardPage';
import FilePage from './FilePage';
import SignInPage from './SignInPage';
import StaffShell from './StaffShell';
import TodayPage from './TodayPage';
import { CrestMark, Spinner } from './ui';

function LegacyCaseRedirect() {
  const { id = '' } = useParams();
  return <Navigate to={`/admin/files/ltb/${encodeURIComponent(id)}`} replace />;
}

function BootScreen() {
  return <main className="ahs-root flex min-h-screen flex-col items-center justify-center gap-4" role="status">
    <CrestMark variant="plum" className="h-14 w-14" />
    <p className="flex items-center gap-2 text-[14px] text-[color:var(--ah-ink-2)]">
      <Spinner className="text-[color:var(--ah-gold-600)]" />Opening AnderHue Paralegal…
    </p>
  </main>;
}

/** AnderHue staff workspace: /sign-in and /admin (ARCHITECTURE.md 5.3). */
export default function StaffApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;
    let authEventReceived = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      authEventReceived = true;
      if (!active) return;
      setSession(next);
      setReady(true);
      if (!next) queryClient.clear();
    });
    supabase.auth.getSession().then(({ data }) => {
      if (active && !authEventReceived) { setSession(data.session); setReady(true); }
    }).catch(() => { if (active) setReady(true); });
    return () => { active = false; subscription.unsubscribe(); };
  }, [queryClient]);

  if (!ready) return <BootScreen />;
  return <Routes>
    <Route path="/sign-in" element={<SignInPage session={session} />} />
    <Route path="/admin/ltb" element={<Navigate to="/admin/landlord" replace />} />
    <Route path="/admin/ltb/cases/:id" element={<LegacyCaseRedirect />} />
    <Route element={<AccessGate session={session} />}>
      <Route element={<StaffShell />}>
        <Route path="/admin" element={<Navigate to="/admin/today" replace />} />
        <Route path="/admin/today" element={<TodayPage />} />
        <Route path="/admin/landlord" element={<BoardPage key="ltb" area="ltb" />} />
        <Route path="/admin/traffic" element={<BoardPage key="traffic" area="traffic" />} />
        <Route path="/admin/other" element={<BoardPage key="general" area="general" />} />
        <Route path="/admin/files/:area/:id" element={<FilePage />} />
        <Route path="*" element={<Navigate to="/admin/today" replace />} />
      </Route>
    </Route>
  </Routes>;
}
