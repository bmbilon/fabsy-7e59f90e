/** Formatting helpers for the staff workspace. Ontario deadlines run on Toronto time. */
import { UPLOAD_LIMITS, daysUntil, torontoToday } from './catalog';

export const TORONTO = 'America/Toronto';
const DAY = 86_400_000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE.test(value);
}

/** Calendar date (YYYY-MM-DD) of an instant, in Toronto. */
export function torontoDateOf(timestamp: string | number | Date | null | undefined): string | null {
  if (timestamp === null || timestamp === undefined || timestamp === '') return null;
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return torontoToday(date);
}

/** Whole calendar days since an instant (Toronto). 0 means today. */
export function calendarDaysSince(timestamp: string | null | undefined, today = torontoToday()): number | null {
  const day = torontoDateOf(timestamp);
  if (!day) return null;
  const diff = daysUntil(day, today);
  return diff === null ? null : -diff;
}

/** "Thursday, October 1, 2026" in Toronto. */
export function longTodayLine(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TORONTO, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(now);
}

/** "Oct 6, 2026" for a calendar date. */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isIsoDate(isoDate)) return '';
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-CA', {
    timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
  });
}

/** "Tue, Oct 6" (adds the year when it is not the current Toronto year). */
export function formatShortDate(isoDate: string | null | undefined, today = torontoToday()): string {
  if (!isIsoDate(isoDate)) return '';
  const sameYear = isoDate.slice(0, 4) === today.slice(0, 4);
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-CA', {
    timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** "Oct 6" or "Oct 6, 2027" for compact table cells. */
export function formatTableDate(isoDate: string | null | undefined, today = torontoToday()): string {
  if (!isIsoDate(isoDate)) return '';
  const sameYear = isoDate.slice(0, 4) === today.slice(0, 4);
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-CA', {
    timeZone: 'UTC', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** "Oct 1, 10:42 a.m." in Toronto. */
export function formatDateTime(timestamp: string | null | undefined): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const sameYear = torontoDateOf(date)?.slice(0, 4) === torontoToday().slice(0, 4);
  return date.toLocaleString('en-CA', {
    timeZone: TORONTO, month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }),
    hour: 'numeric', minute: '2-digit',
  });
}

/** "10:42 a.m." in Toronto. */
export function formatClock(timestamp: string | number | Date): string {
  return new Date(timestamp).toLocaleTimeString('en-CA', { timeZone: TORONTO, hour: 'numeric', minute: '2-digit' });
}

/** Short relative time: "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", or a date. */
export function relativeTime(timestamp: string | null | undefined, now = Date.now()): string {
  if (!timestamp) return '';
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) return '';
  const diff = now - time;
  if (diff < 45_000) return 'just now';
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))} min ago`;
  if (diff < DAY) return `${Math.round(diff / 3_600_000)} h ago`;
  const days = calendarDaysSince(timestamp, torontoToday(new Date(now))) ?? Math.floor(diff / DAY);
  if (days <= 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return formatTableDate(torontoDateOf(timestamp));
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** "1:05" countdown from milliseconds. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Reason chip text for a key date. */
export function dueLabel(days: number): string {
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Due today';
  return `Due in ${plural(days, 'day')}`;
}

/** Money input helpers (cents in the database, dollars in forms). */
export function centsToInput(cents: unknown): string {
  return typeof cents === 'number' && Number.isFinite(cents) ? (cents / 100).toFixed(2) : '';
}

export function inputToCents(value: string): number | null | undefined {
  const text = value.trim();
  if (!text) return null;
  const amount = Number(text.replace(/[$,\s]/g, ''));
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  return Math.round(amount * 100);
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('') || '·';
}

/** Keyboard hint for the command palette: Command K on Apple devices, Ctrl K elsewhere. */
export function searchShortcutLabel(): string {
  if (typeof navigator === 'undefined') return 'Ctrl K';
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
    || navigator.platform || navigator.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform) ? '⌘K' : 'Ctrl K';
}

/** True when a key event comes from a field where typing should not trigger shortcuts. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || !element.tagName) return false;
  const tag = element.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable;
}

export function humanize(value: string | null | undefined): string {
  if (!value) return '';
  const text = value.replace(/_/g, ' ').trim();
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}

// ---------------------------------------------------------------------------
// Document names. Names come from whoever uploaded the file, so they can carry
// bidirectional and zero-width controls that disguise the real extension
// ("invoice" + U+202E + "fdp.exe" displays as "invoiceexe.pdf"), or an
// extension that does not match what was stored.
// ---------------------------------------------------------------------------

// C0 and C1 controls, the Arabic letter mark, zero-width and direction marks
// (U+200B to U+200F), bidi embeddings and overrides (U+202A to U+202E), word
// joiner and bidi isolates (U+2060 to U+2069) and the byte order mark.
// eslint-disable-next-line no-control-regex
const INVISIBLE_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

/** Text without invisible or direction-changing characters, on one line. */
export function cleanDisplayText(value: string | null | undefined): string {
  return (value || '').replace(INVISIBLE_CHARACTERS, '').replace(/\s+/g, ' ').trim();
}

function withStoredExtension(name: string, contentType: string): string {
  const extension = UPLOAD_LIMITS.contentTypes[contentType] || '';
  const current = (name.match(/\.([a-z0-9]{1,8})$/i)?.[1] || '').toLowerCase();
  return extension && UPLOAD_LIMITS.extensionTypes[current] !== contentType ? `${name}.${extension}` : name;
}

/**
 * The name staff see for a document: invisible characters removed, ending in
 * the extension of its stored content type, so "ticket.pdf.exe" stored as a
 * PDF shows as "ticket.pdf.exe.pdf".
 */
export function safeDocumentName(original: string | null | undefined, contentType: string, fallback = 'Document'): string {
  const name = cleanDisplayText(original).slice(0, 200).trim();
  return withStoredExtension(/[\p{L}\p{N}]/u.test(name) ? name : fallback, contentType);
}

/**
 * The file name for a download (mirrors downloadName in
 * supabase/functions/_shared/practice-portal-core.ts, after removing invisible
 * characters): letters, digits, spaces, dots, dashes, underscores and brackets
 * only, so it cannot change the signed URL's query string, ending in the
 * stored type's extension, at most 120 characters.
 */
export function downloadFileName(original: string | null | undefined, contentType: string, fallback = 'document'): string {
  let name = cleanDisplayText(original).slice(0, 200)
    .replace(/[^\p{L}\p{N} ._()-]+/gu, '_').replace(/_{2,}/g, '_').replace(/^[\s._]+/, '').trim();
  if (!name) name = fallback;
  name = withStoredExtension(name, contentType);
  if (name.length > 120) {
    const dot = name.lastIndexOf('.');
    const suffix = dot > 0 && name.length - dot <= 9 ? name.slice(dot) : '';
    name = `${name.slice(0, 120 - suffix.length).trim()}${suffix}`;
  }
  return name;
}
