export interface ExistingClientIdentity {
  auth_user_id: string | null;
  last_name: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  date_of_birth: string | null;
}

export interface SubmittedClientIdentity {
  lastName: string;
  address: string;
  city: string;
  postalCode: string;
  dateOfBirth?: string;
}

function normalizedText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ")
    .toLocaleLowerCase("en-CA");
  return normalized || null;
}

function normalizedPostalCode(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").toUpperCase().replace(
    /[^A-Z0-9]/g,
    "",
  );
  return normalized || null;
}

function normalizedDate(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function requiredMatch(left: string | null, right: string | null): boolean {
  return left !== null && right !== null && left === right;
}

/**
 * A legacy client may refresh contact details only before any portal account is
 * bound and only when stable identity fields all match. First name, email and
 * phone are intentionally excluded because those are the values a returning
 * customer may legitimately be changing.
 */
export function canRefreshUnclaimedClientContact(
  existing: ExistingClientIdentity,
  submitted: SubmittedClientIdentity,
): boolean {
  if (existing.auth_user_id !== null) return false;

  return requiredMatch(
    normalizedText(existing.last_name),
    normalizedText(submitted.lastName),
  ) &&
    requiredMatch(
      normalizedDate(existing.date_of_birth),
      normalizedDate(submitted.dateOfBirth),
    ) &&
    requiredMatch(
      normalizedText(existing.address),
      normalizedText(submitted.address),
    ) &&
    requiredMatch(
      normalizedText(existing.city),
      normalizedText(submitted.city),
    ) &&
    requiredMatch(
      normalizedPostalCode(existing.postal_code),
      normalizedPostalCode(submitted.postalCode),
    );
}
