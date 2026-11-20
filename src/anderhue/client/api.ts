/**
 * Typed client for the three public functions the client app talks to
 * (ARCHITECTURE.md 4.1 and 4.2, plus the existing landlord contract in
 * supabase/functions/ltb-intake):
 *
 *   ltb-intake       landlord intake: submit, finalize
 *   practice-intake  traffic and general intake: submit, finalize
 *   practice-portal  request_link, session, file, download, prepare_upload, confirm_upload
 *
 * Plain fetch with the public anon key (no supabase-js, no auth session).
 * Documents go straight to one-time signed storage URLs with XMLHttpRequest so
 * the browser reports real upload progress.
 */
import { SUPABASE_ANON_KEY, functionUrl } from '../config';
import type { Phase, PracticeArea } from './catalog';

export type FunctionName = 'ltb-intake' | 'practice-intake' | 'practice-portal';

/** The one error type the app handles. `status` is 0 when the server could not be reached. */
export class ApiError extends Error {
  readonly status: number;
  /** Storage said the object already exists: a retried upload whose first attempt had arrived. */
  readonly duplicate: boolean;

  constructor(message: string, status: number, duplicate = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.duplicate = duplicate;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export const NETWORK_MESSAGE = 'We could not reach our server. Check your connection and try again.';
export const EXPIRED_MESSAGE = 'That link has expired. Enter your email and we will send a fresh one.';

export function defaultErrorMessage(status: number): string {
  switch (status) {
    case 0: return NETWORK_MESSAGE;
    case 401: return EXPIRED_MESSAGE;
    case 403: return 'We could not accept this request from this page. Please call or email us.';
    case 404: return 'We could not find that file.';
    case 422: return 'Some details need another look.';
    case 429: return 'Too many attempts from this connection. Please wait a little and try again.';
    default: return 'Something went wrong on our side. Please try again in a minute.';
  }
}

function baseHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
}

const REQUEST_TIMEOUT_MS = 30_000;

async function post<T>(name: FunctionName, body: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(functionUrl(name), {
      method: 'POST',
      headers: baseHeaders(),
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(NETWORK_MESSAGE, 0);
  } finally {
    window.clearTimeout(timer);
  }
  const data = (await response.json().catch(() => null)) as (Record<string, unknown> & { ok?: unknown; error?: unknown }) | null;
  if (!response.ok || !data || data.ok !== true) {
    const status = response.ok ? 502 : response.status;
    const message = data && typeof data.error === 'string' && data.error.trim() ? data.error.trim() : defaultErrorMessage(status);
    throw new ApiError(message, status);
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Intake (ltb-intake and practice-intake)
// ---------------------------------------------------------------------------

export interface UploadFileSpec {
  name: string;
  contentType: string;
  size: number;
}

/** One-time signed upload target returned by submit; `index` points into the submitted files. */
export interface IntakeUploadTarget {
  documentId: string;
  index: number;
  path?: string;
  signedUrl: string;
  contentType: string;
}

interface IntakeCommon {
  practiceId: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  /** Honeypot. Always empty for people. */
  company: string;
  /** Milliseconds since the page loaded. */
  elapsedMs: number;
  files: UploadFileSpec[];
}

export interface LtbSubmitRequest extends IntakeCommon {
  city: string;
  issue: string;
  owed: string;
  served: 'no' | 'yes' | 'unsure';
}

export interface LtbSubmitResponse {
  ok: true;
  caseId: string | null;
  caseNumber: string | null;
  intakeToken: string | null;
  uploads: IntakeUploadTarget[];
}

export interface TrafficSubmitRequest extends IntakeCommon {
  area: 'traffic';
  ticketType: string;
  ticketCity: string;
  ticketReceivedOn: string;
  optionChosen: string;
}

export interface GeneralSubmitRequest extends IntakeCommon {
  area: 'general';
  category: string;
  deadline: string;
  otherParty: string;
  clientCity: string;
}

export type PracticeSubmitRequest = TrafficSubmitRequest | GeneralSubmitRequest;

export interface PracticeSubmitResponse {
  ok: true;
  matterId: string | null;
  matterNumber: string | null;
  intakeToken: string | null;
  uploads: IntakeUploadTarget[];
}

export interface FinalizeResponse {
  ok: true;
  received: number;
}

export const ltbIntake = {
  submit: (request: LtbSubmitRequest) =>
    post<LtbSubmitResponse>('ltb-intake', { action: 'submit', ...request }),
  finalize: (request: { caseId: string; intakeToken: string; uploaded: string[] }) =>
    post<FinalizeResponse>('ltb-intake', { action: 'finalize', ...request }),
};

export const practiceIntake = {
  submit: (request: PracticeSubmitRequest) =>
    post<PracticeSubmitResponse>('practice-intake', { action: 'submit', ...request }),
  finalize: (request: { matterId: string; intakeToken: string; uploaded: string[] }) =>
    post<FinalizeResponse>('practice-intake', { action: 'finalize', ...request }),
};

// ---------------------------------------------------------------------------
// Portal (practice-portal)
// ---------------------------------------------------------------------------

export interface PortalPractice {
  name: string;
  displayName: string;
  phone: string;
  publicEmail: string;
  siteUrl: string;
}

export interface PortalFileSummary {
  area: PracticeArea;
  id: string;
  number: string;
  title: string;
  stage: string;
  stageLabel: string;
  phase: Phase;
  closed: boolean;
  requestOpen: boolean;
  updatedAt: string;
  createdAt: string;
}

export interface PortalSessionResponse {
  ok: true;
  client: { firstName: string; displayName: string; email: string };
  practice: PortalPractice;
  files: PortalFileSummary[];
  /** When the current link stops working (ISO timestamp or unix seconds). */
  expiresAt: string | number | null;
}

export interface PortalDocument {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number | null;
  uploadedAt: string | null;
  from: 'you' | 'practice';
  kindLabel?: string | null;
}

export interface PortalRequest {
  message: string;
  at: string;
  answered: boolean;
}

export interface PortalFile {
  area: PracticeArea;
  id: string;
  number: string;
  title: string;
  areaLabel: string;
  stage: string;
  stageLabel: string;
  clientNext: string;
  phase: Phase;
  closed: boolean;
  outcomeLabel: string | null;
  createdAt: string;
  updatedAt: string;
  keyDates: { label: string; date: string }[];
  request: PortalRequest | null;
  documents: PortalDocument[];
  history: { at: string; label: string }[];
  canUpload: boolean;
  limits: { maxFiles: number; maxBytes: number };
}

export interface PortalUploadTarget {
  documentId: string;
  index: number;
  signedUrl: string;
  contentType: string;
}

export const portal = {
  requestLink: (request: { practiceId: string; email: string; company: string; elapsedMs: number }) =>
    post<{ ok: true }>('practice-portal', { action: 'request_link', ...request }),
  session: (token: string) =>
    post<PortalSessionResponse>('practice-portal', { action: 'session', token }),
  file: (token: string, area: PracticeArea, id: string) =>
    post<{ ok: true; file: PortalFile }>('practice-portal', { action: 'file', token, area, id }),
  download: (token: string, area: PracticeArea, id: string, documentId: string) =>
    post<{ ok: true; url: string; name: string }>('practice-portal', { action: 'download', token, area, id, documentId }),
  prepareUpload: (token: string, area: PracticeArea, id: string, files: UploadFileSpec[]) =>
    post<{ ok: true; uploads: PortalUploadTarget[] }>('practice-portal', { action: 'prepare_upload', token, area, id, files }),
  confirmUpload: (token: string, area: PracticeArea, id: string, documentIds: string[], note: string) =>
    post<{ ok: true; received: number }>('practice-portal', { action: 'confirm_upload', token, area, id, documentIds, note }),
};

// ---------------------------------------------------------------------------
// Signed uploads
// ---------------------------------------------------------------------------

export interface UploadOptions {
  /** Fraction of the request body sent so far, 0 to 1. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * PUT one file to a one-time signed storage URL, exactly like the landlords
 * page: multipart form data, `x-upsert: false`, anon key headers.
 */
export function uploadToSignedUrl(signedUrl: string, file: Blob, fileName: string, contentType: string, options: UploadOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new ApiError('The upload was cancelled.', 0));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
    xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_ANON_KEY}`);
    xhr.timeout = options.timeoutMs ?? 180_000;
    xhr.upload.onprogress = event => {
      if (event.lengthComputable && event.total > 0) options.onProgress?.(Math.min(1, event.loaded / event.total));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        options.onProgress?.(1);
        resolve();
        return;
      }
      const text = typeof xhr.responseText === 'string' ? xhr.responseText : '';
      const duplicate = xhr.status === 409 || /duplicate|already exists/i.test(text);
      reject(new ApiError('The upload did not finish.', xhr.status, duplicate));
    };
    xhr.onerror = () => reject(new ApiError('The upload was interrupted.', 0));
    xhr.ontimeout = () => reject(new ApiError('The upload took too long.', 0));
    xhr.onabort = () => reject(new ApiError('The upload was cancelled.', 0));
    options.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    const body = new FormData();
    body.append('cacheControl', '3600');
    body.append('', new Blob([file], { type: contentType }), fileName);
    xhr.send(body);
  });
}
