import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  channelHold,
  completionUrl,
  deliverRecovery,
  type RecoveryJob,
  recoveryMessage,
  type RecoverySnapshot,
  stripeRecoveryHold,
  unsubscribeSignature,
} from "./ticket-recovery.ts";
const base: RecoverySnapshot = {
  eligible: true,
  reason: null,
  email: "customer@example.com",
  phone: "+14035550112",
  can_email: true,
  sms_opt_in: true,
  first_name: "Pat",
  ticket_number: "B12345678C",
  paid: false,
  has_consent: true,
  mode: "payment",
  uploaded_at: "2026-09-20T12:00:00Z",
  legacy_sent_at: null,
  session_ids: [],
  preferred_locale: "en",
};
const job: RecoveryJob = {
  id: "00000000-0000-4000-8000-000000000001",
  source_kind: "submission",
  source_id: "00000000-0000-4000-8000-000000000002",
  channel: "email",
  stage: 1,
  claim_id: "claim",
};
Deno.test("links and copy request only the missing requirement", () => {
  for (const mode of ["checkout", "payment", "consent"] as const) {
    const s = { ...base, mode };
    const m = recoveryMessage(
      s,
      "https://example.com/unsubscribe",
      "123 Test Street, Calgary AB",
    );
    assertEquals(completionUrl(s), `https://fabsy.ca/${mode}`);
    assertStringIncludes(m.email.subject, `Ticket ${s.ticket_number} —`);
    assertStringIncludes(m.sms, s.ticket_number);
    assertStringIncludes(m.sms, "STOP");
    assertStringIncludes(m.email.text!, "same email");
    assertEquals(m.email.html.includes("private link"), false);
  }
  assertStringIncludes(
    recoveryMessage(
      base,
      "https://example.com/u",
      "123 Test Street, Calgary AB",
    ).email.text!,
    "We have your ticket and consent.",
  );
});
Deno.test("missing number and mailing address cannot render messages", () => {
  assertThrows(() =>
    recoveryMessage(
      { ...base, ticket_number: "" },
      "https://example.com/u",
      "123 Test Street, Calgary AB",
    )
  );
  assertThrows(() => recoveryMessage(base, "https://example.com/u", ""));
  assertThrows(() =>
    recoveryMessage(
      { ...base, ticket_number: "B123\nBcc: bad@example.com" },
      "https://example.com/u",
      "123 Test Street, Calgary AB",
    )
  );
});
Deno.test("SMS opt-in and a valid phone are independent of representation consent", () => {
  assertEquals(
    channelHold({ ...base, sms_opt_in: false }, "sms"),
    "sms_opt_in_required",
  );
  assertEquals(channelHold({ ...base, phone: "" }, "sms"), "phone_unavailable");
  assertEquals(channelHold({ ...base, sms_opt_in: false }, "email"), null);
});
Deno.test("customer names cannot inject HTML", () => {
  const m = recoveryMessage(
    { ...base, first_name: "<script>alert(1)</script>" },
    "https://example.com/u",
    "123 Test Street, Calgary AB",
  );
  assertEquals(m.email.html.includes("<script>"), false);
});
const stripe = (body: unknown, status = 200) => async () =>
  new Response(JSON.stringify(body), { status });
Deno.test("standalone paid checkout with matching email blocks a duplicate payment reminder", async () => {
  assertEquals(
    await stripeRecoveryHold(
      base,
      "key",
      stripe({
        data: [{
          customer_details: { email: base.email },
          payment_status: "paid",
          status: "complete",
        }],
        has_more: false,
      }) as typeof fetch,
    ),
    "stripe_payment_reconciliation_required",
  );
});
Deno.test("unrelated unpaid sessions permit a reminder; malformed provider response fails closed", async () => {
  assertEquals(
    await stripeRecoveryHold(
      base,
      "key",
      stripe({ data: [], has_more: false }) as typeof fetch,
    ),
    null,
  );
  assertEquals(
    await stripeRecoveryHold(
      base,
      "key",
      stripe({ error: "unavailable" }, 500) as typeof fetch,
    ),
    "payment_check_unavailable",
  );
  assertEquals(
    await stripeRecoveryHold(base, "key", stripe({ data: [] }) as typeof fetch),
    "payment_check_unavailable",
  );
});
Deno.test("known completed delayed-payment session waits for reconciliation", async () => {
  const id = "cs_live_example123";
  assertEquals(
    await stripeRecoveryHold(
      { ...base, session_ids: [id] },
      "key",
      stripe({
        id,
        payment_status: "unpaid",
        status: "complete",
      }) as typeof fetch,
    ),
    "stripe_payment_reconciliation_required",
  );
});
Deno.test("paid case can receive only its consent reminder without another payment lookup", async () => {
  assertEquals(
    await stripeRecoveryHold(
      { ...base, paid: true, mode: "consent" },
      "",
      (() => {
        throw Error("unexpected fetch");
      }) as typeof fetch,
    ),
    null,
  );
});
Deno.test("unreadable paginated payment history is held", async () => {
  assertEquals(
    await stripeRecoveryHold(
      base,
      "key",
      stripe({ data: [], has_more: true }) as typeof fetch,
    ),
    "payment_check_unavailable",
  );
});
function deps(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  return {
    calls,
    snapshot: async () => base,
    providerHold: async () => null,
    begin: async () => {
      calls.push("begin");
      return true;
    },
    send: async () => {
      calls.push("send");
      return "receipt";
    },
    finish: async (_j: RecoveryJob, status: string) => {
      calls.push(status);
      return true;
    },
    ...overrides,
  };
}
Deno.test("dispatch is reserved before provider call and receipt saved after", async () => {
  const d = deps();
  assertEquals(await deliverRecovery(job, d), "sent");
  assertEquals(d.calls, ["begin", "send", "sent"]);
});
Deno.test("completed case sends nothing", async () => {
  const d = deps({
    snapshot: async () => ({ ...base, eligible: false, reason: "complete" }),
  });
  assertEquals(await deliverRecovery(job, d), "suppressed");
  assertEquals(d.calls, ["suppressed"]);
});
Deno.test("payment race or unsubscribe at final boundary sends nothing", async () => {
  const d = deps({ begin: async () => false });
  assertEquals(await deliverRecovery(job, d), "held");
  assertEquals(d.calls, ["held"]);
});
Deno.test("ambiguous payment is held without a provider attempt", async () => {
  const d = deps({
    providerHold: async () => "stripe_payment_reconciliation_required",
  });
  assertEquals(await deliverRecovery(job, d), "held");
  assertEquals(d.calls, ["held"]);
});
Deno.test("provider timeout after reservation is uncertain and not retried", async () => {
  const d = deps({
    send: async () => {
      throw Error("timeout after acceptance");
    },
  });
  assertEquals(await deliverRecovery(job, d), "uncertain");
  assertEquals(d.calls, ["begin", "uncertain"]);
});
Deno.test("failed receipt storage does not cause a second provider send", async () => {
  let sends = 0;
  const d = deps({
    send: async () => {
      sends++;
      return "receipt";
    },
    finish: async () => false,
  });
  assertEquals(await deliverRecovery(job, d), "recording_failed");
  assertEquals(sends, 1);
});
Deno.test("unsubscribe signatures cannot be changed or minted without secret", async () => {
  const secret = "a".repeat(40);
  assertEquals(
    await unsubscribeSignature(job.id, secret),
    await unsubscribeSignature(job.id, secret),
  );
  assertEquals(
    (await unsubscribeSignature(job.id, secret)) ===
      (await unsubscribeSignature(job.source_id, secret)),
    false,
  );
  await assertRejects(() => unsubscribeSignature(job.id, ""));
});

Deno.test("email body uses the first-party page and one-click header uses the signed API", () => {
  const body = "https://fabsy.ca/reminder-preferences.html#id=example";
  const api =
    "https://fixture.supabase.co/functions/v1/process-ticket-recovery?action=unsubscribe";
  const m = recoveryMessage(base, body, "123 Test Street, Calgary AB", api);
  assertStringIncludes(m.email.html, body);
  assertEquals(m.email.headers?.["List-Unsubscribe"], `<${api}>`);
});
