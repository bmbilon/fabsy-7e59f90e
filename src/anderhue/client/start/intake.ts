import { ANDERHUE_PRACTICE } from '../../config';
import type { LtbSubmitRequest, PracticeSubmitRequest, UploadFileSpec } from '../api';
import {
  AREAS, GENERAL_CATEGORIES, LTB_ISSUES, TICKET_OPTION_CHOSEN, TICKET_RESPONSE_DAYS, TICKET_TYPES,
  addDays, formatLongDate, labelFor, torontoToday, type PracticeArea,
} from '../catalog';
import { readJson, removeItem, writeJson } from '../lib/storage';

// ---------------------------------------------------------------------------
// Fields and steps
// ---------------------------------------------------------------------------

export interface IntakeFields {
  name: string;
  email: string;
  phone: string;
  notes: string;
  // Landlord
  issue: string;
  served: string;
  owed: string;
  city: string;
  // Traffic
  ticketType: string;
  ticketReceivedOn: string;
  ticketCity: string;
  optionChosen: string;
  // Something else
  category: string;
  deadline: string;
  otherParty: string;
  clientCity: string;
}

export type FieldName = keyof IntakeFields;
export type FieldErrors = Partial<Record<FieldName, string>>;

export const EMPTY_FIELDS: IntakeFields = {
  name: '', email: '', phone: '', notes: '',
  issue: '', served: '', owed: '', city: '',
  ticketType: '', ticketReceivedOn: '', ticketCity: '', optionChosen: '',
  category: '', deadline: '', otherParty: '', clientCity: '',
};

/** Server-side lengths (ltb-intake-core.ts and ARCHITECTURE.md 4.1). */
export const MAX_LENGTH: Record<FieldName, number> = {
  name: 200, email: 254, phone: 40, notes: 2000,
  issue: 40, served: 10, owed: 40, city: 100,
  ticketType: 40, ticketReceivedOn: 10, ticketCity: 100, optionChosen: 20,
  category: 40, deadline: 10, otherParty: 200, clientCity: 100,
};

export const STEPS = [
  { id: 'documents', label: 'Documents' },
  { id: 'details', label: 'Details' },
  { id: 'contact', label: 'Contact' },
  { id: 'review', label: 'Review and send' },
] as const;
export type StepId = typeof STEPS[number]['id'];
export const STEP_IDS: StepId[] = STEPS.map(step => step.id);

export function stepIndex(step: StepId): number {
  return STEP_IDS.indexOf(step);
}

export function isStepId(value: string | null | undefined): value is StepId {
  return typeof value === 'string' && (STEP_IDS as string[]).includes(value);
}

/** /start?area=traffic&step=details. The first step has no step parameter. */
export function stepPath(area: PracticeArea, step: StepId | 'sent'): string {
  const base = `/start?area=${AREAS[area].startParam}`;
  return step === 'documents' ? base : `${base}&step=${step}`;
}

/** Fields shown on each step, in screen order (used to focus the first problem). */
export function stepFields(step: StepId, area: PracticeArea): FieldName[] {
  if (step === 'contact') return ['name', 'email', 'phone'];
  if (step !== 'details') return [];
  if (area === 'ltb') return ['issue', 'served', 'owed', 'city', 'notes'];
  if (area === 'traffic') return ['ticketType', 'ticketReceivedOn', 'ticketCity', 'optionChosen', 'notes'];
  return ['category', 'notes', 'deadline', 'otherParty', 'clientCity'];
}

// ---------------------------------------------------------------------------
// Validation (mirrors the server so a 422 is rare)
// ---------------------------------------------------------------------------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

function validIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** Earliest ticket date the server accepts: two years before today (Toronto). */
export function ticketDateRange(today = torontoToday()): { min: string; max: string } {
  const [year, month, day] = today.split('-');
  const min = `${Number(year) - 2}-${month}-${month === '02' && day === '29' ? '28' : day}`;
  return { min, max: today };
}

export function estimatedResponseDate(receivedOn: string): string | null {
  if (!validIsoDate(receivedOn)) return null;
  return addDays(receivedOn, TICKET_RESPONSE_DAYS);
}

export function validateDetails(area: PracticeArea, fields: IntakeFields): FieldErrors {
  const errors: FieldErrors = {};
  if (area === 'ltb') {
    if (!fields.issue) errors.issue = 'Choose the closest match. Pick “Something else” if none fit.';
  } else if (area === 'traffic') {
    if (!fields.ticketType) errors.ticketType = 'Choose what the ticket is for. Pick “Something else” if none fit.';
    if (fields.ticketReceivedOn) {
      const { min, max } = ticketDateRange();
      if (!validIsoDate(fields.ticketReceivedOn)) errors.ticketReceivedOn = 'Enter the date as year, month and day.';
      else if (fields.ticketReceivedOn > max) errors.ticketReceivedOn = 'This date is in the future. Enter the date you got the ticket.';
      else if (fields.ticketReceivedOn < min) errors.ticketReceivedOn = 'Enter a date within the last two years.';
    }
  } else {
    if (!fields.category) errors.category = 'Choose the closest match. Pick “Something else” if none fit.';
    if (fields.notes.trim().length < 10) {
      errors.notes = fields.notes.trim()
        ? 'Tell us a little more, at least 10 characters.'
        : 'Tell us what you need help with.';
    }
    if (fields.deadline && !validIsoDate(fields.deadline)) errors.deadline = 'Enter the date as year, month and day.';
  }
  return errors;
}

export function validateContact(fields: IntakeFields): FieldErrors {
  const errors: FieldErrors = {};
  if (!fields.name.trim()) errors.name = 'Enter your full name.';
  if (!fields.email.trim()) errors.email = 'Enter your email address. We send your file link there.';
  else if (!isValidEmail(fields.email)) errors.email = 'Enter an email address like name@example.com.';
  const digits = fields.phone.replace(/\D/g, '');
  if (fields.phone.trim() && (digits.length < 7 || digits.length > 15)) {
    errors.phone = 'Enter a phone number with the area code, or leave it blank.';
  }
  return errors;
}

export function validateStep(step: StepId, area: PracticeArea, fields: IntakeFields): FieldErrors {
  if (step === 'details') return validateDetails(area, fields);
  if (step === 'contact') return validateContact(fields);
  return {};
}

/** The first step that still needs something, or null when the file is ready to send. */
export function firstInvalidStep(area: PracticeArea, fields: IntakeFields): StepId | null {
  if (Object.keys(validateDetails(area, fields)).length) return 'details';
  if (Object.keys(validateContact(fields)).length) return 'contact';
  return null;
}

// ---------------------------------------------------------------------------
// Email typo help
// ---------------------------------------------------------------------------

const KNOWN_DOMAINS = [
  'gmail.com', 'hotmail.com', 'hotmail.ca', 'outlook.com', 'outlook.ca', 'live.com', 'live.ca', 'msn.com',
  'yahoo.com', 'yahoo.ca', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'mail.com', 'gmx.com',
  'proton.me', 'protonmail.com', 'rogers.com', 'bell.net', 'sympatico.ca', 'shaw.ca', 'telus.net', 'cogeco.ca',
  'videotron.ca', 'eastlink.ca', 'sasktel.net',
];
const SUGGEST_DOMAINS = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.ca', 'icloud.com', 'live.com', 'rogers.com', 'bell.net', 'sympatico.ca', 'shaw.ca', 'telus.net', 'cogeco.ca'];

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/** "name@gmial.com" suggests "name@gmail.com". Null when the domain looks fine. */
export function emailSuggestion(email: string): string | null {
  const match = /^([^\s@]+)@([^\s@]+\.[^\s@]+)$/.exec(email.trim().toLowerCase());
  if (!match) return null;
  const [, local, domain] = match;
  if (KNOWN_DOMAINS.includes(domain) || domain.length < 5) return null;
  let best: string | null = null;
  let bestDistance = 3;
  for (const candidate of SUGGEST_DOMAINS) {
    const d = distance(domain, candidate);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best && bestDistance <= 2 ? `${local}@${best}` : null;
}

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

function cleanOwed(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^[\d,.\s]+$/.test(trimmed) ? `$${trimmed.replace(/\s+/g, '')}` : trimmed;
}

export function ltbPayload(fields: IntakeFields, files: UploadFileSpec[], company: string, elapsedMs: number): LtbSubmitRequest {
  const served = fields.served === 'no' || fields.served === 'yes' ? fields.served : 'unsure';
  return {
    practiceId: ANDERHUE_PRACTICE.practiceId,
    name: fields.name.trim(),
    email: fields.email.trim(),
    phone: fields.phone.trim(),
    city: fields.city.trim(),
    issue: fields.issue || 'other',
    owed: cleanOwed(fields.owed),
    served,
    notes: fields.notes.trim(),
    company,
    elapsedMs,
    files,
  };
}

export function practicePayload(area: 'traffic' | 'general', fields: IntakeFields, files: UploadFileSpec[], company: string, elapsedMs: number): PracticeSubmitRequest {
  const common = {
    practiceId: ANDERHUE_PRACTICE.practiceId,
    name: fields.name.trim(),
    email: fields.email.trim(),
    phone: fields.phone.trim(),
    notes: fields.notes.trim(),
    company,
    elapsedMs,
    files,
  };
  if (area === 'traffic') {
    return {
      ...common,
      area,
      ticketType: fields.ticketType || 'other',
      ticketCity: fields.ticketCity.trim(),
      ticketReceivedOn: fields.ticketReceivedOn,
      optionChosen: fields.optionChosen || 'unsure',
    };
  }
  return {
    ...common,
    area,
    category: fields.category || 'other',
    deadline: fields.deadline,
    otherParty: fields.otherParty.trim(),
    clientCity: fields.clientCity.trim(),
  };
}

// ---------------------------------------------------------------------------
// Server messages
// ---------------------------------------------------------------------------

const SERVER_FIELD: Record<string, { field?: FieldName; step: StepId; label: string }> = {
  name: { field: 'name', step: 'contact', label: 'your name' },
  email: { field: 'email', step: 'contact', label: 'your email address' },
  phone: { field: 'phone', step: 'contact', label: 'your phone number' },
  notes: { field: 'notes', step: 'details', label: 'what you need help with' },
  city: { field: 'city', step: 'details', label: 'the rental unit city' },
  issue: { field: 'issue', step: 'details', label: 'the issue' },
  owed: { field: 'owed', step: 'details', label: 'rent owed' },
  ticketType: { field: 'ticketType', step: 'details', label: 'what the ticket is for' },
  ticketReceivedOn: { field: 'ticketReceivedOn', step: 'details', label: 'the date you got the ticket' },
  ticketCity: { field: 'ticketCity', step: 'details', label: 'the city on the ticket' },
  optionChosen: { field: 'optionChosen', step: 'details', label: 'what you have done so far' },
  category: { field: 'category', step: 'details', label: 'the kind of matter' },
  deadline: { field: 'deadline', step: 'details', label: 'the deadline' },
  otherParty: { field: 'otherParty', step: 'details', label: 'the other party' },
  clientCity: { field: 'clientCity', step: 'details', label: 'your city' },
  files: { step: 'documents', label: 'your documents' },
};

const FIELD_MESSAGES: FieldErrors = {
  name: 'Check your name.',
  email: 'Check your email address.',
  phone: 'Check your phone number, or leave it blank.',
  notes: 'Tell us a little more, at least 10 characters.',
  ticketReceivedOn: 'Enter a date within the last two years, not in the future.',
  deadline: 'Check this date.',
};

/** Where a 400 or 422 from submit should send the person, and what to say. */
export function serverErrorTarget(message: string): { step: StepId; errors: FieldErrors; message: string } {
  const list = /check these fields:\s*([^.]+)/i.exec(message);
  if (list) {
    const keys = list[1].split(/,\s*|\s+and\s+/).map(item => item.trim()).filter(Boolean);
    const known = keys.map(key => SERVER_FIELD[key]).filter(Boolean);
    if (known.length) {
      const errors: FieldErrors = {};
      for (const entry of known) if (entry.field) errors[entry.field] = FIELD_MESSAGES[entry.field] || 'Check this answer.';
      const step = known.map(entry => entry.step).sort((a, b) => stepIndex(a) - stepIndex(b))[0];
      const labels = known.map(entry => entry.label);
      const joined = labels.length > 1 ? `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}` : labels[0];
      return { step, errors, message: `We could not accept ${joined}. Please check and try again.` };
    }
  }
  if (/attach|file|document|photo|pdf|upload|mb/i.test(message)) return { step: 'documents', errors: {}, message };
  if (/email|name|phone/i.test(message)) return { step: 'contact', errors: {}, message };
  if (/date|deadline|ticket|notes|help|issue|category/i.test(message)) return { step: 'details', errors: {}, message };
  return { step: 'review', errors: {}, message };
}

// ---------------------------------------------------------------------------
// Review rows
// ---------------------------------------------------------------------------

export function detailRows(area: PracticeArea, fields: IntakeFields): { label: string; value: string }[] {
  const served: Record<string, string> = { no: 'Not yet', yes: 'Yes', unsure: 'Not sure' };
  if (area === 'ltb') {
    return [
      { label: 'Issue', value: labelFor(LTB_ISSUES, fields.issue) },
      { label: 'Notice served', value: served[fields.served] || '' },
      { label: 'Approximate rent owed', value: cleanOwed(fields.owed) },
      { label: 'Rental unit city', value: fields.city.trim() },
      { label: 'Anything we should know', value: fields.notes.trim() },
    ];
  }
  if (area === 'traffic') {
    return [
      { label: 'The ticket is for', value: labelFor(TICKET_TYPES, fields.ticketType) },
      { label: 'Date you got it', value: fields.ticketReceivedOn ? formatLongDate(fields.ticketReceivedOn) || fields.ticketReceivedOn : '' },
      { label: 'City where it was issued', value: fields.ticketCity.trim() },
      { label: 'Done so far', value: labelFor(TICKET_OPTION_CHOSEN, fields.optionChosen) },
      { label: 'Anything we should know', value: fields.notes.trim() },
    ];
  }
  return [
    { label: 'Kind of matter', value: labelFor(GENERAL_CATEGORIES, fields.category) },
    { label: 'What you need help with', value: fields.notes.trim() },
    { label: 'Deadline', value: fields.deadline ? formatLongDate(fields.deadline) || fields.deadline : '' },
    { label: 'Other party', value: fields.otherParty.trim() },
    { label: 'Your city', value: fields.clientCity.trim() },
  ];
}

// ---------------------------------------------------------------------------
// Draft and receipt persistence (typed fields only, never files)
// ---------------------------------------------------------------------------

const DRAFT_PREFIX = 'anderhue.start.v1.';
const SENT_KEY = 'anderhue.start.v1.sent';

interface StoredDraft {
  fields: Partial<IntakeFields>;
  fileCount: number;
  savedAt: number;
}

export function loadDraft(area: PracticeArea): { fields: IntakeFields; fileCount: number } | null {
  const stored = readJson<StoredDraft>('session', `${DRAFT_PREFIX}${area}`);
  if (!stored || typeof stored !== 'object' || !stored.fields) return null;
  const fields = { ...EMPTY_FIELDS };
  for (const key of Object.keys(EMPTY_FIELDS) as FieldName[]) {
    const value = (stored.fields as Record<string, unknown>)[key];
    if (typeof value === 'string') fields[key] = value.slice(0, MAX_LENGTH[key]);
  }
  return { fields, fileCount: Number.isFinite(stored.fileCount) ? Number(stored.fileCount) : 0 };
}

export function saveDraft(area: PracticeArea, fields: IntakeFields, fileCount: number): void {
  const hasContent = Object.values(fields).some(value => value.trim() !== '') || fileCount > 0;
  if (!hasContent) {
    removeItem('session', `${DRAFT_PREFIX}${area}`);
    return;
  }
  writeJson('session', `${DRAFT_PREFIX}${area}`, { fields, fileCount, savedAt: Date.now() } satisfies StoredDraft);
}

export function clearDraft(area: PracticeArea): void {
  removeItem('session', `${DRAFT_PREFIX}${area}`);
}

export interface SentSummary {
  area: PracticeArea;
  number: string;
  email: string;
  sentCount: number;
  failedNames: string[];
  /** The documents may have arrived but finalize could not be confirmed. */
  unconfirmed: boolean;
}

export function loadSent(): SentSummary | null {
  const stored = readJson<SentSummary>('session', SENT_KEY);
  if (!stored || typeof stored.number !== 'string' || !(stored.area in AREAS)) return null;
  return {
    area: stored.area,
    number: stored.number,
    email: typeof stored.email === 'string' ? stored.email : '',
    sentCount: Number(stored.sentCount) || 0,
    failedNames: Array.isArray(stored.failedNames) ? stored.failedNames.filter(name => typeof name === 'string') : [],
    unconfirmed: Boolean(stored.unconfirmed),
  };
}

export function saveSent(summary: SentSummary): void {
  writeJson('session', SENT_KEY, summary);
}

export function clearSent(): void {
  removeItem('session', SENT_KEY);
}
