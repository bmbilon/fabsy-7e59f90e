import { Clock, Lock, LogOut } from 'lucide-react';
import { formatDate } from '../lib/format';
import { usePortal } from './PortalContext';

/** Whose file this is, and sign out. */
export default function AccountBar() {
  const { session, signOut } = usePortal();
  const email = session.data?.client.email;
  return (
    <div className="ahc-account border-b border-[color:var(--ah-line)]">
      <p className="flex min-w-0 items-center gap-2">
        <Lock size={14} aria-hidden="true" className="shrink-0 text-[color:var(--ah-plum-600)]" />
        <span className="min-w-0 truncate">
          {email ? (
            <>
              <span className="hidden sm:inline">Signed in as </span>
              <strong className="font-semibold text-[color:var(--ah-ink)]">{email}</strong>
            </>
          ) : 'Signed in with your secure link'}
        </span>
      </p>
      <button type="button" className="ahc-btn ahc-btn--ghost ahc-btn--sm -mr-2 shrink-0" onClick={signOut}>
        <LogOut size={16} aria-hidden="true" />
        Sign out
      </button>
    </div>
  );
}

/** When the link stops working, and "Remember this device" (off by default; keeps the link in this browser). */
export function DeviceNote() {
  const { session, remembered, setRemembered } = usePortal();
  const expires = formatDate(session.data?.expiresAt ?? null);
  return (
    <div className="mt-10 grid gap-4 border-t border-[color:var(--ah-line)] pt-6 text-[14px] leading-relaxed text-[color:var(--ah-muted)] md:grid-cols-2 md:gap-10">
      {expires ? (
        <p className="flex items-start gap-2">
          <Clock size={15} aria-hidden="true" className="mt-1 shrink-0" />
          <span>This secure link works until {expires}. After that, you can ask for a new link with your email address.</span>
        </p>
      ) : <span />}
      <div>
        <label className="ahc-check ahc-check--strong">
          <input type="checkbox" checked={remembered} onChange={event => setRemembered(event.target.checked)} aria-describedby="remember-hint" />
          Remember this device
        </label>
        <p id="remember-hint" className="-mt-2 ml-7 max-w-[22rem]">Stay signed in here until the link expires. Leave this off on a shared computer.</p>
      </div>
    </div>
  );
}
