import { useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, FileImage, FileText, X } from 'lucide-react';
import { fileBadge, type PickedFile } from '../lib/files';
import { formatBytes } from '../lib/format';
import type { TransferState } from '../lib/uploads';
import { cx } from '../lib/cx';

export function FileThumb({ file }: { file: PickedFile }) {
  const [broken, setBroken] = useState(false);
  if (file.kind === 'image' && file.previewUrl && !broken) {
    return <img src={file.previewUrl} alt="" className="ahc-thumb" width={48} height={48} onError={() => setBroken(true)} />;
  }
  const Icon = file.kind === 'pdf' ? FileText : FileImage;
  return (
    <span className={cx('ahc-thumb', 'ahc-thumb--doc', file.kind === 'pdf' && 'ahc-thumb--pdf')} aria-hidden="true">
      <Icon size={20} />
      {fileBadge(file.name, file.contentType)}
    </span>
  );
}

interface FileRowProps {
  file: PickedFile;
  transfer?: TransferState;
  onRemove?: (file: PickedFile) => void;
}

/** One chosen file: thumbnail, name, size, and either a remove button or upload progress. */
export default function FileRow({ file, transfer, onRemove }: FileRowProps) {
  const percent = transfer ? Math.round(Math.min(transfer.fraction, transfer.status === 'done' ? 1 : 0.97) * 100) : 0;
  // Until the browser reports progress the bar animates instead of sitting at 0%.
  const unknown = transfer?.status === 'uploading' && transfer.fraction <= 0;
  let status: ReactNode = null;
  if (transfer?.status === 'waiting') status = <span>Waiting</span>;
  else if (unknown) status = <span>Uploading</span>;
  else if (transfer?.status === 'uploading') status = <span className="ah-mono">{transfer.fraction >= 0.999 ? 'Finishing' : `${percent}%`}</span>;
  else if (transfer?.status === 'done') status = <span className="inline-flex items-center gap-1 text-[color:var(--ah-success)]"><CircleCheck size={14} aria-hidden="true" />Uploaded</span>;
  else if (transfer?.status === 'failed') status = <span className="inline-flex items-center gap-1 text-[color:var(--ah-danger)]"><CircleAlert size={14} aria-hidden="true" />Did not upload</span>;

  return (
    <li className="ahc-file" data-status={transfer?.status}>
      <FileThumb file={file} />
      <div className="min-w-0">
        <p className="ahc-file-name" title={file.name}>{file.name}</p>
        <p className="ahc-file-meta">
          <span>{fileBadge(file.name, file.contentType)}</span>
          <span aria-hidden="true">·</span>
          <span>{formatBytes(file.size)}</span>
          {status ? <><span aria-hidden="true">·</span>{status}</> : null}
        </p>
        {transfer && transfer.status !== 'failed' ? (
          <progress
            className="ahc-progress"
            max={100}
            value={unknown ? undefined : transfer.status === 'waiting' ? 0 : percent}
            data-status={transfer.status}
            aria-label={`Upload progress for ${file.name}`}
          />
        ) : null}
      </div>
      {onRemove ? (
        <button type="button" className="ahc-btn ahc-btn--ghost ahc-btn--icon" onClick={() => onRemove(file)} aria-label={`Remove ${file.name}`}>
          <X size={18} aria-hidden="true" />
        </button>
      ) : <span aria-hidden="true" />}
    </li>
  );
}
