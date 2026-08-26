import assert from "node:assert/strict";
import test from "node:test";
import {
  MANUAL_SCAN_MAX_BYTES,
  manualScanDescriptor,
  matchesDeclaredMagic,
  safeManualTempPath,
} from "./manual-scan.ts";

test("manual upload descriptor accepts only the private scan allowlist and size cap", () => {
  assert.deepEqual(
    manualScanDescriptor({
      name: "signed.pdf",
      contentType: "application/pdf",
      size: 42,
    }),
    {
      name: "signed.pdf",
      contentType: "application/pdf",
      size: 42,
    },
  );
  assert.equal(
    manualScanDescriptor({
      name: "signed.svg",
      contentType: "image/svg+xml",
      size: 42,
    }),
    null,
  );
  assert.equal(
    manualScanDescriptor({
      name: "signed.pdf",
      contentType: "application/pdf",
      size: MANUAL_SCAN_MAX_BYTES + 1,
    }),
    null,
  );
});

test("declared MIME must match magic bytes", () => {
  assert.equal(
    matchesDeclaredMagic(
      new TextEncoder().encode("%PDF-1.7"),
      "application/pdf",
    ),
    true,
  );
  assert.equal(
    matchesDeclaredMagic(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0), "image/jpeg"),
    true,
  );
  assert.equal(
    matchesDeclaredMagic(
      Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
      "image/png",
    ),
    true,
  );
  assert.equal(
    matchesDeclaredMagic(new TextEncoder().encode("<html>"), "application/pdf"),
    false,
  );
});

test("temporary scan path is scoped to one invite and one random upload", () => {
  const invite = "00000000-0000-4000-8000-000000000001";
  assert.equal(
    safeManualTempPath(
      invite,
      `temporary/${invite}/00000000-0000-4000-8000-000000000002/upload.pdf`,
    ),
    true,
  );
  assert.equal(
    safeManualTempPath(
      invite,
      `temporary/00000000-0000-4000-8000-000000000003/00000000-0000-4000-8000-000000000002/upload.pdf`,
    ),
    false,
  );
  assert.equal(
    safeManualTempPath(invite, `temporary/${invite}/../upload.pdf`),
    false,
  );
});
