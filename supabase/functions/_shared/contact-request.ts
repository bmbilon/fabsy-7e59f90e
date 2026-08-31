export class ContactRequestError extends Error {}

function field(value: unknown, label: string, maximum: number, required = false, multiline = false): string {
  if (value !== undefined && typeof value !== "string") throw new ContactRequestError(`Invalid ${label}.`);
  const result = (typeof value === "string" ? value : "").trim();
  if ((required && !result) || result.length > maximum || (!multiline && /[\r\n]/.test(result))) {
    throw new ContactRequestError(`Invalid ${label}.`);
  }
  return result;
}

export function parseContactRequest(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ContactRequestError("Invalid contact request.");
  const input = value as Record<string, unknown>;
  const email = field(input.email, "email", 254, true);
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new ContactRequestError("Invalid email.");
  const inquiryType = input.inquiry_type ?? "contact";
  if (inquiryType !== "contact" && inquiryType !== "fleet") throw new ContactRequestError("Invalid enquiry type.");
  return {
    name: field(input.name, "name", 120, true), email,
    phone: field(input.phone, "phone", 40), subject: field(input.subject, "subject", 200),
    message: field(input.message, "message", 6000, true, true),
    inquiryType, preferredLocale: input.preferred_locale,
  };
}

export function escapeContactHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
