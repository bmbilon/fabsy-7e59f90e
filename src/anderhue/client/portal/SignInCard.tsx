import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, Inbox, KeyRound, MailCheck, RefreshCw, ShieldCheck } from 'lucide-react';
import { ANDERHUE_PRACTICE } from '../../config';
import { ApiError, defaultErrorMessage, portal } from '../api';
import { PORTAL_LINK_DAYS } from '../catalog';
import { Alert, Button, Field } from '../components/ui';
import { useCountdown } from '../lib/hooks';
import { waitForHumanPace } from '../lib/uploads';
import { isValidEmail } from '../start/intake';
import type { PortalNotice } from './PortalContext';

const RESEND_SECONDS = 60;

function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** No token: ask for the email on file and send a fresh secure link. Never says whether the email has a file. */
export default function SignInCard({ notice }: { notice: PortalNotice }) {
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [resendAt, setResendAt] = useState<number | null>(null);
  const secondsLeft = useCountdown(resendAt);
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (sentTo) heading.current?.focus({ preventScroll: true });
  }, [sentTo]);

  const request = async (address: string, isResend: boolean) => {
    setBusy(true);
    setError(null);
    setResent(false);
    try {
      const elapsedMs = await waitForHumanPace();
      await portal.requestLink({ practiceId: ANDERHUE_PRACTICE.practiceId, email: address, company, elapsedMs });
      setSentTo(address);
      setResendAt(Date.now() + RESEND_SECONDS * 1000);
      if (isResend) setResent(true);
    } catch (caught) {
      const status = caught instanceof ApiError ? caught.status : 500;
      if (status === 422) setError('Check your email address and try again.');
      else if (status === 429) setError('Too many requests from this connection. Please wait a few minutes and try again, or call us.');
      else if (status === 403) setError('We could not send a link from this page. Please call or email us.');
      else setError(caught instanceof ApiError ? caught.message : defaultErrorMessage(500));
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!isValidEmail(address)) {
      setError(address ? 'Enter an email address like name@example.com.' : 'Enter the email address you used for your file.');
      input.current?.focus();
      return;
    }
    void request(address, false);
  };

  if (sentTo) {
    return (
      <div className="mx-auto w-full max-w-[520px] px-4 pb-16 pt-8 sm:pt-14">
        <section className="ahc-card ahc-card-pad" aria-labelledby="check-title">
          <span className="ahc-drop-icon" aria-hidden="true"><MailCheck size={24} /></span>
          <h1 id="check-title" ref={heading} tabIndex={-1} className="ah-display mt-5 text-[30px] sm:text-[34px]">Check your email</h1>
          <p className="mt-3 text-[16px] leading-relaxed text-[color:var(--ah-ink-2)]">
            If <strong className="font-semibold text-[color:var(--ah-ink)] [overflow-wrap:anywhere]">{sentTo}</strong> matches a file with us, we will email a secure link to that address.
          </p>
          <ul className="mt-6 grid gap-4 text-[15px] text-[color:var(--ah-ink-2)]">
            <li className="flex gap-3"><KeyRound size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[color:var(--ah-plum-600)]" /><span>The link opens your file directly. No password needed.</span></li>
            <li className="flex gap-3"><Clock size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[color:var(--ah-plum-600)]" /><span>Links expire after {PORTAL_LINK_DAYS} days. You can ask for a fresh one here any time.</span></li>
            <li className="flex gap-3"><Inbox size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[color:var(--ah-plum-600)]" /><span>Not in your inbox? Check your spam or junk folder for a message from {ANDERHUE_PRACTICE.name}.</span></li>
          </ul>
          {resent ? <Alert tone="success" className="mt-6">We sent another link.</Alert> : null}
          {error ? <Alert tone="error" className="mt-6">{error}</Alert> : null}
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button
              variant="secondary"
              icon={RefreshCw}
              busy={busy}
              disabled={secondsLeft > 0}
              onClick={() => void request(sentTo, true)}
              className="sm:flex-1"
            >
              {secondsLeft > 0 ? <span>Resend link in <span className="ah-mono">{formatCountdown(secondsLeft)}</span></span> : 'Resend link'}
            </Button>
            <Button
              variant="ghost"
              icon={ArrowLeft}
              onClick={() => { setSentTo(null); setResendAt(null); setResent(false); setError(null); window.requestAnimationFrame(() => input.current?.focus()); }}
            >
              Use a different email
            </Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[520px] px-4 pb-16 pt-8 sm:pt-14">
      <section className="ahc-card ahc-card-pad" aria-labelledby="open-title">
        <span className="ahc-drop-icon" aria-hidden="true"><KeyRound size={22} /></span>
        <h1 id="open-title" className="ah-display mt-5 text-[32px] sm:text-[38px]">Open your file</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-[color:var(--ah-ink-2)]">
          Enter the email you used when you started your file. We will send you a secure link that opens it.
        </p>
        {notice === 'expired' ? (
          <Alert tone="info" className="mt-5">That link has expired. Enter your email and we will send a fresh one.</Alert>
        ) : notice === 'signed_out' ? (
          <Alert tone="success" className="mt-5">You have signed out on this device.</Alert>
        ) : null}
        <form className="mt-6 grid gap-5" noValidate onSubmit={submit}>
          <Field id="portal-email" label="Email" error={error || undefined}>
            {control => (
              <input
                {...control}
                ref={input}
                className="ahc-input"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={254}
                value={email}
                onChange={event => { setEmail(event.target.value); setError(null); }}
              />
            )}
          </Field>
          <div className="ahc-hp" aria-hidden="true">
            <label htmlFor="portal-hp-field">Leave this field empty</label>
            <input id="portal-hp-field" name="hp_field" tabIndex={-1} autoComplete="off" value={company} onChange={event => setCompany(event.target.value)} />
          </div>
          <Button type="submit" variant="primary" block busy={busy}>Email me a secure link</Button>
        </form>
        <p className="mt-6 flex items-start gap-2 text-[14px] text-[color:var(--ah-muted)]">
          <ShieldCheck size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>For your privacy, we only send links to the email address on your file.</span>
        </p>
      </section>
      <p className="mt-6 text-center text-[15px] text-[color:var(--ah-ink-2)]">
        New here? <Link to="/start" className="ahc-link">Start a file</Link>
      </p>
    </div>
  );
}
