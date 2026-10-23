import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { portal } from '../api';
import type { PracticeArea } from '../catalog';
import FilePicker from '../components/FilePicker';
import { Alert, Button, Field } from '../components/ui';
import { INTAKE_LIMITS, revokePreview, type FileLimits, type PickedFile } from '../lib/files';
import { listJoin, plural } from '../lib/format';
import { runUploads, withRetry, type TransferState, type UploadJob } from '../lib/uploads';
import { usePortal } from './PortalContext';

interface PortalUploaderProps {
  area: PracticeArea;
  id: string;
  limits?: { maxFiles: number; maxBytes: number } | null;
  /** Prefix for element ids, so two uploaders never clash. */
  idPrefix: string;
  compact?: boolean;
  submitLabel?: (count: number) => string;
  onUploaded: () => void;
}

interface Result {
  received: number;
  failedNames: string[];
  unconfirmed: boolean;
  /** Uploaded but not found by the server when confirming. */
  missing: number;
}

function safeLimits(limits: PortalUploaderProps['limits']): FileLimits {
  const maxFiles = Number(limits?.maxFiles);
  const maxBytes = Number(limits?.maxBytes);
  return {
    maxFiles: Number.isFinite(maxFiles) && maxFiles > 0 ? Math.min(maxFiles, INTAKE_LIMITS.maxFiles) : INTAKE_LIMITS.maxFiles,
    maxBytes: Number.isFinite(maxBytes) && maxBytes > 0 ? Math.min(maxBytes, INTAKE_LIMITS.maxBytes) : INTAKE_LIMITS.maxBytes,
  };
}

/** prepare_upload, a signed PUT per file with progress, then confirm_upload with an optional note. */
export default function PortalUploader({ area, id, limits, idPrefix, compact, submitLabel, onUploaded }: PortalUploaderProps) {
  const { token, handleError } = usePortal();
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [note, setNote] = useState('');
  const [transfers, setTransfers] = useState<Record<string, TransferState> | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filesRef = useRef(files);
  const busy = Boolean(transfers);
  const fileLimits = safeLimits(limits);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => () => filesRef.current.forEach(revokePreview), []);

  const send = async () => {
    if (!token || busy || !files.length) return;
    const batch = files;
    setError(null);
    setResult(null);
    setTransfers(Object.fromEntries(batch.map(file => [file.id, { status: 'waiting', fraction: 0 } as TransferState])));
    try {
      const prepared = await portal.prepareUpload(token, area, id, batch.map(file => ({ name: file.name, contentType: file.contentType, size: file.size })));
      const targets = new Map((prepared.uploads || []).map(target => [target.index, target]));
      const documentFor = new Map<string, string>();
      const jobs: UploadJob[] = [];
      batch.forEach((file, position) => {
        const target = targets.get(position);
        if (!target) return;
        documentFor.set(file.id, target.documentId);
        jobs.push({ key: file.id, signedUrl: target.signedUrl, file: file.file, name: file.name, contentType: target.contentType || file.contentType });
      });
      const outcome = await runUploads(jobs, (key, state) => setTransfers(previous => ({ ...(previous || {}), [key]: state })));
      const succeeded = batch.filter(file => outcome.succeeded.includes(file.id));
      const failed = batch.filter(file => !outcome.succeeded.includes(file.id));
      let received = 0;
      let unconfirmed = false;
      if (succeeded.length) {
        try {
          const confirmed = await withRetry(() => portal.confirmUpload(token, area, id, succeeded.map(file => documentFor.get(file.id) as string), note.trim()));
          received = Number(confirmed.received) || 0;
        } catch (caught) {
          const apiError = handleError(caught);
          if (apiError.status === 401) return;
          unconfirmed = true;
        }
      }
      if (succeeded.length && !unconfirmed && received === 0) {
        // The server found none of them in storage: keep everything for another try.
        setResult({ received: 0, failedNames: batch.map(file => file.name), unconfirmed: false, missing: 0 });
        return;
      }
      succeeded.forEach(revokePreview);
      setFiles(failed);
      if (succeeded.length && !unconfirmed) setNote('');
      const missing = unconfirmed ? 0 : Math.max(0, succeeded.length - received);
      setResult({ received, failedNames: failed.map(file => file.name), unconfirmed, missing });
      if (received > 0) onUploaded();
    } catch (caught) {
      const apiError = handleError(caught);
      if (apiError.status === 401) return;
      if (apiError.status === 409 || apiError.status === 422) setError(apiError.message);
      else if (apiError.status === 0) setError('We could not reach our server. Check your connection and try again.');
      else setError(apiError.message || 'Your documents were not sent. Please try again.');
    } finally {
      setTransfers(null);
    }
  };

  const label = submitLabel ? submitLabel(files.length) : `Send ${plural(files.length, 'document', 'documents')}`;

  return (
    <div className="grid gap-4">
      {result && result.received > 0 && !result.failedNames.length && !result.missing ? (
        <Alert tone="success" title="Thanks, we have your documents">
          {plural(result.received, 'document was', 'documents were')} added to your file.
        </Alert>
      ) : null}
      {result && result.failedNames.length ? (
        <Alert tone="warn" title={result.received ? `${plural(result.received, 'document', 'documents')} added, but some did not upload` : 'Your documents did not upload'}>
          {listJoin(result.failedNames)} {result.failedNames.length === 1 ? 'is' : 'are'} still listed below. Press send to try again.
        </Alert>
      ) : null}
      {result && result.missing ? (
        <Alert tone="info" title={`${plural(result.missing, 'document', 'documents')} may not have arrived`}>
          Check the documents list for this file and send anything that is missing.
        </Alert>
      ) : null}
      {result && result.unconfirmed ? (
        <Alert tone="info" title="We could not confirm your upload">
          Refresh this page in a minute. If your documents are not listed, send them again.
        </Alert>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <FilePicker id={idPrefix} files={files} onChange={setFiles} limits={fileLimits} transfers={transfers} compact={compact} label="Add documents to your file" />

      {files.length ? (
        <>
          <Field id={`${idPrefix}-note`} label="Add a note" optional hint="For example, which notice this is or when you received it.">
            {control => (
              <textarea {...control} className="ahc-input" rows={3} maxLength={1000} value={note} disabled={busy} onChange={event => setNote(event.target.value)} />
            )}
          </Field>
          <div>
            <Button variant="primary" icon={Send} busy={busy} onClick={() => void send()} className="w-full sm:w-auto">
              {busy ? 'Sending' : label}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
