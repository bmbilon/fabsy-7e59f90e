import { useId, useRef, useState, type DragEvent } from 'react';
import { AlertCircle, CheckCircle2, CloudUpload, Loader2 } from 'lucide-react';
import { DOCUMENT_KINDS, UPLOAD_LIMITS, type PracticeArea } from '../catalog';
import { addStaffDocument, friendlyError, uploadProblem, type UploadStep } from '../api';
import { cleanDisplayText, formatBytes, plural } from '../format';
import { notifyError, notifySuccess } from '../notify';
import { Button, Field, SelectInput } from '../ui';

type ItemState = 'queued' | UploadStep | 'done' | 'failed';

interface Item {
  key: string;
  name: string;
  size: number;
  state: ItemState;
  error?: string;
}

const STEP_LABEL: Record<ItemState, string> = {
  queued: 'Waiting', preparing: 'Preparing', uploading: 'Uploading', confirming: 'Confirming', done: 'Added', failed: 'Failed',
};

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif';

/** Staff document upload: kind, optional sharing, drop zone or file picker, per-file progress. */
export default function StaffUploader({ area, id, updatesOn, held = false, onUploaded }: {
  area: PracticeArea; id: string; updatesOn: boolean; held?: boolean; onUploaded: () => void;
}) {
  const uid = useId();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState('');
  const [share, setShare] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const busy = items.some(item => !['done', 'failed'].includes(item.state));

  const patch = (key: string, next: Partial<Item>) => setItems(current => current.map(item => item.key === key ? { ...item, ...next } : item));

  const start = async (list: File[]) => {
    if (!list.length || busy) return;
    const batch = list.slice(0, UPLOAD_LIMITS.maxFilesPerBatch);
    if (list.length > batch.length) notifyError('Too many files', `Upload up to ${UPLOAD_LIMITS.maxFilesPerBatch} files at a time.`);
    const queued: Item[] = batch.map((file, index) => ({
      key: `${Date.now()}-${index}-${file.name}`, name: cleanDisplayText(file.name) || 'Document', size: file.size, state: 'queued',
    }));
    setItems(queued);
    let added = 0;
    for (const [index, file] of batch.entries()) {
      const key = queued[index].key;
      const problem = uploadProblem(file);
      if (problem) { patch(key, { state: 'failed', error: problem }); continue; }
      try {
        await addStaffDocument({ area, id, file, kind: kind || null, share, onStep: step => patch(key, { state: step }) });
        patch(key, { state: 'done' });
        added += 1;
      } catch (cause) {
        patch(key, { state: 'failed', error: friendlyError(cause, 'The upload did not finish. Try again.') });
      }
    }
    if (input.current) input.current.value = '';
    if (added) {
      onUploaded();
      notifySuccess(`${plural(added, 'document')} added`, share
        ? updatesOn ? 'Shared with the client. They get an email.' : 'Shared with the client. Client emails are off, so no email was sent.'
        : 'Visible to staff only.');
    }
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setOver(false);
    void start(Array.from(event.dataTransfer.files || []));
  };

  return <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2">
      <Field id={`${uid}-kind`} label="Document kind">
        <SelectInput id={`${uid}-kind`} small value={kind} onChange={event => setKind(event.target.value)} disabled={busy}>
          <option value="">Not specified</option>
          {DOCUMENT_KINDS[area].map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </SelectInput>
      </Field>
      <label className="flex cursor-pointer items-start gap-2.5 self-end rounded-[6px] px-0.5 py-1.5 sm:pb-2">
        <input type="checkbox" className="ahs-check mt-0.5" checked={share} disabled={busy} onChange={event => setShare(event.target.checked)} />
        <span className="text-[13px] leading-5">
          <span className="font-semibold text-[color:var(--ah-ink)]">Share with client</span>
          <span className="block text-[12px] text-[color:var(--ah-muted)]">{held
            ? `Sharing also adds this file to the client’s files${updatesOn ? ' and emails them' : ''}.`
            : updatesOn ? 'They see it in their file and get an email.' : 'They see it in their file. No email is sent.'}</span>
        </span>
      </label>
    </div>
    <label htmlFor={`${uid}-files`} className="ahs-drop cursor-pointer" data-over={over ? 'true' : undefined} data-disabled={busy ? 'true' : undefined}
      onDragOver={event => { event.preventDefault(); if (!busy) setOver(true); }}
      onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <CloudUpload aria-hidden="true" />
      <span className="text-[13px]"><span className="font-semibold text-[color:var(--ah-plum-600)] underline-offset-2 hover:underline">Choose files</span> or drop them here</span>
      <span className="text-[11.5px] text-[color:var(--ah-muted)]">PDF, JPG, PNG, WebP or HEIC · up to 10 MB each · {UPLOAD_LIMITS.maxFilesPerBatch} at a time</span>
      <input ref={input} id={`${uid}-files`} type="file" multiple accept={ACCEPT} className="sr-only" disabled={busy}
        aria-label="Choose files to upload" onChange={event => void start(Array.from(event.target.files || []))} />
    </label>
    {items.length > 0 && <ul className="ahs-inset ahs-divide" aria-live="polite" aria-label="Uploads">
      {items.map(item => <li key={item.key} className="flex items-center gap-2.5 px-3 py-2">
        {item.state === 'done' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[color:var(--ah-success)]" aria-hidden="true" />
          : item.state === 'failed' ? <AlertCircle className="h-4 w-4 shrink-0 text-[color:var(--ah-danger)]" aria-hidden="true" />
            : <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[color:var(--ah-gold-600)]" aria-hidden="true" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium text-[color:var(--ah-ink)]">{item.name}</span>
          {item.error && <span className="block text-[11.5px] text-[color:var(--ah-danger)]">{item.error}</span>}
        </span>
        <span className="shrink-0 text-[11.5px] text-[color:var(--ah-muted)]">{item.state === 'done' || item.state === 'failed' ? formatBytes(item.size) : STEP_LABEL[item.state]}</span>
      </li>)}
      {!busy && <li className="flex justify-end px-2 py-1.5">
        <Button size="xs" variant="ghost" onClick={() => setItems([])}>Clear list</Button>
      </li>}
    </ul>}
  </div>;
}
