import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  deliverTicketIntakeResume,
  preserveConfirmedDraftOnDeliveryFailure,
  publicResumeDeliveryState,
  resumeDeliveryEnabled,
  safeResumeDeliveryAttempt,
  ticketIntakeResumeUrl,
  twilioRecipient,
} from "./ticket-intake-resume-delivery.ts";

const draftId = "00000000-0000-4000-8000-000000000301";
const accessToken = "a".repeat(64);

Deno.test("provider delivery is disabled unless the server opts in exactly", () => {
  assertEquals(resumeDeliveryEnabled(undefined), false);
  assertEquals(resumeDeliveryEnabled("false"), false);
  assertEquals(resumeDeliveryEnabled("TRUE"), false);
  assertEquals(resumeDeliveryEnabled("true"), true);
});

Deno.test("resume capability appears only in a localized URL fragment", () => {
  const english = new URL(
    ticketIntakeResumeUrl("https://fabsy.ca/internal", "en", accessToken),
  );
  assertEquals(english.origin, "https://fabsy.ca");
  assertEquals(english.pathname, "/submit-ticket");
  assertEquals(english.search, "");
  assertEquals(english.hash, `#resume=${accessToken}`);

  const punjabi = new URL(
    ticketIntakeResumeUrl("https://fabsy.ca", "pa", accessToken),
  );
  assertEquals(punjabi.pathname, "/pa/submit-ticket");
  assertEquals(punjabi.search, "");
  assertEquals(punjabi.hash, `#resume=${accessToken}`);
});

Deno.test("resume URL rejects unsafe site origins and malformed capabilities", async () => {
  await assertRejects(
    async () => ticketIntakeResumeUrl("http://fabsy.ca", "en", accessToken),
    Error,
    "HTTPS",
  );
  await assertRejects(
    async () =>
      ticketIntakeResumeUrl("https://user:pass@fabsy.ca", "en", accessToken),
    Error,
    "credentials",
  );
  await assertRejects(
    async () => ticketIntakeResumeUrl("https://fabsy.ca", "en", "short"),
    Error,
    "capability",
  );
});

Deno.test("public delivery state omits claims, failures and provider details", () => {
  assertEquals(
    publicResumeDeliveryState({
      ticket_uploaded_at: "2026-09-03T12:00:00Z",
      resume_delivery_status: "failed",
      resume_delivery_channel: "email",
      resume_delivery_sent_at: null,
      resume_delivery_attempt_count: 1,
      resume_delivery_lifetime_attempt_count: 1,
    }, true),
    {
      status: "failed",
      channel: "email",
      sentAt: null,
      canRetry: true,
      mode: "automatic",
    },
  );
  assertEquals(
    publicResumeDeliveryState({
      ticket_uploaded_at: "2026-09-03T12:00:00Z",
      resume_delivery_status: "sending",
      resume_delivery_channel: "sms",
      resume_delivery_sent_at: null,
      resume_delivery_attempt_count: 1,
      resume_delivery_lifetime_attempt_count: 1,
    }, true).canRetry,
    false,
  );
  assertEquals(
    publicResumeDeliveryState({
      ticket_uploaded_at: "2026-09-03T12:00:00Z",
      resume_delivery_status: "failed",
      resume_delivery_channel: "email",
      resume_delivery_sent_at: null,
      resume_delivery_attempt_count: 5,
      resume_delivery_lifetime_attempt_count: 5,
    }, true).canRetry,
    false,
  );
  assertEquals(
    publicResumeDeliveryState({
      ticket_uploaded_at: "2026-09-03T12:00:00Z",
      resume_delivery_status: "pending",
      resume_delivery_channel: null,
      resume_delivery_sent_at: null,
      resume_delivery_attempt_count: 0,
      resume_delivery_lifetime_attempt_count: 0,
    }),
    {
      status: "pending",
      channel: null,
      sentAt: null,
      canRetry: false,
      mode: "manual",
    },
  );
  assertEquals(
    publicResumeDeliveryState({
      ticket_uploaded_at: "2026-09-03T12:00:00Z",
      resume_delivery_status: "pending",
      resume_delivery_channel: null,
      resume_delivery_sent_at: null,
      resume_delivery_attempt_count: 0,
      resume_delivery_lifetime_attempt_count: 0,
    }, true).canRetry,
    true,
  );
  assertEquals(
    publicResumeDeliveryState({
      ticket_uploaded_at: "2026-09-03T12:00:00Z",
      resume_delivery_status: "pending",
      resume_delivery_channel: null,
      resume_delivery_sent_at: null,
      resume_delivery_attempt_count: 0,
      resume_delivery_lifetime_attempt_count: 5,
    }, true).canRetry,
    false,
  );
});

Deno.test("email delivery uses one stable key per draft capability generation", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    calls += 1;
    assertEquals(String(input), "https://api.resend.com/emails");
    const headers = new Headers(init?.headers);
    assertEquals(
      headers.get("Idempotency-Key"),
      `ticket-intake-resume/${draftId}/1`,
    );
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assertEquals(body.to, ["lead@example.com"]);
    assertEquals(body.reply_to, "hello@fabsy.ca");
    assertStringIncludes(
      String(body.html),
      `/pa/submit-ticket#resume=${accessToken}`,
    );
    return new Response(JSON.stringify({ id: "email_123" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const result = await deliverTicketIntakeResume({
    draftId,
    generation: 1,
    accessToken,
    channel: "email",
    recipient: "lead@example.com",
    preferredLocale: "pa",
    configuration: { resendApiKey: "test-key", siteUrl: "https://fabsy.ca" },
    fetcher,
  });
  assertEquals(calls, 1);
  assertEquals(result, { outcome: "sent", failureCode: null });
});

Deno.test("a rotated capability delivers with a distinct second-generation email key", async () => {
  const rotatedToken = "b".repeat(64);
  let idempotencyKey = "";
  let payload: Record<string, unknown> = {};
  const result = await deliverTicketIntakeResume({
    draftId,
    generation: 2,
    accessToken: rotatedToken,
    channel: "email",
    recipient: "corrected@example.com",
    preferredLocale: "en",
    configuration: { resendApiKey: "test-key", siteUrl: "https://fabsy.ca" },
    fetcher: async (_input, init) => {
      idempotencyKey = new Headers(init?.headers).get("Idempotency-Key") || "";
      payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ id: "email_456" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  assertEquals(idempotencyKey, `ticket-intake-resume/${draftId}/2`);
  assertEquals(payload.to, ["corrected@example.com"]);
  assertStringIncludes(String(payload.html), `#resume=${rotatedToken}`);
  assertEquals(result, { outcome: "sent", failureCode: null });
});

Deno.test("provider outcomes distinguish definite failures from ambiguous sends", async () => {
  const base = {
    draftId,
    generation: 1,
    accessToken,
    channel: "email" as const,
    recipient: "lead@example.com",
    preferredLocale: "en" as const,
    configuration: { resendApiKey: "test-key" },
  };
  assertEquals(
    await deliverTicketIntakeResume({
      ...base,
      fetcher: async () => new Response("", { status: 400 }),
    }),
    { outcome: "failed", failureCode: "request_rejected" },
  );
  assertEquals(
    await deliverTicketIntakeResume({
      ...base,
      fetcher: async () => new Response("", { status: 429 }),
    }),
    { outcome: "failed", failureCode: "rate_limited" },
  );
  assertEquals(
    await deliverTicketIntakeResume({
      ...base,
      fetcher: async () => new Response("", { status: 503 }),
    }),
    { outcome: "indeterminate", failureCode: "outcome_unknown" },
  );
  assertEquals(
    await deliverTicketIntakeResume({
      ...base,
      fetcher: async () => {
        throw new TypeError("synthetic network failure");
      },
    }),
    { outcome: "indeterminate", failureCode: "outcome_unknown" },
  );
});

Deno.test("Twilio recipient normalization permits North American numbers only", async () => {
  assertEquals(twilioRecipient("4035550123"), "+14035550123");
  assertEquals(twilioRecipient("14035550123"), "+14035550123");
  assertEquals(twilioRecipient("+14035550123"), "+14035550123");
  assertThrows(() => twilioRecipient("+442071838750"), Error, "North American");

  let encodedBody = "";
  const result = await deliverTicketIntakeResume({
    draftId,
    generation: 1,
    accessToken,
    channel: "sms",
    recipient: "4035550123",
    preferredLocale: "en",
    configuration: {
      twilioAccountSid: `AC${"1".repeat(32)}`,
      twilioAuthToken: "test-token",
      twilioPhoneNumber: "+14035550000",
    },
    fetcher: async (_input, init) => {
      encodedBody = String(init?.body);
      return new Response(JSON.stringify({ sid: `SM${"2".repeat(32)}` }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  assertEquals(new URLSearchParams(encodedBody).get("To"), "+14035550123");
  assertEquals(result, { outcome: "sent", failureCode: null });
  assert(
    new URLSearchParams(encodedBody).get("Body")?.includes(
      `#resume=${accessToken}`,
    ),
  );
});

Deno.test("Twilio transport and 5xx outcomes remain non-retryable indeterminate", async () => {
  const base = {
    draftId,
    generation: 1,
    accessToken,
    channel: "sms" as const,
    recipient: "4035550123",
    preferredLocale: "en" as const,
    configuration: {
      twilioAccountSid: `AC${"1".repeat(32)}`,
      twilioAuthToken: "test-token",
      twilioPhoneNumber: "+14035550000",
    },
  };
  assertEquals(
    await deliverTicketIntakeResume({
      ...base,
      fetcher: async () => new Response("", { status: 500 }),
    }),
    { outcome: "indeterminate", failureCode: "outcome_unknown" },
  );
  assertEquals(
    await deliverTicketIntakeResume({
      ...base,
      fetcher: async () => {
        throw new TypeError("synthetic timeout");
      },
    }),
    { outcome: "indeterminate", failureCode: "outcome_unknown" },
  );
});

Deno.test("a render/provider helper exception settles as indeterminate after upload confirmation", async () => {
  assertEquals(
    await safeResumeDeliveryAttempt(async () => {
      throw new Error("synthetic helper failure");
    }),
    { outcome: "indeterminate", failureCode: "outcome_unknown" },
  );
});

Deno.test("delivery infrastructure failure cannot erase an acknowledged upload revision", async () => {
  const confirmed = { revision: 12, ticketUploadedAt: "2026-09-03T12:00:00Z" };
  assertEquals(
    await preserveConfirmedDraftOnDeliveryFailure(
      confirmed,
      async () => {
        throw new Error("synthetic database outage");
      },
    ),
    confirmed,
  );
});
