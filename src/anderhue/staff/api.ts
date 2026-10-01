/**
 * Data layer for the AnderHue staff workspace (ARCHITECTURE.md 3.4 and 5.3).
 *
 * Reads: every table query is scoped with practice_id = the AnderHue practice
 * (ltb_practices is keyed by id). Writes go only through the staff RPCs,
 * ltb_set_client_registration, the granted column updates, and storage
 * uploads to paths registered by practice_staff_add_document.
 */
import { supabase } from '@/integrations/supabase/client';
import { ANDERHUE_PRACTICE } from '@/anderhue/config';
import { AREAS, UPLOAD_LIMITS, type PracticeArea } from './catalog';
import type {
  CaseRow, ClientRecord, DocumentRow, EventRow, NoticeRow, PracticeRow, RegistrationStatus,
} from './model';

// The practice tables and RPCs are newer than the generated client types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as any;
export const PRACTICE_ID: string = ANDERHUE_PRACTICE.practiceId;

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const ROOT = 'anderhue-staff';
export const staffKeys = {
  root: [ROOT] as const,
  user: (userId: string) => [ROOT, userId] as const,
  membership: (userId: string) => [ROOT, userId, 'membership'] as const,
  practice: (userId: string) => [ROOT, userId, 'practice'] as const,
  boards: (userId: string) => [ROOT, userId, 'board'] as const,
  board: (userId: string, area: PracticeArea) => [ROOT, userId, 'board', area] as const,
  events: (userId: string) => [ROOT, userId, 'recent-events'] as const,
  noticeHealth: (userId: string) => [ROOT, userId, 'notice-health'] as const,
  files: (userId: string) => [ROOT, userId, 'file'] as const,
  file: (userId: string, area: PracticeArea, id: string) => [ROOT, userId, 'file', area, id] as const,
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

const ERROR_MESSAGES: Record<string, string> = {
  PRACTICE_CASE_NOT_FOUND: 'This file is not available to your account.',
  PRACTICE_CLIENT_NOT_FOUND: 'This client is not available to your account.',
  PRACTICE_STAGE_INVALID: 'That stage is not available for this file.',
  PRACTICE_OUTCOME_REQUIRED: 'Choose an outcome before closing the file.',
  PRACTICE_OUTCOME_INVALID: 'That outcome is not available for this file.',
  PRACTICE_NOTE_TOO_LONG: 'Keep the internal note under 1,000 characters.',
  PRACTICE_MESSAGE_TOO_LONG: 'Keep the message under 1,000 characters.',
  PRACTICE_MESSAGE_REQUIRED: 'Write a message for the client.',
  PRACTICE_MESSAGE_INVALID: 'Write a message for the client, up to 1,000 characters.',
  PRACTICE_FILE_CLOSED: 'This file is closed.',
  PRACTICE_UPLOAD_LIMIT: 'This file has reached its document limit.',
  PRACTICE_DOCUMENT_INVALID: 'Use a PDF, JPG, PNG, WebP or HEIC file up to 10 MB.',
  PRACTICE_DOCUMENT_NOT_FOUND: 'That document is no longer available.',
  PRACTICE_UPLOAD_MISSING: 'The upload did not reach secure storage. Try again.',
  PRACTICE_NOTICE_NOT_FOUND: 'That email has already gone out or was cancelled.',
  PRACTICE_NOTICE_NOT_PENDING: 'That email has already gone out or was cancelled.',
  PRACTICE_EMAIL_INVALID: 'Enter a valid email address, like name@example.com.',
  PRACTICE_EMAIL_TAKEN: 'Another client of the practice already uses this email address.',
  PRACTICE_CLIENT_INVALID: 'Check the client details and try again.',
  PRACTICE_DETAILS_INVALID: 'Check the file details and try again.',
  PRACTICE_INTAKE_INVALID: 'Check the file details and try again.',
  PRACTICE_AREA_INVALID: 'Choose a practice area.',
  PRACTICE_NUMBER_IMMUTABLE: 'File numbers cannot be changed.',
  PRACTICE_PRACTICE_UNKNOWN: 'This practice is not available to your account.',
  PRACTICE_ACCESS_DENIED: 'Your account cannot open files for this practice.',
  LTB_CASE_NOT_FOUND: 'This file is not available to your account.',
  LTB_CLIENT_NOT_FOUND: 'This client is not available to your account.',
  LTB_STAGE_INVALID: 'That stage is not available for this file.',
  LTB_OUTCOME_REQUIRED: 'Choose an outcome before closing the file.',
  LTB_NOTE_TOO_LONG: 'Keep the internal note under 1,000 characters.',
  LTB_REGISTRATION_INCOMPLETE: 'Add a name, mailing address and phone before confirming registration.',
  LTB_IDENTITY_DOCUMENT_REQUIRED: 'Enter the ID document type you checked.',
  LTB_REGISTRATION_STATUS_INVALID: 'That registration status is not available.',
};

export const GENERIC_ERROR = 'The change could not be saved. Refresh and try again.';

export class StaffError extends Error {
  code: string | null;
  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = 'StaffError';
    this.code = code;
  }
}

/** Plain-language message for an RPC, PostgREST, storage or network error. */
export function friendlyError(cause: unknown, fallback = GENERIC_ERROR): string {
  if (cause instanceof StaffError) return cause.message;
  const raw = cause as { message?: string; code?: string; details?: string } | null;
  const message = `${raw?.message || ''} ${raw?.details || ''}`;
  const code = message.match(/\b(?:PRACTICE|LTB)_[A-Z_]+\b/)?.[0];
  if (code) return ERROR_MESSAGES[code] || fallback;
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(message)) {
    return 'The server could not be reached. Check your connection and try again.';
  }
  if (raw?.code === '42501' || /row-level security|permission denied/i.test(message)) {
    return 'This change is not allowed right now. Refresh the file and try again.';
  }
  if (raw?.code === '23514') return 'One of the values is not accepted. Check the fields and try again.';
  return fallback;
}

function fail(error: unknown, fallback = GENERIC_ERROR): never {
  const code = `${(error as { message?: string })?.message || ''}`.match(/\b(?:PRACTICE|LTB)_[A-Z_]+\b/)?.[0] || null;
  throw new StaffError(friendlyError(error, fallback), code);
}

// ---------------------------------------------------------------------------
// Column lists
// ---------------------------------------------------------------------------

const CLIENT_BRIEF = 'ltb_clients(first_name,last_name,organization_name,email,phone,registration_status)';
const CLIENT_FULL = 'ltb_clients(id,client_type,first_name,last_name,organization_name,business_number,contact_title,email,' +
  'phone,mailing_address,city,province,postal_code,occupation,registration_status,registered_at,identity_verified_at,' +
  'identity_document_type,field_sources,portal_revoked_before)';
const CASE_COMMON = 'id,client_id,stage,stage_changed_at,outcome,intake_review_status,returning_client,source,' +
  'client_request_message,client_request_at,client_uploaded_at,portal_visible,created_at,updated_at';

const BOARD_SELECT: Record<PracticeArea, string> = {
  ltb: `${CASE_COMMON},case_number,issue,unit_city,arrears_claimed_cents,arrears_reported_text,notice_form,` +
    `notice_termination_date,hearing_date,${CLIENT_BRIEF}`,
  traffic: `${CASE_COMMON},area,matter_number,ticket_type,ticket_city,option_chosen,option_deadline,meeting_date,` +
    `trial_date,field_sources,${CLIENT_BRIEF}`,
  general: `${CASE_COMMON},area,matter_number,category,client_city,deadline_date,other_party,${CLIENT_BRIEF}`,
};

const DETAIL_SELECT: Record<'ltb' | 'matter', string> = {
  ltb: `${CASE_COMMON},closed_at,case_number,issue,notice_served,rental_unit_address,unit_city,tenant_names,` +
    'rent_amount_cents,rent_period,rent_due_day,lease_start_date,arrears_claimed_cents,arrears_reported_text,notice_form,' +
    'notice_served_on,notice_service_method,notice_termination_date,hearing_date,review_notes,client_notes,field_sources,' +
    `intake_finalized_at,${CLIENT_FULL}`,
  matter: `${CASE_COMMON},closed_at,area,matter_number,client_notes,review_notes,field_sources,intake_finalized_at,` +
    'ticket_type,ticket_city,ticket_received_on,option_chosen,offence_number,offence_date,offence_description,' +
    'statute_section,set_fine_cents,total_payable_cents,court_location,option_deadline,disclosure_requested_on,' +
    `meeting_date,trial_date,category,deadline_date,other_party,client_city,${CLIENT_FULL}`,
};

const DOCUMENT_COLUMNS = 'id,storage_path,original_name,content_type,size_bytes,uploaded_at,kind,extraction_status,' +
  'extracted,uploaded_by,shared_with_client,created_at';
const EVENT_COLUMNS = 'id,event,detail,at,actor_id';
/** The only practice_notices columns staff may read (never snapshot, email_payload or recipients). */
export const NOTICE_COLUMNS = 'id,area,case_id,audience,kind,detail,status,next_attempt_at,sent_at,failure_code,created_at';

/** Column UPDATE grants (LTB migration and ARCHITECTURE.md 3.4). */
export const CLIENT_UPDATE_COLUMNS = [
  'client_type', 'first_name', 'last_name', 'organization_name', 'business_number', 'contact_title', 'phone',
  'mailing_address', 'city', 'province', 'postal_code', 'occupation', 'field_sources',
] as const;
export const LTB_CASE_UPDATE_COLUMNS = [
  'issue', 'notice_served', 'rental_unit_address', 'unit_city', 'tenant_names', 'rent_amount_cents', 'rent_period',
  'rent_due_day', 'lease_start_date', 'arrears_claimed_cents', 'notice_form', 'notice_served_on', 'notice_service_method',
  'notice_termination_date', 'hearing_date', 'review_notes', 'field_sources', 'intake_review_status',
] as const;
export const MATTER_UPDATE_COLUMNS = [
  'ticket_type', 'ticket_city', 'ticket_received_on', 'option_chosen', 'offence_number', 'offence_date',
  'offence_description', 'statute_section', 'set_fine_cents', 'total_payable_cents', 'court_location', 'option_deadline',
  'disclosure_requested_on', 'meeting_date', 'trial_date', 'category', 'deadline_date', 'other_party', 'client_city',
  'review_notes', 'field_sources', 'intake_review_status',
] as const;

function onlyGranted(patch: Record<string, unknown>, allowed: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.includes(key)) throw new StaffError(`${key} cannot be edited here.`);
    out[key] = value;
  }
  return out;
}

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export { isUuid };

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface PracticeAccess {
  practice_id: string;
  practice_name: string;
  member_role: 'licensee' | 'clerk' | 'fabsy_admin' | string;
}

export async function fetchMyPractices(): Promise<PracticeAccess[]> {
  const { data, error } = await db.rpc('ltb_my_practices');
  if (error) throw error;
  return (data || []) as PracticeAccess[];
}

export async function fetchPractice(): Promise<PracticeRow | null> {
  const { data, error } = await db.from('ltb_practices')
    .select('client_updates_enabled,display_name,site_url')
    .eq('id', PRACTICE_ID)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as PracticeRow | null;
}

export async function fetchBoard(area: PracticeArea): Promise<CaseRow[]> {
  let query = db.from(AREAS[area].tables.matters).select(BOARD_SELECT[area]).eq('practice_id', PRACTICE_ID);
  if (area !== 'ltb') query = query.eq('area', area);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(500);
  if (error) throw error;
  return (data || []) as CaseRow[];
}

export interface RecentEvent {
  fileId: string;
  table: 'ltb' | 'matter';
  row: EventRow;
}

/** Latest events across all three areas (Today activity and last staff touch). */
export async function fetchRecentEvents(): Promise<RecentEvent[]> {
  const [ltb, matters] = await Promise.all([
    db.from('ltb_case_events').select(`${EVENT_COLUMNS},case_id`).eq('practice_id', PRACTICE_ID)
      .order('at', { ascending: false }).limit(100),
    db.from('practice_matter_events').select(`${EVENT_COLUMNS},matter_id`).eq('practice_id', PRACTICE_ID)
      .order('at', { ascending: false }).limit(100),
  ]);
  if (ltb.error) throw ltb.error;
  if (matters.error) throw matters.error;
  const rows: RecentEvent[] = [
    ...((ltb.data || []) as EventRow[]).map(row => ({ fileId: row.case_id || '', table: 'ltb' as const, row })),
    ...((matters.data || []) as EventRow[]).map(row => ({ fileId: row.matter_id || '', table: 'matter' as const, row })),
  ];
  return rows.sort((a, b) => Date.parse(b.row.at) - Date.parse(a.row.at));
}

/** Client updates from the last 30 days (failed-update flags across files). */
export async function fetchClientNotices(): Promise<NoticeRow[]> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await db.from('practice_notices').select(NOTICE_COLUMNS)
    .eq('practice_id', PRACTICE_ID).eq('audience', 'client').gte('created_at', since)
    .order('created_at', { ascending: false }).limit(500);
  if (error) throw error;
  return (data || []) as NoticeRow[];
}

export interface FileDetail {
  area: PracticeArea;
  record: CaseRow & Record<string, unknown>;
  client: ClientRecord;
  documents: DocumentRow[];
  events: EventRow[];
  notices: NoticeRow[];
}

export async function fetchFile(area: PracticeArea, id: string): Promise<FileDetail | null> {
  const tables = AREAS[area].tables;
  let fileQuery = db.from(tables.matters).select(DETAIL_SELECT[area === 'ltb' ? 'ltb' : 'matter'])
    .eq('practice_id', PRACTICE_ID).eq('id', id);
  if (area !== 'ltb') fileQuery = fileQuery.eq('area', area);
  const [file, documents, events, notices] = await Promise.all([
    fileQuery.maybeSingle(),
    db.from(tables.documents).select(DOCUMENT_COLUMNS).eq('practice_id', PRACTICE_ID).eq(tables.foreignKey, id)
      .order('created_at', { ascending: true }),
    db.from(tables.events).select(EVENT_COLUMNS).eq('practice_id', PRACTICE_ID).eq(tables.foreignKey, id)
      .order('at', { ascending: false }).limit(100),
    db.from('practice_notices').select(NOTICE_COLUMNS).eq('practice_id', PRACTICE_ID).eq('area', area).eq('case_id', id)
      .eq('audience', 'client').order('created_at', { ascending: false }).limit(50),
  ]);
  if (file.error || documents.error || events.error || notices.error) {
    throw new StaffError('This file could not be loaded. Try again.');
  }
  if (!file.data || !file.data.ltb_clients) return null;
  return {
    area,
    record: file.data,
    client: file.data.ltb_clients as ClientRecord,
    documents: (documents.data || []) as DocumentRow[],
    events: (events.data || []) as EventRow[],
    notices: ((notices.data || []) as NoticeRow[]).filter(notice => notice.audience === 'client'),
  };
}

// ---------------------------------------------------------------------------
// Writes: staff RPCs
// ---------------------------------------------------------------------------

export interface StageInput {
  area: PracticeArea;
  id: string;
  stage: string;
  outcome?: string | null;
  note?: string | null;
  message?: string | null;
  notify: boolean;
}

export interface StageResult {
  stage: string;
  outcome: string | null;
  noticeId: string | null;
}

export async function setStage(input: StageInput): Promise<StageResult> {
  const { data, error } = await db.rpc('practice_set_stage', {
    p_area: input.area,
    p_case_id: input.id,
    p_stage: input.stage,
    p_outcome: input.stage === 'closed' ? input.outcome || null : null,
    p_note: input.note?.trim() || null,
    p_client_message: input.notify ? input.message?.trim() || null : null,
    p_notify: input.notify,
  });
  if (error) fail(error);
  const result = (typeof data === 'string' ? JSON.parse(data) : data) || {};
  return { stage: result.stage || input.stage, outcome: result.outcome ?? null, noticeId: result.noticeId || null };
}

export async function cancelNotice(noticeId: string): Promise<boolean> {
  const { data, error } = await db.rpc('practice_cancel_notice', { p_notice_id: noticeId });
  if (error) fail(error, 'The email could not be cancelled. It may already be on its way.');
  return data === true;
}

export async function requestDocuments(area: PracticeArea, id: string, message: string): Promise<string | null> {
  const { data, error } = await db.rpc('practice_request_documents', {
    p_area: area, p_case_id: id, p_message: message.trim(),
  });
  if (error) fail(error, 'The request could not be sent. Try again.');
  return (data as string | null) || null;
}

export async function clearRequest(area: PracticeArea, id: string): Promise<void> {
  const { error } = await db.rpc('practice_clear_request', { p_area: area, p_case_id: id });
  if (error) fail(error, 'The request could not be cleared. Try again.');
}

/** Content type for an upload, with the extension fallback from the catalog. */
export function resolveContentType(file: File): string | null {
  const type = (file.type || '').toLowerCase();
  if (UPLOAD_LIMITS.contentTypes[type]) return type;
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  return UPLOAD_LIMITS.extensionTypes[extension] || null;
}

export function uploadProblem(file: File): string | null {
  if (!resolveContentType(file)) return 'Use a PDF, JPG, PNG, WebP or HEIC file.';
  if (file.size <= 0) return 'This file is empty.';
  if (file.size > UPLOAD_LIMITS.maxBytes) return 'Files must be 10 MB or smaller.';
  return null;
}

export type UploadStep = 'preparing' | 'uploading' | 'confirming';

/**
 * Staff upload: register the document row, upload to the registered storage
 * path (never upsert), then confirm so the row is marked uploaded.
 */
export async function addStaffDocument(input: {
  area: PracticeArea; id: string; file: File; kind: string | null; share: boolean;
  onStep?: (step: UploadStep) => void;
}): Promise<{ documentId: string }> {
  const contentType = resolveContentType(input.file);
  const problem = uploadProblem(input.file);
  if (problem || !contentType) throw new StaffError(problem || 'Use a PDF, JPG, PNG, WebP or HEIC file.');
  input.onStep?.('preparing');
  const { data, error } = await db.rpc('practice_staff_add_document', {
    p_area: input.area,
    p_case_id: input.id,
    p_name: input.file.name.slice(0, 200),
    p_content_type: contentType,
    p_size: input.file.size,
    p_kind: input.kind || null,
    p_share: input.share,
  });
  if (error) fail(error, 'The document could not be added. Try again.');
  const row = (Array.isArray(data) ? data[0] : data) as { document_id: string; bucket: string; storage_path: string } | null;
  if (!row?.document_id || !row.storage_path) throw new StaffError('The document could not be added. Try again.');
  input.onStep?.('uploading');
  const body = input.file.type === contentType ? input.file : new Blob([input.file], { type: contentType });
  const upload = await supabase.storage.from(row.bucket || AREAS[input.area].bucket)
    .upload(row.storage_path, body, { contentType, upsert: false });
  if (upload.error) throw new StaffError('The upload did not finish. Try again.');
  input.onStep?.('confirming');
  const confirm = await db.rpc('practice_staff_confirm_document', { p_area: input.area, p_document_id: row.document_id });
  if (confirm.error) fail(confirm.error, 'The upload could not be confirmed. Try again.');
  return { documentId: row.document_id };
}

export async function setDocumentShared(area: PracticeArea, documentId: string, shared: boolean): Promise<boolean> {
  const { data, error } = await db.rpc('practice_set_document_shared', {
    p_area: area, p_document_id: documentId, p_shared: shared,
  });
  if (error) fail(error, 'Sharing could not be changed. Try again.');
  return data !== false;
}

export interface NewMatterInput {
  area: PracticeArea;
  client: { email: string; firstName?: string; lastName?: string; organizationName?: string; phone?: string };
  details: Record<string, string | undefined>;
  sendInvite: boolean;
}

export interface NewMatterResult {
  caseId: string;
  caseNumber: string;
  clientId: string;
  noticeId: string | null;
}

const compact = (value: Record<string, string | undefined>) => Object.fromEntries(
  Object.entries(value).map(([key, item]) => [key, item?.trim() || undefined]).filter(([, item]) => item !== undefined),
);

export async function createMatter(input: NewMatterInput): Promise<NewMatterResult> {
  const { data, error } = await db.rpc('practice_create_matter', {
    p_practice_id: PRACTICE_ID,
    p_area: input.area,
    p_client: { ...compact(input.client), email: input.client.email.trim().toLowerCase() },
    p_details: compact(input.details),
    p_send_invite: input.sendInvite,
  });
  if (error) fail(error, 'The file could not be opened. Try again.');
  const row = (Array.isArray(data) ? data[0] : data) as { case_id: string; case_number: string; client_id: string; notice_id: string | null } | null;
  if (!row?.case_id) throw new StaffError('The file could not be opened. Try again.');
  return { caseId: row.case_id, caseNumber: row.case_number, clientId: row.client_id, noticeId: row.notice_id || null };
}

export async function revokePortalAccess(clientId: string): Promise<string | null> {
  const { data, error } = await db.rpc('practice_revoke_portal_access', { p_client_id: clientId });
  if (error) fail(error, 'Client links could not be revoked. Try again.');
  return (data as string | null) || null;
}

/**
 * Changes the client's email (shared by all of their files). The server
 * revokes every link already sent and cancels unsent client updates, then
 * returns the stored, normalized address.
 */
export async function setClientEmail(clientId: string, email: string): Promise<string> {
  const { data, error } = await db.rpc('practice_set_client_email', { p_client_id: clientId, p_email: email.trim() });
  if (error) fail(error, 'The email address could not be changed. Try again.');
  if (typeof data !== 'string' || !data) throw new StaffError('The email address could not be changed. Try again.');
  return data;
}

export async function setClientRegistration(clientId: string, status: RegistrationStatus, idType?: string | null): Promise<void> {
  const { error } = await db.rpc('ltb_set_client_registration', {
    p_client_id: clientId,
    p_status: status,
    p_identity_document_type: status === 'verified' ? idType?.trim() || null : null,
  });
  if (error) fail(error);
}

// ---------------------------------------------------------------------------
// Writes: granted column updates
// ---------------------------------------------------------------------------

export async function updateClient(clientId: string, patch: Record<string, unknown>): Promise<void> {
  const body = onlyGranted(patch, CLIENT_UPDATE_COLUMNS);
  const { data, error } = await db.from('ltb_clients').update(body)
    .eq('id', clientId).eq('practice_id', PRACTICE_ID).select('id');
  if (error) fail(error, 'Client details could not be saved.');
  if (!data?.length) throw new StaffError('Client details could not be saved. Refresh and try again.');
}

export async function updateFile(area: PracticeArea, id: string, patch: Record<string, unknown>): Promise<void> {
  const body = onlyGranted(patch, area === 'ltb' ? LTB_CASE_UPDATE_COLUMNS : MATTER_UPDATE_COLUMNS);
  let query = db.from(AREAS[area].tables.matters).update(body).eq('id', id).eq('practice_id', PRACTICE_ID);
  if (area !== 'ltb') query = query.eq('area', area);
  const { data, error } = await query.select('id');
  if (error) fail(error, 'The file could not be saved. Wait until document reading finishes, then try again.');
  if (!data?.length) throw new StaffError('The file could not be saved. Wait until document reading finishes, then try again.');
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export const SIGNED_URL_SECONDS = 300;

export async function signedDocumentUrl(area: PracticeArea, storagePath: string, download?: string): Promise<string> {
  const { data, error } = await supabase.storage.from(AREAS[area].bucket)
    .createSignedUrl(storagePath, SIGNED_URL_SECONDS, download ? { download } : undefined);
  if (error || !data?.signedUrl) throw new StaffError('This document is not available right now.');
  return data.signedUrl;
}
