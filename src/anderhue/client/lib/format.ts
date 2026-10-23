import { daysUntil, formatLongDate } from '../catalog';

const TIME_ZONE = 'America/Toronto';
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts ISO strings, unix seconds or milliseconds. */
export function toDate(value: string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    const date = new Date(value < 1e12 ? value * 1000 : value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const date = new Date(DATE_ONLY.test(value) ? `${value}T12:00:00Z` : value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** "Oct 1, 2026" */
export function formatDate(value: string | number | null | undefined): string {
  const date = toDate(value);
  if (!date) return '';
  const timeZone = typeof value === 'string' && DATE_ONLY.test(value) ? 'UTC' : TIME_ZONE;
  return date.toLocaleDateString('en-CA', { timeZone, month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Oct 1, 2026, 2:14 p.m." */
export function formatDateTime(value: string | number | null | undefined): string {
  const date = toDate(value);
  if (!date) return '';
  if (typeof value === 'string' && DATE_ONLY.test(value)) return formatDate(value);
  const day = date.toLocaleDateString('en-CA', { timeZone: TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric' });
  const time = date.toLocaleTimeString('en-CA', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
}

/** Calendar dates read best long ("Thu, October 1, 2026"); timestamps fall back to a short date. */
export function formatKeyDate(value: string | null | undefined): string {
  if (!value) return '';
  if (DATE_ONLY.test(value)) return formatLongDate(value);
  return formatDate(value);
}

/** "Today", "Tomorrow", "In 12 days", "3 days ago". Empty when the date is unreadable. */
export function relativeDays(value: string | null | undefined): string {
  if (!value) return '';
  const isoDate = DATE_ONLY.test(value) ? value : (() => {
    const date = toDate(value);
    if (!date) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  })();
  const days = daysUntil(isoDate);
  if (days === null) return '';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days > 0 ? `In ${days} days` : `${Math.abs(days)} days ago`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  const rounded = mb < 100 ? Math.round(mb * 10) / 10 : Math.round(mb);
  return `${String(rounded).replace(/\.0$/, '')} MB`;
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "a, b and c" */
export function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
