import { useEffect, useRef, useState } from 'react';
import { Mail, MailWarning } from 'lucide-react';
import { cancelNotice, friendlyError } from '../api';
import { formatDateTime } from '../format';
import { useNow } from '../hooks';
import { NOTICE_KIND_LABELS, noticeStatusInfo, noticeSummary } from '../model';
import { notifyError, notifySuccess } from '../notify';
import { Button, Card, CardHead, Chip, EmptyState } from '../ui';
import type { FileView } from './types';

/** Client updates for this file (practice_notices, allowed columns only). */
export default function NoticesCard({ view }: { view: FileView }) {
  const { area, notices, updatesOn } = view;
  const pending = notices.some(notice => notice.status === 'pending');
  const now = useNow(1000, pending);
  const [busy, setBusy] = useState<string | null>(null);
  const refreshed = useRef<Set<string>>(new Set());

  // When a scheduled update reaches its send time, refresh to pick up the new status.
  useEffect(() => {
    for (const notice of notices) {
      if (notice.status !== 'pending' || !notice.next_attempt_at || refreshed.current.has(notice.id)) continue;
      if (Date.parse(notice.next_attempt_at) + 5000 < now) {
        refreshed.current.add(notice.id);
        view.refresh();
      }
    }
  }, [now, notices, view]);

  const cancel = async (id: string) => {
    setBusy(id);
    try {
      const cancelled = await cancelNotice(id);
      if (cancelled) notifySuccess('Client update cancelled', 'The email will not be sent.');
      else notifyError('Too late to cancel', 'That email has already gone out or was cancelled.');
      view.refresh();
    } catch (cause) {
      notifyError('Not cancelled', friendlyError(cause));
    } finally {
      setBusy(null);
    }
  };

  return <Card labelledBy="notices-title">
    <CardHead id="notices-title" title="Client updates" icon={<Mail />}
      sub={updatesOn ? 'Emails to the client about this file.' : 'Client emails are off for this practice. Nothing will be sent.'} />
    {notices.length ? <ul className="ahs-divide px-4">
      {notices.map(notice => {
        const status = noticeStatusInfo(notice, now);
        const summary = noticeSummary(area, notice);
        return <li key={notice.id} className="flex items-start gap-3 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[13px] font-semibold text-[color:var(--ah-ink)]">{NOTICE_KIND_LABELS[notice.kind] || notice.kind}</span>
              <Chip tone={status.tone}>{status.label}</Chip>
            </div>
            {summary && <p className="mt-0.5 line-clamp-2 text-[12.5px] text-[color:var(--ah-ink-2)]">{summary}</p>}
            <p className="mt-0.5 text-[11.5px] text-[color:var(--ah-muted)]">
              {status.pending ? <span className="ahs-num font-medium text-[#644a1e]" aria-live="off">{status.note}</span> : status.note}
              {!status.pending && status.label !== 'Sent' && <> · Queued {formatDateTime(notice.created_at)}</>}
            </p>
          </div>
          {status.pending && <Button size="xs" variant="secondary" onClick={() => void cancel(notice.id)} busy={busy === notice.id}
            aria-label={`Cancel the ${(NOTICE_KIND_LABELS[notice.kind] || 'client update').toLowerCase()} email`}>Cancel</Button>}
        </li>;
      })}
    </ul>
      : <EmptyState compact icon={updatesOn ? <Mail /> : <MailWarning />} title="No client emails yet">
        {updatesOn ? 'Stage updates, document requests and shared documents are emailed here.' : 'Turn on client emails when the practice email domain is ready.'}
      </EmptyState>}
  </Card>;
}
