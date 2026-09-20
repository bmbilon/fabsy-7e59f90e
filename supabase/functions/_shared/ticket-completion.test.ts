import { assertEquals, assertRejects } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { createTicketCompletionUrl, intakeAccessTokenHash, validTicketCompletionUrl } from "./ticket-completion.ts";
const source = { draftId: "11111111-2222-4333-8444-555555555555", accessTokenHash: "a".repeat(64), expiresAt: "2035-01-01T00:00:00Z", secret: "synthetic-server-secret" };
const tokenFrom = (url: string) => new URLSearchParams(new URL(url).hash.slice(1)).get("access")!;
Deno.test("completion alias is deterministic, private and authorizes the same stored intake", async () => {
  const url = await createTicketCompletionUrl(source);
  assertEquals(await createTicketCompletionUrl(source), url);
  assertEquals(validTicketCompletionUrl(url), true);
  assertEquals(new URL(url).search, "");
  const token = tokenFrom(url);
  assertEquals(token.length < 200, true);
  assertEquals(await intakeAccessTokenHash(token, source.secret, source.draftId), source.accessTokenHash);
});
Deno.test("tampering, wrong signing key, expiry and cross-case substitution cannot authorize", async () => {
  const token = tokenFrom(await createTicketCompletionUrl(source));
  for (const changed of [token.replace("a".repeat(64), "b".repeat(64)), token.replace("11111111", "99999999"), `${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}`, token.replace("c1.", "c1.bad.")]) {
    assertEquals(await intakeAccessTokenHash(changed, source.secret, source.draftId), "");
  }
  assertEquals(await intakeAccessTokenHash(token, "different-secret", source.draftId), "");
  assertEquals(await intakeAccessTokenHash(token, "", source.draftId), "");
  assertEquals(await intakeAccessTokenHash(token, source.secret, "99999999-2222-4333-8444-555555555555"), "");
  assertEquals(await intakeAccessTokenHash(token, source.secret, source.draftId, Date.parse(source.expiresAt)), "");
});
Deno.test("rotation revokes old aliases without changing the original browser capability at issuance", async () => {
  const old = tokenFrom(await createTicketCompletionUrl(source));
  const rotated = { ...source, accessTokenHash: "c".repeat(64) };
  const next = tokenFrom(await createTicketCompletionUrl(rotated));
  assertEquals(await intakeAccessTokenHash(old, source.secret) === rotated.accessTokenHash, false);
  assertEquals(await intakeAccessTokenHash(next, source.secret), rotated.accessTokenHash);
  assertEquals(await intakeAccessTokenHash("original-token", source.secret), await intakeAccessTokenHash("original-token", "other-secret"));
});
Deno.test("email URLs reject generic intake, unsafe URLs and expired sources", async () => {
  const url = await createTicketCompletionUrl(source);
  for (const candidate of ["https://fabsy.ca/submit-ticket", url.replace("fabsy.ca", "evil.test"), url.replace("https:", "http:"), url.replace("#access=", "?access="), "javascript:alert(1)", ""]) assertEquals(validTicketCompletionUrl(candidate), false);
  await assertRejects(() => createTicketCompletionUrl({ ...source, expiresAt: "2020-01-01" }));
});
