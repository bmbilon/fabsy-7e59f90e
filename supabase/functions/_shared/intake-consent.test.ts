import assert from "node:assert/strict";
import { INTAKE_CONSENT_VERSION, INTAKE_CONSENT_LABEL, parseIntakeConsent, parsePhotoUploadConsent, PHOTO_UPLOAD_CONSENT_VERSION, LEGACY_PHOTO_UPLOAD_CONSENT_VERSION, NOT_GUILTY_PLEA_INSTRUCTION, NO_PLEA_INSTRUCTION } from "./intake-consent.ts";

const valid = { accepted: true, version: INTAKE_CONSENT_VERSION, method: "checkbox" };
Deno.test("intake consent rejects missing, false, stale and coerced acceptance", () => {
  for (const value of [null, {}, { ...valid, accepted: false }, { ...valid, accepted: "true" }, { ...valid, version: "old" }, { ...valid, method: "inferred" }]) {
    assert.throws(() => parseIntakeConsent(value, "Alex Example", false));
  }
});
Deno.test("checkbox consent binds server wording, identity, product and time without inventing a signature", () => {
  const now = new Date("2026-09-20T12:34:56Z");
  const consent = parseIntakeConsent({ ...valid, acceptedAt: "1900-01-01", name: "Someone Else", authorization: ["anything"], label: "spoof" }, "Alex Example", true, now);
  assert.equal(consent.name, "Alex Example");
  assert.equal(consent.acceptedAt, now.toISOString());
  assert.equal(consent.label, INTAKE_CONSENT_LABEL);
  assert.equal(consent.method, "checkbox");
  assert.equal("signature" in consent, false);
  assert.match(consent.authorization.join("\n"), /not-guilty plea/);
  assert.match(consent.authorization.join("\n"), /\$79/);
});
Deno.test("typed consent still requires the actual matching legal-name signature", () => {
  assert.throws(() => parseIntakeConsent({ ...valid, method: "typed" }, "Alex Example", false));
  assert.throws(() => parseIntakeConsent({ ...valid, method: "typed", signature: "Different Person" }, "Alex Example", false));
  const consent = parseIntakeConsent({ ...valid, method: "typed", signature: " Alex  Example " }, "Alex Example", false);
  assert.equal(consent.method, "typed");
  assert.match(consent.authorization.join("\n"), /\$198/);
});

Deno.test("photo consent preserves either submitted plea choice with server-owned instruction", () => {
  for (const pleadNotGuilty of [true, false]) {
    const consent = parsePhotoUploadConsent({ accepted: true, method: "checkbox", version: PHOTO_UPLOAD_CONSENT_VERSION,
      pleadNotGuilty, pleaLabel: "spoof", pleaInstruction: "spoof" }, "ticket-id", "ticket-id/ticket.pdf");
    const saved = JSON.parse(JSON.stringify(consent));
    assert.equal(saved.pleadNotGuilty, pleadNotGuilty);
    assert.equal(saved.pleaLabel, "I plead not guilty");
    assert.equal(saved.pleaInstruction, pleadNotGuilty ? NOT_GUILTY_PLEA_INSTRUCTION : NO_PLEA_INSTRUCTION);
    assert.ok(!saved.authorization.join("\n").includes("Enter a not-guilty plea"));
  }
});

Deno.test("current photo consent rejects missing or coerced plea choice; legacy consent never gains one", () => {
  for (const pleadNotGuilty of [undefined, null, "true", "false", 0, 1]) {
    assert.throws(() => parsePhotoUploadConsent({ accepted: true, method: "checkbox", version: PHOTO_UPLOAD_CONSENT_VERSION,
      pleadNotGuilty }, "ticket-id", "ticket-id/ticket.pdf"));
  }
  const legacy = parsePhotoUploadConsent({ accepted: true, method: "checkbox", version: LEGACY_PHOTO_UPLOAD_CONSENT_VERSION,
    pleadNotGuilty: true }, "ticket-id", "ticket-id/ticket.pdf");
  assert.equal(legacy.version, LEGACY_PHOTO_UPLOAD_CONSENT_VERSION);
  assert.equal("pleadNotGuilty" in JSON.parse(JSON.stringify(legacy)), false);
  assert.equal("pleaInstruction" in legacy, false);
});
