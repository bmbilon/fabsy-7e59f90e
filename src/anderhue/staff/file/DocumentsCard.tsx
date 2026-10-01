import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Download, Eye, FileImage, FileText, Files, Loader2 } from 'lucide-react';
import { DOCUMENT_KINDS, type PracticeArea } from '../catalog';
import { friendlyError, setDocumentShared, signedDocumentUrl, staffKeys } from '../api';
import { downloadFileName, formatBytes, formatDate, humanize, relativeTime, safeDocumentName, torontoDateOf } from '../format';
import type { DocumentRow } from '../model';
import { notifyError, notifySuccess } from '../notify';
import { useStaffSession } from '../session';
import { Button, Card, CardHead, Chip, StaffSheet, Toggle } from '../ui';
import StaffUploader from './StaffUploader';
import type { FileView } from './types';

const isImage = (doc: DocumentRow) => doc.content_type.startsWith('image/');
const previewable = (doc: DocumentRow) => doc.content_type === 'application/pdf'
  || ['image/jpeg', 'image/png', 'image/webp'].includes(doc.content_type);

function kindLabel(area: PracticeArea, kind: string | null): string {
  if (!kind) return 'Unclassified';
  return DOCUMENT_KINDS[area].find(option => option.value === kind)?.label || humanize(kind);
}

/**
 * The name shown for a document (list, viewer title): uploader-supplied, so
 * invisible and direction-changing characters are removed and the extension
 * always matches the stored content type.
 */
const docName = (area: PracticeArea, doc: DocumentRow) =>
  safeDocumentName(doc.original_name, doc.content_type, doc.kind ? kindLabel(area, doc.kind) : 'Document');

async function download(area: PracticeArea, doc: DocumentRow) {
  try {
    const url = await signedDocumentUrl(area, doc.storage_path, downloadFileName(docName(area, doc), doc.content_type));
    // Storage serves this signed URL as an attachment. Use the current tab,
    // as the client portal does, instead of opening a window after an async
    // request (which is subject to browser popup and PDF-viewer behaviour).
    window.location.assign(url);
  } catch (cause) {
    notifyError('Download unavailable', friendlyError(cause));
  }
}

function DocumentViewer({ area, doc, onOpenChange }: { area: PracticeArea; doc: DocumentRow | null; onOpenChange: (open: boolean) => void }) {
  const { userId } = useStaffSession();
  const open = Boolean(doc);
  const url = useQuery({
    queryKey: [...staffKeys.user(userId), 'signed-url', area, doc?.id || ''],
    queryFn: () => signedDocumentUrl(area, doc!.storage_path),
    enabled: open && Boolean(doc?.uploaded_at) && Boolean(doc && previewable(doc)),
    staleTime: 240_000,
    gcTime: 270_000,
    retry: false,
  });
  if (!doc) return null;
  const name = docName(area, doc);
  return <StaffSheet open={open} onOpenChange={onOpenChange} title={name}
    description={`${kindLabel(area, doc.kind)} · ${formatBytes(doc.size_bytes)} · ${doc.uploaded_by === 'staff' ? 'From the practice' : 'From the client'}`}
    actions={<Button size="sm" variant="secondary" onClick={() => void download(area, doc)}><Download aria-hidden="true" />Download</Button>}>
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[#2b2231] p-3 sm:p-5">
      {!previewable(doc) ? <div className="max-w-sm text-center text-[13.5px] leading-6 text-[rgb(247_241_232/0.85)]">
        <FileImage className="mx-auto mb-3 h-8 w-8 text-[color:var(--ah-gold-300)]" aria-hidden="true" />
        Preview is not available for this file type. Download the file to open it.
      </div>
        : url.isPending ? <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ah-gold-300)]" aria-label="Loading document" />
        : url.isError ? <p role="alert" className="max-w-sm text-center text-[13.5px] text-[rgb(247_241_232/0.85)]">
          <AlertCircle className="mx-auto mb-3 h-7 w-7 text-[color:var(--ah-gold-300)]" aria-hidden="true" />
          This document is not available right now. Try again in a moment.
        </p>
        : isImage(doc) ? <img src={url.data} alt={name} className="max-h-full max-w-full rounded-[4px] object-contain shadow-[0_8px_30px_rgb(0_0_0/0.35)]" />
        : <iframe src={url.data} title={name} className="h-full w-full rounded-[4px] border-0 bg-white" />}
    </div>
    <p className="border-t border-[color:var(--ahs-line-soft)] px-5 py-2.5 text-[11.5px] text-[color:var(--ah-muted)]">
      Secure link, valid for five minutes. Uploaded {doc.uploaded_at ? formatDate(torontoDateOf(doc.uploaded_at)) : 'not yet'}.
    </p>
  </StaffSheet>;
}

function ExtractedDetails({ doc }: { doc: DocumentRow }) {
  const fields = Object.entries(doc.extracted?.fields || {})
    .filter(([, value]) => value !== null && value !== '' && !(Array.isArray(value) && !value.length));
  if (!fields.length) return null;
  return <details className="mt-1.5">
    <summary className="cursor-pointer text-[12px] font-medium text-[color:var(--ah-plum-600)]">What was read</summary>
    <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-[6px] bg-[color:var(--ah-ivory-50)] p-2.5 text-[11.5px]">
      {fields.map(([key, value]) => <div key={key} className="contents">
        <dt className="text-[color:var(--ah-muted)]">{humanize(key.replace(/([A-Z])/g, ' $1').toLowerCase())}{doc.extracted?.lowConfidence?.includes(key) ? ' (low)' : ''}</dt>
        <dd className="break-words text-[color:var(--ah-ink)]">{Array.isArray(value) ? value.join(', ') : /cents$/i.test(key) && typeof value === 'number' ? `$${(value / 100).toFixed(2)}` : String(value)}</dd>
      </div>)}
    </dl>
    {doc.extracted?.notes && <p className="mt-1.5 text-[11.5px] text-[color:var(--ah-ink-2)]">{doc.extracted.notes}</p>}
  </details>;
}

function DocumentItem({ view, doc, onView }: { view: FileView; doc: DocumentRow; onView: () => void }) {
  const { area } = view;
  const [shared, setShared] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const uploaded = Boolean(doc.uploaded_at);
  const value = shared ?? doc.shared_with_client;
  const name = docName(area, doc);
  useEffect(() => { setShared(null); }, [doc.shared_with_client]);
  const Icon = isImage(doc) ? FileImage : FileText;

  const toggle = async (next: boolean) => {
    setShared(next);
    setBusy(true);
    try {
      await setDocumentShared(area, doc.id, next);
      notifySuccess(next ? 'Shared with the client' : 'No longer shared',
        next ? view.updatesOn ? 'They see it in their file and get an email.' : 'They see it in their file. Client emails are off.' : 'The client no longer sees this document.');
      view.refresh();
    } catch (cause) {
      setShared(null);
      notifyError('Sharing not changed', friendlyError(cause));
    } finally {
      setBusy(false);
    }
  };

  return <li className="flex items-start gap-3 py-2.5">
    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] ${isImage(doc) ? 'bg-[#efe8f2] text-[#4f2c69]' : 'bg-[#f8e3df] text-[#8a1d14]'}`} aria-hidden="true">
      <Icon className="h-4 w-4" />
    </span>
    <div className="min-w-0 flex-1">
      <p className="truncate text-[13px] font-semibold text-[color:var(--ah-ink)]" title={name}>{name}</p>
      <p className="text-[11.5px] leading-5 text-[color:var(--ah-muted)]">
        {kindLabel(area, doc.kind)} · <span className="whitespace-nowrap">{formatBytes(doc.size_bytes)}</span> · <span className="whitespace-nowrap">{uploaded ? formatDate(torontoDateOf(doc.uploaded_at)) : 'Upload not finished'}</span>
      </p>
      {doc.uploaded_by === 'staff' && uploaded && <label className="mt-1.5 inline-flex cursor-pointer items-center gap-2 text-[12px] font-medium text-[color:var(--ah-ink-2)]">
        <Toggle checked={value} disabled={busy} onCheckedChange={next => void toggle(next)} label={`Share ${name} with the client`} />
        {value ? 'Shared with client' : 'Staff only'}
      </label>}
      {doc.extracted && <ExtractedDetails doc={doc} />}
    </div>
    {uploaded && <div className="flex shrink-0 items-center gap-0.5">
      <Button size="xs" variant="ghost" icon onClick={onView} aria-label={`View ${name}`} title="View"><Eye aria-hidden="true" /></Button>
      <Button size="xs" variant="ghost" icon onClick={() => void download(area, doc)} aria-label={`Download ${name}`} title="Download"><Download aria-hidden="true" /></Button>
    </div>}
  </li>;
}

export default function DocumentsCard({ view }: { view: FileView }) {
  const { area, id, documents, signals } = view;
  const [viewing, setViewing] = useState<DocumentRow | null>(null);
  const newestFirst = (a: DocumentRow, b: DocumentRow) => Date.parse(b.uploaded_at || b.created_at) - Date.parse(a.uploaded_at || a.created_at);
  const fromClient = documents.filter(doc => doc.uploaded_by !== 'staff').sort(newestFirst);
  const fromPractice = documents.filter(doc => doc.uploaded_by === 'staff').sort(newestFirst);

  const group = (title: string, list: DocumentRow[], empty: string) => <div>
    <h3 className="flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-[0.12em] text-[color:var(--ah-muted)]">
      {title}<span className="ahs-count !normal-case !tracking-normal">{list.length}</span>
    </h3>
    {list.length ? <ul className="ahs-divide mt-1">{list.map(doc => <DocumentItem key={doc.id} view={view} doc={doc} onView={() => setViewing(doc)} />)}</ul>
      : <p className="mt-1.5 text-[12.5px] text-[color:var(--ah-muted)]">{empty}</p>}
  </div>;

  return <Card labelledBy="documents-title" id="documents">
    <CardHead id="documents-title" title="Documents" icon={<Files />}
      sub={`${fromClient.length} from the client · ${fromPractice.length} from the practice`}
      actions={signals.clientUploadWaiting ? <Chip tone="gold">New from client</Chip> : undefined} />
    <div className="ahs-card-body space-y-5">
      {signals.clientUploadWaiting && view.record.client_uploaded_at && <p className="rounded-[6px] bg-[color:var(--ahs-gold-tint)] px-3 py-2 text-[12.5px] leading-5 text-[#644a1e]">
        The client added documents {relativeTime(view.record.client_uploaded_at)}. Review them, then clear the request or update the file.
      </p>}
      {group('From the client', fromClient, 'Nothing from the client yet.')}
      {group('From the practice', fromPractice, 'Nothing uploaded by the practice yet.')}
      <div className="border-t border-[color:var(--ahs-line-soft)] pt-4">
        <h3 className="mb-2.5 text-[11.5px] font-bold uppercase tracking-[0.12em] text-[color:var(--ah-muted)]">Add documents</h3>
        <StaffUploader area={area} id={id} updatesOn={view.updatesOn} held={view.file.portalHidden} onUploaded={view.refresh} />
      </div>
    </div>
    <DocumentViewer area={area} doc={viewing} onOpenChange={open => { if (!open) setViewing(null); }} />
  </Card>;
}
