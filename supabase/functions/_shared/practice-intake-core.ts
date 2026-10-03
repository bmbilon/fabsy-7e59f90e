/**
 * Pure logic for the AnderHue practice intake (traffic tickets and other
 * matters) and the HTTP plumbing shared by the two public practice functions.
 * No network, no Deno APIs, so it is shared by the edge functions and the
 * Node test suite (scripts/test-practice-files.mjs).
 *
 * Ticket data read from an upload is a suggestion. It only fills empty matter
 * fields, never overwrites what a client typed or what staff confirmed, and
 * never touches the client record.
 */
import { cleanText, splitName, toCents, validDate } from "./ltb-intake-core.ts";
import {
  addDays,
  areaFromParam,
  GENERAL_CATEGORIES,
  TICKET_OPTION_CHOSEN,
  TICKET_RESPONSE_DAYS,
  TICKET_TYPES,
  torontoToday,
  UPLOAD_LIMITS,
} from "./practice-catalog.ts";
import { hmacHex, PORTAL_SECRET_MIN_LENGTH } from "./practice-portal-token.ts";

export const PRACTICE_DEFAULT_ID = "anderhue-paralegal";
export const PRACTICE_INTAKE_AREAS = ["traffic", "general"] as const;
export type IntakeArea = typeof PRACTICE_INTAKE_AREAS[number];
export const PRACTICE_DEFAULT_ORIGINS = "https://anderhue.ca,https://www.anderhue.ca,https://anderhue-paralegal.vercel.app";

/** A request problem with a plain-sentence message that is safe to show the visitor. */
export class RequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export const MESSAGES = {
  unreadable: "Your request could not be read.",
  originNotAllowed: "Requests from this site are not allowed.",
  usePost: "Use POST.",
  unknownPractice: "Unknown practice.",
  fileRules: `Attach photos or PDFs, ${UPLOAD_LIMITS.maxBytes / (1024 * 1024)} MB or smaller each.`,
  tooManyFiles: `Attach up to ${UPLOAD_LIMITS.maxFilesPerBatch} files.`,
  unexpected: "Something went wrong on our side. Please try again or call the office.",
} as const;

// Stripping control characters is the point of this pattern.
// deno-lint-ignore no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g; // eslint-disable-line no-control-regex

export function cleanMultiline(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL, "").replace(/\r\n?/g, "\n").trim().slice(0, max);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function isEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** A single name-like word: a letter, then letters, apostrophes or hyphens. */
const GREETING_NAME = /^[\p{L}][\p{L}'’-]{0,39}$/u;

/**
 * The name to greet a client by, in emails and in the portal. Public intakes
 * are anonymous, so the stored first name is untrusted: only its first word is
 * used, and only when it looks like a name, so nothing the practice shows a
 * client can carry a stranger's sentence or link. Otherwise "" (greet with
 * "Hello,").
 */
export function greetingName(firstName: unknown): string {
  if (typeof firstName !== "string") return "";
  const first = firstName.normalize("NFC").trim().split(/\s+/)[0] || "";
  return GREETING_NAME.test(first) ? first : "";
}

// ---------------------------------------------------------------------------
// File specs (intake and portal uploads share the same rules)
// ---------------------------------------------------------------------------

export interface PracticeFileSpec {
  name: string;
  contentType: string;
  extension: string;
  size: number;
}

/** Non-standard types some browsers and phones send for the six accepted formats. */
const TYPE_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
  "image/heic-sequence": "image/heic",
  "image/heif-sequence": "image/heif",
};

/**
 * Resolves the stored content type: a declared type among the six accepted
 * ones wins; otherwise (empty, generic or non-standard type) the file name's
 * extension decides. Returns null when neither is acceptable.
 */
export function resolveContentType(declared: unknown, name: string): string | null {
  const type = cleanText(declared, 100).toLowerCase().split(";")[0].trim();
  const aliased = TYPE_ALIASES[type] || type;
  if (UPLOAD_LIMITS.contentTypes[aliased]) return aliased;
  const extension = (name.match(/\.([a-z0-9]{1,8})$/i)?.[1] || "").toLowerCase();
  return UPLOAD_LIMITS.extensionTypes[extension] || null;
}

export function parseFileSpecs(raw: unknown, options: { required?: boolean } = {}): PracticeFileSpec[] {
  const list = raw === undefined || raw === null ? [] : raw;
  if (!Array.isArray(list) || list.length > UPLOAD_LIMITS.maxFilesPerBatch) {
    throw new RequestError(MESSAGES.tooManyFiles);
  }
  if (options.required && list.length === 0) throw new RequestError("Choose at least one file to upload.");
  return list.map((file): PracticeFileSpec => {
    const spec = (file && typeof file === "object" ? file : {}) as Record<string, unknown>;
    // Keep only the base name: browsers may send C:\fakepath\... or folder paths.
    const base = typeof spec.name === "string" ? spec.name.split(/[\\/]/).pop() || "" : "";
    const name = cleanText(base, 200);
    const contentType = resolveContentType(spec.contentType, name);
    const size = Number(spec.size);
    if (!contentType || !Number.isInteger(size) || size <= 0 || size > UPLOAD_LIMITS.maxBytes) {
      throw new RequestError(MESSAGES.fileRules);
    }
    return { name, contentType, extension: UPLOAD_LIMITS.contentTypes[contentType], size };
  });
}

/** Storage object name for a document: {caseId}/{documentId}.{ext}. */
export function documentPath(caseId: string, documentId: string, extension: string): string {
  return `${caseId.toLowerCase()}/${documentId.toLowerCase()}.${extension}`;
}

/** Document ids whose objects actually exist in a storage folder listing. */
export function presentDocumentIds(objects: { name?: unknown }[] | null | undefined): Set<string> {
  return new Set((objects || [])
    .map(object => typeof object?.name === "string" ? object.name.split(".")[0].toLowerCase() : "")
    .filter(name => UUID.test(name)));
}

// ---------------------------------------------------------------------------
// Submission parsing
// ---------------------------------------------------------------------------

export interface PracticeSubmission {
  practiceId: string;
  area: IntakeArea;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  notes: string;
  // Traffic
  ticketType: string | null;
  ticketCity: string;
  ticketReceivedOn: string | null;
  optionChosen: string | null;
  // General
  category: string | null;
  deadline: string | null;
  otherParty: string;
  clientCity: string;
  files: PracticeFileSpec[];
  /** Honeypot filled or submitted faster than a person can. */
  bot: boolean;
}

const oneOf = (list: readonly { value: string }[], value: unknown, fallback: string) =>
  list.some(item => item.value === value) ? value as string : fallback;

/** The same calendar day `years` years away (Feb 29 becomes Feb 28). */
export function shiftYears(isoDate: string, years: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(year + years, month - 1, day));
  if (target.getUTCMonth() !== month - 1) target.setUTCDate(0);
  return target.toISOString().slice(0, 10);
}

/** Returns the date, null when blank, or "invalid". */
function boundedDate(value: unknown, min: string, max: string): string | null | "invalid" {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return null;
  const date = validDate(value);
  if (!date || typeof value !== "string" || value.trim().length !== 10) return "invalid";
  return date < min || date > max ? "invalid" : date;
}

export function parsePracticeSubmission(input: unknown, now: Date = new Date()): PracticeSubmission {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new RequestError(MESSAGES.unreadable);
  const body = input as Record<string, unknown>;
  const bot = isBot(body);

  const practiceId = cleanText(body.practiceId, 60) || PRACTICE_DEFAULT_ID;
  if (!/^[a-z0-9-]{3,60}$/.test(practiceId)) throw new RequestError(MESSAGES.unknownPractice);
  const area = areaFromParam(typeof body.area === "string" ? body.area : "");
  if (practiceId === PRACTICE_DEFAULT_ID && area === "general") {
    throw new RequestError("AnderHue accepts only Landlord and Tenant Board matters and traffic tickets.");
  }
  if (area !== "traffic" && area !== "general") throw new RequestError("Unknown practice area.");

  const { firstName, lastName } = splitName(cleanText(body.name, 200));
  const email = cleanText(body.email, 254).toLowerCase();
  const phoneInput = cleanText(body.phone, 40);
  const digits = phoneInput.replace(/\D/g, "");
  const notes = cleanMultiline(body.notes, 2000);
  const today = torontoToday(now);

  const invalid: string[] = [];
  if (!firstName) invalid.push("name");
  if (!isEmail(email)) invalid.push("email");
  if (phoneInput && (digits.length < 7 || digits.length > 15)) invalid.push("phone");

  let ticketReceivedOn: string | null = null;
  let deadline: string | null = null;
  if (area === "traffic") {
    const received = boundedDate(body.ticketReceivedOn, shiftYears(today, -2), today);
    if (received === "invalid") invalid.push("ticket date");
    else ticketReceivedOn = received;
  } else {
    const due = boundedDate(body.deadline, shiftYears(today, -2), shiftYears(today, 10));
    if (due === "invalid") invalid.push("deadline");
    else deadline = due;
    if (notes.length < 10) invalid.push("description (at least 10 characters)");
  }
  if (invalid.length) throw new RequestError(`Check these fields: ${invalid.join(", ")}.`, 422);

  const files = parseFileSpecs(body.files);
  const traffic = area === "traffic";
  return {
    practiceId, area, firstName, lastName, email,
    phone: phoneInput ? `${phoneInput.startsWith("+") ? "+" : ""}${digits}` : "",
    notes,
    ticketType: traffic ? oneOf(TICKET_TYPES, body.ticketType, "other") : null,
    ticketCity: traffic ? cleanText(body.ticketCity, 100) : "",
    ticketReceivedOn,
    optionChosen: traffic ? oneOf(TICKET_OPTION_CHOSEN, body.optionChosen, "unsure") : null,
    category: traffic ? null : oneOf(GENERAL_CATEGORIES, body.category, "other"),
    deadline,
    otherParty: traffic ? "" : cleanText(body.otherParty, 200),
    clientCity: traffic ? "" : cleanText(body.clientCity, 100),
    files, bot,
  };
}

/** The p_intake object for practice_register_intake (ARCHITECTURE.md 3.4). */
export function intakeRecord(submission: PracticeSubmission, userAgent: string): Record<string, unknown> {
  const base = {
    email: submission.email, firstName: submission.firstName, lastName: submission.lastName,
    phone: submission.phone, notes: submission.notes, userAgent: cleanText(userAgent, 400),
  };
  return submission.area === "traffic"
    ? { ...base, ticketType: submission.ticketType, ticketCity: submission.ticketCity,
      ticketReceivedOn: submission.ticketReceivedOn, optionChosen: submission.optionChosen }
    : { ...base, category: submission.category, deadline: submission.deadline,
      otherParty: submission.otherParty, clientCity: submission.clientCity };
}

// ---------------------------------------------------------------------------
// Ticket extraction normalisation
// ---------------------------------------------------------------------------

export interface TicketFields {
  offenceNumber: string | null;
  offenceDate: string | null;
  offenceDescription: string | null;
  statuteSection: string | null;
  setFineCents: number | null;
  totalPayableCents: number | null;
  courtLocation: string | null;
  ticketCity: string | null;
}

export interface TicketExtraction {
  documentId: string;
  kind: "ticket";
  fields: TicketFields;
  lowConfidence: (keyof TicketFields)[];
  notes: string;
  /** At least one ticket field was read from the image. */
  readSomething: boolean;
}

export const TICKET_FIELD_KEYS: (keyof TicketFields)[] = [
  "offenceNumber", "offenceDate", "offenceDescription", "statuteSection", "setFineCents",
  "totalPayableCents", "courtLocation", "ticketCity",
];

/** Raw tool keys returned by extract_ontario_offence_notice. */
export const TICKET_RAW_KEYS: Record<keyof TicketFields, string> = {
  offenceNumber: "offence_number", offenceDate: "offence_date", offenceDescription: "offence_description",
  statuteSection: "statute_section", setFineCents: "set_fine", totalPayableCents: "total_payable",
  courtLocation: "court_location", ticketCity: "ticket_city",
};

/** Ontario driver's licence numbers: one letter and 14 digits, often grouped 4-5-5. */
const LICENCE_NUMBER = "\\b[A-Z]\\d{4}[\\s-]?\\d{5}[\\s-]?\\d{5}\\b";

/** Removes anything shaped like a driver's licence number from free text. */
export function redactIdentifiers(text: string): string {
  return text.replace(new RegExp(LICENCE_NUMBER, "gi"), "[number removed]");
}

function textOrNull(value: unknown, max: number): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = cleanText(redactIdentifiers(String(value)), max);
  return text && !/^(null|n\/a|none|unknown|not visible|illegible)$/i.test(text) ? text : null;
}

/**
 * The ticket's own number, as printed. Dropped (not truncated) when it is too
 * long, has no digit, has unexpected characters or looks like a licence number.
 */
export function normalizeOffenceNumber(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = cleanText(String(value), 120).toUpperCase().replace(/\s+/g, " ");
  if (!text || text.length > 40 || !/\d/.test(text) || !/^[A-Z0-9][A-Z0-9 ./-]*$/.test(text)) return null;
  return new RegExp(LICENCE_NUMBER, "i").test(text) ? null : text;
}

export function normalizeTicketExtraction(
  documentId: string, raw: Record<string, unknown>, today: string = torontoToday(),
): TicketExtraction {
  const offenceDate = validDate(raw.offence_date);
  const fields: TicketFields = {
    offenceNumber: normalizeOffenceNumber(raw.offence_number),
    offenceDate: offenceDate && offenceDate <= today ? offenceDate : null,
    offenceDescription: textOrNull(raw.offence_description, 300),
    statuteSection: textOrNull(raw.statute_section, 80),
    setFineCents: toCents(raw.set_fine),
    totalPayableCents: toCents(raw.total_payable),
    courtLocation: textOrNull(raw.court_location, 200),
    ticketCity: textOrNull(raw.ticket_city, 100),
  };
  const rawLow = Array.isArray(raw.low_confidence_fields) ? raw.low_confidence_fields.map(String) : [];
  const lowConfidence = TICKET_FIELD_KEYS.filter(key =>
    fields[key] !== null && (rawLow.includes(TICKET_RAW_KEYS[key]) || rawLow.includes(key)));
  return {
    documentId, kind: "ticket", fields, lowConfidence,
    notes: textOrNull(raw.notes, 500) || "",
    readSomething: TICKET_FIELD_KEYS.some(key => fields[key] !== null),
  };
}

// ---------------------------------------------------------------------------
// Merge ticket data into a traffic matter
// ---------------------------------------------------------------------------

export type FieldSource = {
  source: "form" | "document" | "staff";
  documentId?: string;
  kind?: string;
  confidence?: "high" | "low";
};

export interface TrafficMatterState {
  offence_number: string | null;
  offence_date: string | null;
  offence_description: string | null;
  statute_section: string | null;
  set_fine_cents: number | null;
  total_payable_cents: number | null;
  court_location: string | null;
  ticket_city: string | null;
  option_deadline: string | null;
  field_sources: Record<string, FieldSource>;
}

export interface TicketMergeInput {
  matter: TrafficMatterState;
  extractions: TicketExtraction[];
  /** Uploaded documents that could not be read automatically (PDF, failed read). */
  unreadDocuments: { documentId: string; reason: "pdf" | "failed" }[];
}

export interface TicketMergeResult {
  matterPatch: Partial<TrafficMatterState>;
  reviewStatus: "ready" | "needs_review";
  notes: string[];
}

type MatterColumn = Exclude<keyof TrafficMatterState, "field_sources">;

const COLUMN: Record<keyof TicketFields, MatterColumn> = {
  offenceNumber: "offence_number", offenceDate: "offence_date", offenceDescription: "offence_description",
  statuteSection: "statute_section", setFineCents: "set_fine_cents", totalPayableCents: "total_payable_cents",
  courtLocation: "court_location", ticketCity: "ticket_city",
};

const LABELS: Record<MatterColumn, string> = {
  offence_number: "offence number", offence_date: "offence date", offence_description: "offence description",
  statute_section: "statute and section", set_fine_cents: "set fine", total_payable_cents: "total payable",
  court_location: "court location", ticket_city: "ticket city", option_deadline: "response deadline",
};

const REQUIRED: (keyof TicketFields)[] = ["offenceNumber", "offenceDate", "offenceDescription"];

const blank = (value: unknown) => value === null || value === undefined || value === "";
const comparable = (value: unknown) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shown = (column: MatterColumn, value: unknown) =>
  typeof value === "number" && column.endsWith("_cents") ? money(value) : String(value);
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function mergeTicketIntake(input: TicketMergeInput): TicketMergeResult {
  const patch: Partial<TrafficMatterState> = {};
  const sources: Record<string, FieldSource> = { ...(input.matter.field_sources || {}) };
  const conflicts: string[] = [];
  const lowConfidence = new Set<MatterColumn>();
  const read = new Set<keyof TicketFields>();
  const extra: string[] = [];
  let dateDocument: string | null = null;
  const current = (column: MatterColumn) =>
    column in patch ? (patch as Record<string, unknown>)[column] : input.matter[column];

  for (const extraction of input.extractions) {
    for (const key of TICKET_FIELD_KEYS) {
      const value = extraction.fields[key];
      if (blank(value)) continue;
      read.add(key);
      const column = COLUMN[key];
      const existing = current(column);
      const low = extraction.lowConfidence.includes(key);
      if (blank(existing)) {
        (patch as Record<string, unknown>)[column] = value;
        sources[column] = {
          source: "document", documentId: extraction.documentId, kind: "ticket", confidence: low ? "low" : "high",
        };
        if (low) lowConfidence.add(column);
        if (key === "offenceDate") dateDocument = extraction.documentId;
      } else if (comparable(existing) !== comparable(value)) {
        conflicts.push(`A ticket image shows the ${LABELS[column]} as "${shown(column, value)}", but the file has "${
          shown(column, existing)}".`);
      } else if (key === "offenceDate" && !dateDocument) {
        dateDocument = extraction.documentId;
      }
    }
    if (!extraction.readSomething) extra.push("One image did not show a readable offence notice. Review it directly.");
    if (extraction.notes) extra.push(`Ticket image: ${extraction.notes}`);
  }

  // The usual 15-day window to respond is an estimate for triage only.
  const offenceDate = current("offence_date");
  if (blank(current("option_deadline")) && read.has("offenceDate") && typeof offenceDate === "string") {
    const estimate = addDays(offenceDate, TICKET_RESPONSE_DAYS);
    if (estimate) {
      patch.option_deadline = estimate;
      sources.option_deadline = {
        source: "document", documentId: dateDocument || input.extractions[0]?.documentId, kind: "ticket", confidence: "low",
      };
      extra.push(`Response deadline ${estimate} is an estimate (offence date plus ${TICKET_RESPONSE_DAYS} days). Confirm it against the ticket.`);
    }
  }
  if (Object.keys(patch).length) patch.field_sources = sources;

  const missing = REQUIRED.filter(key => !read.has(key)).map(key => LABELS[COLUMN[key]]);
  const reviewNotes = [input.extractions.length
    ? `Read automatically from ${plural(input.extractions.length, "image")}. Nothing here has been confirmed by the client; check against the original ticket before acting.`
    : "No ticket image could be read automatically."];
  reviewNotes.push(...conflicts.map(line => `Conflict: ${line}`));
  if (lowConfidence.size) reviewNotes.push(`Low confidence: ${[...lowConfidence].map(column => LABELS[column]).join(", ")}.`);
  const pdfs = input.unreadDocuments.filter(doc => doc.reason === "pdf").length;
  const failed = input.unreadDocuments.length - pdfs;
  if (pdfs) reviewNotes.push(`${plural(pdfs, "PDF")} not read automatically. Review ${pdfs === 1 ? "it" : "them"} directly.`);
  if (failed) reviewNotes.push(`${plural(failed, "document")} could not be read. Review directly or ask for a clearer copy.`);
  if (missing.length) reviewNotes.push(`Missing: ${missing.join(", ")}.`);
  reviewNotes.push(...extra);

  const ready = input.extractions.length > 0 && !conflicts.length && !lowConfidence.size &&
    !input.unreadDocuments.length && !missing.length;
  return { matterPatch: patch, reviewStatus: ready ? "ready" : "needs_review", notes: reviewNotes };
}

// ---------------------------------------------------------------------------
// HTTP plumbing shared by practice-intake and practice-portal
// ---------------------------------------------------------------------------

export type RpcError = { code?: string; message?: string; details?: string } | null;
export type RpcResult = { data: unknown; error: RpcError };
export type RpcCall = (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;

/** The subset of a Supabase storage bucket API the practice functions use. */
export interface StorageBucket {
  createSignedUploadUrl(path: string): PromiseLike<{ data: { signedUrl: string } | null; error: unknown }>;
  createSignedUrl(
    path: string, expiresIn: number, options?: { download?: string | boolean },
  ): PromiseLike<{ data: { signedUrl: string } | null; error: unknown }>;
  list(
    path?: string, options?: { limit?: number; offset?: number; search?: string },
  ): PromiseLike<{ data: { name: string }[] | null; error: unknown }>;
}

/** The PRACTICE_* code raised by a SQL function, if any. */
export function practiceErrorCode(error: RpcError): string | null {
  const match = `${error?.message || ""} ${error?.details || ""}`.match(/\bPRACTICE_[A-Z_]+\b/);
  return match ? match[0] : null;
}

export function allowedOrigins(value: string | undefined | null): string[] {
  return (value || PRACTICE_DEFAULT_ORIGINS).split(",").map(origin => origin.trim().replace(/\/+$/, "")).filter(Boolean);
}

export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin" };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "authorization, x-client-info, apikey, content-type";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  return headers;
}

export async function readJsonBody(req: Request, maxBytes = 65_536): Promise<Record<string, unknown>> {
  if (Number(req.headers.get("content-length") || 0) > maxBytes) throw new RequestError(MESSAGES.unreadable);
  const text = await req.text().catch(() => "");
  if (!text || text.length > maxBytes) throw new RequestError(MESSAGES.unreadable);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new RequestError(MESSAGES.unreadable);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RequestError(MESSAGES.unreadable);
  return value as Record<string, unknown>;
}

/**
 * The caller's network address for rate limiting (mirror of requestAddress in
 * ticket-intake-draft.ts). Cloudflare overwrites cf-connecting-ip at the
 * trusted edge; forwarding headers can be supplied by the client, so they never
 * create a bucket of their own. Anything else shares the "unknown" bucket.
 */
export function requestAddress(req: Request): string {
  const value = req.headers.get("cf-connecting-ip")?.trim() || "";
  const ipv4 = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4 && ipv4.slice(1).every(part => Number(part) <= 255)) return value;
  if (value.length >= 2 && value.length <= 45 && value.includes(":") && /^[0-9a-f:]+$/i.test(value)) {
    try {
      new URL(`http://[${value}]/`);
      return value.toLowerCase();
    } catch {
      // Fall through to the shared anonymous bucket.
    }
  }
  return "unknown";
}

export interface RateLimitRule {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

/** Database-backed limits (practice_rate_limit_hit), each a fixed window. */
export const RATE_LIMITS = {
  intakeAddress: { bucket: "intake-address", limit: 8, windowSeconds: 3600 },
  linkAddress: { bucket: "link-address", limit: 5, windowSeconds: 3600 },
  linkEmail: { bucket: "link-email", limit: 3, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;

/** The keyed hash the limiter stores: hex HMAC-SHA256 of "rate-limit:{bucket}:{value}". Raw values never leave the function. */
export function rateLimitKey(secret: string, bucket: string, value: string): Promise<string> {
  return hmacHex(secret, `rate-limit:${bucket}:${value}`);
}

export interface RateLimitDeps {
  rpc: RpcCall;
  env: (key: string) => string | undefined;
  /** Receives codes only, never personal data. */
  log: (...parts: string[]) => void;
}

/**
 * Counts one hit for `value` under `rule`. True when the request may go
 * ahead. Fails open, logging only a code, when the signing secret is missing
 * or the limiter cannot answer: the honeypot still applies, and turning away
 * a real client is worse than letting a few extra requests through.
 */
export async function rateLimitAllows(deps: RateLimitDeps, rule: RateLimitRule, value: string): Promise<boolean> {
  const secret = deps.env("PRACTICE_PORTAL_SIGNING_SECRET") || "";
  if (secret.length < PORTAL_SECRET_MIN_LENGTH) {
    deps.log("practice rate limit skipped", "signing_secret_missing");
    return true;
  }
  try {
    const { data, error } = await deps.rpc("practice_rate_limit_hit", {
      p_key_hash: await rateLimitKey(secret, rule.bucket, value),
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });
    if (error) {
      deps.log("practice rate limit unavailable", error.code || "unknown");
      return true;
    }
    return data !== false;
  } catch (error) {
    deps.log("practice rate limit unavailable", error instanceof Error ? error.name : "unknown");
    return true;
  }
}

/** True when the honeypot is filled or the form was sent faster than a person can. */
export function isBot(body: Record<string, unknown>): boolean {
  const elapsed = Number(body.elapsedMs);
  return cleanText(body.company, 100) !== "" || !Number.isFinite(elapsed) || elapsed < 2500;
}
