import assert from "node:assert/strict";
import { checkSmsBridgeReadiness } from "./sms-readiness.ts";
const config = {
  accountSid: `AC${"a".repeat(32)}`,
  authToken: "test-auth",
  from: "+18255550123",
  assistantId: "11111111-1111-4111-8111-111111111111",
  vapiKey: "test-vapi",
  senderHashKey: "x".repeat(32),
  webhookUrl: "https://test.supabase.co/functions/v1/sms-vapi-webhook",
  supabaseUrl: "https://test.supabase.co",
};
function fixture(
  assistant: object = {
    id: config.assistantId,
    name: "Fabsy Text v4",
    model: { tools: [] },
  },
) {
  const calls: string[] = [];
  const fetcher: typeof fetch = (url, init) => {
    assert.equal(init?.method, "GET");
    assert.equal(init?.body, undefined);
    calls.push(String(url));
    return Promise.resolve(
      Response.json(
        String(url).startsWith("https://api.vapi.ai/") ? assistant : {
          incoming_phone_numbers: [{
            account_sid: config.accountSid,
            phone_number: config.from,
            capabilities: { sms: true },
          }],
        },
      ),
    );
  };
  return { calls, fetcher };
}
const readyDb = () =>
  Promise.resolve({
    version: 1,
    contracts_ready: true,
    circuit_enabled: false,
  });
Deno.test("readiness verifies providers using only GETs and accepts intentionally disabled prelaunch circuit", async () => {
  const f = fixture();
  const result = await checkSmsBridgeReadiness(config, readyDb, f.fetcher);
  assert.equal(result.ready, true);
  assert.equal(result.database?.circuitEnabled, false);
  assert.equal(result.vapi?.assistantName, "Fabsy Text v4");
  assert.equal(f.calls.length, 2);
  assert.ok(
    f.calls.some((url) => url.includes(`/assistant/${config.assistantId}`)),
  );
  assert.ok(
    f.calls.every((url) =>
      !url.includes("/chat") && !url.includes("/Messages")
    ),
  );
});
Deno.test("readiness fails closed for mismatched and action-enabled assistants or missing DB contracts", async () => {
  for (
    const assistant of [{ id: "other", name: "Other", model: {} }, {
      id: config.assistantId,
      name: "Actions",
      model: { toolIds: ["tool"] },
    }]
  ) {
    assert.equal(
      (await checkSmsBridgeReadiness(
        config,
        readyDb,
        fixture(assistant).fetcher,
      )).ready,
      false,
    );
  }
  assert.equal(
    (await checkSmsBridgeReadiness(
      config,
      () => Promise.resolve({}),
      fixture().fetcher,
    )).ready,
    false,
  );
});
Deno.test("invalid configuration never reads providers or database", async () => {
  for (
    const changes of [
      { senderHashKey: "short" },
      {
        webhookUrl: `${config.webhookUrl}?x=y`,
      },
      { assistantId: "invalid" },
      { previousSenderHashKey: config.senderHashKey },
      { senderRateLimit: "0" },
      { globalRateLimit: "1001" },
      { dailyRateLimit: "bad" },
    ]
  ) {
    const never = () => {
      throw new Error("No operation allowed");
    };
    assert.equal(
      (await checkSmsBridgeReadiness({ ...config, ...changes }, never, never))
        .ready,
      false,
    );
  }
});
Deno.test("provider authorization failures return coarse status without secret values", async () => {
  const result = await checkSmsBridgeReadiness(
    config,
    readyDb,
    () => Promise.resolve(new Response("no", { status: 401 })),
  );
  assert.equal(result.ready, false);
  assert.equal(result.vapi?.code, "provider_auth_failed");
  assert.ok(
    !JSON.stringify(result).includes("test-auth") &&
      !JSON.stringify(result).includes("test-vapi"),
  );
});
