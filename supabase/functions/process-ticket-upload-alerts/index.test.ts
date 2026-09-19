import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { handler } from "./index.ts";

Deno.test("worker rejects browsers and arbitrary bearer tokens before touching data", async () => {
  assertEquals(
    (await handler(new Request("https://example.com", { method: "GET" })))
      .status,
    405,
  );
  assertEquals(
    (await handler(new Request("https://example.com", { method: "POST" })))
      .status,
    401,
  );
  assertEquals(
    (await handler(
      new Request("https://example.com", {
        method: "POST",
        headers: { Authorization: "Bearer bogus", "x-cron-secret": "bogus" },
      }),
    )).status,
    401,
  );
});

Deno.test("cron worker deploy config keeps gateway JWT disabled for internal cron-secret authentication", async () => {
  const config = await Deno.readTextFile(
    new URL("../../config.toml", import.meta.url),
  );
  const block =
    config.split("[functions.process-ticket-upload-alerts]")[1]?.split(
      "[functions.",
    )[0] || "";
  assert(/^verify_jwt\s*=\s*false\s*$/m.test(block));
});

Deno.test("configured SMS channel still processes when email configuration is missing", async () => {
  const settings: Record<string, string> = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    IDR_CRON_SECRET: "test-cron-secret-".repeat(3),
    RESEND_API_KEY: "",
    TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`,
    TWILIO_AUTH_TOKEN: "test-token",
    TWILIO_PHONE_NUMBER: "+14035550100",
    TICKET_UPLOAD_ALERT_SMS_FROM: "",
  };
  const original = Object.fromEntries(
    Object.keys(settings).map((key) => [key, Deno.env.get(key)]),
  );
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  try {
    for (const [key, value] of Object.entries(settings)) {
      Deno.env.set(key, value);
    }
    globalThis.fetch = (url) => {
      calls.push(String(url));
      if (String(url).endsWith("/rest/v1/rpc/claim_ticket_upload_sms_alerts")) {
        return Promise.resolve(Response.json([]));
      }
      throw new Error("unexpected network call");
    };
    const response = await handler(
      new Request("https://example.com", {
        method: "POST",
        headers: { "x-cron-secret": settings.IDR_CRON_SECRET },
      }),
    );
    assertEquals(response.status, 503);
    const result = await response.json();
    assertEquals(result.email.error, "email_configuration_missing");
    assertEquals(result.sms.claimed, 0);
    assertEquals(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});

Deno.test("authorized dry run verifies dedicated sender without sending or claiming any work", async () => {
  const settings: Record<string, string> = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    IDR_CRON_SECRET: "test-cron-secret-".repeat(3),
    RESEND_API_KEY: "test-resend-key",
    TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`,
    TWILIO_AUTH_TOKEN: "test-token",
    TWILIO_PHONE_NUMBER: "+14035550999",
    TICKET_UPLOAD_ALERT_SMS_FROM: "+14035550100",
  };
  const original = Object.fromEntries(
    Object.keys(settings).map((key) => [key, Deno.env.get(key)]),
  );
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    for (const [key, value] of Object.entries(settings)) {
      Deno.env.set(key, value);
    }
    globalThis.fetch = (url, options) => {
      calls++;
      const endpoint = new URL(String(url));
      assertEquals(options?.method, "GET");
      assert(endpoint.pathname.endsWith("/IncomingPhoneNumbers.json"));
      assertEquals(
        endpoint.searchParams.get("PhoneNumber"),
        settings.TICKET_UPLOAD_ALERT_SMS_FROM,
      );
      return Promise.resolve(
        Response.json({
          incoming_phone_numbers: [{
            account_sid: settings.TWILIO_ACCOUNT_SID,
            phone_number: settings.TICKET_UPLOAD_ALERT_SMS_FROM,
            capabilities: { sms: true },
          }],
        }),
      );
    };
    const response = await handler(
      new Request("https://example.com", {
        method: "POST",
        headers: { "x-cron-secret": settings.IDR_CRON_SECRET },
        body: JSON.stringify({ dryRun: true }),
      }),
    );
    assertEquals(response.status, 200);
    assertEquals(await response.json(), {
      ok: true,
      dryRun: true,
      emailConfigured: true,
      sms: { ready: true, code: null },
    });
    assertEquals(calls, 1, "Only read-only provider lookup occurred");
    for (const body of ['{"dryRun":"true"}', "invalid-json", "null", "[]"]) {
      const invalid = await handler(
        new Request("https://example.com", {
          method: "POST",
          headers: { "x-cron-secret": settings.IDR_CRON_SECRET },
          body,
        }),
      );
      assertEquals(
        invalid.status,
        400,
        "Malformed dry-run requests cannot fall through to normal sends",
      );
    }
    assertEquals(calls, 1);
    const unauthorized = await handler(
      new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify({ dryRun: true }),
      }),
    );
    assertEquals(unauthorized.status, 401);
    assertEquals(
      calls,
      1,
      "Unauthenticated requests cannot inspect provider configuration",
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});
