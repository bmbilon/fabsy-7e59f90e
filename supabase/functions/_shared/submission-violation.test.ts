import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  normalizeSubmissionViolation,
  PENDING_VIOLATION_REVIEW,
} from "./submission-violation.ts";

Deno.test("missing ticket description remains eligible for human review", () => {
  for (const value of [undefined, null, "", "   "]) {
    assertEquals(normalizeSubmissionViolation(value), {
      ok: true,
      value: PENDING_VIOLATION_REVIEW,
    });
  }
});

Deno.test("customer or OCR description is normalized without changing its meaning", () => {
  assertEquals(normalizeSubmissionViolation("  Speeding  "), {
    ok: true,
    value: "Speeding",
  });
});

Deno.test("invalid description input stays fail-closed", () => {
  assertEquals(normalizeSubmissionViolation({ description: "Speeding" }), {
    ok: false,
    error: "Violation must be text.",
  });
  assertEquals(normalizeSubmissionViolation("x".repeat(501)), {
    ok: false,
    error: "Violation exceeds 500 characters.",
  });
});
