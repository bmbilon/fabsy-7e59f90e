import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "fabsy-referral-tests-"));
try {
  const outfile = path.join(temporary, "attribution.mjs");
  await build({ entryPoints: [fileURLToPath(new URL("./attribution.ts", import.meta.url))], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
  const {
    REFERRAL_DRAFT_STORAGE_KEY, REFERRAL_WINDOW_MS, normalizeReferralCode, parseReferralAttribution,
    readReferralDraft, writeReferralDraft, latestReferralAttribution, referralCodeFromLocation, createReferralCaptureController,
  } = await import(pathToFileURL(outfile).href);
  const now = Date.parse("2026-08-31T12:00:00Z");
  const sample = (code = "ABC123", at = now) => ({ code, attributedAt: new Date(at).toISOString(), expiresAt: new Date(at + REFERRAL_WINDOW_MS).toISOString(), attributionToken: "server-signed-test-token-only" });
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };

  assert.equal(normalizeReferralCode("  abC_12-xy  "), "ABC_12-XY");
  for (const code of [null, 123, "AB", "A".repeat(33), "=SUM(A1)", "a/bc", "<script>", "abc\nxyz"]) assert.equal(normalizeReferralCode(code), null);
  assert.equal(referralCodeFromLocation({ pathname: "/", search: "?ref=abc123&utm_source=friend" }), "ABC123");
  assert.equal(referralCodeFromLocation({ pathname: "/r/abc123", search: "" }), "ABC123");
  assert.equal(referralCodeFromLocation({ pathname: "/r/ABC123/", search: "?ref=LAST123" }), "LAST123");
  for (const pathname of ["/r/%2Fbad", "/r/abc/extra", "/r/%", "//foreign.example/r/abc"]) assert.equal(referralCodeFromLocation({ pathname, search: "" }), null);

  assert.deepEqual(parseReferralAttribution(sample(), now), sample());
  assert.equal(parseReferralAttribution(sample("ABC123", now + 1), now), null, "Future captures cannot extend attribution");
  assert.equal(parseReferralAttribution(sample("ABC123", now - REFERRAL_WINDOW_MS), now), null, "The 30-day boundary is expired");
  assert.ok(parseReferralAttribution(sample("ABC123", now - REFERRAL_WINDOW_MS + 1), now));
  assert.equal(parseReferralAttribution({ ...sample(), expiresAt: new Date(now + REFERRAL_WINDOW_MS + 1).toISOString() }, now), null);
  assert.equal(parseReferralAttribution({ ...sample(), attributedAt: "invalid" }, now), null);
  assert.equal(parseReferralAttribution({ ...sample(), attributionToken: "" }, now), null, "A timestamp alone never attributes an order");
  assert.equal(latestReferralAttribution([sample("EARLIER", now - 1000), sample("LATEST1", now), sample("FUTURE1", now + 1)], now)?.code, "LATEST1");

  writeReferralDraft(storage, { ...sample(), driversLicenseImage: "data:image/jpeg;base64,private", firstName: "Private", pro_verified: true }, now);
  const persisted = data.get(REFERRAL_DRAFT_STORAGE_KEY);
  assert.deepEqual(JSON.parse(persisted), { version: 1, referral: sample() });
  assert.ok(!/private|firstName|driversLicenseImage|pro_verified/i.test(persisted), "Only referral attribution is serialized");
  assert.deepEqual(readReferralDraft(storage, now), sample());
  storage.setItem("other-intake-key", "preserve");
  assert.equal(readReferralDraft(storage, now + REFERRAL_WINDOW_MS), null);
  assert.equal(storage.getItem(REFERRAL_DRAFT_STORAGE_KEY), null);
  assert.equal(storage.getItem("other-intake-key"), "preserve");
  storage.setItem(REFERRAL_DRAFT_STORAGE_KEY, "{malformed");
  assert.equal(readReferralDraft(storage, now), null);
  const deniedStorage = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() { throw new Error("denied"); } };
  assert.equal(readReferralDraft(deniedStorage, now), null);
  assert.deepEqual(writeReferralDraft(deniedStorage, sample(), now), sample(), "In-memory use remains possible when storage is blocked");

  let active = sample("INITIAL", now - 1000);
  let requests = 0;
  const pending = new Map();
  const capture = createReferralCaptureController({
    read: () => active, write: referral => { active = referral; }, clear: () => { active = null; }, now: () => now,
    request: code => { requests += 1; return new Promise((resolve, reject) => pending.set(code, { resolve, reject })); },
  });
  await capture.capture("INITIAL");
  assert.equal(requests, 0, "Ordinary revisits must not renew attribution");
  const first = capture.capture("FIRST01");
  const last = capture.capture("LAST001");
  pending.get("LAST001").resolve(sample("LAST001"));
  await last;
  pending.get("FIRST01").resolve(sample("FIRST01"));
  await first;
  assert.equal(active.code, "LAST001", "The last requested touch wins even when an earlier request finishes later");

  const invalid = capture.capture("INVALID");
  pending.get("INVALID").resolve({ code: "INVALID", attributedAt: sample().attributedAt });
  await assert.rejects(invalid);
  assert.equal(active.code, "LAST001", "Invalid capture preserves the last valid referral");
  const unavailable = capture.capture("OFFLINE");
  pending.get("OFFLINE").reject(new Error("offline"));
  await assert.rejects(unavailable);
  assert.equal(active.code, "LAST001", "Network failures preserve attribution");

  const fresh = capture.capture("LAST001", true);
  pending.get("LAST001").resolve(sample("LAST001"));
  await fresh;
  assert.equal(requests, 5, "An explicit manual apply may mint a fresh token");
  const cancelled = capture.capture("CANCEL1");
  capture.clear();
  pending.get("CANCEL1").resolve(sample("CANCEL1"));
  await cancelled;
  assert.equal(active, null, "Removing a code cancels late capture responses");

  const proFile = path.join(temporary, "pro-intake.mjs");
  await build({ entryPoints: [fileURLToPath(new URL("../pro-drivers/intake.ts", import.meta.url))], bundle: true, platform: "node", format: "esm", outfile: proFile, logLevel: "silent" });
  const { normalizeLicenceClass, isProLicenceClass, licenceClassHint, verifiedProResponse, proCheckoutSubtotalCents, validateProLicenceFile } = await import(pathToFileURL(proFile).href);
  const verified = { verified: true, status: "verified", discountPercent: 20 };
  for (const licenceClass of ["1", "2", "4"]) {
    assert.equal(isProLicenceClass(licenceClass), true);
    assert.equal(proCheckoutSubtotalCents(19800, { licenceClass, ticketType: "officer_issued" }, verified), 15840);
    assert.equal(proCheckoutSubtotalCents(22900, { licenceClass, ticketType: "officer_issued" }, verified), 18320);
    assert.equal(proCheckoutSubtotalCents(7900, { licenceClass, ticketType: "photo_radar" }, verified), 7900, "Camera notices never receive pro discount");
  }
  for (const licenceClass of ["3", "5", "6", "7", "unknown", "commercial", 1, null]) {
    assert.equal(isProLicenceClass(licenceClass), false);
    assert.equal(proCheckoutSubtotalCents(19800, { licenceClass }, verified), 19800);
  }
  assert.equal(normalizeLicenceClass("class_1"), "unknown");
  assert.equal(licenceClassHint("Class 1"), "1");
  assert.equal(licenceClassHint("Class 5 GDL"), "5");
  assert.equal(licenceClassHint("1 or 4"), "unknown");
  const unsafeDraft = { licenceClass: "1", pro_verified: true, proVerified: true, discount_applied: 20, discountPercent: 20 };
  assert.equal(proCheckoutSubtotalCents(19800, unsafeDraft, null), 19800, "Client/prefill flags cannot change the displayed price");
  for (const response of [{ verified: "true", status: "verified", discountPercent: 20 }, { ...verified, status: "pending" }, { ...verified, discountPercent: 0 }, { pro_verified: true }]) assert.equal(verifiedProResponse(response), null);
  assert.equal(validateProLicenceFile({ name: "licence.jpg", type: "image/jpeg", size: 1000 }).valid, true);
  for (const file of [
    { name: "licence.pdf", type: "application/pdf", size: 1000 },
    { name: "licence.heic", type: "image/heic", size: 1000 },
    { name: "licence.jpg", type: "text/html", size: 1000 },
    { name: "licence.jpg", type: "image/jpeg", size: 10 * 1024 * 1024 + 1 },
  ]) assert.equal(validateProLicenceFile(file).valid, false);
  console.log("Referral last-touch, signed-token draft privacy, expiry/races and pro pricing safeguards passed.");
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
