import { UPLOAD_LIMITS } from '../catalog';
import { formatBytes } from './format';

export interface FileLimits {
  maxFiles: number;
  maxBytes: number;
}

/** Intake and portal batches share the catalog limits unless the server says otherwise. */
export const INTAKE_LIMITS: FileLimits = { maxFiles: UPLOAD_LIMITS.maxFilesPerBatch, maxBytes: UPLOAD_LIMITS.maxBytes };

export const FRIENDLY_TYPES = 'PDF, JPG, PNG, WEBP or HEIC';

/** Accept attribute: the six content types plus extensions for browsers that send no type. */
export const ACCEPT_ATTR = [
  ...Object.keys(UPLOAD_LIMITS.contentTypes),
  ...Object.keys(UPLOAD_LIMITS.extensionTypes).map(extension => `.${extension}`),
].join(',');

export interface PickedFile {
  /** Local id for React keys and progress tracking. */
  id: string;
  file: File;
  name: string;
  size: number;
  contentType: string;
  kind: 'image' | 'pdf';
  /** Object URL for image thumbnails; revoked when the file leaves the list. */
  previewUrl: string | null;
}

export function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec((name || '').trim());
  return match ? match[1].toLowerCase() : '';
}

/** The accepted content type, using the extension when the browser sends an empty or generic type. */
export function resolveContentType(file: { name: string; type: string }): string | null {
  const type = (file.type || '').toLowerCase();
  if (UPLOAD_LIMITS.contentTypes[type]) return type;
  if (type === 'image/jpg' || type === 'image/pjpeg') return 'image/jpeg';
  return UPLOAD_LIMITS.extensionTypes[extensionOf(file.name)] || null;
}

export function localId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sameFile(a: File, b: File): boolean {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

export interface IncomingCheck {
  accepted: { file: File; contentType: string }[];
  problems: string[];
}

/**
 * Splits newly chosen files into the ones we keep and friendly reasons for the
 * rest: wrong type, empty, too large, already added, or over the batch limit.
 */
export function checkIncoming(current: PickedFile[], incoming: File[], limits: FileLimits, overflowHint = ''): IncomingCheck {
  const accepted: IncomingCheck['accepted'] = [];
  const problems: string[] = [];
  let room = Math.max(0, limits.maxFiles - current.length);
  let overflow = 0;
  for (const file of incoming) {
    const name = file.name || 'That file';
    const contentType = resolveContentType(file);
    if (!contentType) {
      problems.push(`${name} is not a file type we can accept. Use ${FRIENDLY_TYPES}.`);
      continue;
    }
    if (file.size === 0) {
      problems.push(`${name} is empty. Try saving it again, then add it.`);
      continue;
    }
    if (file.size > limits.maxBytes) {
      problems.push(`${name} is ${formatBytes(file.size)}. Each file must be ${formatBytes(limits.maxBytes)} or smaller. A photo of each page usually fits.`);
      continue;
    }
    if (current.some(item => sameFile(item.file, file)) || accepted.some(item => sameFile(item.file, file))) {
      problems.push(`${name} is already in your list.`);
      continue;
    }
    if (room <= 0) {
      overflow += 1;
      continue;
    }
    accepted.push({ file, contentType });
    room -= 1;
  }
  if (overflow) {
    const what = overflow === 1 ? '1 file was not added' : `${overflow} files were not added`;
    problems.push(`You can send up to ${limits.maxFiles} files at a time, so ${what}.${overflowHint ? ` ${overflowHint}` : ''}`);
  }
  return { accepted, problems };
}

export function toPickedFile(file: File, contentType: string): PickedFile {
  const kind = contentType === 'application/pdf' ? 'pdf' : 'image';
  let previewUrl: string | null = null;
  if (kind === 'image' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try { previewUrl = URL.createObjectURL(file); } catch { previewUrl = null; }
  }
  return { id: localId(), file, name: file.name || 'document', size: file.size, contentType, kind, previewUrl };
}

export function revokePreview(file: PickedFile): void {
  if (file.previewUrl) {
    try { URL.revokeObjectURL(file.previewUrl); } catch { /* already released */ }
  }
}

export function fileBadge(name: string, contentType: string): string {
  if (contentType === 'application/pdf') return 'PDF';
  const extension = extensionOf(name);
  if (extension === 'jpeg') return 'JPG';
  return (extension || contentType.split('/')[1] || 'FILE').toUpperCase().slice(0, 4);
}
