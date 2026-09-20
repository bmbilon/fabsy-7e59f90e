import assert from "node:assert/strict";
import { INTAKE_CONSENT_VERSION, INTAKE_CONSENT_LABEL, parseIntakeConsent } from "./intake-consent.ts";

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
