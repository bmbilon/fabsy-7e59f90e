import { referralInvitationAvailability, referralInvitationHtml, resolutionCopy, resolutionPreviewFingerprint } from "./resolution-email.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(JSON.stringify({ actual, expected }));
}
function check(condition: unknown, message: string) { if (!condition) throw new Error(message); }

Deno.test("camera final results are monetary outcomes without insurance or conviction marketing", () => {
  for (const outcome of ["withdrawn", "reduced", "unchanged"]) {
    const copy = resolutionCopy("photo_radar", outcome);
    check(copy, `Missing camera outcome ${outcome}`);
    check(!/insurance|conviction|demerit|premium|renewal/i.test(JSON.stringify(copy)), "Camera result contains officer/insurance copy");
  }
  for (const outcome of [null, "", "pending", "conviction_stands", "other"]) equal(resolutionCopy("photo_radar", outcome), null);
  equal(resolutionCopy("officer_issued", "unchanged"), null);
  check(resolutionCopy("officer_issued", "conviction_stands"), "Officer final outcome missing");
});

Deno.test("referral invitations require enabled configuration and a recent paid purchase", () => {
  const ready = { enabled: true, mailingAddress: "123 Fixture Street, Calgary AB", checkoutCreatedAt: "2026-08-01T12:00:00Z", now: new Date("2026-08-31T12:00:00Z") };
  equal(referralInvitationAvailability(ready).available, true);
  for (const changed of [
    { enabled: false }, { mailingAddress: "" }, { mailingAddress: "   " },
    { checkoutCreatedAt: null }, { checkoutCreatedAt: "bad-date" },
    { checkoutCreatedAt: "2026-08-31T12:00:00.001Z" }, { checkoutCreatedAt: "2024-08-31T11:59:59.999Z" },
  ]) {
    const result = referralInvitationAvailability({ ...ready, ...changed });
    equal(result.available, false);
    check(result.reason, "Unavailable invitations need a reason");
  }
  equal(referralInvitationAvailability({ ...ready, checkoutCreatedAt: "2024-08-31T12:00:00Z" }).available, true);
});

Deno.test("invitation renderer validates links and escapes operator-supplied mailing text", () => {
  const html = referralInvitationHtml("AB12CD34EF", "123 Fixture St <img src=x onerror=alert(1)>", "https://fabsy.test");
  check(html.includes("https://fabsy.test/r/AB12CD34EF"), "Client share link missing");
  check(html.includes("$50") && html.includes("$20"), "Officer and camera reward terms missing");
  check(html.includes("unsubscribe"), "Unsubscribe instruction missing");
  check(!html.includes("<img") && html.includes("&lt;img"), "Mailing text was not escaped");
  let rejected = false;
  try { referralInvitationHtml('bad\" onclick="alert(1)', "123 Fixture St", "https://fabsy.test"); } catch { rejected = true; }
  check(rejected, "Unsafe referral code accepted");
});

Deno.test("review fingerprints change when saved outcome, recipient or rendered details change", async () => {
  const snapshot = { submissionId: "test-case", outcome: "withdrawn", recipient: "client@example.test", firstName: "Fixture", ticketNumber: "T-1", resolution: resolutionCopy("officer_issued", "withdrawn"), invitationAvailable: false };
  const fingerprint = await resolutionPreviewFingerprint(snapshot);
  check(/^[a-f0-9]{64}$/.test(fingerprint), "Expected a SHA256 fingerprint");
  equal(await resolutionPreviewFingerprint(snapshot), fingerprint);
  for (const changed of [{ outcome: "reduced" }, { recipient: "other@example.test" }, { firstName: "Different" }, { ticketNumber: "T-2" }, { invitationAvailable: true }]) {
    check(await resolutionPreviewFingerprint({ ...snapshot, ...changed }) !== fingerprint, "Changed preview retained its fingerprint");
  }
});
