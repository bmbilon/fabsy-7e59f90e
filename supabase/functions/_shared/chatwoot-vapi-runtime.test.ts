// deno-lint-ignore-file require-await
// Async test doubles preserve the provider/database promise boundary.
import {
  acceptQueueEvent,
  makeChatwootClient,
  makeJobStore,
  requestJson,
} from "./chatwoot-vapi-runtime.ts";
import { CHATWOOT_REPLY_MARKER } from "./chatwoot-vapi.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
async function rejects(task: Promise<unknown>) {
  let rejected = false;
  try {
    await task;
  } catch {
    rejected = true;
  }
  equal(rejected, true);
}
const event = {
  kind: "incoming" as const,
  accountId: 12,
  inboxId: 34,
  conversationId: 56,
  messageId: 78,
  messageSid: "SM" + "1".repeat(32),
  deliveryId: "11111111-1111-4111-8111-111111111111",
  eventAt: "2026-09-11T20:00:00Z",
  controlHint: false,
};
Deno.test("metadata enqueue requires a durable receipt, not merely HTTP success", async () => {
  await rejects(
    acceptQueueEvent(async () => ({ data: null, error: null }), event),
  );
  let argumentsSeen: unknown;
  await acceptQueueEvent(async (_name, args) => {
    argumentsSeen = args;
    return {
      data: { enqueued: true, duplicate: false, job_id: "job" },
      error: null,
    };
  }, event);
  equal(
    Object.keys(argumentsSeen as object).sort(),
    [
      "p_account_id",
      "p_conversation_id",
      "p_control_hint",
      "p_delivery_id",
      "p_inbox_id",
      "p_message_id",
      "p_message_sid",
    ].sort(),
  );
});
Deno.test("queue claims reject malformed data before worker can use URLs", async () => {
  const jobs = makeJobStore(async () => ({
    data: { job_id: "x", conversation_id: "../../other" },
    error: null,
  }));
  await rejects(jobs.claim());
});
Deno.test("native outgoing API uses bot token, marker and no source_id", async () => {
  const original = globalThis.fetch;
  const calls: {
    url: string;
    headers: Headers;
    body: Record<string, unknown>;
  }[] = [];
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(_input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });
    return Promise.resolve(Response.json({ id: 90 }));
  }) as typeof fetch;
  try {
    const client = makeChatwootClient(
      "https://app.chatwoot.com",
      12,
      7,
      "bot-test",
      "reader-test",
    );
    equal(await client.send(56, "Hello", "marker"), 90);
    equal(
      calls[0].url,
      "https://app.chatwoot.com/api/v1/accounts/12/conversations/56/messages",
    );
    equal(calls[0].headers.get("api_access_token"), "bot-test");
    equal(calls[0].body, {
      content: "Hello",
      message_type: "outgoing",
      private: false,
      content_type: "text",
      content_attributes: { [CHATWOOT_REPLY_MARKER]: "marker" },
    });
  } finally {
    globalThis.fetch = original;
  }
});
Deno.test("unknown sends reconcile using separate reader token and bounded pagination", async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    equal(new Headers(init?.headers).get("api_access_token"), "reader-test");
    urls.push(String(input));
    return Promise.resolve(
      Response.json({
        payload: urls.length === 1 ? [{ id: 100 }] : [
          {
            id: 90,
            private: false,
            message_type: 1,
            sender: { id: 7, type: "agent_bot" },
            content_attributes: { [CHATWOOT_REPLY_MARKER]: "marker" },
          },
        ],
      }),
    );
  }) as typeof fetch;
  try {
    const client = makeChatwootClient(
      "https://app.chatwoot.com",
      12,
      7,
      "bot-test",
      "reader-test",
    );
    equal(await client.findReply(56, "marker"), 90);
    equal(urls[1].endsWith("?before=100"), true);
  } finally {
    globalThis.fetch = original;
  }
});
Deno.test("provider response stream is bounded even without Content-Length", async () => {
  const original = globalThis.fetch;
  globalThis.fetch =
    (() => Promise.resolve(new Response("x".repeat(1000001)))) as typeof fetch;
  try {
    await rejects(requestJson("https://example.invalid", {}));
  } finally {
    globalThis.fetch = original;
  }
});
