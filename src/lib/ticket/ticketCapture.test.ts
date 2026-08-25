import assert from "node:assert/strict";
import test from "node:test";

import {
  TICKET_CAPTURE_MAX_BYTES,
  validateTicketCaptureFile,
} from "./ticketCapture.ts";

test("accepts every supported ticket format", () => {
  const supported = [
    ["ticket.pdf", "application/pdf", "pdf"],
    ["ticket.jpg", "image/jpeg", "image"],
    ["ticket.jpeg", "image/jpeg", "image"],
    ["ticket.png", "image/png", "image"],
    ["ticket.webp", "image/webp", "image"],
    ["ticket.heic", "image/heic", "image"],
    ["ticket.heif", "image/heif", "image"],
  ] as const;

  for (const [name, type, expectedKind] of supported) {
    const result = validateTicketCaptureFile({ name, type, size: 1_024 });
    assert.equal(result.valid, true, `${name} should be accepted`);
    if (result.valid) assert.equal(result.kind, expectedKind);
  }
});

test("uses the extension for HEIC files with a generic browser MIME type", () => {
  const result = validateTicketCaptureFile({
    name: "IMG_1001.HEIC",
    type: "application/octet-stream",
    size: 1_024,
  });

  assert.deepEqual(result, {
    valid: true,
    kind: "image",
    mimeType: "image/heic",
  });
});

test("accepts a file exactly at the 10 MB limit", () => {
  const result = validateTicketCaptureFile({
    name: "ticket.pdf",
    type: "application/pdf",
    size: TICKET_CAPTURE_MAX_BYTES,
  });

  assert.equal(result.valid, true);
});

test("rejects oversized, empty, unsupported and mismatched files", () => {
  const cases = [
    { name: "ticket.pdf", type: "application/pdf", size: TICKET_CAPTURE_MAX_BYTES + 1 },
    { name: "ticket.pdf", type: "application/pdf", size: 0 },
    { name: "ticket.exe", type: "application/octet-stream", size: 1_024 },
    { name: "ticket.pdf", type: "image/jpeg", size: 1_024 },
  ];

  for (const file of cases) {
    assert.equal(validateTicketCaptureFile(file).valid, false, `${file.name} should be rejected`);
  }
});
