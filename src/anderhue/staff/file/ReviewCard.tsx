import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, MessageSquareQuote } from 'lucide-react';
import { friendlyError, updateFile } from '../api';
import { notifyError, notifySuccess } from '../notify';
import { Button, Card, CardHead, Field, ReviewPill, TextArea } from '../ui';
import type { FileView } from './types';

export default function ReviewCard({ view }: { view: FileView }) {
  const { record, area, id, reading } = view;
  const saved = (record.review_notes as string | null) || '';
  const [notes, setNotes] = useState(saved);
  const [busy, setBusy] = useState<'save' | 'review' | null>(null);
  const dirty = notes !== saved;

  // Keep in step with refetches unless the notes are being edited.
  useEffect(() => { if (!dirty) setNotes(saved); }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (kind: 'save' | 'review') => {
    setBusy(kind);
    try {
      await updateFile(area, id, {
        ...(dirty || kind === 'save' ? { review_notes: notes.trim().slice(0, 4000) || null } : {}),
        ...(kind === 'review' ? { intake_review_status: 'ready' } : {}),
      });
      notifySuccess(kind === 'review' ? 'Marked reviewed' : 'Notes saved');
      view.refresh();
    } catch (cause) {
      notifyError(kind === 'review' ? 'Not marked reviewed' : 'Notes not saved', friendlyError(cause));
    } finally {
      setBusy(null);
    }
  };

  const clientNotes = (record.client_notes as string | null)?.trim();
  const arrears = area === 'ltb' ? (record.arrears_reported_text as string | null) : null;
  const status = record.intake_review_status;

  return <Card labelledBy="review-title">
    <CardHead id="review-title" title="Review" icon={<MessageSquareQuote />}
      sub={status === 'needs_review' ? 'Check the intake against the originals, then mark it reviewed.'
        : reading ? 'Documents are being read. Fields fill in when reading finishes.'
          : 'Intake reviewed. Keep notes here as the file moves.'}
      actions={<ReviewPill status={status} />} />
    <div className="ahs-card-body space-y-4">
      {reading && <p role="status" className="flex items-center gap-2 rounded-[6px] bg-[#efe8f2] px-3 py-2 text-[12.5px] font-medium text-[#4f2c69]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Reading documents. This usually takes under a minute.
      </p>}
      <figure>
        <figcaption className="ahs-label">In the client’s words</figcaption>
        {clientNotes ? <blockquote className="ahs-quote mt-1">{clientNotes}</blockquote>
          : <p className="mt-1 text-[13px] text-[color:var(--ah-muted)]">The client did not add notes.</p>}
      </figure>
      {arrears && <p className="text-[13px] text-[color:var(--ah-ink-2)]">Client’s estimate of arrears: <strong className="font-semibold text-[color:var(--ah-ink)]">{arrears}</strong></p>}
      <Field id="review-notes" label="Internal review notes" help="Staff only. Never shown to the client."
        extra={<span className="ahs-counter ml-auto">{notes.length.toLocaleString('en-CA')} / 4,000</span>}>
        <TextArea id="review-notes" rows={6} value={notes} maxLength={4000} disabled={reading || busy !== null}
          onChange={event => setNotes(event.target.value)} aria-describedby="review-notes-help" />
      </Field>
    </div>
    <div className="ahs-card-foot">
      <Button size="sm" variant="secondary" onClick={() => void run('save')} disabled={!dirty || reading || busy !== null} busy={busy === 'save'}>
        Save notes
      </Button>
      {status === 'needs_review' && <Button size="sm" variant="primary" onClick={() => void run('review')} disabled={busy !== null} busy={busy === 'review'}>
        {busy !== 'review' && <CheckCircle2 aria-hidden="true" />}Mark reviewed
      </Button>}
      {dirty && <span className="ml-auto text-[12px] text-[color:var(--ah-muted)]">Unsaved changes</span>}
    </div>
  </Card>;
}
