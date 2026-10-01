import { useEffect, useState } from 'react';
import { friendlyError, setClientEmail } from '../api';
import { notifySuccess } from '../notify';
import { Button, Field, StaffDialog, TextInput } from '../ui';

/**
 * Corrects a client's email through practice_set_client_email. The address is
 * shared by every file for the client; the server signs the client out of
 * every link already sent and cancels updates that have not gone out.
 */
export default function ChangeEmailDialog({ open, onOpenChange, clientId, clientName, currentEmail, onChanged }: {
  open: boolean; onOpenChange: (open: boolean) => void; clientId: string; clientName: string; currentEmail: string;
  onChanged: (email: string) => void;
}) {
  const [email, setEmail] = useState(currentEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setEmail(currentEmail);
    setError('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const typed = email.trim().toLowerCase();
  const unchanged = !typed || typed === currentEmail.trim().toLowerCase();

  const submit = async () => {
    if (unchanged) {
      setError(typed ? 'This is the current address. Enter the new one.' : 'Enter the new email address.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const stored = await setClientEmail(clientId, email);
      onOpenChange(false);
      onChanged(stored);
      notifySuccess('Client email changed', `Updates now go to ${stored}. Links sent to the old address no longer work.`);
    } catch (cause) {
      setError(friendlyError(cause, 'The email address could not be changed. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return <StaffDialog open={open} onOpenChange={onOpenChange} busy={busy} onSubmit={submit} className="!max-w-[500px]"
    title="Change client email" description={`${clientName} · ${currentEmail}`}
    footer={<>
      <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
      <Button type="submit" variant="primary" busy={busy} disabled={unchanged}>Change email</Button>
    </>}>
    <div className="space-y-4">
      <Field id="client-new-email" label="New email address" error={error || null}
        help="It applies to every file for this client. Addresses are saved in lowercase.">
        <TextInput id="client-new-email" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false}
          maxLength={254} value={email} disabled={busy} data-autofocus
          onFocus={event => event.currentTarget.select()}
          onChange={event => { setEmail(event.target.value); setError(''); }}
          aria-invalid={!!error} aria-describedby={error ? 'client-new-email-error' : 'client-new-email-help'} />
      </Field>
      <div className="rounded-[6px] border border-[color:var(--ahs-line-soft)] bg-[color:var(--ah-ivory-50)] px-3.5 py-3 text-[13px] leading-5 text-[color:var(--ah-ink-2)]">
        <p className="font-semibold text-[color:var(--ah-ink)]">When you save</p>
        <p className="mt-0.5">The client is signed out of every link we sent, and unsent updates are cancelled. New updates go to the new address.</p>
      </div>
    </div>
  </StaffDialog>;
}
