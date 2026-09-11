import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { renderAbandonedTicketEmail } from "./abandoned-ticket-email.ts";
import {
  type AbandonedTicketContext,
  AbandonedTicketDeliveryError,
  type AbandonedTicketDependencies,
  type AbandonedTicketJob,
  checkoutHasCompleted,
  processAbandonedTicketEmails,
  sendAbandonedTicketEmail,
} from "./abandoned-ticket-delivery.ts";

const sessionId = "cs_live_fixture123456";
const job: AbandonedTicketJob = {
  id: "job-1",
  draft_id: "draft-1",
  claim_id: "claim-1",
  email_payload: null,
};
const context: AbandonedTicketContext = {
  eligible: true,
  email: "ali@example.com",
  firstName: "Ali",
  ticketType: "Speeding",
  ticketNumber: "E24800635T",
  checkoutSessionIds: [],
};
function fixture(overrides: Partial<AbandonedTicketDependencies> = {}) {
  let claimed = false;
  const outcomes: unknown[][] = [];
  const sent: unknown[][] = [];
  const deps: AbandonedTicketDependencies = {
    claim: () => {
      if (claimed) return Promise.resolve(null);
      claimed = true;
      return Promise.resolve(job);
    },
    context: () => Promise.resolve(context),
    freeze: (_job, email) => Promise.resolve(email),
    checkoutCompleted: () => Promise.resolve(false),
    send: (email, id) => {
      sent.push([email, id]);
      return Promise.resolve("email-1");
    },
    finish: (job, status, providerId, reason) => {
      outcomes.push([job.id, status, providerId, reason]);
      return Promise.resolve(true);
    },
    ...overrides,
  };
  return { deps, outcomes, sent };
}

Deno.test("eligible unpaid draft sends once with the personalized payload", async () => {
  const f = fixture();
  const result = await processAbandonedTicketEmails(f.deps);
  assertEquals(result, {
    claimed: 1,
    sent: 1,
    retry: 0,
    failed: 0,
    suppressed: 0,
    recordingFailed: 0,
  });
  assertEquals(f.outcomes, [[job.id, "sent", "email-1", null]]);
  assertEquals(f.sent, [[
    renderAbandonedTicketEmail({
      email: context.email!,
      firstName: "Ali",
      ticketType: "Speeding",
      ticketNumber: "E24800635T",
    }),
    job.id,
  ]]);
});

Deno.test("local paid, withdrawn, contacted and expired intakes never reach the provider", async () => {
  for (
    const reason of [
      "paid",
      "expired",
      "contacted",
      "dismissed",
      "deleted",
      "recipient_changed",
    ]
  ) {
    const f = fixture({
      context: () => Promise.resolve({ eligible: false, reason }),
    });
    assertEquals((await processAbandonedTicketEmails(f.deps)).suppressed, 1);
    assertEquals(f.sent.length, 0);
  }
});

Deno.test("a creating checkout is retried without sending", async () => {
  const f = fixture({
    context: () =>
      Promise.resolve({
        eligible: false,
        reason: "checkout_creating",
        retryable: true,
      }),
  });
  assertEquals((await processAbandonedTicketEmails(f.deps)).retry, 1);
  assertEquals(f.sent.length, 0);
});

Deno.test("Stripe suppresses checkout completion even before the local webhook arrives", async () => {
  const f = fixture({
    context: () =>
      Promise.resolve({ ...context, checkoutSessionIds: [sessionId] }),
    checkoutCompleted: () => Promise.resolve(true),
  });
  assertEquals((await processAbandonedTicketEmails(f.deps)).suppressed, 1);
  assertEquals(f.sent.length, 0);
});

Deno.test("Stripe failure fails closed and queues a retry", async () => {
  const f = fixture({
    context: () =>
      Promise.resolve({ ...context, checkoutSessionIds: [sessionId] }),
    checkoutCompleted: () =>
      Promise.reject(
        new AbandonedTicketDeliveryError("payment_check_unavailable"),
      ),
  });
  assertEquals((await processAbandonedTicketEmails(f.deps)).retry, 1);
  assertEquals(f.sent.length, 0);
});

Deno.test("final eligibility check catches payment during processing", async () => {
  let reads = 0;
  const f = fixture({
    context: () =>
      Promise.resolve(
        ++reads === 1 ? context : { eligible: false, reason: "paid" },
      ),
  });
  assertEquals((await processAbandonedTicketEmails(f.deps)).suppressed, 1);
  assertEquals(f.sent.length, 0);
});

Deno.test("new checkout created between reads must be checked on a later attempt", async () => {
  let reads = 0;
  const f = fixture({
    context: () =>
      Promise.resolve(
        ++reads === 1
          ? context
          : { ...context, checkoutSessionIds: [sessionId] },
      ),
  });
  assertEquals((await processAbandonedTicketEmails(f.deps)).retry, 1);
  assertEquals(f.sent.length, 0);
});

Deno.test("changed recipient or a lost freeze never sends stale mail", async () => {
  for (const lostFreeze of [true, false]) {
    let reads = 0;
    const f = fixture({
      context: () =>
        Promise.resolve(
          ++reads === 1 || lostFreeze
            ? context
            : { ...context, email: "new@example.com" },
        ),
      freeze: (_job, email) => Promise.resolve(lostFreeze ? null : email),
    });
    assertEquals((await processAbandonedTicketEmails(f.deps)).suppressed, 1);
    assertEquals(f.sent.length, 0);
  }
});

Deno.test("retries reuse the frozen email even when personal details change", async () => {
  const frozen = renderAbandonedTicketEmail({
    email: context.email!,
    firstName: "Original",
  });
  let claimed = false;
  const f = fixture({
    claim: () => {
      if (claimed) return Promise.resolve(null);
      claimed = true;
      return Promise.resolve({ ...job, email_payload: frozen });
    },
  });
  await processAbandonedTicketEmails(f.deps);
  assertEquals(f.sent, [[frozen, job.id]]);
});

Deno.test("receipt failure is visible while the frozen claim remains recoverable", async () => {
  const f = fixture({ finish: () => Promise.resolve(false) });
  assertEquals((await processAbandonedTicketEmails(f.deps)).recordingFailed, 1);
  assertEquals(f.sent.length, 1);
});

Deno.test("provider permanent rejection stops automatic retry", async () => {
  const f = fixture({
    send: () =>
      Promise.reject(
        new AbandonedTicketDeliveryError("email_provider_http_422", true),
      ),
  });
  assertEquals((await processAbandonedTicketEmails(f.deps)).failed, 1);
});

Deno.test("Stripe reader verifies unpaid, paid, free and delayed complete checkouts", async () => {
  for (
    const [payment_status, status, completed] of [
      ["unpaid", "open", false],
      ["unpaid", "expired", false],
      ["paid", "complete", true],
      ["no_payment_required", "complete", true],
      ["unpaid", "complete", true],
    ] as const
  ) {
    const fetcher: typeof fetch = () =>
      Promise.resolve(Response.json({ id: sessionId, payment_status, status }));
    assertEquals(
      await checkoutHasCompleted("fixture", sessionId, fetcher),
      completed,
    );
  }
  for (
    const response of [
      Response.json({}, { status: 500 }),
      Response.json({
        id: "different",
        payment_status: "unpaid",
        status: "open",
      }),
    ]
  ) {
    await assertRejects(
      () =>
        checkoutHasCompleted(
          "fixture",
          sessionId,
          () => Promise.resolve(response),
        ),
      AbandonedTicketDeliveryError,
    );
  }
  await assertRejects(
    () => checkoutHasCompleted("fixture", "../../elsewhere"),
    AbandonedTicketDeliveryError,
  );
});

Deno.test("Resend attempts use identical payload bytes and a stable idempotency key", async () => {
  const requests: RequestInit[] = [];
  const email = renderAbandonedTicketEmail({ email: context.email! });
  const fetcher: typeof fetch = (_url, options) => {
    requests.push(options!);
    return Promise.resolve(Response.json({ id: "email-1" }));
  };
  await sendAbandonedTicketEmail("fixture", email, job.id, fetcher);
  await sendAbandonedTicketEmail("fixture", email, job.id, fetcher);
  assertEquals(requests[0].body, requests[1].body);
  assertEquals(JSON.parse(requests[0].body as string).bcc, ["brett@execom.ca"]);
  assertEquals(
    new Headers(requests[0].headers).get("Idempotency-Key"),
    "abandoned-ticket/job-1",
  );
  await assertRejects(
    () =>
      sendAbandonedTicketEmail(
        "fixture",
        email,
        job.id,
        () => Promise.resolve(Response.json({}, { status: 429 })),
      ),
    AbandonedTicketDeliveryError,
  );
});

Deno.test("legacy frozen email without the required BCC never reaches Resend", async () => {
  const email = renderAbandonedTicketEmail({ email: context.email! });
  const legacy = { ...email };
  Reflect.deleteProperty(legacy, "bcc");
  let providerCalls = 0;
  const fetcher: typeof fetch = () => {
    providerCalls++;
    return Promise.resolve(Response.json({ id: "unexpected" }));
  };
  for (
    const payload of [legacy, { ...email, bcc: [] }, {
      ...email,
      bcc: ["wrong@example.test"],
    }]
  ) {
    const error = await assertRejects(
      () => sendAbandonedTicketEmail("fixture", payload, job.id, fetcher),
      AbandonedTicketDeliveryError,
    );
    assertEquals(error.code, "email_bcc_missing");
    assertEquals(error.permanent, true);
  }
  assertEquals(providerCalls, 0);
});
