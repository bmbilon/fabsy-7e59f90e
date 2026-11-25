import { useCallback, useMemo, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, RefreshCw, ShieldAlert, UserRoundCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import useSafeHead from '@/hooks/useSafeHead';
import { PRACTICE_ID, fetchMyPractices, staffKeys } from './api';
import { ROLE_LABELS } from './model';
import { notifyError } from './notify';
import { StaffSessionContext, type StaffSessionValue } from './session';
import { Button, CrestMark, Spinner } from './ui';

function GateScreen({ title, children, actions, icon }: { title?: string; children: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return <main className="ahs-root flex min-h-screen items-center justify-center px-4 py-12">
    <div className="w-full max-w-[460px] text-center">
      <CrestMark variant="plum" className="mx-auto h-16 w-16" />
      <p className="ahs-eyebrow mt-5">AnderHue Paralegal</p>
      <div className="ahs-card mt-5 px-6 py-7 text-left sm:px-8">
        {icon && <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--ah-ivory-200)] text-[color:var(--ah-gold-600)] [&_svg]:h-5 [&_svg]:w-5">{icon}</span>}
        {title && <h1 className="text-[20px] font-bold leading-tight text-[color:var(--ah-plum-950)]">{title}</h1>}
        <div className="mt-2 text-[14px] leading-6 text-[color:var(--ah-ink-2)]">{children}</div>
        {actions && <div className="mt-6 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  </main>;
}

/**
 * Signed-in and practice-member gate. Nothing below it (and no file data)
 * loads until ltb_my_practices confirms membership of the AnderHue practice.
 */
export default function AccessGate({ session }: { session: Session | null }) {
  useSafeHead({ title: 'Practice workspace | AnderHue Paralegal', robots: 'noindex, nofollow' });
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = session?.user.id || '';
  const practices = useQuery({
    queryKey: staffKeys.membership(userId),
    queryFn: fetchMyPractices,
    enabled: !!session,
    retry: false,
    staleTime: 0,
  });

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      notifyError('Sign out failed', 'Please try again.');
      return;
    }
    queryClient.clear();
    navigate('/sign-in', { replace: true });
  }, [navigate, queryClient]);

  const membership = practices.data?.find(practice => practice.practice_id === PRACTICE_ID);
  const value = useMemo<StaffSessionValue | null>(() => session && membership ? {
    session,
    userId,
    email: session.user.email || '',
    role: membership.member_role,
    roleLabel: ROLE_LABELS[membership.member_role] || 'Team member',
    signOut,
  } : null, [session, membership, userId, signOut]);

  if (!session) return <Navigate to="/sign-in" replace state={{ from: location }} />;

  const signOutButton = <Button variant="ghost" onClick={() => void signOut()}><LogOut aria-hidden="true" />Sign out</Button>;

  if (practices.isPending) {
    return <GateScreen>
      <p role="status" className="flex items-center gap-2.5 text-[14px] font-medium text-[color:var(--ah-ink)]">
        <Spinner className="text-[color:var(--ah-gold-600)]" />Checking practice access…
      </p>
    </GateScreen>;
  }
  if (practices.isError) {
    return <GateScreen title="Access could not be verified" icon={<ShieldAlert />}
      actions={<>
        <Button variant="primary" onClick={() => void practices.refetch()} busy={practices.isFetching}>
          {!practices.isFetching && <RefreshCw aria-hidden="true" />}Retry access check
        </Button>
        {signOutButton}
      </>}>
      <p>Please try again before opening any files.</p>
    </GateScreen>;
  }
  if (!value) {
    return <GateScreen title="Your account is ready" icon={<UserRoundCheck />}
      actions={<>
        <Button variant="primary" onClick={() => void practices.refetch()} busy={practices.isFetching}>Check access again</Button>
        {signOutButton}
      </>}>
      <p>Your practice administrator needs to enable access to AnderHue Paralegal’s workspace for <strong className="font-semibold text-[color:var(--ah-ink)]">{session.user.email}</strong>.</p>
    </GateScreen>;
  }
  return <StaffSessionContext.Provider value={value}><Outlet /></StaffSessionContext.Provider>;
}
