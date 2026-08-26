import assert from "node:assert/strict";
import test from "node:test";
import { consentAccessDenial, signedUrlLifetimeSeconds } from "./access.ts";

const NOW = Date.parse("2026-08-25T20:00:00.000Z");

test("completed consent remains accessible only before its invitation expiry", () => {
  assert.equal(
    consentAccessDenial({
      status: "completed",
      expires_at: "2026-08-25T20:00:01.000Z",
      access_revoked_at: null,
    }, NOW),
    null,
  );
  assert.equal(
    consentAccessDenial({
      status: "completed",
      expires_at: "2026-08-25T20:00:00.000Z",
      access_revoked_at: null,
    }, NOW),
    "expired",
  );
});

test("post-completion access revocation is denied without changing completed status", () => {
  assert.equal(
    consentAccessDenial({
      status: "completed",
      expires_at: "2026-08-26T20:00:00.000Z",
      access_revoked_at: "2026-08-25T20:00:00.000Z",
    }, NOW),
    "revoked",
  );
});

test("legacy revoked and expired statuses remain denied", () => {
  assert.equal(
    consentAccessDenial({
      status: "revoked",
      expires_at: "2026-08-26T20:00:00.000Z",
    }, NOW),
    "revoked",
  );
  assert.equal(
    consentAccessDenial({
      status: "expired",
      expires_at: "2026-08-26T20:00:00.000Z",
    }, NOW),
    "expired",
  );
});

test("malformed expiry fails closed", () => {
  assert.equal(
    consentAccessDenial({
      status: "completed",
      expires_at: "not-a-date",
      access_revoked_at: null,
    }, NOW),
    "expired",
  );
});

test("signed URL lifetime is capped at ten minutes and invite lifetime", () => {
  assert.equal(signedUrlLifetimeSeconds("2026-08-25T20:30:00.000Z", NOW), 600);
  assert.equal(signedUrlLifetimeSeconds("2026-08-25T20:05:00.000Z", NOW), 300);
  assert.equal(signedUrlLifetimeSeconds("2026-08-25T20:00:05.900Z", NOW), 5);
  assert.equal(signedUrlLifetimeSeconds("2026-08-25T20:00:00.900Z", NOW), 0);
  assert.equal(signedUrlLifetimeSeconds("2026-08-25T19:59:59.000Z", NOW), 0);
});
