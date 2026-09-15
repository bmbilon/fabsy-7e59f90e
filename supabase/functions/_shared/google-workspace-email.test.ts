import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildWorkspaceMime } from "./google-workspace-email.ts";

Deno.test("Workspace MIME pins the visible sender and carries deterministic replay metadata", async () => {
  const mime = await buildWorkspaceMime({
    from: "Fabsy Portal <hello@fabsy.ca>",
    reply_to: "hello@fabsy.ca",
    to: ["client@example.test"],
    subject: "Your Fabsy file is in progress",
    html: "<p>Hello &amp; welcome</p>",
    headers: { "X-Fabsy-Test": "fixture" },
  }, "case/status/fixture");
  assertStringIncludes(mime, "From: Fabsy Portal <hello@fabsy.ca>");
  assertStringIncludes(mime, "Reply-To: hello@fabsy.ca");
  assertStringIncludes(mime, "X-Fabsy-Idempotency-Key:");
  assertStringIncludes(mime, "Message-ID:");
  assertStringIncludes(mime, "Content-Type: multipart/alternative");
  assertEquals(mime.includes("execom.ca"), false);
});

Deno.test("Workspace MIME supports embedded email attachments", async () => {
  const mime = await buildWorkspaceMime({
    from: "Fabsy <hello@fabsy.ca>",
    to: ["client@example.test"],
    subject: "Signed form",
    html: "<p>Attached.</p>",
    attachments: [{ filename: "consent.pdf", content: "cGRm" }],
  }, "attachment/fixture");
  assertStringIncludes(mime, "Content-Type: multipart/mixed");
  assertStringIncludes(
    mime,
    'Content-Type: application/pdf; name="consent.pdf"',
  );
  assertStringIncludes(mime, "cGRm");
});

Deno.test("Workspace MIME rejects non-Fabsy senders and header injection", async () => {
  await assertRejects(
    () =>
      buildWorkspaceMime({
        from: "Legacy <brett@execom.ca>",
        to: ["client@example.test"],
        subject: "No",
        html: "<p>No</p>",
      }, "sender/fixture"),
    Error,
    "EMAIL_FROM_MUST_BE_HELLO_AT_FABSY",
  );
  await assertRejects(
    () =>
      buildWorkspaceMime({
        from: "Fabsy <hello@fabsy.ca>",
        to: ["client@example.test"],
        subject: "Hello\r\nBcc: attacker@example.test",
        html: "<p>No</p>",
      }, "header/fixture"),
    Error,
    "INVALID_EMAIL_SUBJECT",
  );
});
