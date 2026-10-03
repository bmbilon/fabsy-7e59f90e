import { useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import useSafeHead from '@/hooks/useSafeHead';
import { Button, CrestMark, Field, TextInput } from './ui';

function safeTarget(state: unknown): string {
  const from = (state as { from?: { pathname?: string; search?: string } } | null)?.from;
  const path = from?.pathname || '';
  return path.startsWith('/admin/') && !path.startsWith('//') ? `${path}${from?.search || ''}` : '/admin/today';
}

function authMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : '';
  if (/invalid login credentials/i.test(message)) return 'That email and password do not match an account.';
  if (/email not confirmed/i.test(message)) return 'Confirm your email first. Check your inbox for the confirmation link.';
  if (/already registered|already been registered/i.test(message)) return 'An account already exists for this email. Sign in instead.';
  if (/password/i.test(message) && /least/i.test(message)) return 'Use a password with at least 6 characters.';
  if (/fetch|network/i.test(message)) return 'The server could not be reached. Check your connection and try again.';
  return message || 'Unable to sign in. Please try again.';
}

export default function SignInPage({ session }: { session: Session | null }) {
  useSafeHead({ title: 'Sign in | AnderHue Paralegal', robots: 'noindex, nofollow' });
  const location = useLocation();
  const navigate = useNavigate();
  const target = safeTarget(location.state);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reveal, setReveal] = useState(false);
  if (session) return <Navigate to={target} replace />;

  async function submit(event: FormEvent) {
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
        setNotice('Check your email to confirm your account. Your practice administrator will then enable your workspace access.');
        setSignup(false);
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
        navigate(target, { replace: true });
      }
    } catch (cause) {
      setError(authMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return <main className="ahs-root grid min-h-screen lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
    <aside className="ahs-signin-panel hidden min-h-screen flex-col justify-between p-12 lg:flex xl:p-16" aria-label="About the practice workspace">
      <div className="relative z-10 flex items-center gap-3">
        <CrestMark className="h-11 w-11" />
        <div>
          <p className="ahs-brand-name">AnderHue Paralegal</p>
          <p className="ahs-brand-sub mt-1">Professional Corporation</p>
        </div>
      </div>
      <CrestMark className="pointer-events-none absolute -bottom-10 -right-10 h-[340px] w-[340px] opacity-[0.07]" />
      <div className="relative z-10 max-w-[540px]">
        <p className="ahs-eyebrow !text-[color:var(--ah-gold-300)]">Practice workspace</p>
        <p className="ahs-display ahs-signin-title mt-4">Every file, document and client update in one place.</p>
        <p className="mt-6 max-w-[460px] text-[15px] leading-7 text-[rgb(231_223_234)]">
          Landlord and Tenant Board matters and Ontario traffic tickets for the practice, with secure documents and timely updates for every client.
        </p>
      </div>
      <p className="relative z-10 text-[12.5px] text-[rgb(199_187_201)]">Private access for AnderHue Paralegal team members.</p>
    </aside>

    <div className="flex min-h-screen flex-col">
      <header className="ahs-topbar flex items-center gap-3 px-5 py-4 lg:hidden">
        <CrestMark className="h-9 w-9" />
        <div>
          <p className="ahs-brand-name !text-[14px]">AnderHue Paralegal</p>
          <p className="ahs-brand-sub mt-0.5 !text-[9.5px]">Practice workspace</p>
        </div>
      </header>
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <section className="w-full max-w-[408px]" aria-labelledby="signin-title">
          <p className="ahs-eyebrow">{signup ? 'New team account' : 'Team sign in'}</p>
          <h1 id="signin-title" className="ahs-display ahs-page-title mt-3">{signup ? 'Create your account' : 'Welcome back'}</h1>
          <p className="mt-3 text-[14px] leading-6 text-[color:var(--ah-ink-2)]">
            {signup ? 'Register with the email your practice administrator has on file.' : 'Sign in to the AnderHue Paralegal practice workspace.'}
          </p>
          <form onSubmit={submit} className="ahs-card mt-7 space-y-4 p-5 sm:p-6">
            <Field id="email" label="Email address">
              <TextInput id="email" type="email" autoComplete="email" value={email} required disabled={busy}
                onChange={event => setEmail(event.target.value)} className="!h-10" />
            </Field>
            <Field id="password" label="Password">
              <div className="relative">
                <TextInput id="password" type={reveal ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'}
                  minLength={signup ? 6 : undefined} value={password} required disabled={busy}
                  onChange={event => setPassword(event.target.value)} className="!h-10 !pr-11" />
                <button type="button" onClick={() => setReveal(value => !value)} aria-pressed={reveal}
                  aria-label={reveal ? 'Hide the password' : 'Show the password'}
                  className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-[5px] text-[color:var(--ah-muted)] hover:bg-[color:var(--ah-ivory-100)] hover:text-[color:var(--ah-ink)]">
                  {reveal ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </Field>
            {error && <p role="alert" className="rounded-[6px] bg-[color:var(--ah-danger-soft)] px-3 py-2 text-[13px] leading-5 text-[#7d1a12]">{error}</p>}
            {notice && <p role="status" className="rounded-[6px] bg-[color:var(--ah-success-soft)] px-3 py-2 text-[13px] leading-5 text-[#22533c]">{notice}</p>}
            <Button type="submit" variant="primary" block disabled={busy} className="!h-11 !text-[14px]">
              {busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
            </Button>
          </form>
          <button type="button" disabled={busy}
            className="ahs-link mx-auto mt-5 block text-center text-[13.5px] disabled:opacity-50"
            onClick={() => { setSignup(!signup); setError(''); setNotice(''); }}>
            {signup ? 'Already registered? Sign in' : 'First time here? Create an account'}
          </button>
          <p className="mt-8 text-center text-[12px] text-[color:var(--ah-muted)] lg:hidden">Private access for AnderHue Paralegal team members.</p>
        </section>
      </div>
    </div>
  </main>;
}
