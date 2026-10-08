export type PortalLookupKind = 'plate' | 'drivers_license' | 'date_of_birth';
export const portalLookupLabels: Record<PortalLookupKind, string> = {
  plate: 'Licence plate', drivers_license: "Driver’s licence number", date_of_birth: 'Date of birth',
};

/** One case-bound identifier is sufficient. Never turn missing data into a value. */
export function normalizePortalLookup(kind: unknown, raw: unknown, today = new Date().toISOString().slice(0, 10)) {
  if (!['plate', 'drivers_license', 'date_of_birth'].includes(String(kind)) || typeof raw !== 'string') throw new Error('VERIFICATION_DETAIL_INVALID');
  if (raw.length > 60) throw new Error('VERIFICATION_DETAIL_INVALID');
  if (kind === 'date_of_birth') {
    const value = raw.trim();
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T12:00:00Z') : null;
    if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value < '1900-01-01' || value > today) throw new Error('VERIFICATION_DETAIL_INVALID');
    return value;
  }
  if (!/^[A-Za-z0-9 .-]+$/.test(raw.trim())) throw new Error('VERIFICATION_DETAIL_INVALID');
  const value = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^(?:UNKNOWN|NOTSUPPLIED|NOTPROVIDED|PENDING|PLACEHOLDER)$/.test(value) || /^PHOTOINTAKE/.test(value)
    || !(kind === 'plate' ? /^[A-Z0-9]{2,12}$/ : /^[A-Z0-9]{5,30}$/).test(value)) throw new Error('VERIFICATION_DETAIL_INVALID');
  return value;
}
