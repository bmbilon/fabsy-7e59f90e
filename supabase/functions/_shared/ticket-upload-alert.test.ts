import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  processTicketUploadAlerts,
  renderUploadAlertEmail,
  sendUploadAlertEmail,
  type UploadAlert,
  type UploadAlertDependencies,
  type UploadAlertEmail,
  UploadAlertSendError,
} from "./ticket-upload-alert.ts";

const alert: UploadAlert = {
  id: "11111111-1111-4111-8111-111111111111",
  draft_id: "22222222-2222-4222-8222-222222222222",
  claim_id: "33333333-3333-4333-8333-333333333333",
  uploaded_at: "2026-09-09T15:10:22Z",
  contact_snapshot: {
    firstName: '<img src=x onerror="alert(1)">',
    lastName: "O'Neil",
    email: "lead@example.com",
    phone: "4035550123",
    preferredLocale: "pa",
  },
};
const email = renderUploadAlertEmail(alert, "brett@execom.ca");

Deno.test("upload email is actionable, escaped and has no customer capability or attachment", () => {
  assertEquals(email.to, ["brett@execom.ca"]);
  assertEquals(email.from, "Fabsy <hello@fabsy.ca>");
  assert(email.html.includes("https://fabsy.ca/admin/cases"));
  assert(
    email.html.includes("lead@example.com") &&
      email.html.includes("4035550123"),
  );
  assert(email.html.includes("&lt;img") && !email.html.includes("<img src=x"));
  assert(
    !email.html.includes("accessToken") && !email.html.includes("/storage/") &&
      !email.html.includes("#resume="),
  );
  assert(!("attachments" in email));
  assertEquals(Object.keys(email).sort(), ["from", "html", "subject", "to"]);
});

Deno.test("email sends immutable bytes with the same provider idempotency key", async () => {
  const requests: RequestInit[] = [];
  const fetcher: typeof fetch = (_url, options) => {
    requests.push(options!);
    return Promise.resolve(
      new Response(JSON.stringify({ id: "email-id" }), { status: 200 }),
    );
  };
  await sendUploadAlertEmail("test-key", email, alert.id, fetcher);
  await sendUploadAlertEmail("test-key", email, alert.id, fetcher);
  assertEquals(requests[0].body, requests[1].body);
  assertEquals(
    new Headers(requests[0].headers).get("Idempotency-Key"),
    `ticket-upload/${alert.id}`,
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
        sendUploadAlertEmail(
          "key",
          email,
          alert.id,
          () => Promise.resolve(new Response("{}", { status })),
        ),
      UploadAlertSendError,
    );
    assertEquals(error.permanent, permanent);
  }
  await assertRejects(
    () =>
      sendUploadAlertEmail(
        "key",
        email,
        alert.id,
        () => Promise.reject(new TypeError("network")),
      ),
    UploadAlertSendError,
    "provider_network_error",
  );
});

function dependencies(overrides: Partial<UploadAlertDependencies> = {}) {
  const finishes: unknown[][] = [];
  const sent: UploadAlertEmail[] = [];
  const deps: UploadAlertDependencies = {
    recipient: "brett@execom.ca",
    verifyRecipient: () => Promise.resolve(true),
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

Deno.test("unverified recipients cannot claim or send a notice", async () => {
  let claimed = false;
  const { deps } = dependencies({
    verifyRecipient: () => Promise.resolve(false),
    claim: () => {
      claimed = true;
      return Promise.resolve([]);
    },
  });
  await assertRejects(() => processTicketUploadAlerts(deps));
  assertEquals(claimed, false);
});
Deno.test("successful sends record provider IDs", async () => {
  const { deps, finishes } = dependencies();
  assertEquals(await processTicketUploadAlerts(deps), {
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
  await processTicketUploadAlerts(deps);
  assertEquals(sent, [frozen]);
});
Deno.test("recipient changes cannot send a frozen email to the old recipient", async () => {
  const { deps, sent, finishes } = dependencies({
    freeze: () => Promise.resolve({ ...email, to: ["old@example.com"] }),
  });
  const result = await processTicketUploadAlerts(deps);
  assertEquals(result.failed, 1);
  assertEquals(sent.length, 0);
  assertEquals(finishes[0][3], "frozen_recipient_changed");
});
Deno.test("network failure remains queued and does not throw into intake handling", async () => {
  const { deps, finishes } = dependencies({
    send: () =>
      Promise.reject(new UploadAlertSendError("provider_network_error")),
  });
  assertEquals((await processTicketUploadAlerts(deps)).retry, 1);
  assertEquals(finishes[0][1], "retry");
});
Deno.test("failed payload persistence prevents any provider request", async () => {
  const { deps, sent } = dependencies({
    freeze: () => Promise.reject(new Error("database")),
  });
  assertEquals((await processTicketUploadAlerts(deps)).retry, 1);
  assertEquals(sent.length, 0);
});
Deno.test("accepted send with lost acknowledgement remains recoverable by lease", async () => {
  const { deps } = dependencies({
    finish: () => Promise.reject(new Error("database")),
  });
  assertEquals((await processTicketUploadAlerts(deps)).recordingFailed, 1);
});
Deno.test("empty queue never calls provider", async () => {
  const { deps, sent } = dependencies({ claim: () => Promise.resolve([]) });
  assertEquals((await processTicketUploadAlerts(deps)).claimed, 0);
  assertEquals(sent.length, 0);
});
