export const PENDING_VIOLATION_REVIEW = "Ticket pending human review";

export type NormalizedViolation =
  | { ok: true; value: string }
  | {
    ok: false;
    error: "Violation must be text." | "Violation exceeds 500 characters.";
  };

export function normalizeSubmissionViolation(
  value: unknown,
): NormalizedViolation {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: PENDING_VIOLATION_REVIEW };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "Violation must be text." };
  }
  const normalized = value.trim();
  if (!normalized) {
    return { ok: true, value: PENDING_VIOLATION_REVIEW };
  }
  if (normalized.length > 500) {
    return { ok: false, error: "Violation exceeds 500 characters." };
  }
  return { ok: true, value: normalized };
}
