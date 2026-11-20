import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent as ReactDragEvent, type MouseEvent } from 'react';
import { Camera, CloudUpload, FolderOpen } from 'lucide-react';
import { ACCEPT_ATTR, FRIENDLY_TYPES, checkIncoming, revokePreview, toPickedFile, type FileLimits, type PickedFile } from '../lib/files';
import { formatBytes, plural } from '../lib/format';
import { useMediaQuery } from '../lib/hooks';
import type { TransferState } from '../lib/uploads';
import { cx } from '../lib/cx';
import FileRow from './FileRow';
import { Alert, Button } from './ui';

interface FilePickerProps {
  /** Prefix for element ids. */
  id: string;
  files: PickedFile[];
  onChange: (next: PickedFile[]) => void;
  limits: FileLimits;
  /** Present while uploading: the list shows progress and editing stops. */
  transfers?: Record<string, TransferState> | null;
  disabled?: boolean;
  compact?: boolean;
  /** Extra sentence when a batch is over the limit, e.g. where to add the rest. */
  overflowHint?: string;
  /** Accept images pasted anywhere on the page (outside text fields). */
  listenForPaste?: boolean;
  /** Accessible name for the drop zone region. */
  label?: string;
}

function carriesFiles(event: ReactDragEvent | DragEvent): boolean {
  return Array.from(event.dataTransfer?.types || []).includes('Files');
}

/**
 * Drop zone with click to browse, a camera button on touch devices, inline
 * validation and a file list with thumbnails, remove buttons and progress.
 */
export default function FilePicker({ id, files, onChange, limits, transfers, disabled, compact, overflowHint, listenForPaste, label }: FilePickerProps) {
  const touch = useMediaQuery('(pointer: coarse)');
  const browseInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const browseButton = useRef<HTMLButtonElement>(null);
  const dragDepth = useRef(0);
  const filesRef = useRef(files);
  const [dragging, setDragging] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const locked = Boolean(disabled || transfers);
  const full = files.length >= limits.maxFiles;

  const addFiles = useCallback((incoming: File[]) => {
    if (!incoming.length) return;
    const current = filesRef.current;
    const result = checkIncoming(current, incoming, limits, overflowHint);
    setProblems(result.problems);
    if (result.accepted.length) {
      const picked = result.accepted.map(item => toPickedFile(item.file, item.contentType));
      const next = [...current, ...picked];
      filesRef.current = next;
      onChange(next);
      setAnnouncement(`${plural(picked.length, 'file', 'files')} added. ${next.length} of ${limits.maxFiles} chosen.${result.problems.length ? ` ${result.problems.join(' ')}` : ''}`);
    } else {
      setAnnouncement(result.problems.join(' '));
    }
  }, [limits, onChange, overflowHint]);

  const remove = (file: PickedFile) => {
    revokePreview(file);
    const next = filesRef.current.filter(item => item.id !== file.id);
    filesRef.current = next;
    onChange(next);
    setProblems([]);
    setAnnouncement(`${file.name} removed. ${next.length} of ${limits.maxFiles} chosen.`);
    window.requestAnimationFrame(() => browseButton.current?.focus());
  };

  const onInput = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files || []);
    event.target.value = '';
    addFiles(chosen);
  };

  // A file dropped beside the zone would otherwise open in the tab and lose the form.
  useEffect(() => {
    const guard = (event: DragEvent) => {
      if (carriesFiles(event)) event.preventDefault();
    };
    window.addEventListener('dragover', guard);
    window.addEventListener('drop', guard);
    return () => {
      window.removeEventListener('dragover', guard);
      window.removeEventListener('drop', guard);
    };
  }, []);

  useEffect(() => {
    if (!listenForPaste || locked) return undefined;
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const pasted = Array.from(event.clipboardData?.files || []);
      if (!pasted.length) return;
      event.preventDefault();
      addFiles(pasted);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [listenForPaste, locked, addFiles]);

  const onZoneClick = (event: MouseEvent<HTMLDivElement>) => {
    if (locked || full) return;
    if ((event.target as HTMLElement).closest('button, a, input, label')) return;
    browseInput.current?.click();
  };

  const showIcon = !touch && !compact;
  const zone = locked ? null : (
    <div
      role="group"
      aria-label={label || 'Add documents'}
      className={cx('ahc-drop', compact && 'ahc-drop--compact', touch && 'ahc-drop--touch')}
      data-dragging={dragging ? 'true' : undefined}
      data-disabled={full ? 'true' : undefined}
      onClick={onZoneClick}
      onDragEnter={event => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={event => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = full ? 'none' : 'copy';
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
      }}
      onDrop={event => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (!full) addFiles(Array.from(event.dataTransfer.files || []));
      }}
    >
      {showIcon ? (
        <span className="ahc-drop-icon" aria-hidden="true"><CloudUpload size={24} /></span>
      ) : null}
      <p className={cx('flex items-center gap-2 font-semibold text-[17px] leading-snug text-[color:var(--ah-plum-950)]', showIcon && 'mt-3')}>
        {!showIcon ? <CloudUpload size={20} aria-hidden="true" className="shrink-0 text-[color:var(--ah-plum-600)]" /> : null}
        {full ? `You have added ${limits.maxFiles} files` : dragging ? 'Drop to add' : touch ? 'Add photos or PDFs' : 'Drag files here'}
      </p>
      <p className="mt-1 text-[14px] leading-normal text-[color:var(--ah-muted)]">
        {full
          ? 'That is the most you can send at once. Remove one to add another.'
          : touch
            ? `${FRIENDLY_TYPES}, up to ${formatBytes(limits.maxBytes)} each.`
            : `or choose them from your computer. ${FRIENDLY_TYPES}, up to ${formatBytes(limits.maxBytes)} each.`}
      </p>
      {!full ? (
        <div className="ahc-drop-actions mt-4" data-count={touch ? 2 : 1}>
          {touch ? (
            <Button variant="primary" icon={Camera} onClick={() => cameraInput.current?.click()}>Take a photo</Button>
          ) : null}
          <Button ref={browseButton} variant={touch ? 'secondary' : 'primary'} icon={FolderOpen} onClick={() => browseInput.current?.click()}>
            Choose files
          </Button>
        </div>
      ) : null}
      <input ref={browseInput} id={`${id}-files`} data-picker="browse" type="file" multiple accept={ACCEPT_ATTR} hidden onChange={onInput} />
      <input ref={cameraInput} id={`${id}-camera`} data-picker="camera" type="file" accept="image/*" capture="environment" hidden onChange={onInput} />
    </div>
  );

  return (
    <div className="grid gap-3">
      {zone}
      {problems.length ? (
        <Alert tone="warn" title={problems.length > 1 ? 'Some files were not added' : undefined} live={false}>
          {problems.length > 1 ? (
            <ul className="list-disc space-y-1 pl-5">{problems.map(problem => <li key={problem}>{problem}</li>)}</ul>
          ) : problems[0]}
        </Alert>
      ) : null}
      {files.length ? (
        <ul className="ahc-files" aria-label="Chosen files">
          {files.map(file => (
            <FileRow key={file.id} file={file} transfer={transfers?.[file.id]} onRemove={locked ? undefined : remove} />
          ))}
        </ul>
      ) : null}
      <p className="sr-only" aria-live="polite">{announcement}</p>
    </div>
  );
}
