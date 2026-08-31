export type TicketReviewField =
  | "ticketNumber" | "issueDate" | "location" | "fineAmount"
  | "officer" | "officerBadge" | "offenceSection" | "offenceSubSection"
  | "offenceDescription" | "courtDate";

export const REQUIRED_TICKET_REVIEW_FIELDS = ["ticketNumber", "issueDate", "location", "fineAmount"] as const;

export function ticketFieldNeedsReview(field: TicketReviewField, value: unknown): boolean {
  if (field === "issueDate" || field === "courtDate") {
    return !(value instanceof Date) || !Number.isFinite(value.getTime());
  }
  if (typeof value !== "string" || !value.trim()) return true;
  if (field === "fineAmount") return !/^\d+(?:\.\d{1,2})?$/.test(value.trim());
  if (field === "location") return value.trim().length < 5;
  return false;
}

export function hasTicketReviewData(data: Partial<Record<TicketReviewField, unknown>>): boolean {
  return REQUIRED_TICKET_REVIEW_FIELDS.some(field => !ticketFieldNeedsReview(field, data[field]));
}

export function missingRequiredTicketFields(data: Partial<Record<TicketReviewField, unknown>>) {
  return REQUIRED_TICKET_REVIEW_FIELDS.filter(field => ticketFieldNeedsReview(field, data[field]));
}
