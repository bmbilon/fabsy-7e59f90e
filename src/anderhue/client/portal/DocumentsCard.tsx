import { useState } from 'react';
import { Download, FileImage, FileText } from 'lucide-react';
import { portal, type PortalDocument, type PortalFile } from '../api';
import { Alert } from '../components/ui';
import { cx } from '../lib/cx';
import { formatBytes, formatDate } from '../lib/format';
import { usePortal } from './PortalContext';

function DocumentRow({ document, busy, onDownload }: { document: PortalDocument; busy: boolean; onDownload: (document: PortalDocument) => void }) {
  const pdf = document.contentType === 'application/pdf';
  const Icon = pdf ? FileText : FileImage;
  // Size is the least useful detail, so it is the one that gives way on small phones.
  const meta = [
    { text: document.kindLabel || '', className: '' },
    { text: formatDate(document.uploadedAt), className: '' },
    { text: formatBytes(document.sizeBytes ?? null), className: 'hidden min-[400px]:inline-flex' },
  ].filter(item => item.text);
  return (
    <li className="ahc-doc">
      <span className={cx('ahc-doc-icon', pdf && 'ahc-doc-icon--pdf')} aria-hidden="true"><Icon size={20} /></span>
      <div className="min-w-0">
        <p className="ahc-file-name" title={document.name}>{document.name}</p>
        <p className="ahc-file-meta ahc-file-meta--wrap">
          {meta.map((item, index) => (
            <span key={`${item.text}-${index}`} className={item.className || 'inline-flex'}>
              <span className="inline-flex items-center gap-2">
                {index ? <span aria-hidden="true">·</span> : null}
                {item.text}
              </span>
            </span>
          ))}
        </p>
      </div>
      <button
        type="button"
        className="ahc-btn ahc-btn--secondary ahc-btn--sm min-w-[44px]"
        onClick={() => onDownload(document)}
        disabled={busy}
        aria-busy={busy || undefined}
        aria-label={`Download ${document.name}`}
      >
        <Download size={17} aria-hidden="true" className={busy ? 'animate-pulse' : undefined} />
        <span className="hidden sm:inline">{busy ? 'Preparing' : 'Download'}</span>
      </button>
    </li>
  );
}

function Group({ title, documents, empty, busyId, onDownload }: { title: string; documents: PortalDocument[]; empty: string; busyId: string | null; onDownload: (document: PortalDocument) => void }) {
  return (
    <div className="mt-5">
      <h3 className="ahc-section-label flex items-center gap-2">
        {title}
        <span className="ah-mono rounded bg-[color:var(--ah-ivory-200)] px-1.5 text-[12px] font-medium">{documents.length}</span>
      </h3>
      {documents.length ? (
        <ul className="ahc-docs mt-1">
          {documents.map(document => <DocumentRow key={document.id} document={document} busy={busyId === document.id} onDownload={onDownload} />)}
        </ul>
      ) : (
        <p className="mt-2 text-[15px] text-[color:var(--ah-muted)]">{empty}</p>
      )}
    </div>
  );
}

/** Documents both ways. Download asks for a short-lived signed link, then hands it to the browser. */
export default function DocumentsCard({ file }: { file: PortalFile }) {
  const { token, handleError } = usePortal();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fromYou = file.documents.filter(document => document.from === 'you');
  const fromPractice = file.documents.filter(document => document.from !== 'you');

  const download = async (document: PortalDocument) => {
    if (!token || busyId) return;
    setBusyId(document.id);
    setError(null);
    try {
      const response = await portal.download(token, file.area, file.id, document.id);
      window.location.assign(response.url);
      window.setTimeout(() => setBusyId(null), 1500);
    } catch (caught) {
      const apiError = handleError(caught);
      setBusyId(null);
      if (apiError.status !== 401) setError(`We could not download ${document.name}. ${apiError.status === 0 ? 'Check your connection and try again.' : 'Please try again.'}`);
    }
  };

  return (
    <section className="ahc-card ahc-card-pad" aria-labelledby="documents-title">
      <h2 id="documents-title" className="ahc-card-title">Documents</h2>
      {error ? <Alert tone="error" className="mt-4">{error}</Alert> : null}
      <Group title="From you" documents={fromYou} empty="You have not added any documents yet." busyId={busyId} onDownload={download} />
      <Group title="From the practice" documents={fromPractice} empty="Nothing yet. Documents we share with you will appear here." busyId={busyId} onDownload={download} />
    </section>
  );
}
