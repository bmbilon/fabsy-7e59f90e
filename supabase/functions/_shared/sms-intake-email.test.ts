import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  processSmsIntakeEmails,
  renderSmsIntakeEmail,
  sendSmsIntakeEmail,
  type SmsIntakeEmail,
  type SmsIntakeEmailDependencies,
  type SmsIntakeEmailPayload,
  SmsIntakeEmailSendError,
} from "./sms-intake-email.ts";

const alert: SmsIntakeEmail = {
  id: "11111111-1111-4111-8111-111111111111",
  inquiry_id: "22222222-2222-4222-8222-222222222222",
  claim_id: "33333333-3333-4333-8333-333333333333",
  snapshot: {
    fromNumber: "+14035550123",
    toNumber: "+18255550123",
    body: '<img src=x onerror="alert(1)">',
    numMedia: 1,
    receivedAt: "2026-09-09T15:10:22Z",
    inquiryId: "22222222-2222-4222-8222-222222222222",
  },
};
const email = renderSmsIntakeEmail(alert);

Deno.test("SMS inquiry email is actionable, escaped and has no customer capability or attachment", () => {
  assertEquals(email.to, ["hello@fabsy.ca"]);
  assertEquals(email.bcc, ["brett@execom.ca"]);
  assertEquals(email.from, "Fabsy SMS <hello@fabsy.ca>");
  assert(email.html.includes("https://fabsy.ca/admin/sms"));
  assert(
    email.html.includes("+18255550123") &&
      email.html.includes("4035550123"),
  );
  assert(email.html.includes("&lt;img") && !email.html.includes("<img src=x"));
  assert(
    !email.html.includes("accessToken") && !email.html.includes("/storage/") &&
      !email.html.includes("#resume="),
  );
  assert(!("attachments" in email));
  assertEquals(Object.keys(email).sort(), [
    "bcc",
    "from",
    "html",
    "subject",
    "to",
  ]);
});

Deno.test("email sends immutable bytes with the same provider idempotency key", async () => {
  const requests: RequestInit[] = [];
  const fetcher: typeof fetch = (_url, options) => {
    requests.push(options!);
    return Promise.resolve(
      new Response(JSON.stringify({ id: "email-id" }), { status: 200 }),
    );
  };
  await sendSmsIntakeEmail("test-key", email, alert.id, fetcher);
  await sendSmsIntakeEmail("test-key", email, alert.id, fetcher);
  assertEquals(requests[0].body, requests[1].body);
  assertEquals(
    new Headers(requests[0].headers).get("Idempotency-Key"),
    `sms-inquiry-${alert.id}`,
  );
});

Deno.test("provider errors distinguish safely retried failures from permanent rejection", async () => {
  for (
    const [status, permanent] of [[429, false], [503, false], [409, false], [
      422,
      true,
    ], [401, true]] as const
  ) {
    const error = await assertRejects(
      () =>
        sendSmsIntakeEmail(
          "key",
          email,
          alert.id,
          () => Promise.resolve(new Response("{}", { status })),
        ),
      SmsIntakeEmailSendError,
    );
    assertEquals(error.permanent, permanent);
  }
  await assertRejects(
    () =>
      sendSmsIntakeEmail(
        "key",
        email,
        alert.id,
        () => Promise.reject(new TypeError("network")),
      ),
    SmsIntakeEmailSendError,
    "provider_network_error",
  );
});

function dependencies(overrides: Partial<SmsIntakeEmailDependencies> = {}) {
  const finishes: unknown[][] = [];
  const sent: SmsIntakeEmailPayload[] = [];
  const deps: SmsIntakeEmailDependencies = {
    claim: () => Promise.resolve([alert]),
    freeze: (_alert, payload) => Promise.resolve(payload),
    send: (payload) => {
      sent.push(payload);
      return Promise.resolve("email-id");
    },
    finish: (row, status, id, code) => {
      finishes.push([row.id, status, id, code]);
      return Promise.resolve(true);
    },
    ...overrides,
  };
  return { deps, finishes, sent };
}

Deno.test("successful sends record provider IDs", async () => {
  const { deps, finishes } = dependencies();
  assertEquals(await processSmsIntakeEmails(deps), {
    claimed: 1,
    sent: 1,
    retry: 0,
    failed: 0,
    recordingFailed: 0,
  });
  assertEquals(finishes[0], [alert.id, "sent", "email-id", null]);
});
Deno.test("reclaimed notice uses frozen payload despite changed contact/template", async () => {
  const frozen = { ...email, html: "previously persisted message" };
  const { deps, sent } = dependencies({
    freeze: () => Promise.resolve(frozen),
  });
  await processSmsIntakeEmails(deps);
  assertEquals(sent, [frozen]);
});
Deno.test("recipient changes cannot send a frozen email to the old recipient", async () => {
  const { deps, sent, finishes } = dependencies({
    freeze: () => Promise.resolve({ ...email, to: ["old@example.com"] }),
  });
  const result = await processSmsIntakeEmails(deps);
  assertEquals(result.failed, 1);
  assertEquals(sent.length, 0);
  assertEquals(finishes[0][3], "frozen_recipient_changed");
});
Deno.test("missing backup copy cannot send a frozen email", async () => {
  const { deps, sent, finishes } = dependencies({
    freeze: () => Promise.resolve({ ...email, bcc: [] }),
  });
  const result = await processSmsIntakeEmails(deps);
  assertEquals(result.failed, 1);
  assertEquals(sent.length, 0);
  assertEquals(finishes[0][3], "frozen_recipient_changed");
});
Deno.test("network failure remains queued and does not throw into intake handling", async () => {
  const { deps, finishes } = dependencies({
    send: () =>
      Promise.reject(new SmsIntakeEmailSendError("provider_network_error")),
  });
  assertEquals((await processSmsIntakeEmails(deps)).retry, 1);
  assertEquals(finishes[0][1], "retry");
});
Deno.test("failed payload persistence prevents any provider request", async () => {
  const { deps, sent } = dependencies({
    freeze: () => Promise.reject(new Error("database")),
  });
  assertEquals((await processSmsIntakeEmails(deps)).retry, 1);
  assertEquals(sent.length, 0);
});
Deno.test("accepted send with lost acknowledgement remains recoverable by lease", async () => {
  const { deps } = dependencies({
    finish: () => Promise.reject(new Error("database")),
  });
  assertEquals((await processSmsIntakeEmails(deps)).recordingFailed, 1);
});
Deno.test("empty queue never calls provider", async () => {
  const { deps, sent } = dependencies({ claim: () => Promise.resolve([]) });
  assertEquals((await processSmsIntakeEmails(deps)).claimed, 0);
  assertEquals(sent.length, 0);
});
