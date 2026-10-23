/**
 * Domain model for the staff workspace: row shapes (ARCHITECTURE.md 3.1 and
 * 3.2), normalized file summaries, attention signals, and readable labels for
 * events and client updates. Pure functions only.
 */
import {
  AREAS, GENERAL_CATEGORIES, LTB_ISSUES, STAGES, TICKET_TYPES, addDays, clientStageLabel, daysUntil, isTerminalStage,
  labelFor, matterTitle, outcomeDef, staffStageLabel, stageDef, torontoToday,
  type PracticeArea, type StageDef,
} from './catalog';
import {
  calendarDaysSince, cleanDisplayText, dueLabel, formatClock, formatCountdown, formatDateTime, humanize, isIsoDate, plural,
} from './format';

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export type ReviewStatus = 'pending_scan' | 'scanning' | 'needs_review' | 'ready';
export type RegistrationStatus = 'provisional' | 'registered' | 'verified';
export type FieldSource = { source: 'form' | 'document' | 'staff'; documentId?: string; kind?: string; confidence?: 'high' | 'low' };
export type FieldSources = Record<string, FieldSource | undefined>;

export interface ClientBrief {
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  email: string;
  phone: string | null;
  registration_status: RegistrationStatus;
}

export interface ClientRecord extends ClientBrief {
  id: string;
  client_type: 'individual' | 'organization';
  business_number: string | null;
  contact_title: string | null;
  mailing_address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  occupation: string | null;
  registered_at: string | null;
  identity_verified_at: string | null;
  identity_document_type: string | null;
  field_sources: FieldSources | null;
  portal_revoked_before: string | null;
}

interface CaseRowBase {
  id: string;
  client_id: string;
  stage: string;
  stage_changed_at: string;
  outcome: string | null;
  intake_review_status: ReviewStatus;
  returning_client: boolean;
  source: string;
  client_request_message: string | null;
  client_request_at: string | null;
  client_uploaded_at: string | null;
  /** False while a public intake for a client who already has a file is held out of the client portal. */
  portal_visible?: boolean | null;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  client_notes?: string | null;
  review_notes?: string | null;
  field_sources?: FieldSources | null;
  intake_finalized_at?: string | null;
}

export interface LtbCaseRow extends CaseRowBase {
  case_number: string;
  issue: string;
  notice_served?: string | null;
  rental_unit_address?: string | null;
  unit_city: string | null;
  tenant_names?: string[] | null;
  rent_amount_cents?: number | null;
  rent_period?: string | null;
  rent_due_day?: number | null;
  lease_start_date?: string | null;
  arrears_claimed_cents: number | null;
  arrears_reported_text: string | null;
  notice_form: string | null;
  notice_served_on?: string | null;
  notice_service_method?: string | null;
  notice_termination_date: string | null;
  hearing_date: string | null;
  ltb_clients: ClientBrief | ClientRecord | null;
}

export interface MatterRow extends CaseRowBase {
  area: 'traffic' | 'general';
  matter_number: string;
  ticket_type: string | null;
  ticket_city: string | null;
  ticket_received_on?: string | null;
  option_chosen: string | null;
  offence_number?: string | null;
  offence_date?: string | null;
  offence_description?: string | null;
  statute_section?: string | null;
  set_fine_cents?: number | null;
  total_payable_cents?: number | null;
  court_location?: string | null;
  option_deadline: string | null;
  disclosure_requested_on?: string | null;
  meeting_date: string | null;
  trial_date: string | null;
  category: string | null;
  deadline_date: string | null;
  other_party: string | null;
  client_city: string | null;
  ltb_clients: ClientBrief | ClientRecord | null;
}

export type CaseRow = LtbCaseRow | MatterRow;

export interface DocumentRow {
  id: string;
  storage_path: string;
  original_name: string | null;
  content_type: string;
  size_bytes: number;
  uploaded_at: string | null;
  kind: string | null;
  extraction_status: string;
  extracted: { fields?: Record<string, unknown>; lowConfidence?: string[]; notes?: string } | null;
  uploaded_by: 'client' | 'staff';
  shared_with_client: boolean;
  created_at: string;
}

export interface EventRow {
  id: number | string;
  event: string;
  detail: Record<string, unknown> | null;
  at: string;
  actor_id: string | null;
  case_id?: string;
  matter_id?: string;
}

export type NoticeStatus = 'pending' | 'sending' | 'retry' | 'sent' | 'failed' | 'indeterminate' | 'superseded' | 'cancelled';

export interface NoticeRow {
  id: string;
  area: PracticeArea | null;
  case_id: string | null;
  audience: 'client' | 'staff';
  kind: string;
  detail: Record<string, unknown> | null;
  status: NoticeStatus;
  next_attempt_at: string | null;
  sent_at: string | null;
  failure_code: string | null;
  created_at: string;
}

export interface PracticeRow {
  client_updates_enabled: boolean;
  display_name: string | null;
  site_url: string | null;
}

// ---------------------------------------------------------------------------
// Areas and routes
// ---------------------------------------------------------------------------

export const AREA_LIST: PracticeArea[] = ['ltb', 'traffic', 'general'];
export const AREA_ROUTE: Record<PracticeArea, string> = { ltb: 'landlord', traffic: 'traffic', general: 'other' };
export const AREA_PAGE_TITLE: Record<PracticeArea, string> = {
  ltb: 'Landlord files', traffic: 'Traffic tickets', general: 'Other matters',
};
export const AREA_NOUN: Record<PracticeArea, string> = { ltb: 'landlord file', traffic: 'traffic ticket', general: 'matter' };

export const fileHref = (area: PracticeArea, id: string) => `/admin/files/${area}/${id}`;
export const boardHref = (area: PracticeArea) => `/admin/${AREA_ROUTE[area]}`;
export const fileKey = (area: PracticeArea, id: string) => `${area}:${id}`;

export function laneStages(area: PracticeArea): StageDef[] {
  return STAGES[area].filter(stage => !stage.terminal);
}

export function stageIndex(area: PracticeArea, stage: string): number {
  return STAGES[area].findIndex(def => def.value === stage);
}

// ---------------------------------------------------------------------------
// Normalized file summary
// ---------------------------------------------------------------------------

export type KeyDateKind = 'hearing' | 'l1' | 'option_deadline' | 'meeting' | 'trial' | 'deadline';

export interface KeyDate {
  kind: KeyDateKind;
  label: string;
  date: string;
  estimate?: boolean;
}

export interface StaffFile {
  key: string;
  area: PracticeArea;
  id: string;
  number: string;
  stage: string;
  outcome: string | null;
  terminal: boolean;
  reviewStatus: ReviewStatus;
  clientId: string;
  clientName: string;
  email: string;
  phone: string;
  registration: RegistrationStatus | null;
  title: string;
  city: string;
  createdAt: string;
  updatedAt: string;
  stageChangedAt: string;
  requestMessage: string | null;
  requestAt: string | null;
  clientUploadedAt: string | null;
  returningClient: boolean;
  /** Held out of the client portal until staff take it forward (portal_visible is false). */
  portalHidden: boolean;
  source: string;
  noticeForm: string | null;
  noticeTerminationDate: string | null;
  dates: KeyDate[];
}

/** Badge and explanation for a file held out of the client portal (portal_visible false). */
export const PORTAL_HOLD_LABEL = 'Not shown to the client yet';
export const PORTAL_HOLD_HELP = 'This file came in under an email that already has a file. The client sees it once you move it out of New intake.';

export function clientDisplayName(client: Partial<ClientBrief> | null | undefined): string {
  if (!client) return 'Name pending';
  const person = [client.first_name, client.last_name].filter(Boolean).join(' ').trim();
  return client.organization_name?.trim() || person || 'Name pending';
}

export function fileNumber(area: PracticeArea, row: Partial<LtbCaseRow & MatterRow>): string {
  return (area === 'ltb' ? row.case_number : row.matter_number) || 'Number pending';
}

export function fileCity(area: PracticeArea, row: Partial<LtbCaseRow & MatterRow>): string {
  if (area === 'ltb') return row.unit_city || '';
  if (area === 'traffic') return row.ticket_city || '';
  return row.client_city || '';
}

const PRE_FILING_LTB = new Set(['new_intake', 'under_review', 'quoted', 'retained', 'notice_served']);
const PRE_OPTION_TRAFFIC = new Set(['new_intake', 'under_review', 'quoted', 'retained']);
const MEETING_TRAFFIC = new Set(['option_filed', 'disclosure_requested', 'resolution_meeting']);

export const KEY_DATE_LABELS: Record<KeyDateKind, string> = {
  hearing: 'Hearing',
  l1: 'Earliest L1 filing',
  option_deadline: 'Response deadline',
  meeting: 'Prosecutor meeting',
  trial: 'Trial',
  deadline: 'Deadline',
};

export const KEY_DATE_SHORT: Record<KeyDateKind, string> = {
  hearing: 'Hearing',
  l1: 'L1 from',
  option_deadline: 'Respond by',
  meeting: 'Meeting',
  trial: 'Trial',
  deadline: 'Deadline',
};

/** "overdue", "today", "in 3 days" for dates within a week; empty otherwise. */
export function relativeDays(days: number | null): string {
  if (days === null || days > 7) return '';
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/** L1 can be filed the day after the N4 termination date. */
export function l1FileFrom(terminationDate: string | null | undefined): string | null {
  return isIsoDate(terminationDate) ? addDays(terminationDate, 1) : null;
}

/** Dates that still matter for this file at its current stage. */
export function relevantDates(area: PracticeArea, row: Partial<LtbCaseRow & MatterRow>, today = torontoToday()): KeyDate[] {
  const stage = row.stage || '';
  if (isTerminalStage(area, stage)) return [];
  const dates: KeyDate[] = [];
  const add = (kind: KeyDateKind, date: string | null | undefined, extra: Partial<KeyDate> = {}) => {
    if (isIsoDate(date)) dates.push({ kind, label: KEY_DATE_LABELS[kind], date, ...extra });
  };
  if (area === 'ltb') {
    if (stage !== 'order_issued') add('hearing', row.hearing_date);
    if (row.notice_form === 'N4' && PRE_FILING_LTB.has(stage)) {
      const from = l1FileFrom(row.notice_termination_date);
      if (from && from >= today) add('l1', from);
    }
  } else if (area === 'traffic') {
    const chosen = row.option_chosen || 'unsure';
    if (PRE_OPTION_TRAFFIC.has(stage) && !['trial', 'meeting', 'paid'].includes(chosen)) {
      const source = row.field_sources?.option_deadline;
      add('option_deadline', row.option_deadline, {
        estimate: source?.source === 'form' || source?.source === 'document' || source?.confidence === 'low',
      });
    }
    if (MEETING_TRAFFIC.has(stage)) add('meeting', row.meeting_date);
    add('trial', row.trial_date);
  } else {
    add('deadline', row.deadline_date);
  }
  return dates.sort((a, b) => a.date.localeCompare(b.date));
}

export function toStaffFile(area: PracticeArea, row: CaseRow, today = torontoToday()): StaffFile {
  const record = row as Partial<LtbCaseRow & MatterRow>;
  const client = row.ltb_clients;
  return {
    key: fileKey(area, row.id),
    area,
    id: row.id,
    number: fileNumber(area, record),
    stage: row.stage,
    outcome: row.outcome,
    terminal: isTerminalStage(area, row.stage),
    reviewStatus: row.intake_review_status,
    clientId: row.client_id,
    clientName: clientDisplayName(client),
    email: client?.email || '',
    phone: client?.phone || '',
    registration: client?.registration_status || null,
    title: matterTitle(area, record),
    city: fileCity(area, record),
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.stage_changed_at || row.created_at,
    stageChangedAt: row.stage_changed_at || row.created_at,
    requestMessage: row.client_request_message || null,
    requestAt: row.client_request_at || null,
    clientUploadedAt: row.client_uploaded_at || null,
    returningClient: Boolean(row.returning_client),
    portalHidden: row.portal_visible === false,
    source: row.source || '',
    noticeForm: area === 'ltb' ? record.notice_form || null : null,
    noticeTerminationDate: area === 'ltb' ? record.notice_termination_date || null : null,
    dates: relevantDates(area, record, today),
  };
}

// ---------------------------------------------------------------------------
// Attention signals
// ---------------------------------------------------------------------------

export type Tone = 'danger' | 'warn' | 'info' | 'gold' | 'success' | 'neutral';
export type ReasonKey =
  | 'overdue' | 'notice_failed' | 'due' | 'ready_l1' | 'client_uploaded' | 'needs_review'
  | 'request_open' | 'reading' | 'returning' | 'test';

export interface Reason {
  key: ReasonKey;
  label: string;
  tone: Tone;
  weight: number;
  attention: boolean;
}

export interface Signals {
  keyDate: KeyDate | null;
  keyDays: number | null;
  reasons: Reason[];
  attention: boolean;
  urgency: number;
  dueSoon: boolean;
  clientUploadWaiting: boolean;
  needsReview: boolean;
  readyL1: boolean;
  requestOpenDays: number | null;
}

export interface SignalContext {
  today?: string;
  now?: number;
  /** Latest event with a staff actor for this file, if known. */
  staffTouchAt?: string | null;
  /** Latest client update for this file that was not cancelled or superseded. */
  latestClientNotice?: Pick<NoticeRow, 'status' | 'kind' | 'created_at' | 'failure_code'> | null;
}

const ms = (value: string | null | undefined) => {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : 0;
};

/**
 * The client uploaded something staff have not acted on yet: after an open
 * request, or after the last staff touch (stage change, staff event, or a
 * staff edit of the row after the upload).
 */
export function clientUploadWaiting(file: Pick<StaffFile, 'clientUploadedAt' | 'requestAt' | 'stageChangedAt' | 'updatedAt'>, staffTouchAt?: string | null): boolean {
  const uploaded = ms(file.clientUploadedAt);
  if (!uploaded) return false;
  const requested = ms(file.requestAt);
  if (requested && uploaded > requested) return true;
  const touches = [ms(file.stageChangedAt), ms(staffTouchAt)];
  const updated = ms(file.updatedAt);
  if (updated - uploaded > 1500) touches.push(updated);
  return uploaded > Math.max(0, ...touches);
}

export function computeSignals(file: StaffFile, context: SignalContext = {}): Signals {
  const today = context.today || torontoToday();
  const reasons: Reason[] = [];
  const push = (reason: Reason) => reasons.push(reason);

  const failed = context.latestClientNotice && ['failed', 'indeterminate'].includes(context.latestClientNotice.status);
  if (failed) push({ key: 'notice_failed', label: 'Client update failed', tone: 'danger', weight: 950, attention: true });

  let keyDate: KeyDate | null = null;
  let keyDays: number | null = null;
  let waiting = false;
  let readyL1 = false;
  let requestOpenDays: number | null = null;
  const needsReview = !file.terminal && file.reviewStatus === 'needs_review';

  if (!file.terminal) {
    for (const date of file.dates) {
      const days = daysUntil(date.date, today);
      if (days === null) continue;
      if (keyDays === null || days < keyDays) { keyDate = date; keyDays = days; }
    }
    if (keyDate && keyDays !== null) {
      if (keyDays < 0) push({ key: 'overdue', label: dueLabel(keyDays), tone: 'danger', weight: 1000 + Math.min(99, -keyDays), attention: true });
      else if (keyDays <= 7) {
        push({ key: 'due', label: dueLabel(keyDays), tone: keyDays <= 2 ? 'danger' : 'warn', weight: 900 - keyDays * 15, attention: true });
      }
    }
    if (file.area === 'ltb' && file.stage === 'notice_served' && file.noticeForm === 'N4') {
      const from = l1FileFrom(file.noticeTerminationDate);
      readyL1 = Boolean(from && today >= from);
      if (readyL1) push({ key: 'ready_l1', label: 'Ready to file L1', tone: 'success', weight: 700, attention: true });
    }
    waiting = clientUploadWaiting(file, context.staffTouchAt);
    if (waiting) push({ key: 'client_uploaded', label: 'Client uploaded', tone: 'gold', weight: 650, attention: true });
    if (needsReview) push({ key: 'needs_review', label: 'Needs review', tone: 'warn', weight: 600, attention: true });
    if (file.requestAt && !(ms(file.clientUploadedAt) > ms(file.requestAt))) {
      requestOpenDays = calendarDaysSince(file.requestAt, today) ?? 0;
      const label = requestOpenDays <= 0 ? 'Request open today' : `Request open ${plural(requestOpenDays, 'day')}`;
      push({ key: 'request_open', label, tone: 'info', weight: 400 + Math.min(60, requestOpenDays), attention: requestOpenDays >= 3 });
    }
    if (file.reviewStatus === 'pending_scan' || file.reviewStatus === 'scanning') {
      push({ key: 'reading', label: 'Reading documents', tone: 'info', weight: 300, attention: true });
    }
  }
  if (file.returningClient) push({ key: 'returning', label: 'Returning client', tone: 'neutral', weight: 10, attention: false });
  if (file.source === 'smoke-test') push({ key: 'test', label: 'Test file', tone: 'neutral', weight: 5, attention: false });

  reasons.sort((a, b) => b.weight - a.weight);
  const attentionReasons = reasons.filter(reason => reason.attention);
  return {
    keyDate,
    keyDays,
    reasons,
    attention: attentionReasons.length > 0,
    urgency: attentionReasons[0]?.weight || 0,
    dueSoon: keyDays !== null && keyDays <= 7,
    clientUploadWaiting: waiting,
    needsReview,
    readyL1,
    requestOpenDays,
  };
}

/** Chip tone for a date that is N days away (negative when past). */
export function dateTone(days: number | null): Tone {
  if (days === null) return 'neutral';
  if (days <= 2) return 'danger';
  if (days <= 7) return 'warn';
  return 'neutral';
}

export interface FileWithSignals extends StaffFile {
  signals: Signals;
}

/** Most urgent first; then the nearest date; then the oldest file. */
export function compareUrgency(a: FileWithSignals, b: FileWithSignals): number {
  return (b.signals.urgency - a.signals.urgency)
    || ((a.signals.keyDays ?? 9999) - (b.signals.keyDays ?? 9999))
    || (ms(a.createdAt) - ms(b.createdAt))
    || a.number.localeCompare(b.number);
}

export function compareRecent(a: StaffFile, b: StaffFile): number {
  return ms(b.updatedAt) - ms(a.updatedAt) || b.number.localeCompare(a.number);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export function fileHaystack(file: StaffFile): string {
  const digits = file.phone.replace(/\D/g, '');
  return [file.number, file.number.replace(/-/g, ''), file.clientName, file.email, file.phone, digits, file.city, file.title]
    .join(' ').toLocaleLowerCase('en-CA');
}

export function matchesQuery(file: StaffFile, query: string): boolean {
  const tokens = query.trim().toLocaleLowerCase('en-CA').split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const hay = fileHaystack(file);
  return tokens.every(token => {
    if (hay.includes(token)) return true;
    const digits = token.replace(/\D/g, '');
    return digits.length >= 3 && digits.length === token.replace(/[\s().+-]/g, '').length && hay.includes(digits);
  });
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const REVIEW_LABELS: Record<ReviewStatus, string> = {
  pending_scan: 'Waiting for documents',
  scanning: 'Reading documents',
  needs_review: 'Needs review',
  ready: 'Reviewed',
};

export const REVIEW_TONES: Record<ReviewStatus, Tone> = {
  pending_scan: 'info', scanning: 'info', needs_review: 'warn', ready: 'success',
};

export const REGISTRATION_LABELS: Record<RegistrationStatus, string> = {
  provisional: 'Provisional', registered: 'Registered', verified: 'ID verified',
};

export const ROLE_LABELS: Record<string, string> = {
  licensee: 'Licensee', clerk: 'Clerk', fabsy_admin: 'Software support',
};

export function outcomeLabel(area: PracticeArea, outcome: string | null | undefined, audience: 'staff' | 'client' = 'staff'): string {
  const def = outcomeDef(area, outcome);
  return def ? (audience === 'staff' ? def.staffLabel : def.clientLabel) : '';
}

export function stageWithOutcome(area: PracticeArea, stage: string, outcome: string | null): string {
  const label = staffStageLabel(area, stage);
  if (stage === 'closed' && outcome) return `${label} · ${outcomeLabel(area, outcome)}`;
  return label;
}

export const FIELD_LABELS: Record<string, string> = {
  issue: 'Issue', notice_served: 'Notice served', rental_unit_address: 'Rental unit address', unit_city: 'Rental unit city',
  tenant_names: 'Tenants', rent_amount_cents: 'Rent', rent_period: 'Rent period', rent_due_day: 'Rent due day',
  lease_start_date: 'Lease start', arrears_claimed_cents: 'Arrears claimed', notice_form: 'Notice form',
  notice_served_on: 'Notice served on', notice_service_method: 'Service method', notice_termination_date: 'Termination date',
  hearing_date: 'Hearing date', review_notes: 'Review notes', intake_review_status: 'Review status',
  client_request_message: 'Client request', client_request_at: 'Client request', client_uploaded_at: 'Client upload',
  ticket_type: 'Ticket type', ticket_city: 'Ticket city', ticket_received_on: 'Received on', option_chosen: 'Option chosen',
  offence_number: 'Offence number', offence_date: 'Offence date', offence_description: 'Offence',
  statute_section: 'Statute and section', set_fine_cents: 'Set fine', total_payable_cents: 'Total payable',
  court_location: 'Court location', option_deadline: 'Response deadline', disclosure_requested_on: 'Disclosure requested on',
  meeting_date: 'Meeting date', trial_date: 'Trial date', category: 'Category', deadline_date: 'Deadline',
  other_party: 'Other party', client_city: 'Client city', client_type: 'Client type', first_name: 'First name',
  last_name: 'Last name', organization_name: 'Organization', business_number: 'Business number',
  contact_title: 'Title', phone: 'Phone', mailing_address: 'Mailing address', city: 'City', province: 'Province',
  postal_code: 'Postal code', occupation: 'Occupation', portal_revoked_before: 'Client links', email: 'Email',
};

const fieldList = (value: unknown) => Array.isArray(value)
  ? Array.from(new Set((value as unknown[]).map(field => FIELD_LABELS[String(field)] || humanize(String(field))))).join(', ')
  : '';

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export type EventActor = 'staff' | 'client' | 'system';

export interface EventSummary {
  title: string;
  detail: string;
  quote: string;
  actor: EventActor;
}

/** Readable label for a case event (ltb_case_events / practice_matter_events). */
export function describeEvent(area: PracticeArea, row: EventRow): EventSummary {
  const detail = row.detail || {};
  const staff = Boolean(row.actor_id);
  let actor: EventActor = staff ? 'staff' : 'system';
  let title = humanize(row.event);
  let line = '';
  let quote = '';
  switch (row.event) {
    case 'intake_received': {
      const fromStaff = text(detail.source) === 'staff';
      title = fromStaff ? 'File opened by the practice' : 'File opened from the website';
      const docs = count(detail.documents);
      line = [docs !== null ? (docs ? plural(docs, 'document') : 'No documents') : '', detail.returningClient ? 'Returning client' : '']
        .filter(Boolean).join(' · ');
      actor = fromStaff ? 'staff' : 'client';
      break;
    }
    case 'documents_uploaded': {
      const docs = count(detail.count) ?? 0;
      title = docs ? `${plural(docs, 'document')} received at intake` : 'No documents arrived at intake';
      actor = 'client';
      break;
    }
    case 'stage_changed': {
      const stage = text(detail.stage);
      title = stage ? `Moved to ${staffStageLabel(area, stage)}` : 'Stage changed';
      line = outcomeLabel(area, text(detail.outcome) || null);
      quote = text(detail.note);
      break;
    }
    case 'outcome_changed': {
      title = 'Outcome corrected';
      line = outcomeLabel(area, text(detail.outcome) || null);
      quote = text(detail.note);
      break;
    }
    case 'notice_cancelled': {
      const kind = text(detail.kind);
      title = 'Client email cancelled';
      line = NOTICE_KIND_LABELS[kind] || '';
      break;
    }
    case 'case_updated':
      title = 'File details edited';
      line = fieldList(detail.fields);
      break;
    case 'client_updated':
      title = 'Client details edited';
      line = fieldList(detail.fields);
      break;
    case 'client_registration_changed': {
      const status = text(detail.status);
      title = status === 'verified' ? 'Client identity verified' : status === 'registered' ? 'Client registration confirmed' : 'Client set to provisional';
      break;
    }
    case 'documents_requested':
      title = 'Documents requested';
      quote = text(detail.message);
      break;
    case 'request_cleared':
    case 'client_request_cleared':
    case 'documents_request_cleared':
      title = 'Request cleared';
      break;
    case 'client_uploaded': {
      const docs = count(detail.count) ?? 0;
      title = `Client added ${plural(docs || 1, 'document')}`;
      quote = text(detail.note);
      actor = 'client';
      break;
    }
    case 'staff_uploaded':
      title = 'Practice added a document';
      line = cleanDisplayText(text(detail.name) || text(detail.documentName));
      break;
    case 'document_shared':
      title = 'Document shared with the client';
      line = cleanDisplayText(text(detail.documentName) || text(detail.name));
      break;
    case 'document_unshared':
      title = 'Document no longer shared';
      line = cleanDisplayText(text(detail.documentName) || text(detail.name));
      break;
    case 'portal_access_revoked':
    case 'portal_revoked':
      title = 'Client links revoked';
      break;
    case 'upload_invite_sent':
      title = 'Upload invite sent';
      break;
    default:
      break;
  }
  return { title, detail: line, quote, actor };
}

export const NOTICE_KIND_LABELS: Record<string, string> = {
  intake_received: 'File received',
  stage_changed: 'Stage update',
  documents_requested: 'Document request',
  document_shared: 'Document shared',
  portal_link: 'Secure link',
  upload_invite: 'Upload invite',
  staff_new_intake: 'New intake alert',
  staff_client_uploaded: 'Client upload alert',
};

export function noticeSummary(area: PracticeArea, notice: NoticeRow): string {
  const detail = notice.detail || {};
  if (notice.kind === 'stage_changed') {
    const stage = text(detail.stage);
    const outcome = text(detail.outcome);
    const label = stage ? clientStageLabel(area, stage) : '';
    return [label, outcome ? outcomeLabel(area, outcome, 'client') : ''].filter(Boolean).join(' · ');
  }
  if (notice.kind === 'documents_requested') return text(detail.message);
  if (notice.kind === 'document_shared') return cleanDisplayText(text(detail.documentName));
  return '';
}

/** Statuses practice_cancel_notice still stops: not gone out, not being sent. */
export const CANCELLABLE_NOTICE_STATUSES: readonly NoticeStatus[] = ['pending', 'retry'];

export interface NoticeStatusInfo {
  label: string;
  tone: Tone;
  note: string;
  /** Shows a countdown to its send time. */
  live: boolean;
  /** Staff can still stop it. */
  cancellable: boolean;
}

/** Why an update was cancelled (practice_notices.failure_code). */
const CANCELLED_NOTES: Record<string, string> = {
  cancelled_by_staff: 'Not sent',
  request_cleared: 'Not sent. The request was cleared',
  portal_access_revoked: 'Not sent. Client links were revoked',
  client_email_changed: 'Not sent. The client email changed',
  document_unshared: 'Not sent. The document was unshared',
};

function retryNote(due: number, at: string | null): string {
  const when = due <= 60_000 ? 'shortly'
    : due < 3_600_000 ? `in ${Math.ceil(due / 60_000)} min`
      : at ? `at ${formatClock(at)}` : 'later';
  return `Not sent yet. It will be retried ${when} unless you cancel it.`;
}

export function noticeStatusInfo(notice: NoticeRow, now = Date.now()): NoticeStatusInfo {
  const base = { live: false, cancellable: false };
  switch (notice.status) {
    case 'pending': {
      const due = ms(notice.next_attempt_at) - now;
      return { label: 'Scheduled', tone: 'gold', live: true, cancellable: true, note: due > 0 ? `Sends in ${formatCountdown(due)}` : 'Sending shortly' };
    }
    case 'retry':
      return { ...base, label: 'Retrying', tone: 'warn', cancellable: true, note: retryNote(ms(notice.next_attempt_at) - now, notice.next_attempt_at) };
    case 'sending':
      return { ...base, label: 'Sending', tone: 'info', note: 'On its way' };
    case 'sent':
      return { ...base, label: 'Sent', tone: 'success', note: notice.sent_at ? formatDateTime(notice.sent_at) : '' };
    case 'failed':
      return { ...base, label: 'Failed', tone: 'danger', note: notice.failure_code ? humanize(notice.failure_code) : 'Not delivered' };
    case 'indeterminate':
      return { ...base, label: 'Failed', tone: 'danger', note: 'Delivery could not be confirmed' };
    case 'superseded':
      return { ...base, label: 'Superseded', tone: 'neutral', note: 'A later stage change replaced it' };
    case 'cancelled':
      return { ...base, label: 'Cancelled', tone: 'neutral', note: CANCELLED_NOTES[notice.failure_code || ''] || 'Not sent' };
    default:
      return { ...base, label: humanize(notice.status), tone: 'neutral', note: '' };
  }
}

// ---------------------------------------------------------------------------
// Client email preview (mirrors ARCHITECTURE.md 4.3 client email rules)
// ---------------------------------------------------------------------------

export function stageHeadline(area: PracticeArea, stage: string, outcome: string | null): string {
  const label = clientStageLabel(area, stage);
  if (stage === 'closed' && outcome) {
    const result = outcomeLabel(area, outcome, 'client');
    return result && result !== 'Closed' ? `${label}: ${result}` : label;
  }
  return label;
}

export function clientGreetingName(client: Partial<ClientBrief> | null | undefined): string {
  return client?.first_name?.trim() || client?.organization_name?.trim() || '';
}

// ---------------------------------------------------------------------------
// Request suggestions and form vocabularies
// ---------------------------------------------------------------------------

export const REQUEST_SUGGESTIONS: Record<PracticeArea, { label: string; line: string }[]> = {
  ltb: [
    { label: 'Signed lease', line: 'Please upload your signed lease.' },
    { label: 'Rent ledger', line: 'Please upload the rent ledger.' },
    { label: 'N4 and certificate of service', line: 'Please upload the N4 and the certificate of service.' },
    { label: 'Photo ID', line: 'Please upload a photo ID.' },
  ],
  traffic: [
    { label: 'Front and back of the ticket', line: 'Please upload photos of the front and back of the ticket.' },
    { label: 'Court notice', line: 'Please upload any court notice you received.' },
    { label: 'Photo ID', line: 'Please upload a photo ID.' },
  ],
  general: [
    { label: 'Notice or claim', line: 'Please upload any notice or claim you received.' },
    { label: 'Photo ID', line: 'Please upload a photo ID.' },
  ],
};

export const LTB_ISSUE_OPTIONS = LTB_ISSUES;
export const TICKET_TYPE_OPTIONS = TICKET_TYPES;
export const GENERAL_CATEGORY_OPTIONS = GENERAL_CATEGORIES;

export function issueLabel(value: string | null | undefined): string {
  return labelFor(LTB_ISSUES, value);
}

export function phaseOf(area: PracticeArea, stage: string): string {
  return stageDef(area, stage)?.phase || 'received';
}

export { AREAS };
