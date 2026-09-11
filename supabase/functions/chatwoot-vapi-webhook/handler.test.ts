// deno-lint-ignore-file require-await
// Async test doubles preserve the provider/database promise boundary.
import {
  hmacHex,
  parseChatwootEvent,
  type QueueEvent,
  verifyChatwootSignature,
} from "../_shared/chatwoot-vapi.ts";
import { createChatwootWebhook } from "./handler.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
const secret = "123456789ABCDEFGHJKLMNPQR"; // Rails' generated AgentBot secrets have 24 characters.
const now = Date.UTC(2026, 8, 11, 20);
const payload = () => ({
  event: "message_created",
  id: 123,
  private: false,
  message_type: "incoming",
  source_id: "SM" + "1".repeat(32),
  content: "Hi",
  created_at: new Date(now).toISOString(),
  sender: { type: "contact" },
  account: { id: 12 },
  inbox: { id: 34 },
  conversation: { id: 56, account_id: 12, inbox_id: 34, status: "pending" },
});
async function signed(
  value: unknown,
  overrides: Record<string, string> = {},
  time = Math.floor(now / 1000),
) {
  const body = typeof value === "string" ? value : JSON.stringify(value);
  const timestamp = String(time);
  return new Request("https://example.invalid/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-chatwoot-timestamp": timestamp,
      "x-chatwoot-signature": `sha256=${await hmacHex(
        secret,
        `${timestamp}.${body}`,
      )}`,
      ...overrides,
    },
    body,
  });
}
function harness() {
  const events: QueueEvent[] = [];
  let wakes = 0;
  const handler = createChatwootWebhook({
    accountId: 12,
    inboxId: 34,
    signingSecret: secret,
    now: () => now,
    async accept(event) {
      events.push(event);
    },
    async wake() {
      wakes++;
    },
    defer(task) {
      void task;
    },
  });
  return { handler, events, wakes: () => wakes };
}
Deno.test("24-character native Chatwoot secret signs exact bytes", async () => {
  const h = harness();
  equal((await h.handler(await signed(payload()))).status, 204);
  equal(h.events.length, 1);
  equal(h.wakes(), 1);
  equal(
    Object.keys(h.events[0]).sort(),
    [
      "accountId",
      "controlHint",
      "conversationId",
      "deliveryId",
      "eventAt",
      "inboxId",
      "kind",
      "messageId",
      "messageSid",
    ].sort(),
  );
  equal(JSON.stringify(h.events).includes("content"), false);
});
Deno.test("signature tampering, stale replay and future signatures fail before queue", async () => {
  const h = harness();
  equal(
    (await h.handler(
      await signed(payload(), {
        "x-chatwoot-signature": "sha256=" + "0".repeat(64),
      }),
    )).status,
    403,
  );
  equal(
    (await h.handler(await signed(payload(), {}, now / 1000 - 301))).status,
    403,
  );
  equal(
    (await h.handler(await signed(payload(), {}, now / 1000 + 301))).status,
    403,
  );
  equal(h.events.length, 0);
  const raw = JSON.stringify(payload());
  const timestamp = String(now / 1000);
  equal(
    await verifyChatwootSignature(
      secret,
      `sha256=${await hmacHex(secret, `${timestamp}.${raw}`)}`,
      timestamp,
      raw + " ",
      now,
    ),
    false,
  );
});
Deno.test("signed repeats derive identical delivery IDs for durable replay dedupe", async () => {
  const h = harness();
  await h.handler(await signed(payload()));
  await h.handler(await signed(payload()));
  equal(h.events[0].deliveryId, h.events[1].deliveryId);
});
Deno.test("wrong account/inbox and conflicting nested scope are rejected", async () => {
  for (
    const altered of [{ ...payload(), account: { id: 99 } }, {
      ...payload(),
      inbox: { id: 99 },
    }, {
      ...payload(),
      conversation: { ...payload().conversation, inbox_id: 99 },
    }]
  ) {
    const h = harness();
    equal((await h.handler(await signed(altered))).status, 400);
    equal(h.events.length, 0);
  }
});
Deno.test("notes, outgoing bot echoes and delivery updates never enqueue AI", async () => {
  for (
    const altered of [{ ...payload(), private: true }, {
      ...payload(),
      message_type: "outgoing",
      sender: { type: "agent_bot" },
    }, { ...payload(), event: "message_updated" }]
  ) {
    const h = harness();
    equal((await h.handler(await signed(altered))).status, 204);
    equal(h.events.length, 0);
  }
});
Deno.test("human outgoing messages invalidate without retaining text", async () => {
  const h = harness();
  await h.handler(
    await signed({
      ...payload(),
      message_type: "outgoing",
      sender: { type: "user" },
    }),
  );
  equal(h.events[0].kind, "invalidate");
  equal(JSON.stringify(h.events).includes("Hi"), false);
});
Deno.test("only explicit signed pending status transition releases human hold", () => {
  const value = {
    event: "conversation_status_changed",
    id: 56,
    account_id: 12,
    inbox_id: 34,
    status: "pending",
    updated_at: now / 1000,
    created_at: now / 1000 - 3600,
    meta: {},
    changed_attributes: [{
      status: { previous_value: "open", current_value: "pending" },
    }],
  };
  equal(parseChatwootEvent(value, 12, 34, "delivery")?.kind, "status");
  equal(
    parseChatwootEvent(
      { ...value, event: "conversation_updated" },
      12,
      34,
      "delivery",
    ),
    null,
  );
  equal(
    parseChatwootEvent(
      { ...value, changed_attributes: [] },
      12,
      34,
      "delivery",
    ),
    null,
  );
});
Deno.test("queue failure returns Chatwoot-retryable 500 and never wakes", async () => {
  let wake = false;
  const handler = createChatwootWebhook({
    accountId: 12,
    inboxId: 34,
    signingSecret: secret,
    now: () => now,
    async accept() {
      throw new Error("db down");
    },
    async wake() {
      wake = true;
    },
    defer() {},
  });
  equal((await handler(await signed(payload()))).status, 500);
  equal(wake, false);
});
Deno.test("oversized raw webhook is rejected before parsing or signature work", async () => {
  const h = harness();
  equal((await h.handler(await signed("x".repeat(65537)))).status, 413);
  equal(h.events.length, 0);
});
