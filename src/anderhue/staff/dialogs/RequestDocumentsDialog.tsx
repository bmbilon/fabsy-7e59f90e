import { useEffect, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { friendlyError, requestDocuments } from '../api';
import { formatDate, torontoDateOf } from '../format';
import { REQUEST_SUGGESTIONS } from '../model';
import { notifySuccess } from '../notify';
import { Button, Field, StaffDialog, TextArea } from '../ui';
import type { FileView } from '../file/types';

export default function RequestDocumentsDialog({ open, onOpenChange, view }: {
  open: boolean; onOpenChange: (open: boolean) => void; view: FileView;
}) {
  const { area, id, updatesOn, record } = view;
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const suggestions = REQUEST_SUGGESTIONS[area];

  useEffect(() => { if (open) { setMessage(''); setError(''); } }, [open]);

  const lines = message.split('\n');
  const has = (line: string) => lines.some(item => item.trim() === line);
  const toggle = (line: string) => {
    setError('');
    setMessage(current => {
      const existing = current.split('\n');
      if (existing.some(item => item.trim() === line)) return existing.filter(item => item.trim() !== line).join('\n').replace(/^\n+|\n+$/g, '');
      const base = current.replace(/\s+$/, '');
      return base ? `${base}\n${line}` : line;
    });
  };

  const submit = async () => {
    const text = message.trim();
    if (!text) { setError('Write a message, or pick one of the suggestions.'); return; }
    if (text.length > 1000) { setError('Keep the message under 1,000 characters.'); return; }
    setBusy(true);
    setError('');
    try {
      await requestDocuments(area, id, text);
      onOpenChange(false);
      view.refresh();
      notifySuccess('Request sent', updatesOn
        ? 'The client gets an email with a secure link to upload.'
        : 'Saved to the client’s file. Client emails are off, so let the client know another way.');
    } catch (cause) {
      setError(friendlyError(cause, 'The request could not be sent. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return <StaffDialog open={open} onOpenChange={onOpenChange} busy={busy} onSubmit={submit} className="!max-w-[560px]"
    title="Request documents" description={`${view.number} · ${view.file.clientName}`}
    footer={<>
      <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
      <Button type="submit" variant="primary" busy={busy}>Send request</Button>
    </>}>
    <div className="space-y-4">
      <div>
        <p className="ahs-label" id="request-suggestions-label">Suggestions</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="request-suggestions-label">
          {suggestions.map(item => {
            const active = has(item.line);
            return <button key={item.label} type="button" className="ahs-filter" aria-pressed={active} onClick={() => toggle(item.line)} disabled={busy}>
              {active ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}{item.label}
            </button>;
          })}
        </div>
      </div>
      <Field id="request-message" label="Message to the client" error={error || null}
        help={updatesOn ? 'The client gets an email with this message and a secure link to upload.'
          : 'Client emails are off for this practice. The request shows in the client’s file, but no email is sent.'}
        extra={<span className="ahs-counter ml-auto">{message.length} / 1,000</span>}>
        <TextArea id="request-message" rows={6} maxLength={1000} value={message} disabled={busy} data-autofocus
          onChange={event => { setMessage(event.target.value); setError(''); }}
          aria-invalid={!!error} aria-describedby={error ? 'request-message-error' : 'request-message-help'}
          placeholder="Tell the client exactly what you need and why." />
      </Field>
      {record.client_request_at && <p className="rounded-[6px] bg-[color:var(--ah-ivory-100)] px-3 py-2 text-[12.5px] text-[color:var(--ah-ink-2)]">
        This replaces the open request from {formatDate(torontoDateOf(record.client_request_at))}.
      </p>}
    </div>
  </StaffDialog>;
}
