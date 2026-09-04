import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createDraftAccessToken,
  discardedPendingObjectForCleanup,
  draftCapabilityWasRotated,
  DraftRequestError,
  draftStoragePath,
  draftUploadVerificationTarget,
  isAllowedTicketIntakeOrigin,
  mergeDraftContact,
  parseDraftAccessToken,
  parseDraftContact,
  parseJsonBody,
  parseTicketFileMetadata,
  requestFingerprint,
  sanitizeDraftData,
  sha256Hex,
  storageObjectMatches,
  syncContactIntoDraftData,
} from "./ticket-intake-draft.ts";

Deno.test("draft capabilities contain 256 random bits and only hashes are persisted", async () => {
  const first = createDraftAccessToken();
  const second = createDraftAccessToken();
  assertEquals(first.length, 64);
  assert(/^[0-9a-f]{64}$/.test(first));
  assert(first !== second);
  assertEquals(parseDraftAccessToken(first), first);
  const hash = await sha256Hex(first);
  assertEquals(hash.length, 64);
  assert(hash !== first);
  assertThrows(() => parseDraftAccessToken("short"), DraftRequestError);
});

Deno.test("request fingerprints are keyed and do not disclose the source address", async () => {
  const first = await requestFingerprint("server-secret", "203.0.113.1");
  const second = await requestFingerprint("different-secret", "203.0.113.1");
  assert(/^[0-9a-f]{64}$/.test(first));
  assert(first !== second);
  assert(!first.includes("203.0.113.1"));
});

Deno.test("draft input allowlist rejects signatures, files, bearer credentials and unknown fields", () => {
  const safe = sanitizeDraftData({
    firstName: "  Brett ",
    email: " PERSON@EXAMPLE.COM ",
    ticketType: "officer_issued",
    smsOptIn: false,
    agentRepresentationPermitted: null,
    issueDate: "2026-09-03T12:00:00.000Z",
  });
  assertEquals(safe, {
    firstName: "Brett",
    email: "person@example.com",
    ticketType: "officer_issued",
    smsOptIn: false,
    agentRepresentationPermitted: null,
    issueDate: "2026-09-03T12:00:00.000Z",
  });
  for (
    const key of [
      "digitalSignature",
      "ticketImage",
      "sourceAssessmentAccessToken",
      "referral",
      "paymentMethod",
    ]
  ) {
    const error = assertThrows(
      () => sanitizeDraftData({ [key]: "secret" }),
      DraftRequestError,
    );
    assertEquals(error.code, "sensitive_draft_field");
  }
  assertThrows(() => sanitizeDraftData({ madeUp: "value" }), DraftRequestError);
  assertThrows(() => sanitizeDraftData({ smsOptIn: "yes" }), DraftRequestError);
});

Deno.test("lead contact requires one normalized reachable channel and stays synchronized", () => {
  assertEquals(
    parseDraftContact({ email: " PERSON@EXAMPLE.COM ", phone: "" }),
    {
      email: "person@example.com",
      phone: null,
    },
  );
  assertEquals(parseDraftContact({ phone: "+1 (403) 555-0123" }), {
    email: null,
    phone: "+14035550123",
  });
  assertThrows(
    () => parseDraftContact({ email: "", phone: "" }),
    DraftRequestError,
  );
  assertThrows(
    () => parseDraftContact({ email: "a@example.com", extra: "x" }),
    DraftRequestError,
  );
  const updatedContact = mergeDraftContact(
    { email: "old@example.com", phone: null },
    { email: "new@example.com" },
  );
  assertEquals(updatedContact, { email: "new@example.com", phone: null });
  const synchronized: Record<string, unknown> = syncContactIntoDraftData(
    { email: "new@example.com", firstName: "Test" },
    updatedContact,
  );
  assertEquals(
    synchronized,
    { email: "new@example.com", firstName: "Test" },
  );
});

Deno.test("ticket metadata and object confirmation are exact and bounded", () => {
  const file = parseTicketFileMetadata({
    contentType: "image/jpeg",
    size: 1234,
  });
  assertEquals(file, {
    contentType: "image/jpeg",
    extension: "jpg",
    size: 1234,
  });
  assertEquals(
    draftStoragePath("00000000-0000-4000-8000-000000000001", 3, file.extension),
    "00000000-0000-4000-8000-000000000001/representation-ticket-r3.jpg",
  );
  assert(storageObjectMatches(file, { mimetype: "image/jpeg", size: 1234 }));
  assert(!storageObjectMatches(file, { mimetype: "image/png", size: 1234 }));
  assert(!storageObjectMatches(file, { mimetype: "image/jpeg", size: 1235 }));
  assertThrows(
    () => parseTicketFileMetadata({ contentType: "text/html", size: 100 }),
    DraftRequestError,
  );
  assertThrows(
    () =>
      parseTicketFileMetadata({
        contentType: "image/jpeg",
        size: 10 * 1024 * 1024 + 1,
      }),
    DraftRequestError,
  );
});

Deno.test("origins are exact and JSON bodies have a byte ceiling", () => {
  assert(isAllowedTicketIntakeOrigin("https://fabsy.ca"));
  assert(
    isAllowedTicketIntakeOrigin(
      "https://preview.example",
      "https://preview.example",
    ),
  );
  assert(!isAllowedTicketIntakeOrigin("https://fabsy-evil.vercel.app"));
  assert(!isAllowedTicketIntakeOrigin("https://fabsy.ca.evil.example"));
  assertEquals(parseJsonBody('{"action":"read"}'), { action: "read" });
  assertThrows(() => parseJsonBody("not-json"), DraftRequestError);
  assertThrows(
    () => parseJsonBody(JSON.stringify({ value: "x".repeat(70 * 1024) })),
    DraftRequestError,
  );
});

Deno.test("helpers never accept async malformed capability input", async () => {
  await assertRejects(async () => {
    parseDraftAccessToken(await Promise.resolve("not-a-capability"));
  }, DraftRequestError);
});

Deno.test("replacement verification preserves the confirmed ticket until the pending object wins", () => {
  const confirmed = {
    ticket_document_path: "draft/confirmed.pdf",
    ticket_document_content_type: "application/pdf",
    ticket_document_size_bytes: 1200,
    pending_ticket_document_path: "draft/replacement.jpg",
    pending_ticket_document_content_type: "image/jpeg",
    pending_ticket_document_size_bytes: 2400,
  };
  assertEquals(draftUploadVerificationTarget(confirmed), {
    path: "draft/replacement.jpg",
    contentType: "image/jpeg",
    size: 2400,
    replacement: true,
  });
  assertEquals(
    draftUploadVerificationTarget({
      ...confirmed,
      pending_ticket_document_path: null,
      pending_ticket_document_content_type: null,
      pending_ticket_document_size_bytes: null,
    }),
    {
      path: "draft/confirmed.pdf",
      contentType: "application/pdf",
      size: 1200,
      replacement: false,
    },
  );
});

Deno.test("discard cleanup never removes a concurrently confirmed or still-pending object", () => {
  const pending = "draft/replacement.jpg";
  assertEquals(
    discardedPendingObjectForCleanup(pending, {
      ticket_document_path: "draft/confirmed.pdf",
      pending_ticket_document_path: null,
    }),
    pending,
  );
  assertEquals(
    discardedPendingObjectForCleanup(pending, {
      ticket_document_path: pending,
      pending_ticket_document_path: null,
    }),
    null,
  );
  assertEquals(
    discardedPendingObjectForCleanup(pending, {
      ticket_document_path: "draft/confirmed.pdf",
      pending_ticket_document_path: pending,
    }),
    null,
  );
});

Deno.test("capability rotation is acknowledged only for the server-provided replacement hash", () => {
  assert(draftCapabilityWasRotated("old", "new", "new"));
  assert(!draftCapabilityWasRotated("old", "unexpected", "new"));
  assert(!draftCapabilityWasRotated("same", "same", "same"));
});
