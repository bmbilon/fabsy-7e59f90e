import assert from "node:assert/strict";
import { handler } from "./index.ts";
const env = {
  SUPABASE_URL: "https://synthetic.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key-".repeat(3),
  RESEND_API_KEY: "synthetic-resend",
  IDR_CRON_SECRET: "synthetic-cron-".repeat(3),
  TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`,
  TWILIO_AUTH_TOKEN: "synthetic-twilio",
  TWILIO_SMS_NUMBER: "+18255550123",
  SMS_VAPI_ASSISTANT_ID: "11111111-1111-4111-8111-111111111111",
  VAPI_PRIVATE_API_KEY: "synthetic-vapi",
  SMS_SENDER_HASH_KEY: "s".repeat(32),
  SMS_WEBHOOK_URL:
    "https://synthetic.supabase.co/functions/v1/sms-vapi-webhook",
};
async function withEnv(fn: () => Promise<void>) {
  const previous = Object.fromEntries(
    Object.keys(env).map((name) => [name, Deno.env.get(name)]),
  );
  for (const [name, value] of Object.entries(env)) Deno.env.set(name, value);
  try {
    await fn();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
}
Deno.test("email worker rejects unauthenticated requests before any provider or DB read", () =>
  withEnv(async () => {
    const original = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error("No network expected");
    };
    try {
      assert.equal(
        (await handler(
          new Request("https://local", {
            method: "POST",
            body: '{"dryRun":true}',
          }),
        )).status,
        401,
      );
      assert.equal((await handler(new Request("https://local"))).status, 405);
    } finally {
      globalThis.fetch = original;
    }
  }));
Deno.test("authenticated dryRun reads readiness contracts without claims, chats, SMS or emails", () =>
  withEnv(async () => {
    const original = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/rest/v1/rpc/sms_intake_readiness")) {
        return Promise.resolve(
          Response.json({
            version: 1,
            contracts_ready: true,
            circuit_enabled: false,
          }),
        );
      }
      assert.equal(init?.method, "GET");
      if (url.includes("api.twilio.com")) {
        return Promise.resolve(
          Response.json({
            incoming_phone_numbers: [{
              account_sid: env.TWILIO_ACCOUNT_SID,
              phone_number: env.TWILIO_SMS_NUMBER,
              capabilities: { sms: true },
            }],
          }),
        );
      }
      if (url.includes("api.vapi.ai/assistant/")) {
        return Promise.resolve(
          Response.json({
            id: env.SMS_VAPI_ASSISTANT_ID,
            name: "Fabsy Text v4",
            model: {},
          }),
        );
      }
      throw new Error(`Unexpected request ${url}`);
    };
    try {
      const response = await handler(
        new Request("https://local", {
          method: "POST",
          headers: { "x-cron-secret": env.IDR_CRON_SECRET },
          body: '{"dryRun":true}',
        }),
      );
      assert.equal(response.status, 200);
      assert.equal((await response.json()).ready, true);
      assert.equal(calls.length, 3);
      assert.ok(
        calls.every((url) =>
          !/claim_|freeze_|finish_|\/chat$|\/emails|\/Messages/.test(url)
        ),
      );
    } finally {
      globalThis.fetch = original;
    }
  }));

Deno.test("worker reports provider email rejection as unhealthy and records permanent failure", () =>
  withEnv(async () => {
    const original = globalThis.fetch;
    let recorded = false;
    globalThis.fetch = (input, init) => {
      const url = String(input);
      if (url.includes("/claim_sms_intake_email_notifications")) {
        return Promise.resolve(Response.json([{
          id: "notification",
          inquiry_id: "inquiry",
          claim_id: "claim",
          snapshot: {
            fromNumber: "+14035550123",
            toNumber: env.TWILIO_SMS_NUMBER,
            body: "Hello",
            numMedia: 0,
            receivedAt: "2026-09-18T00:00:00Z",
            inquiryId: "inquiry",
          },
        }]));
      }
      if (url.includes("/freeze_sms_intake_email_notification")) {
        return Promise.resolve(
          Response.json(JSON.parse(String(init!.body)).p_payload),
        );
      }
      if (url === "https://api.resend.com/emails") {
        return Promise.resolve(
          Response.json({ error: "synthetic rejection" }, { status: 422 }),
        );
      }
      if (url.includes("/finish_sms_intake_email_notification")) {
        const payload = JSON.parse(String(init!.body));
        assert.equal(payload.p_status, "failed");
        assert.equal(payload.p_failure_code, "provider_http_422");
        recorded = true;
        return Promise.resolve(Response.json(true));
      }
      throw new Error(`Unexpected request ${url}`);
    };
    try {
      const response = await handler(
        new Request("https://local", {
          method: "POST",
          headers: { "x-cron-secret": env.IDR_CRON_SECRET },
          body: "{}",
        }),
      );
      assert.equal(response.status, 503);
      const result = await response.json();
      assert.equal(result.ok, false);
      assert.equal(result.failed, 1);
      assert.equal(recorded, true);
    } finally {
      globalThis.fetch = original;
    }
  }));
