import { strict as assert } from "node:assert";
import { approvalHash, approvalPublicSummary, newApprovalToken, APPROVAL_TOKEN_PATTERN, normalizeApprovalTicket, validateTermsUrl } from "./disclosure-approval.ts";

Deno.test("approval uses 256-bit random tokens with one-way storage hashes", async () => {
  const first = newApprovalToken(); const second = newApprovalToken();
  assert.match(first, APPROVAL_TOKEN_PATTERN); assert.notEqual(first, second);
  assert.equal(await approvalHash("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal((await approvalHash(first)).length, 64);
});

Deno.test("phone preview excludes full identifiers, storage paths and bearer material", () => {
  const row = { status: "pending", expires_at: "2026-09-20T15:00:00Z", case_label: "Test C.",
    ticket_number: "E12345678T", token_hash: "secret", source_snapshot: { drivers_license: "private" },
    recipient_phone: "private", consent_sha256: "private", scope: "Frozen authorized action", terms_text: "captured terms" };
  const summary = approvalPublicSummary(row, Date.parse("2026-09-20T14:30:00Z"));
  assert.equal(summary.ticket_suffix, "678T"); assert.equal(summary.scope, row.scope);
  assert.equal(summary.status, "pending");
  for (const privateName of ["token_hash", "source_snapshot", "recipient_phone", "ticket_number", "consent_sha256"]) assert.equal(privateName in summary, false);
  assert.equal(approvalPublicSummary(row, Date.parse("2026-09-20T15:00:00Z")).status, "expired");
  assert.equal(approvalPublicSummary({ ...row, status: "approved" }, Date.parse("2026-09-20T15:00:00Z")).status, "expired");
  assert.equal(approvalPublicSummary({ ...row, status: "consumed" }, Date.parse("2026-09-20T15:00:00Z")).status, "consumed");
});

Deno.test("terms links allow only HTTPS Alberta traffic portal and ticket normalization is exact", () => {
  assert.equal(normalizeApprovalTicket(" e12 345-678t "), "E12345678T");
  assert.equal(validateTermsUrl("https://traffictickets.alberta.ca/terms"), "https://traffictickets.alberta.ca/terms");
  for (const url of ["javascript:alert(1)", "https://traffictickets.alberta.ca.evil.test/", "https://evil.test/", "http://traffictickets.alberta.ca/", "https://x@traffictickets.alberta.ca/", "https://traffictickets.alberta.ca:8443/"]) {
    assert.throws(() => validateTermsUrl(url));
  }
});
