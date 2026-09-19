import assert from "node:assert/strict";
import { createSmsDatabaseFetch, SmsVapiClient } from "./sms-vapi-client.ts";
import { buildVapiInput, classifyControlMessage } from "./sms-vapi.ts";

Deno.test("SMS uses ordinary text Chat API without Vapi SMS transport or unsupported overrides", async () => {
  let received: Record<string, unknown> | undefined;
  const client = new SmsVapiClient("synthetic-key", async (url, options) => {
    assert.equal(url, "https://api.vapi.ai/chat");
    assert.equal(
      new Headers(options?.headers).get("Authorization"),
      "Bearer synthetic-key",
    );
    received = JSON.parse(String(options?.body));
    return new Response(
      JSON.stringify({
        id: "chat_reply",
        output: [{ role: "assistant", content: "Hello" }],
      }),
    );
  });
  assert.deepEqual(
    await client.createChat({
      assistantId: "text-assistant-fixture",
      previousChatId: "prior_chat",
      input: buildVapiInput("Hello"),
    }),
    { chatId: "chat_reply", reply: "Hello" },
  );
  assert.equal(received?.assistantId, "text-assistant-fixture");
  assert.equal(received?.previousChatId, "prior_chat");
  assert.equal(received?.transport, undefined);
  assert.equal(received?.assistantOverrides, undefined);
  assert.equal(received?.sessionId, undefined);
});

Deno.test("SMS client rejects provider errors and malformed output without inventing a response", async () => {
  for (
    const response of [
      new Response("{}", { status: 402 }),
      new Response("invalid json"),
      new Response('{"id":"chat","output":[]}'),
    ]
  ) {
    const client = new SmsVapiClient(
      "synthetic-key",
      () => Promise.resolve(response),
    );
    await assert.rejects(() =>
      client.createChat({
        assistantId: "fixture",
        input: buildVapiInput("Question"),
      })
    );
  }
});

Deno.test("SMS opt-in uses Twilio-supported standalone keywords", () => {
  for (const value of ["START", "unstop", "Yes"]) {
    assert.equal(classifyControlMessage(value), "opt_in");
  }
  for (const value of ["STOP", "REVOKE", "OPTOUT", "unsubscribe"]) {
    assert.equal(classifyControlMessage(value), "opt_out");
  }
  assert.equal(classifyControlMessage("resume"), null);
  assert.equal(classifyControlMessage("please don't stop helping"), null);
});

Deno.test("SMS database calls abort hung RPCs within their budget and preserve caller cancellation", async () => {
  const hanging: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      const abort = () => reject(init!.signal!.reason);
      if (init!.signal!.aborted) abort();
      else init!.signal!.addEventListener("abort", abort, { once: true });
    });
  await assert.rejects(
    createSmsDatabaseFetch(hanging, 5)("https://synthetic.invalid/rpc"),
    { name: "TimeoutError" },
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    createSmsDatabaseFetch(hanging)("https://synthetic.invalid/rpc", {
      signal: controller.signal,
    }),
    { name: "AbortError" },
  );
});
