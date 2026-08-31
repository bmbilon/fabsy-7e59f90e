export type TicketType = "officer_issued" | "photo_radar";
export type TicketTypeSource = "default" | "entry" | "upload" | "manual";
export type RegisteredOwnerAnswer = "" | "yes" | "sold_before" | "stolen";

export interface TicketTypeState {
  ticketType: TicketType;
  ticketTypeSource: TicketTypeSource;
  registeredOwnerOnOffenceDate: RegisteredOwnerAnswer;
}

export const REGISTERED_OWNER_LABELS: Record<Exclude<RegisteredOwnerAnswer, "">, string> = {
  yes: "Yes",
  sold_before: "Sold before",
  stolen: "Stolen",
};

export function ticketTypeFromSearch(search: string): TicketType | null {
  const params = new URLSearchParams(search);
  if (params.get("ticket_type") === "officer_issued") return "officer_issued";
  return params.get("ticket_type") === "photo_radar" || params.get("product") === "photo-radar"
    ? "photo_radar"
    : null;
}

function calendarDate(value: unknown): string {
  const text = value instanceof Date && Number.isFinite(value.getTime())
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
    : typeof value === "string" ? value.trim() : "";
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/.exec(text);
  if (!match) return "";
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.toISOString().slice(0, 10) === match[0].slice(0, 10) ? match[0].slice(0, 10) : "";
}

/** The printed offence date is distinct from a mailed notice's issue/mailing date. */
export function ticketDateFromExtraction(value: unknown, ticketType: TicketType, manualDate?: unknown): string {
  // An explicitly edited (or cleared) date must survive a late OCR response.
  if (manualDate !== undefined) return calendarDate(manualDate);
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const response = value as Record<string, unknown>;
  if (response.success === false || response.error) return "";
  const source = response.data && typeof response.data === "object" && !Array.isArray(response.data)
    ? response.data as Record<string, unknown>
    : response;
  const offenceKeys = ["offenceDate", "offence_date", "offenseDate", "offense_date"];
  const keys = ticketType === "photo_radar" ? offenceKeys : ["issueDate", "issue_date", "ticketDate", ...offenceKeys];
  for (const key of keys) {
    const date = calendarDate(source[key]);
    if (date) return date;
  }
  return "";
}

/** Keep a date-only value on the same calendar day in Alberta and other time zones. */
export function ticketDateAsLocalDate(value: unknown): Date | undefined {
  const text = calendarDate(value);
  if (!text) return undefined;
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(12, 0, 0, 0);
  return date;
}

/** A hint for the intake, never the server's eligibility or price authority. */
export function detectTicketType(value: unknown): TicketType | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  if (response.success === false || response.error) return null;
  const source = response.data && typeof response.data === "object" && !Array.isArray(response.data)
    ? response.data as Record<string, unknown>
    : response;
  const explicit = source.ticket_type ?? source.ticketType;
  if (explicit === "officer_issued") return "officer_issued";
  const textKeys = [
    "offenceDescription", "offenseDescription", "violation", "offence", "charge",
    "noticeText", "notice_text", "rawText", "raw_text", "text", "owner_notice_evidence",
    "ticket_type_evidence", "ticketTypeEvidence", "owner_notice_wording", "noticeType", "notice_type", "documentType", "document_type",
  ];
  const evidence = textKeys.flatMap(key => typeof source[key] === "string" ? [source[key]] : Array.isArray(source[key]) ? source[key].filter(item => typeof item === "string") : []).join(" ");
  const section = [source.offenceSection ?? source.section, source.offenceSubSection ?? source.subsection]
    .filter(item => typeof item === "string" || typeof item === "number").join(" ");
  const ownerWording = /owner\s+of\s+(?:a\s+)?motor\s+vehicle\s+involved/i.test(evidence);
  const ownerSection = /\b160\s*\(\s*1\s*\)/i.test(`${section} ${evidence}`)
    || (/^(?:s(?:ection)?\.?\s*)?160\s*$/i.test(String(source.offenceSection ?? source.section ?? ""))
      && /^\(?\s*1\s*\)?$/.test(String(source.offenceSubSection ?? source.subsection ?? "")));
  const cameraPattern = /photo[\s-]*radar|red[\s-]*light\s+camera|intersection\s+safety\s+camera|automated\s+(?:traffic\s+)?enforcement/i;
  const explicitCameraDocument = [source.noticeType, source.notice_type, source.documentType, source.document_type]
    .some(value => typeof value === "string" && cameraPattern.test(value));
  const mailedOwnerNotice = (source.mailed_notice_format === true || source.mailedNoticeFormat === true || source.mailed_notice === true || source.mailedNotice === true || /mail(?:ed|ing)|registered\s+owner/i.test(evidence))
    && (source.owner_notice === true || source.ownerNotice === true || source.automatedEnforcementNotice === true || cameraPattern.test(evidence));
  if (ownerWording || ownerSection || explicitCameraDocument || mailedOwnerNotice || explicit === "photo_radar") return "photo_radar";
  return null;
}

export function applyTicketType<T extends TicketTypeState>(current: T, ticketType: TicketType, source: TicketTypeSource): T {
  if (source === "upload" && current.ticketTypeSource === "manual") return applyTicketType(current, current.ticketType, "manual");
  const changed = ticketType !== current.ticketType;
  return {
    ...current,
    ticketType,
    ticketTypeSource: source,
    ...(changed ? { registeredOwnerOnOffenceDate: "", consentGiven: false, digitalSignature: "" } : {}),
    ...(ticketType === "photo_radar" ? { insuranceCompany: "", priorTickets: "", pleaType: "not_guilty", vehicleSeized: false } : {}),
    ...(changed && ticketType === "officer_issued" ? { pleaType: "" } : {}),
  };
}

export function applyDetectedTicketType<T extends TicketTypeState>(current: T, extraction: unknown): T {
  const detected = detectTicketType(extraction);
  return detected ? applyTicketType(current, detected, "upload") : applyTicketType(current, current.ticketType, current.ticketTypeSource);
}

export function resetTicketTypeForUpload<T extends TicketTypeState>(current: T): T {
  const next = current.ticketTypeSource === "upload" ? applyTicketType(current, "officer_issued", "default") : current;
  return { ...next, registeredOwnerOnOffenceDate: "", consentGiven: false, digitalSignature: "" };
}

export function ticketCheckoutSelection(ticketType: TicketType, selectedInsuranceAddon: boolean, locale = "en") {
  return {
    orderType: ticketType === "photo_radar" ? "photo_radar" : "rapid_resolution",
    includeIdrAddon: ticketType !== "photo_radar" && locale === "en" && selectedInsuranceAddon,
  };
}

export function assessmentStepsForTicket(ticketType: TicketType): number[] {
  return ticketType === "photo_radar" ? [1, 3, 4] : [1, 2, 3, 4];
}
