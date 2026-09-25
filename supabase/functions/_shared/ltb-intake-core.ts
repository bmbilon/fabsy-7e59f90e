/**
 * Pure logic for the Ontario LTB intake pipeline. No network, no Deno APIs,
 * so it is shared by the edge functions and the Node test suite.
 *
 * Extracted document data is a suggestion from the upload. It only fills
 * empty fields, never overwrites what a client typed or what staff confirmed,
 * and never touches a registered client's identity.
 */

export const LTB_DEFAULT_PRACTICE = "anderhue-paralegal";
export const LTB_BUCKET = "ltb-documents";
export const LTB_MAX_FILES = 6;
export const LTB_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const LTB_ISSUES = [
  "arrears", "persistent_late", "n12_own_use", "n5_damage", "n5_conduct", "hearing_scheduled", "other",
] as const;
export const LTB_NOTICE_SERVED = ["no", "yes", "unsure"] as const;
export const LTB_FILE_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};
/** Sept 21, 2026: Bill 60 shortened the N4 notice period to 7 days. */
export const N4_SEVEN_DAY_CUTOVER = "2026-09-21";

export type LtbIssue = typeof LTB_ISSUES[number];
export type LtbNoticeServed = typeof LTB_NOTICE_SERVED[number];

export class LtbRequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

// Stripping control characters is the point of this pattern.
// deno-lint-ignore no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g; // eslint-disable-line no-control-regex

export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanMultiline(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL, "").trim().slice(0, max);
}

export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = cleanText(full, 200).split(" ").filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0].slice(0, 100), lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" ").slice(0, 100),
    lastName: parts[parts.length - 1].slice(0, 100),
  };
}

export interface LtbFileSpec {
  name: string;
  contentType: string;
  extension: string;
  size: number;
}

export interface LtbSubmission {
  practiceId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  issue: LtbIssue;
  noticeServed: LtbNoticeServed;
  owed: string;
  notes: string;
  files: LtbFileSpec[];
  /** Honeypot filled or submitted faster than a person can. */
  bot: boolean;
}

export function parseLtbSubmission(input: unknown): LtbSubmission {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new LtbRequestError("Your request could not be read.");
  }
  const body = input as Record<string, unknown>;
  const elapsed = Number(body.elapsedMs);
  const bot = cleanText(body.company, 100) !== "" || !Number.isFinite(elapsed) || elapsed < 2500;

  const practiceId = cleanText(body.practiceId, 60) || LTB_DEFAULT_PRACTICE;
  if (!/^[a-z0-9-]{3,60}$/.test(practiceId)) throw new LtbRequestError("Unknown practice.");

  const { firstName, lastName } = splitName(cleanText(body.name, 200));
  const email = cleanText(body.email, 254).toLowerCase();
  const phoneInput = cleanText(body.phone, 40);
  const digits = phoneInput.replace(/\D/g, "");
  const invalid: string[] = [];
  if (!firstName) invalid.push("name");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid.push("email");
  if (phoneInput && (digits.length < 7 || digits.length > 15)) invalid.push("phone");
  if (invalid.length) {
    throw new LtbRequestError(`Check these fields: ${invalid.join(", ")}.`, 422);
  }

  const issue = (LTB_ISSUES as readonly string[]).includes(body.issue as string) ? body.issue as LtbIssue : "other";
  const noticeServed = (LTB_NOTICE_SERVED as readonly string[]).includes(body.served as string)
    ? body.served as LtbNoticeServed : "unsure";

  const rawFiles = body.files === undefined ? [] : body.files;
  if (!Array.isArray(rawFiles) || rawFiles.length > LTB_MAX_FILES) {
    throw new LtbRequestError(`Attach up to ${LTB_MAX_FILES} files.`);
  }
  const files = rawFiles.map((file): LtbFileSpec => {
    const spec = (file && typeof file === "object" ? file : {}) as Record<string, unknown>;
    const contentType = cleanText(spec.contentType, 60).toLowerCase();
    const extension = LTB_FILE_EXTENSIONS[contentType];
    const size = Number(spec.size);
    if (!extension || !Number.isInteger(size) || size <= 0 || size > LTB_MAX_FILE_BYTES) {
      throw new LtbRequestError("Attach photos or PDFs, 10 MB or smaller each.");
    }
    const name = cleanText(spec.name, 200).split(/[\\/]/).pop() || "";
    return { name, contentType, extension, size };
  });

  return {
    practiceId, firstName, lastName, email,
    phone: phoneInput ? `${phoneInput.startsWith("+") ? "+" : ""}${digits}` : "",
    city: cleanText(body.city, 100),
    issue, noticeServed,
    owed: cleanText(body.owed, 40),
    notes: cleanMultiline(body.notes, 2000),
    files, bot,
  };
}

// ---------------------------------------------------------------------------
// Document extraction normalization
// ---------------------------------------------------------------------------

export type LtbDocumentKind = "lease" | "rent_ledger" | "notice" | "government_id" | "ltb_document" | "other";
export type LtbNoticeForm = "N4" | "N5" | "N7" | "N8" | "N12" | "N13" | "other";
export type LtbServiceMethod = "hand" | "mailbox" | "mail" | "courier" | "email" | "other";
export type LtbRentPeriod = "monthly" | "weekly" | "daily" | "yearly";

export interface LtbExtractedFields {
  landlordName: string | null;
  landlordOrganization: string | null;
  landlordAddress: string | null;
  landlordCity: string | null;
  landlordProvince: string | null;
  landlordPostalCode: string | null;
  landlordPhone: string | null;
  idFirstName: string | null;
  idLastName: string | null;
  idAddress: string | null;
  idCity: string | null;
  idProvince: string | null;
  idPostalCode: string | null;
  idDocumentType: string | null;
  rentalUnitAddress: string | null;
  rentalUnitCity: string | null;
  tenantNames: string[];
  rentCents: number | null;
  rentPeriod: LtbRentPeriod | null;
  rentDueDay: number | null;
  leaseStartDate: string | null;
  noticeForm: LtbNoticeForm | null;
  noticeServedDate: string | null;
  noticeServiceMethod: LtbServiceMethod | null;
  noticeTerminationDate: string | null;
  arrearsCents: number | null;
  hearingDate: string | null;
}

export interface LtbExtraction {
  documentId: string;
  kind: LtbDocumentKind;
  fields: LtbExtractedFields;
  lowConfidence: (keyof LtbExtractedFields)[];
  notes: string;
}

const KIND_MAP: Record<string, { kind: LtbDocumentKind; form?: LtbNoticeForm }> = {
  lease: { kind: "lease" },
  rent_ledger: { kind: "rent_ledger" },
  n4_notice: { kind: "notice", form: "N4" },
  n5_notice: { kind: "notice", form: "N5" },
  n12_notice: { kind: "notice", form: "N12" },
  other_ltb_notice: { kind: "notice" },
  government_id: { kind: "government_id" },
  ltb_hearing_notice: { kind: "ltb_document" },
  ltb_order: { kind: "ltb_document" },
};

const FIELD_KEYS: (keyof LtbExtractedFields)[] = [
  "landlordName", "landlordOrganization", "landlordAddress", "landlordCity", "landlordProvince",
  "landlordPostalCode", "landlordPhone", "idFirstName", "idLastName", "idAddress", "idCity", "idProvince",
  "idPostalCode", "idDocumentType", "rentalUnitAddress", "rentalUnitCity", "tenantNames", "rentCents",
  "rentPeriod", "rentDueDay", "leaseStartDate", "noticeForm", "noticeServedDate", "noticeServiceMethod",
  "noticeTerminationDate", "arrearsCents", "hearingDate",
];

/** Raw tool keys (snake_case) the model returns, mapped to normalized keys. */
const RAW_KEY: Partial<Record<keyof LtbExtractedFields, string>> = {
  landlordName: "landlord_name", landlordOrganization: "landlord_organization", landlordAddress: "landlord_address",
  landlordCity: "landlord_city", landlordProvince: "landlord_province", landlordPostalCode: "landlord_postal_code",
  landlordPhone: "landlord_phone", idFirstName: "id_first_name", idLastName: "id_last_name",
  idAddress: "id_address", idCity: "id_city", idProvince: "id_province", idPostalCode: "id_postal_code",
  idDocumentType: "id_document_type", rentalUnitAddress: "rental_unit_address", rentalUnitCity: "rental_unit_city",
  tenantNames: "tenant_names", rentCents: "rent_amount", rentPeriod: "rent_period", rentDueDay: "rent_due_day",
  leaseStartDate: "lease_start_date", noticeForm: "notice_form", noticeServedDate: "notice_served_date",
  noticeServiceMethod: "notice_service_method", noticeTerminationDate: "notice_termination_date",
  arrearsCents: "arrears_total", hearingDate: "hearing_date",
};

export function validDate(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text ? text : null;
}

export function toCents(value: unknown): number | null {
  let amount: number;
  if (typeof value === "number") amount = value;
  else if (typeof value === "string") {
    const cleaned = value.replace(/[$,\s]/g, "").replace(/CAD$/i, "");
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
    amount = Number(cleaned);
  } else return null;
  if (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000) return null;
  return Math.round(amount * 100);
}

function textOrNull(value: unknown, max: number): string | null {
  const text = cleanText(value, max);
  return text && !/^(null|n\/a|none|unknown)$/i.test(text) ? text : null;
}

export function normalizeLtbExtraction(documentId: string, raw: Record<string, unknown>): LtbExtraction {
  const mapped = KIND_MAP[String(raw.document_kind || "")] || { kind: "other" as LtbDocumentKind };
  const rawForm = String(raw.notice_form || "").toUpperCase();
  const noticeForm = (["N4", "N5", "N7", "N8", "N12", "N13"].includes(rawForm) ? rawForm : mapped.form || (
    mapped.kind === "notice" && rawForm ? "other" : null)) as LtbNoticeForm | null;
  const period = String(raw.rent_period || "").toLowerCase();
  const method = String(raw.notice_service_method || "").toLowerCase();
  const methodMap: Record<string, LtbServiceMethod> = {
    hand: "hand", "in person": "hand", mailbox: "mailbox", "mail slot": "mailbox", "under door": "mailbox",
    mail: "mail", "regular mail": "mail", courier: "courier", email: "email",
  };
  const dueDay = Number(raw.rent_due_day);
  const tenants = Array.isArray(raw.tenant_names)
    ? raw.tenant_names.map(name => textOrNull(name, 120)).filter((name): name is string => Boolean(name)).slice(0, 10)
    : [];
  const fields: LtbExtractedFields = {
    landlordName: textOrNull(raw.landlord_name, 200),
    landlordOrganization: textOrNull(raw.landlord_organization, 200),
    landlordAddress: textOrNull(raw.landlord_address, 300),
    landlordCity: textOrNull(raw.landlord_city, 100),
    landlordProvince: textOrNull(raw.landlord_province, 50),
    landlordPostalCode: textOrNull(raw.landlord_postal_code, 12),
    landlordPhone: textOrNull(raw.landlord_phone, 40),
    idFirstName: textOrNull(raw.id_first_name, 100),
    idLastName: textOrNull(raw.id_last_name, 100),
    idAddress: textOrNull(raw.id_address, 300),
    idCity: textOrNull(raw.id_city, 100),
    idProvince: textOrNull(raw.id_province, 50),
    idPostalCode: textOrNull(raw.id_postal_code, 12),
    idDocumentType: textOrNull(raw.id_document_type, 60),
    rentalUnitAddress: textOrNull(raw.rental_unit_address, 300),
    rentalUnitCity: textOrNull(raw.rental_unit_city, 100),
    tenantNames: tenants,
    rentCents: toCents(raw.rent_amount),
    rentPeriod: (["monthly", "weekly", "daily", "yearly"].includes(period) ? period : null) as LtbRentPeriod | null,
    rentDueDay: Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 31 ? dueDay : null,
    leaseStartDate: validDate(raw.lease_start_date),
    noticeForm,
    noticeServedDate: validDate(raw.notice_served_date),
    noticeServiceMethod: methodMap[method] || (method ? "other" : null),
    noticeTerminationDate: validDate(raw.notice_termination_date),
    arrearsCents: toCents(raw.arrears_total),
    hearingDate: validDate(raw.hearing_date),
  };
  const rawLow = Array.isArray(raw.low_confidence_fields) ? raw.low_confidence_fields.map(String) : [];
  const lowConfidence = FIELD_KEYS.filter(key => rawLow.includes(RAW_KEY[key] || "") || rawLow.includes(key));
  return { documentId, kind: mapped.kind, fields, lowConfidence, notes: cleanText(raw.notes, 500) };
}

// ---------------------------------------------------------------------------
// N4 date rules (mirrors the landing page calculator)
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const utc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Earliest valid N4 termination date, or null when the service method needs a manual check. */
export function n4EarliestTermination(servedOn: string, method: LtbServiceMethod | null, period: LtbRentPeriod | null): string | null {
  if (!validDate(servedOn) || !method || !["hand", "mailbox", "mail"].includes(method)) return null;
  const deemed = utc(servedOn) + (method === "mail" ? 5 : 0) * DAY;
  const beforeCutover = servedOn < N4_SEVEN_DAY_CUTOVER;
  const days = beforeCutover && (period === null || period === "monthly" || period === "yearly") ? 14 : 7;
  return iso(deemed + days * DAY);
}

export function l1EarliestFiling(terminationDate: string | null): string | null {
  return terminationDate && validDate(terminationDate) ? iso(utc(terminationDate) + DAY) : null;
}

// ---------------------------------------------------------------------------
// Merge extracted data into the case and a provisional client
// ---------------------------------------------------------------------------

export type FieldSource = { source: "form" | "document" | "staff"; documentId?: string; kind?: string; confidence?: "high" | "low" };

export interface LtbCaseState {
  issue: string;
  rental_unit_address: string | null;
  unit_city: string | null;
  tenant_names: string[];
  rent_amount_cents: number | null;
  rent_period: string | null;
  rent_due_day: number | null;
  lease_start_date: string | null;
  arrears_claimed_cents: number | null;
  notice_form: string | null;
  notice_served_on: string | null;
  notice_service_method: string | null;
  notice_termination_date: string | null;
  hearing_date: string | null;
  field_sources: Record<string, FieldSource>;
}

export interface LtbClientState {
  registration_status: "provisional" | "registered" | "verified";
  client_type: "individual" | "organization";
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  phone: string | null;
  mailing_address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  identity_document_type: string | null;
  field_sources: Record<string, FieldSource>;
}

export interface LtbMergeInput {
  caseState: LtbCaseState;
  client: LtbClientState;
  extractions: LtbExtraction[];
  /** Uploaded documents that could not be read automatically (PDF, failed scan). */
  unreadDocuments: { documentId: string; reason: "pdf" | "failed" }[];
}

export interface LtbMergeResult {
  casePatch: Partial<LtbCaseState>;
  clientPatch: Partial<LtbClientState>;
  reviewStatus: "ready" | "needs_review";
  notes: string[];
}

const KIND_PRIORITY: Record<LtbDocumentKind, number> = {
  government_id: 0, notice: 1, lease: 2, rent_ledger: 3, ltb_document: 4, other: 5,
};

const CASE_LABELS: Record<string, string> = {
  rental_unit_address: "rental unit address", unit_city: "rental unit city", tenant_names: "tenant names",
  rent_amount_cents: "rent", rent_period: "rent period", rent_due_day: "rent due day",
  lease_start_date: "lease start date", arrears_claimed_cents: "arrears", notice_form: "notice form",
  notice_served_on: "notice service date", notice_service_method: "notice service method",
  notice_termination_date: "notice termination date", hearing_date: "hearing date",
  first_name: "first name", last_name: "last name", phone: "phone", mailing_address: "mailing address",
  city: "city", province: "province", postal_code: "postal code", identity_document_type: "ID document type",
};

const empty = (value: unknown) => value === null || value === undefined || value === "" ||
  (Array.isArray(value) && value.length === 0);
const same = (a: unknown, b: unknown) => {
  const norm = (v: unknown) => Array.isArray(v)
    ? v.map(item => String(item).toLowerCase().replace(/\s+/g, " ").trim()).sort().join("|")
    : String(v).toLowerCase().replace(/[\s.,#-]+/g, " ").trim();
  return norm(a) === norm(b);
};
const money = (cents: number) => `$${(cents / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const display = (field: string, value: unknown) =>
  Array.isArray(value) ? value.join(", ")
  : typeof value === "number" && /cents$/.test(field) ? money(value) : String(value);

export function mergeLtbIntake(input: LtbMergeInput): LtbMergeResult {
  const casePatch: Partial<LtbCaseState> = {};
  const clientPatch: Partial<LtbClientState> = {};
  const caseSources: Record<string, FieldSource> = { ...input.caseState.field_sources };
  const clientSources: Record<string, FieldSource> = { ...input.client.field_sources };
  const conflicts: string[] = [];
  const lowConfidence = new Set<string>();
  const notes: string[] = [];
  const provisional = input.client.registration_status === "provisional";
  const ordered = [...input.extractions].sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]);

  const offer = <T extends Record<string, unknown>>(
    target: "case" | "client", field: string, value: unknown, extraction: LtbExtraction,
    fieldKey: keyof LtbExtractedFields,
  ) => {
    if (empty(value)) return;
    const state = (target === "case" ? input.caseState : input.client) as unknown as T;
    const patch = (target === "case" ? casePatch : clientPatch) as Record<string, unknown>;
    const sources = target === "case" ? caseSources : clientSources;
    const current = field in patch ? patch[field] : state[field];
    const low = extraction.lowConfidence.includes(fieldKey);
    if (empty(current)) {
      if (target === "client" && !provisional) return;
      patch[field] = value;
      sources[field] = { source: "document", documentId: extraction.documentId, kind: extraction.kind, confidence: low ? "low" : "high" };
      if (low) lowConfidence.add(field);
      return;
    }
    if (!same(current, value)) {
      const label = CASE_LABELS[field] || field;
      conflicts.push(`${extraction.kind.replace("_", " ")} shows ${label} as "${display(field, value)}", but the file has "${display(field, current)}".`);
    }
  };

  for (const extraction of ordered) {
    const f = extraction.fields;
    if (extraction.kind === "government_id") {
      offer("client", "first_name", f.idFirstName, extraction, "idFirstName");
      offer("client", "last_name", f.idLastName, extraction, "idLastName");
      offer("client", "mailing_address", f.idAddress, extraction, "idAddress");
      offer("client", "city", f.idCity, extraction, "idCity");
      offer("client", "province", f.idProvince, extraction, "idProvince");
      offer("client", "postal_code", f.idPostalCode, extraction, "idPostalCode");
      offer("client", "identity_document_type", f.idDocumentType, extraction, "idDocumentType");
    }
    if (extraction.kind === "lease" || extraction.kind === "notice") {
      offer("client", "mailing_address", f.landlordAddress, extraction, "landlordAddress");
      offer("client", "city", f.landlordCity, extraction, "landlordCity");
      offer("client", "province", f.landlordProvince, extraction, "landlordProvince");
      offer("client", "postal_code", f.landlordPostalCode, extraction, "landlordPostalCode");
      offer("client", "phone", f.landlordPhone, extraction, "landlordPhone");
      const clientName = `${clientPatch.first_name ?? input.client.first_name ?? ""} ${clientPatch.last_name ?? input.client.last_name ?? ""}`.trim();
      if (f.landlordOrganization && !input.client.organization_name) {
        notes.push(`The ${extraction.kind} names the landlord as ${f.landlordOrganization}. Confirm whether the client is that organization and who is authorized to instruct.`);
      } else if (f.landlordName && clientName && !same(f.landlordName, clientName)) {
        notes.push(`The ${extraction.kind} names the landlord as ${f.landlordName}, not ${clientName}. Confirm who the client is before acting.`);
      }
    }
    if (extraction.kind !== "government_id") {
      offer("case", "rental_unit_address", f.rentalUnitAddress, extraction, "rentalUnitAddress");
      offer("case", "unit_city", f.rentalUnitCity, extraction, "rentalUnitCity");
      offer("case", "tenant_names", f.tenantNames, extraction, "tenantNames");
      offer("case", "rent_amount_cents", f.rentCents, extraction, "rentCents");
      offer("case", "rent_period", f.rentPeriod, extraction, "rentPeriod");
      offer("case", "rent_due_day", f.rentDueDay, extraction, "rentDueDay");
      offer("case", "lease_start_date", f.leaseStartDate, extraction, "leaseStartDate");
      offer("case", "arrears_claimed_cents", f.arrearsCents, extraction, "arrearsCents");
      offer("case", "hearing_date", f.hearingDate, extraction, "hearingDate");
    }
    if (extraction.kind === "notice") {
      offer("case", "notice_form", f.noticeForm, extraction, "noticeForm");
      offer("case", "notice_served_on", f.noticeServedDate, extraction, "noticeServedDate");
      offer("case", "notice_service_method", f.noticeServiceMethod, extraction, "noticeServiceMethod");
      offer("case", "notice_termination_date", f.noticeTerminationDate, extraction, "noticeTerminationDate");
    }
    if (extraction.notes) notes.push(`${extraction.kind.replace("_", " ")}: ${extraction.notes}`);
  }

  const merged = { ...input.caseState, ...casePatch };
  if (merged.notice_form === "N4" && merged.notice_served_on && merged.notice_termination_date) {
    const earliest = n4EarliestTermination(
      merged.notice_served_on, merged.notice_service_method as LtbServiceMethod | null,
      merged.rent_period as LtbRentPeriod | null);
    if (earliest && merged.notice_termination_date < earliest) {
      notes.push(`N4 termination date ${merged.notice_termination_date} is earlier than the minimum ${earliest} for that service date and method. The notice may be defective; check before filing.`);
    } else if (!earliest) {
      notes.push("N4 service method needs a manual check of the deemed service date before filing.");
    }
    if (merged.notice_served_on >= N4_SEVEN_DAY_CUTOVER && merged.notice_form === "N4") {
      notes.push("Confirm the N4 is on the current 2026/09 form.");
    }
  }

  if (Object.keys(casePatch).length) casePatch.field_sources = caseSources;
  if (Object.keys(clientPatch).length) clientPatch.field_sources = clientSources;

  const mergedClient = { ...input.client, ...clientPatch };
  const hasIdentity = Boolean((mergedClient.first_name && mergedClient.last_name) || mergedClient.organization_name);
  const arrearsCase = merged.issue === "arrears";
  const missing: string[] = [];
  if (!hasIdentity) missing.push("client's full name");
  if (!merged.rental_unit_address) missing.push("rental unit address");
  if (arrearsCase && merged.rent_amount_cents == null) missing.push("rent amount");
  if (arrearsCase && merged.arrears_claimed_cents == null) missing.push("arrears amount");

  const summary = `Read automatically from ${input.extractions.length} document${input.extractions.length === 1 ? "" : "s"}. Nothing here has been confirmed by the client; check against the originals before acting.`;
  const reviewNotes = [summary];
  if (conflicts.length) reviewNotes.push(...conflicts.map(line => `Conflict: ${line}`));
  if (lowConfidence.size) {
    reviewNotes.push(`Low confidence: ${[...lowConfidence].map(field => CASE_LABELS[field] || field).join(", ")}.`);
  }
  if (input.unreadDocuments.length) {
    const pdfs = input.unreadDocuments.filter(doc => doc.reason === "pdf").length;
    const failed = input.unreadDocuments.length - pdfs;
    if (pdfs) reviewNotes.push(`${pdfs} PDF${pdfs === 1 ? "" : "s"} not read automatically. Review ${pdfs === 1 ? "it" : "them"} directly.`);
    if (failed) reviewNotes.push(`${failed} document${failed === 1 ? "" : "s"} could not be read. Review directly or ask for a clearer copy.`);
  }
  if (missing.length) reviewNotes.push(`Missing: ${missing.join(", ")}.`);
  if (!provisional) reviewNotes.push("Returning registered client: identity details were not changed from the documents.");
  reviewNotes.push(...notes);

  const ready = !conflicts.length && !lowConfidence.size && !input.unreadDocuments.length && !missing.length &&
    input.extractions.length > 0;
  return { casePatch, clientPatch, reviewStatus: ready ? "ready" : "needs_review", notes: reviewNotes };
}

// ---------------------------------------------------------------------------
// Labels shared with the staff alert
// ---------------------------------------------------------------------------
export const LTB_ISSUE_LABELS: Record<string, string> = {
  arrears: "Unpaid rent",
  persistent_late: "Persistent late payment",
  n12_own_use: "Own or family use (N12)",
  n5_damage: "Damage (N5)",
  n5_conduct: "Interference or conduct (N5)",
  hearing_scheduled: "Hearing already scheduled",
  other: "Something else",
};

export function formatCents(cents: number | null | undefined): string {
  return typeof cents === "number" && Number.isFinite(cents) ? money(cents) : "";
}
