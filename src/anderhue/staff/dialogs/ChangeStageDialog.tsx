import { useEffect, useMemo, useState } from 'react';
import { EyeOff } from 'lucide-react';
import { ANDERHUE_PRACTICE } from '@/anderhue/config';
import {
  OUTCOMES, PHASES, STAGES, STAGE_NOTICE_DELAY_SECONDS, formatLongDate, stageDef, staffStageLabel, torontoToday,
  type PracticeArea,
} from '../catalog';
import { cancelNotice, friendlyError, setStage } from '../api';
import { PORTAL_HOLD_LABEL, clientGreetingName, laneStages, stageHeadline, stageWithOutcome } from '../model';
import { notifyError, notifySuccess, notifyWithAction } from '../notify';
import { Button, Field, SelectInput, StaffDialog, TextArea, Toggle } from '../ui';
import type { FileView } from '../file/types';

interface PreviewDate { label: string; date: string }

function previewDates(view: FileView): PreviewDate[] {
  const record = view.record as Record<string, unknown>;
  const today = torontoToday();
  const deadlineSource = (record.field_sources as Record<string, { source?: string; confidence?: string }> | null)?.option_deadline;
  const source = deadlineSource?.confidence === 'low' ? 'estimate' : deadlineSource?.source;
  const candidates: [string, unknown][] = view.area === 'ltb'
    ? [['Earliest termination date', record.notice_termination_date], ['Hearing date', record.hearing_date]]
    : view.area === 'traffic'
      ? [[source === 'staff' ? 'Response deadline' : 'Response deadline (estimate)', record.option_deadline],
        ['Meeting with the prosecutor', record.meeting_date], ['Trial date', record.trial_date]]
      : [['Deadline', record.deadline_date]];
  return candidates
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry[1]) && entry[1] >= today)
    .map(([label, date]) => ({ label, date }));
}

function defaultStage(area: PracticeArea, current: string): string {
  const path = laneStages(area);
  const index = path.findIndex(item => item.value === current);
  if (index >= 0 && index < path.length - 1) return path[index + 1].value;
  if (index === path.length - 1) return 'closed';
  return current;
}

function EmailPreview({ view, stage, outcome, message, practiceName }: {
  view: FileView; stage: string; outcome: string; message: string; practiceName: string;
}) {
  const def = stageDef(view.area, stage);
  const headline = stageHeadline(view.area, stage, stage === 'closed' ? outcome || null : stage === 'declined' ? 'declined' : null);
  const name = clientGreetingName(view.client);
  const dates = previewDates(view);
  return <div className="ahs-email-frame" aria-label="Email preview">
    <dl className="mb-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12px]">
      <dt className="text-[color:var(--ah-muted)]">From</dt><dd className="truncate text-[color:var(--ah-ink-2)]">{practiceName} · files@anderhue.ca</dd>
      <dt className="text-[color:var(--ah-muted)]">To</dt><dd className="truncate text-[color:var(--ah-ink-2)]">{view.client.email}</dd>
      <dt className="text-[color:var(--ah-muted)]">Subject</dt>
      <dd className="font-semibold text-[color:var(--ah-ink)]" data-testid="email-preview-subject">{view.number} · {headline}</dd>
    </dl>
    <div className="ahs-email">
      <img src="/crest-email.png" alt="" aria-hidden="true" width={44} height={44} className="h-11 w-11" />
      <p className="mt-4">{name ? `Hi ${name},` : 'Hello,'}</p>
      <p className="mt-2 text-[17px] font-bold leading-snug text-[color:var(--ah-plum-950)]">{headline}</p>
      <p className="mt-2 text-[color:var(--ah-ink-2)]">{def?.clientNext}</p>
      {message.trim() && <blockquote className="mt-3 whitespace-pre-wrap border-l-[3px] border-[color:var(--ah-gold-500)] bg-[color:var(--ahs-gold-tint)] px-3.5 py-2.5 text-[13.5px] text-[color:var(--ah-ink)]">
        {message.trim()}
      </blockquote>}
      {dates.length > 0 && <ul className="mt-3 space-y-0.5 text-[13px]">
        {dates.map(item => <li key={item.label}><span className="text-[color:var(--ah-muted)]">{item.label}:</span> <strong className="font-semibold">{formatLongDate(item.date)}</strong></li>)}
      </ul>}
      <span className="ahs-email-button mt-4" aria-hidden="true">View your file</span>
      <p className="mt-5 border-t border-[#efe7dc] pt-3 text-[11.5px] leading-5 text-[color:var(--ah-muted)]">
        {ANDERHUE_PRACTICE.phoneDisplay} · {ANDERHUE_PRACTICE.publicEmail}<br />
        {ANDERHUE_PRACTICE.legalName}. Representation begins only after a written retainer.
      </p>
    </div>
  </div>;
}

export default function ChangeStageDialog({ open, onOpenChange, view, practiceName }: {
  open: boolean; onOpenChange: (open: boolean) => void; view: FileView; practiceName: string;
}) {
  const { area, id, record, updatesOn } = view;
  const current = record.stage;
  const [stage, setStageValue] = useState(() => defaultStage(area, current));
  const [outcome, setOutcome] = useState('');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const def = stageDef(area, stage);
  const canNotify = updatesOn && Boolean(def?.notify);

  useEffect(() => {
    if (!open) return;
    const initial = defaultStage(area, current);
    setStageValue(initial);
    setOutcome(record.outcome && current === 'closed' ? record.outcome : '');
    setNote('');
    setMessage('');
    setError('');
    setNotify(updatesOn && Boolean(stageDef(area, initial)?.notify));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseStage = (value: string) => {
    setStageValue(value);
    setError('');
    setNotify(updatesOn && Boolean(stageDef(area, value)?.notify));
    if (value !== 'closed') setOutcome('');
  };

  const unchanged = stage === current && (stage !== 'closed' || (outcome || null) === (record.outcome || null));
  // Same stage, new outcome: practice_set_stage corrects a closed file's outcome and, with an email, queues a fresh update.
  const correction = stage === current && !unchanged;
  const needsOutcome = stage === 'closed' && !outcome;
  const reveals = view.file.portalHidden && stage !== 'new_intake';
  const groups = useMemo(() => PHASES.map(phase => ({
    ...phase, stages: STAGES[area].filter(item => item.phase === phase.value),
  })).filter(group => group.stages.length), [area]);

  const submit = async () => {
    if (unchanged) { setError('Choose a different stage.'); return; }
    if (needsOutcome) { setError('Choose an outcome before closing the file.'); return; }
    setBusy(true);
    setError('');
    const sendEmail = canNotify && notify;
    try {
      const result = await setStage({ area, id, stage, outcome: stage === 'closed' ? outcome : null, note, message, notify: sendEmail });
      onOpenChange(false);
      view.refresh();
      const label = stageWithOutcome(area, result.stage, result.outcome);
      const done = correction ? 'Outcome corrected' : 'Stage updated';
      if (result.noticeId) {
        const noticeId = result.noticeId;
        notifyWithAction({
          title: `${done}. The client update goes out in about ${Math.round(STAGE_NOTICE_DELAY_SECONDS)} seconds.`,
          description: `${view.number} is now ${label}.`,
          actionLabel: 'Undo',
          altText: 'Undo the client update email',
          onAction: () => {
            // practice_cancel_notice stops it while it is scheduled or waiting to retry.
            void cancelNotice(noticeId).then(cancelled => {
              view.refresh();
              if (cancelled) notifySuccess('Client update cancelled', `The email will not be sent. The file stays at ${label}.`);
              else notifyError('Too late to undo', 'That email is no longer waiting to be sent.');
            }).catch(cause => notifyError('Not cancelled', friendlyError(cause)));
          },
        });
      } else {
        notifySuccess(`${done}.`, sendEmail
          ? `${view.number} is now ${label}.`
          : updatesOn ? `${view.number} is now ${label}. No email was sent.` : `${view.number} is now ${label}. Client emails are off for this practice.`);
      }
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  };

  const notifyHelp = !updatesOn ? 'Client emails are off for this practice. Nothing will be sent.'
    : !def?.notify ? `Moving to ${def?.staffLabel || 'this stage'} does not email the client.`
      : notify ? `Sends about ${STAGE_NOTICE_DELAY_SECONDS} seconds after you save, so you can undo a slip.`
        : 'The client sees the new stage in their file, without an email.';

  return <StaffDialog open={open} onOpenChange={onOpenChange} wide busy={busy} onSubmit={submit}
    title="Change stage" description={<>{view.number} · {view.file.clientName} · now <strong className="font-semibold text-[color:var(--ah-ink-2)]">{staffStageLabel(area, current)}</strong></>}
    footer={<>
      <span className="mr-auto hidden text-[11.5px] text-[color:var(--ah-muted)] sm:inline">Ctrl or ⌘ + Enter to save</span>
      <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
      <Button type="submit" variant="primary" busy={busy} disabled={unchanged || needsOutcome}>Update stage</Button>
    </>}>
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="space-y-4">
        <Field id="stage-select" label="New stage">
          <SelectInput id="stage-select" value={stage} onChange={event => chooseStage(event.target.value)} disabled={busy} data-autofocus>
            {groups.map(group => <optgroup key={group.value} label={group.label}>
              {group.stages.map(item => <option key={item.value} value={item.value}>
                {item.staffLabel}{item.value === current ? ' (current)' : ''}
              </option>)}
            </optgroup>)}
          </SelectInput>
        </Field>
        {stage === 'closed' && <Field id="stage-outcome" label="Outcome" error={needsOutcome && error ? 'Choose an outcome before closing the file.' : null}>
          <SelectInput id="stage-outcome" value={outcome} onChange={event => { setOutcome(event.target.value); setError(''); }} disabled={busy}
            aria-invalid={needsOutcome && !!error}>
            <option value="">Choose an outcome</option>
            {OUTCOMES[area].map(item => <option key={item.value} value={item.value}>{item.staffLabel}</option>)}
          </SelectInput>
        </Field>}
        {stage === 'declined' && <p className="rounded-[6px] bg-[color:var(--ah-ivory-100)] px-3 py-2 text-[12.5px] text-[color:var(--ah-ink-2)]">
          The outcome is recorded as Declined.
        </p>}
        {reveals && <p className="flex gap-2 rounded-[6px] border border-dashed border-[#c9bcc8] bg-[#fbf8f3] px-3 py-2 text-[12.5px] leading-5 text-[color:var(--ah-ink-2)]">
          <EyeOff className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[#6f5f78]" aria-hidden="true" />
          <span>{PORTAL_HOLD_LABEL}. Moving it out of New intake adds it to the client’s files.</span>
        </p>}
        <Field id="stage-note" label="Internal note" help="Staff only. Saved in the file activity."
          extra={<span className="ahs-counter ml-auto">{note.length} / 1,000</span>}>
          <TextArea id="stage-note" rows={2} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} disabled={busy} />
        </Field>
        <div className="rounded-[6px] border border-[color:var(--ahs-line-soft)] bg-[color:var(--ah-ivory-50)] p-3.5">
          <div className="flex items-start gap-3">
            <Toggle id="stage-notify" checked={canNotify && notify} disabled={!canNotify || busy} onCheckedChange={setNotify} />
            <div className="min-w-0">
              <label htmlFor="stage-notify" className="block cursor-pointer text-[13.5px] font-semibold leading-5 text-[color:var(--ah-ink)]">Email the client</label>
              <p className="mt-0.5 text-[12.5px] leading-5 text-[color:var(--ah-muted)]">{notifyHelp}</p>
            </div>
          </div>
          {canNotify && notify && <div className="mt-3">
            <Field id="stage-message" label="Personal message (optional)" help="Appears in the email under the update."
              extra={<span className="ahs-counter ml-auto">{message.length} / 1,000</span>}>
              <TextArea id="stage-message" rows={3} maxLength={1000} value={message} onChange={event => setMessage(event.target.value)} disabled={busy}
                placeholder="For example: I will call you on Thursday to go over the next step." />
            </Field>
          </div>}
        </div>
        {error && !needsOutcome && <p role="alert" className="rounded-[6px] bg-[color:var(--ah-danger-soft)] px-3 py-2 text-[13px] text-[#7d1a12]">{error}</p>}
      </div>
      <div className="min-w-0">
        <p className="ahs-label">Client email preview</p>
        {canNotify && notify
          ? <EmailPreview view={view} stage={stage} outcome={outcome} message={message} practiceName={practiceName} />
          : <div className="ahs-email-frame flex min-h-[220px] items-center justify-center text-center">
            <p className="max-w-[260px] text-[13px] leading-6 text-[color:var(--ah-muted)]">
              No email will be sent. The client sees the new stage the next time they open their file.
            </p>
          </div>}
      </div>
    </div>
  </StaffDialog>;
}
