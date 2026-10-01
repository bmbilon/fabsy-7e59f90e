/**
 * Practice file catalog: areas, stages, outcomes and every client-facing
 * label used by the AnderHue client portal, the staff workspace, the intake
 * functions and the client update emails.
 *
 * Pure data and helpers. No network, no Deno or DOM APIs, so it is shared by
 * the edge functions (Deno), the browser apps (Vite) and the Node test suite.
 * Stage and outcome values must match the CHECK constraints in
 * supabase/migrations/20261001150000_anderhue_practice_files.sql.
 */

export const PRACTICE_AREAS = ["ltb", "traffic", "general"] as const;
export type PracticeArea = typeof PRACTICE_AREAS[number];

/** Coarse progress shown to clients. Every stage maps to one phase. */
export const PHASES = [
  { value: "received", label: "Received" },
  { value: "engaged", label: "Fee and retainer" },
  { value: "active", label: "In progress" },
  { value: "done", label: "Closed" },
] as const;
export type Phase = typeof PHASES[number]["value"];

export interface StageDef {
  value: string;
  /** Label on staff boards and the stage picker. */
  staffLabel: string;
  /** Label the client sees in the portal and in update emails. */
  clientLabel: string;
  /** One or two plain sentences: where the file stands and what happens next. */
  clientNext: string;
  phase: Phase;
  /** Moving a file into this stage emails the client (when updates are enabled). */
  notify: boolean;
  /** Closed or declined. Uploads stop and the file leaves the active board. */
  terminal?: boolean;
}

export interface OutcomeDef {
  value: string;
  staffLabel: string;
  clientLabel: string;
}

export interface AreaDef {
  value: PracticeArea;
  /** Staff navigation label. */
  staffLabel: string;
  /** Client-facing name of the matter type. */
  clientLabel: string;
  /** File number prefix, e.g. TKT-2026-0001. */
  numberPrefix: string;
  /** Public page for this practice area. */
  publicPath: string;
  /** Value used in /start?area=... */
  startParam: string;
  /** Private storage bucket for this area's documents. */
  bucket: string;
  /** Postgres tables behind the area. */
  tables: { matters: string; documents: string; events: string; foreignKey: string };
}

export const AREAS: Record<PracticeArea, AreaDef> = {
  ltb: {
    value: "ltb",
    staffLabel: "Landlord",
    clientLabel: "Landlord and Tenant Board file",
    numberPrefix: "LTB",
    publicPath: "/landlords",
    startParam: "landlord",
    bucket: "ltb-documents",
    tables: { matters: "ltb_cases", documents: "ltb_case_documents", events: "ltb_case_events", foreignKey: "case_id" },
  },
  traffic: {
    value: "traffic",
    staffLabel: "Traffic",
    clientLabel: "Traffic ticket",
    numberPrefix: "TKT",
    publicPath: "/traffic-tickets",
    startParam: "traffic",
    bucket: "practice-documents",
    tables: {
      matters: "practice_matters", documents: "practice_matter_documents", events: "practice_matter_events",
      foreignKey: "matter_id",
    },
  },
  general: {
    value: "general",
    staffLabel: "Other",
    clientLabel: "Paralegal matter",
    numberPrefix: "MAT",
    publicPath: "/other-matters",
    startParam: "other",
    bucket: "practice-documents",
    tables: {
      matters: "practice_matters", documents: "practice_matter_documents", events: "practice_matter_events",
      foreignKey: "matter_id",
    },
  },
};

/** Accepts the public /start parameter or the internal value. */
export function areaFromParam(value: string | null | undefined): PracticeArea | null {
  const key = (value || "").trim().toLowerCase();
  if (key === "landlord" || key === "landlords" || key === "ltb") return "ltb";
  if (key === "traffic" || key === "ticket" || key === "traffic-tickets") return "traffic";
  if (key === "other" || key === "general" || key === "other-matters") return "general";
  return null;
}

const FEE_QUOTED_NEXT = "Your fee quote is ready. Reply to this email or call to go ahead, and we will send your written retainer. No work starts before it is signed.";

export const STAGES: Record<PracticeArea, StageDef[]> = {
  ltb: [
    { value: "new_intake", staffLabel: "New intake", clientLabel: "File received", phase: "received", notify: false,
      clientNext: "We have your file. We will review your documents and reply with your next deadline and the fee that applies." },
    { value: "under_review", staffLabel: "Under review", clientLabel: "Under review", phase: "received", notify: true,
      clientNext: "Don is reviewing your documents and dates. If anything is missing, we will ask for it here." },
    { value: "quoted", staffLabel: "Fee quoted", clientLabel: "Fee quoted", phase: "engaged", notify: true,
      clientNext: FEE_QUOTED_NEXT },
    { value: "retained", staffLabel: "Retained", clientLabel: "Retained", phase: "engaged", notify: true,
      clientNext: "Your retainer is in place and work on your file has started." },
    { value: "notice_served", staffLabel: "Notice served", clientLabel: "Notice served", phase: "active", notify: true,
      clientNext: "Your notice has been served. We are tracking the dates and will tell you when the application can be filed." },
    { value: "filed", staffLabel: "Application filed", clientLabel: "Application filed", phase: "active", notify: true,
      clientNext: "Your application has been filed with the Landlord and Tenant Board. We will tell you when the hearing is scheduled." },
    { value: "hearing_scheduled", staffLabel: "Hearing scheduled", clientLabel: "Hearing scheduled", phase: "active", notify: true,
      clientNext: "Your hearing date is set. We will prepare the evidence and walk you through the hearing beforehand." },
    { value: "order_issued", staffLabel: "Order issued", clientLabel: "Order issued", phase: "active", notify: true,
      clientNext: "The Board has issued an order. We will explain what it means and your next steps." },
    { value: "closed", staffLabel: "Closed", clientLabel: "File closed", phase: "done", notify: true, terminal: true,
      clientNext: "Your file is closed. Thank you for trusting us with it." },
    { value: "declined", staffLabel: "Declined", clientLabel: "Not taken on", phase: "done", notify: true, terminal: true,
      clientNext: "We are not able to take on this file. If a notice or Board deadline applies, act on it now. The Law Society Referral Service can connect you with another licensee." },
  ],
  traffic: [
    { value: "new_intake", staffLabel: "New intake", clientLabel: "Ticket received", phase: "received", notify: false,
      clientNext: "We have your ticket. Don will review it and reply with your options and the fee." },
    { value: "under_review", staffLabel: "Under review", clientLabel: "Under review", phase: "received", notify: true,
      clientNext: "We are reviewing your ticket and the deadline printed on it. Keep the original somewhere safe." },
    { value: "quoted", staffLabel: "Fee quoted", clientLabel: "Options and fee ready", phase: "engaged", notify: true,
      clientNext: FEE_QUOTED_NEXT },
    { value: "retained", staffLabel: "Retained", clientLabel: "Retained", phase: "engaged", notify: true,
      clientNext: "You are retained. We will take the next step with the court office and keep you posted." },
    { value: "option_filed", staffLabel: "Request filed", clientLabel: "Request filed with the court", phase: "active", notify: true,
      clientNext: "We have filed your request with the court office. The court sends the next notice, and we will tell you what it says." },
    { value: "disclosure_requested", staffLabel: "Disclosure requested", clientLabel: "Evidence requested", phase: "active", notify: true,
      clientNext: "We have asked the prosecutor for the evidence in your case. This can take several weeks." },
    { value: "resolution_meeting", staffLabel: "Prosecutor meeting", clientLabel: "Talking with the prosecutor", phase: "active", notify: true,
      clientNext: "We are discussing your charge with the prosecutor. You approve any resolution before it is accepted." },
    { value: "offer_received", staffLabel: "Offer received", clientLabel: "Offer received", phase: "active", notify: true,
      clientNext: "The prosecutor has made an offer. We will explain it, and nothing is accepted without your approval." },
    { value: "trial_scheduled", staffLabel: "Trial scheduled", clientLabel: "Trial scheduled", phase: "active", notify: true,
      clientNext: "Your trial date is set. We will appear for you and tell you whether you need to attend." },
    { value: "closed", staffLabel: "Closed", clientLabel: "File closed", phase: "done", notify: true, terminal: true,
      clientNext: "Your file is closed. The result is shown on this page." },
    { value: "declined", staffLabel: "Declined", clientLabel: "Not taken on", phase: "done", notify: true, terminal: true,
      clientNext: "We are not able to take on this ticket. The deadline on your ticket still applies, so choose an option before it passes." },
  ],
  general: [
    { value: "new_intake", staffLabel: "New intake", clientLabel: "Request received", phase: "received", notify: false,
      clientNext: "We have your request. We will reply to confirm whether we can help and what the fee would be." },
    { value: "under_review", staffLabel: "Under review", clientLabel: "Under review", phase: "received", notify: true,
      clientNext: "We are reviewing your matter and any dates that apply. If we need anything else, we will ask for it here." },
    { value: "quoted", staffLabel: "Fee quoted", clientLabel: "Fee quoted", phase: "engaged", notify: true,
      clientNext: FEE_QUOTED_NEXT },
    { value: "retained", staffLabel: "Retained", clientLabel: "Retained", phase: "engaged", notify: true,
      clientNext: "Your retainer is in place and work on your matter has started." },
    { value: "in_progress", staffLabel: "In progress", clientLabel: "In progress", phase: "active", notify: true,
      clientNext: "We are working on your matter and will update you at each key step." },
    { value: "closed", staffLabel: "Closed", clientLabel: "File closed", phase: "done", notify: true, terminal: true,
      clientNext: "Your file is closed. Thank you for trusting us with it." },
    { value: "declined", staffLabel: "Declined", clientLabel: "Not taken on", phase: "done", notify: true, terminal: true,
      clientNext: "This matter is not one we can take on. If a deadline applies, act on it now. The Law Society Referral Service can connect you with another licensee." },
  ],
};

export const OUTCOMES: Record<PracticeArea, OutcomeDef[]> = {
  ltb: [
    { value: "order_obtained", staffLabel: "Order obtained", clientLabel: "Order obtained" },
    { value: "settled", staffLabel: "Settled / payment plan", clientLabel: "Settled" },
    { value: "tenant_paid", staffLabel: "Tenant paid in full", clientLabel: "Tenant paid in full" },
    { value: "withdrawn", staffLabel: "Withdrawn by client", clientLabel: "Withdrawn" },
    { value: "dismissed", staffLabel: "Application dismissed", clientLabel: "Application dismissed" },
    { value: "other", staffLabel: "Other", clientLabel: "Closed" },
  ],
  traffic: [
    { value: "withdrawn", staffLabel: "Charge withdrawn", clientLabel: "Charge withdrawn" },
    { value: "amended", staffLabel: "Amended / reduced", clientLabel: "Charge amended or reduced" },
    { value: "not_guilty", staffLabel: "Not guilty / dismissed", clientLabel: "Not guilty or dismissed" },
    { value: "convicted", staffLabel: "Convicted as charged", clientLabel: "Conviction entered as charged" },
    { value: "client_paid", staffLabel: "Client paid the ticket", clientLabel: "Ticket paid" },
    { value: "other", staffLabel: "Other", clientLabel: "Closed" },
  ],
  general: [
    { value: "resolved", staffLabel: "Resolved", clientLabel: "Resolved" },
    { value: "settled", staffLabel: "Settled", clientLabel: "Settled" },
    { value: "judgment", staffLabel: "Judgment / decision", clientLabel: "Decision issued" },
    { value: "withdrawn", staffLabel: "Withdrawn by client", clientLabel: "Withdrawn" },
    { value: "referred_out", staffLabel: "Referred out", clientLabel: "Referred to another licensee" },
    { value: "other", staffLabel: "Other", clientLabel: "Closed" },
  ],
};

/** Outcome stored automatically when a file is declined (all areas). */
export const DECLINED_OUTCOME = "declined";

// ---------------------------------------------------------------------------
// Intake vocabularies
// ---------------------------------------------------------------------------

/** Landlord issues accepted by the existing ltb-intake function. */
export const LTB_ISSUES = [
  { value: "arrears", label: "Unpaid rent" },
  { value: "persistent_late", label: "Persistent late payment" },
  { value: "n12_own_use", label: "Own or family use (N12)" },
  { value: "n5_damage", label: "Damage (N5)" },
  { value: "n5_conduct", label: "Interference or conduct (N5)" },
  { value: "hearing_scheduled", label: "Hearing already scheduled" },
  { value: "other", label: "Something else" },
] as const;

export const TICKET_TYPES = [
  { value: "speeding", label: "Speeding" },
  { value: "camera", label: "Camera ticket (speed or red light)" },
  { value: "red_light_stop", label: "Red light or stop sign (officer)" },
  { value: "careless", label: "Careless driving" },
  { value: "distracted", label: "Handheld device / distracted" },
  { value: "no_insurance", label: "Insurance" },
  { value: "licence_plate", label: "Licence, plate or permit" },
  { value: "commercial", label: "Commercial vehicle" },
  { value: "other", label: "Something else" },
] as const;

/** What the client has already done with the ticket. */
export const TICKET_OPTION_CHOSEN = [
  { value: "none", label: "Nothing yet" },
  { value: "trial", label: "Requested a trial" },
  { value: "meeting", label: "Requested a meeting with the prosecutor" },
  { value: "paid", label: "Paid it" },
  { value: "unsure", label: "Not sure" },
] as const;

export const GENERAL_CATEGORIES = [
  { value: "small_claims", label: "Small Claims Court" },
  { value: "tribunal", label: "A tribunal or board" },
  { value: "offence", label: "Another provincial offence" },
  { value: "notary", label: "Commissioning or notarizing documents" },
  { value: "other", label: "Something else" },
] as const;

export const DOCUMENT_KINDS: Record<PracticeArea, { value: string; label: string }[]> = {
  ltb: [
    { value: "lease", label: "Lease" },
    { value: "rent_ledger", label: "Rent ledger" },
    { value: "notice", label: "Notice" },
    { value: "government_id", label: "Photo ID" },
    { value: "ltb_document", label: "LTB document" },
    { value: "other", label: "Other" },
  ],
  traffic: [
    { value: "ticket", label: "Ticket" },
    { value: "court_document", label: "Court notice" },
    { value: "disclosure", label: "Disclosure" },
    { value: "correspondence", label: "Correspondence" },
    { value: "government_id", label: "Photo ID" },
    { value: "other", label: "Other" },
  ],
  general: [
    { value: "notice", label: "Notice or claim" },
    { value: "court_document", label: "Court or tribunal document" },
    { value: "correspondence", label: "Correspondence" },
    { value: "evidence", label: "Evidence" },
    { value: "government_id", label: "Photo ID" },
    { value: "other", label: "Other" },
  ],
};

/** Upload limits shared by intake, the client portal and staff uploads. */
export const UPLOAD_LIMITS = {
  maxFilesPerBatch: 6,
  maxClientDocumentsPerFile: 40,
  maxBytes: 10 * 1024 * 1024,
  contentTypes: {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
  } as Record<string, string>,
  /** Extension fallback when a browser sends an empty or generic type. */
  extensionTypes: {
    pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    webp: "image/webp", heic: "image/heic", heif: "image/heif",
  } as Record<string, string>,
};

// ---------------------------------------------------------------------------
// Client update emails (practice_notices.kind)
// ---------------------------------------------------------------------------

export const CLIENT_NOTICE_KINDS = [
  "intake_received", "stage_changed", "documents_requested", "document_shared", "portal_link", "upload_invite",
] as const;
export const STAFF_NOTICE_KINDS = ["staff_new_intake", "staff_client_uploaded"] as const;
export type ClientNoticeKind = typeof CLIENT_NOTICE_KINDS[number];
export type StaffNoticeKind = typeof STAFF_NOTICE_KINDS[number];
export type NoticeKind = ClientNoticeKind | StaffNoticeKind;

/** Seconds a stage update waits before sending, so staff can undo a slip. */
export const STAGE_NOTICE_DELAY_SECONDS = 90;
/** Client portal links in emails stay valid this long. */
export const PORTAL_LINK_DAYS = 30;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isArea(value: unknown): value is PracticeArea {
  return typeof value === "string" && (PRACTICE_AREAS as readonly string[]).includes(value);
}

export function stageDef(area: PracticeArea, stage: string | null | undefined): StageDef | null {
  return STAGES[area].find(def => def.value === stage) || null;
}

export function stageValues(area: PracticeArea): string[] {
  return STAGES[area].map(def => def.value);
}

export function staffStageLabel(area: PracticeArea, stage: string | null | undefined): string {
  return stageDef(area, stage)?.staffLabel || "Unknown stage";
}

export function clientStageLabel(area: PracticeArea, stage: string | null | undefined): string {
  return stageDef(area, stage)?.clientLabel || "In progress";
}

export function outcomeDef(area: PracticeArea, outcome: string | null | undefined): OutcomeDef | null {
  if (outcome === DECLINED_OUTCOME) return { value: DECLINED_OUTCOME, staffLabel: "Declined", clientLabel: "Not taken on" };
  return OUTCOMES[area].find(def => def.value === outcome) || null;
}

export function isTerminalStage(area: PracticeArea, stage: string | null | undefined): boolean {
  return Boolean(stageDef(area, stage)?.terminal);
}

export function phaseIndex(phase: Phase): number {
  return PHASES.findIndex(item => item.value === phase);
}

export function labelFor(list: readonly { value: string; label: string }[], value: string | null | undefined): string {
  return list.find(item => item.value === value)?.label || "";
}

/** Matter title shown to clients and on staff cards. */
export function matterTitle(area: PracticeArea, row: {
  issue?: string | null; ticket_type?: string | null; category?: string | null;
}): string {
  if (area === "ltb") return labelFor(LTB_ISSUES, row.issue) || AREAS.ltb.clientLabel;
  if (area === "traffic") return labelFor(TICKET_TYPES, row.ticket_type) || AREAS.traffic.clientLabel;
  return labelFor(GENERAL_CATEGORIES, row.category) || AREAS.general.clientLabel;
}

/** Safe file-number format: four digits, growing past 9999 instead of truncating. */
export function formatMatterNumber(prefix: string, year: number, sequence: number): string {
  const digits = String(sequence);
  return `${prefix}-${year}-${digits.length < 4 ? digits.padStart(4, "0") : digits}`;
}

export function formatCents(cents: number | null | undefined): string {
  return typeof cents === "number" && Number.isFinite(cents)
    ? `$${(cents / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "";
}

/** Calendar date in Toronto, where Ontario court and Board deadlines run. */
export function torontoToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function addDays(isoDate: string, days: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const time = Date.parse(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(time)) return null;
  return new Date(time + days * 86_400_000).toISOString().slice(0, 10);
}

/** Days from today (Toronto) to an ISO date; negative when past. */
export function daysUntil(isoDate: string | null | undefined, today = torontoToday()): number | null {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  return Math.round((Date.parse(`${isoDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/**
 * Most Ontario offence notices give 15 days to choose an option. This is an
 * estimate for staff triage and client reminders only; the notice governs.
 */
export const TICKET_RESPONSE_DAYS = 15;

export function formatLongDate(isoDate: string | null | undefined): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "";
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-CA", {
    timeZone: "UTC", weekday: "short", month: "long", day: "numeric", year: "numeric",
  });
}
