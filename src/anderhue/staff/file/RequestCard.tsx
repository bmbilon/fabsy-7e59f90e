import { useState } from 'react';
import { CheckCircle2, MailQuestion } from 'lucide-react';
import { clearRequest, friendlyError } from '../api';
import { calendarDaysSince, formatDate, plural, relativeTime, torontoDateOf } from '../format';
import { notifyError, notifySuccess } from '../notify';
import { Button, Card, CardHead, Chip } from '../ui';
import type { FileView } from './types';

export default function RequestCard({ view, onRequest }: { view: FileView; onRequest: () => void }) {
  const { area, id, record } = view;
  const [busy, setBusy] = useState(false);
  const at = record.client_request_at;
  const message = record.client_request_message;
  const uploaded = record.client_uploaded_at;
  const answered = Boolean(at && uploaded && Date.parse(uploaded) > Date.parse(at));
  const days = at ? calendarDaysSince(at) ?? 0 : 0;

  const clear = async () => {
    setBusy(true);
    try {
      await clearRequest(area, id);
      notifySuccess('Request cleared');
      view.refresh();
    } catch (cause) {
      notifyError('Request not cleared', friendlyError(cause));
    } finally {
      setBusy(false);
    }
  };

  return <Card labelledBy="request-title">
    <CardHead id="request-title" title="Client request" icon={<MailQuestion />}
      actions={at ? <Chip tone={answered ? 'gold' : days >= 3 ? 'warn' : 'info'}>{answered ? 'Answered' : days <= 0 ? 'Open today' : `Open ${plural(days, 'day')}`}</Chip> : undefined} />
    {at ? <>
      <div className="ahs-card-body space-y-3">
        {message && <blockquote className="ahs-quote">{message}</blockquote>}
        <p className="text-[12.5px] text-[color:var(--ah-muted)]">Sent {formatDate(torontoDateOf(at))} · {relativeTime(at)}</p>
        {answered && <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-[#22533c]">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />The client uploaded documents {relativeTime(uploaded)}.
        </p>}
      </div>
      <div className="ahs-card-foot">
        <Button size="sm" variant={answered ? 'primary' : 'secondary'} onClick={() => void clear()} busy={busy}>Clear request</Button>
        {!view.file.terminal && <Button size="sm" variant="ghost" onClick={onRequest} disabled={busy}>Send a new request</Button>}
      </div>
    </> : view.file.terminal ? <div className="ahs-card-body">
      <p className="text-[13px] text-[color:var(--ah-muted)]">This file is closed, so the client cannot upload to it. Move it back to an active stage to ask for documents.</p>
    </div> : <div className="ahs-card-body">
      <p className="text-[13px] text-[color:var(--ah-muted)]">No open request. Ask the client for a document and they get a secure upload link.</p>
      <Button size="sm" variant="secondary" className="mt-3" onClick={onRequest}><MailQuestion aria-hidden="true" />Request documents</Button>
    </div>}
  </Card>;
}
