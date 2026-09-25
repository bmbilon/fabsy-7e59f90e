import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import useSafeHead from '@/hooks/useSafeHead';
import { fetchMyLtbPractices } from '@/lib/admin/ltbApi';
import { ANDERHUE } from '@/lib/admin/ltbBranding';
import AdminLtbCases from '@/pages/AdminLtbCases';
import AdminLtbCaseDetail from '@/pages/AdminLtbCaseDetail';

function Brand() {
  return <a href="/" className="inline-flex items-center gap-3 text-foreground" aria-label="AnderHue Paralegal home">
    <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-sm font-bold tracking-wide text-white">AP</span>
    <span className="text-lg font-semibold tracking-tight">AnderHue <span className="font-normal">Paralegal</span></span>
  </a>;
}

function SignIn({ session }: { session: Session | null }) {
  useSafeHead({ title: 'Sign in | AnderHue Paralegal', robots: 'noindex, nofollow' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const navigate = useNavigate();
  if (session) return <Navigate to="/admin/ltb" replace />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (signup) {
        const { error: authError } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: `${window.location.origin}/sign-in` },
        });
        if (authError) throw authError;
        setNotice('Check your email to confirm your account. Your practice administrator will then enable your LTB access.');
        setSignup(false);
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
        navigate('/admin/ltb', { replace: true });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="flex min-h-screen flex-col items-center justify-center px-5 py-12">
    <Brand />
    <section className="mt-9 w-full max-w-md rounded-2xl border bg-card p-7 shadow-sm sm:p-9" aria-labelledby="signin-title">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">LTB workspace</p>
      <h1 id="signin-title" className="mt-3 text-3xl font-semibold tracking-tight">{signup ? 'Create your account' : 'Welcome back'}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{signup ? 'Register with the email your practice administrator has on file.' : 'Sign in to manage your practice’s Ontario landlord and tenant files.'}</p>
      <form onSubmit={submit} className="mt-7 space-y-5">
        <div className="space-y-2"><Label htmlFor="email">Email address</Label><Input id="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required disabled={busy} /></div>
        <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 6 : undefined} value={password} onChange={event => setPassword(event.target.value)} required disabled={busy} /></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {notice && <p role="status" className="text-sm leading-6 text-primary">{notice}</p>}
        <Button type="submit" disabled={busy} className="h-11 w-full">{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}</Button>
        <button type="button" disabled={busy} className="w-full text-center text-sm text-primary underline-offset-4 hover:underline" onClick={() => { setSignup(!signup); setError(''); setNotice(''); }}>{signup ? 'Already registered? Sign in' : 'First time here? Create an account'}</button>
      </form>
    </section>
    <p className="mt-6 text-center text-xs text-muted-foreground">Private access for AnderHue Paralegal team members.</p>
  </main>;
}

function Workspace({ session }: { session: Session | null }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [signoutError, setSignoutError] = useState('');
  const practices = useQuery({
    queryKey: ['ltb-practices', session?.user.id], queryFn: fetchMyLtbPractices,
    enabled: !!session, retry: false, staleTime: 0,
  });
  useSafeHead({ title: 'LTB workspace | AnderHue Paralegal', robots: 'noindex, nofollow' });
  if (!session) return <Navigate to="/sign-in" replace />;
  const member = practices.data?.some(practice => practice.practice_id === ANDERHUE.practiceId);
  async function signout() {
    const { error } = await supabase.auth.signOut();
    if (error) { setSignoutError('Sign out failed. Please try again.'); return; }
    queryClient.clear();
    navigate('/sign-in', { replace: true });
  }
  return <div className="min-h-screen">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-card px-5 py-4 sm:px-8">
      <Brand />
      <nav aria-label="Practice navigation" className="flex items-center gap-4">
        {member && !practices.isError && <Link to="/admin/ltb" className="text-sm font-semibold text-primary">LTB files</Link>}
        <Button variant="outline" onClick={signout}>Sign out</Button>
      </nav>
    </header>
    {signoutError && <p role="alert" className="p-4 text-destructive">{signoutError}</p>}
    {practices.isPending ? <p role="status" className="p-8">Checking practice access…</p>
      : practices.isError ? <main className="p-8"><h1 className="text-xl font-semibold">Access could not be verified</h1><p className="mt-3">Please try again before opening any files.</p><Button className="mt-4" onClick={() => practices.refetch()}>Retry access check</Button></main>
      : !member ? <main className="mx-auto max-w-xl px-5 py-16"><h1 className="text-2xl font-semibold">Your account is ready</h1><p className="mt-4 leading-7 text-muted-foreground">Your practice administrator needs to enable access to AnderHue Paralegal’s LTB workspace for {session.user.email}.</p><Button className="mt-6" onClick={() => practices.refetch()}>Check access again</Button></main>
      : <Outlet />}
  </div>;
}

export default function AnderHuePortal() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();
  useEffect(() => {
    let active = true;
    let authEventReceived = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      authEventReceived = true;
      if (active) { setSession(next); setReady(true); if (!next) queryClient.clear(); }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (active && !authEventReceived) { setSession(data.session); setReady(true); }
    }).catch(() => { if (active) setReady(true); });
    return () => { active = false; subscription.unsubscribe(); };
  }, [queryClient]);
  if (!ready) return <main className="p-8" role="status">Opening AnderHue Paralegal…</main>;
  return <Routes>
    <Route path="/sign-in" element={<SignIn session={session} />} />
    <Route element={<Workspace session={session} />}>
      <Route path="/admin/ltb" element={<AdminLtbCases practice={ANDERHUE} />} />
      <Route path="/admin/ltb/cases/:id" element={<AdminLtbCaseDetail practice={ANDERHUE} />} />
      <Route path="*" element={<Navigate to="/admin/ltb" replace />} />
    </Route>
  </Routes>;
}
