export const TICKET_UPLOAD_MEASUREMENT_STORAGE_KEY = 'fabsy:ticket-upload-measurement:v1';
const MAX_AGE_MS = 10 * 60 * 1000;
const RETURN_PATH = /^\/(?:en\/|pa\/|tl\/|zh-hans\/|zh-hant\/|ar\/|hi\/|es\/)?(?:submit-ticket|ticket-form)\/?$/;

export interface TicketUploadMeasurementHandoff {
  version: 1;
  createdAt: number;
  returnPath: string;
  googleReported: boolean;
  openAIReported: boolean;
}

function validHandoff(value: unknown, now = Date.now()): TicketUploadMeasurementHandoff | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<TicketUploadMeasurementHandoff>;
  if (candidate.version !== 1 || typeof candidate.createdAt !== 'number' ||
      !Number.isFinite(candidate.createdAt) || candidate.createdAt > now ||
      now - candidate.createdAt >= MAX_AGE_MS || typeof candidate.returnPath !== 'string' ||
      !RETURN_PATH.test(candidate.returnPath) || typeof candidate.googleReported !== 'boolean' ||
      typeof candidate.openAIReported !== 'boolean') return null;
  return candidate as TicketUploadMeasurementHandoff;
}

export function readTicketUploadMeasurementHandoff(
  storage: Pick<Storage, 'getItem' | 'removeItem'> = window.sessionStorage,
): TicketUploadMeasurementHandoff | null {
  try {
    const serialized = storage.getItem(TICKET_UPLOAD_MEASUREMENT_STORAGE_KEY);
    if (!serialized || serialized.length > 512) return null;
    const handoff = validHandoff(JSON.parse(serialized));
    if (handoff) return handoff;
    storage.removeItem(TICKET_UPLOAD_MEASUREMENT_STORAGE_KEY);
  } catch { /* An unavailable store simply disables the optional bridge. */ }
  return null;
}

export function beginTicketUploadMeasurementHandoff(
  returnPath: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = window.sessionStorage,
): boolean {
  if (!RETURN_PATH.test(returnPath)) return false;
  const handoff: TicketUploadMeasurementHandoff = {
    version: 1,
    createdAt: Date.now(),
    returnPath,
    googleReported: false,
    openAIReported: false,
  };
  try {
    const serialized = JSON.stringify(handoff);
    storage.setItem(TICKET_UPLOAD_MEASUREMENT_STORAGE_KEY, serialized);
    return storage.getItem(TICKET_UPLOAD_MEASUREMENT_STORAGE_KEY) === serialized;
  } catch {
    return false;
  }
}

export function updateTicketUploadMeasurementHandoff(
  update: Pick<TicketUploadMeasurementHandoff, 'googleReported' | 'openAIReported'>,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = window.sessionStorage,
): TicketUploadMeasurementHandoff | null {
  const current = readTicketUploadMeasurementHandoff(storage);
  if (!current) return null;
  const next = { ...current, ...update };
  try {
    const serialized = JSON.stringify(next);
    storage.setItem(TICKET_UPLOAD_MEASUREMENT_STORAGE_KEY, serialized);
    return storage.getItem(TICKET_UPLOAD_MEASUREMENT_STORAGE_KEY) === serialized ? next : null;
  } catch {
    return null;
  }
}

export function clearTicketUploadMeasurementHandoff(
  storage: Pick<Storage, 'removeItem'> = window.sessionStorage,
): void {
  try { storage.removeItem(TICKET_UPLOAD_MEASUREMENT_STORAGE_KEY); } catch { /* Optional measurement only. */ }
}
