import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { handler } from "./index.ts";

const settings = {
  SUPABASE_URL: "https://payment-sms.example.test", SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key",
  IDR_CRON_SECRET: "synthetic-cron-secret-".repeat(3), TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`,
  TWILIO_AUTH_TOKEN: "synthetic-token", TWILIO_SMS_NUMBER: "+14035550100",
};
async function isolated(run: () => Promise<void>) {
  const original = globalThis.fetch;
  const saved = Object.fromEntries([...Object.keys(settings), "PAYMENT_SMS_FROM_NUMBER"].map(key => [key, Deno.env.get(key)]));
  for (const [key, value] of Object.entries(settings)) Deno.env.set(key, value);
  Deno.env.delete("PAYMENT_SMS_FROM_NUMBER");
  try { await run(); } finally {
    globalThis.fetch = original;
    for (const [key, value] of Object.entries(saved)) if (value === undefined) Deno.env.delete(key); else Deno.env.set(key, value);
  }
}
const request = (body = {}, authorized = true) => new Request("https://worker.example.test", {
  method: "POST", headers: authorized ? { "x-cron-secret": settings.IDR_CRON_SECRET } : {}, body: JSON.stringify(body),
});
Deno.test("payment worker rejects unauthorized requests without external work", () => isolated(async () => {
  globalThis.fetch = () => { throw new Error("external call forbidden"); };
  assertEquals((await handler(request({}, false))).status, 401);
}));
Deno.test("authenticated readiness only verifies SMS sender with provider GET", () => isolated(async () => {
  let calls = 0;
  globalThis.fetch = (url, options) => {
    calls++; assertEquals(options?.method, "GET"); assertEquals(new URL(String(url)).pathname.endsWith("/IncomingPhoneNumbers.json"), true);
    return Promise.resolve(Response.json({ incoming_phone_numbers: [{ account_sid: settings.TWILIO_ACCOUNT_SID, phone_number: settings.TWILIO_SMS_NUMBER, capabilities: { sms: true } }] }));
  };
  const response = await handler(request({ dryRun: true }));
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { ok: true, dryRun: true, sms: { ready: true, code: null } });
  assertEquals(calls, 1);
}));
Deno.test("worker uses separate SMS queue and records health with no email dependency", () => isolated(async () => {
  let claimed = false; const calls: string[] = [];
  globalThis.fetch = (input, options) => {
    const url = new URL(String(input)); calls.push(url.pathname);
    if (url.hostname === "api.twilio.com") {
      assertEquals(new URLSearchParams(options?.body as URLSearchParams).get("To"), "+14036695353");
      return Promise.resolve(Response.json({ sid: `SM${"b".repeat(32)}` }));
    }
    if (url.pathname.endsWith("/claim_payment_sms_notifications")) {
      const result = claimed ? [] : [{ id: "id", claim_id: "claim", amount_total: 20790, currency: "CAD", client_name: "Test Person", ticket_number: "E12345678A" }];
      claimed = true; return Promise.resolve(Response.json(result));
    }
    if (url.pathname.endsWith("/finish_payment_sms_notification")) {
      assertEquals(JSON.parse(String(options?.body)).p_status, "accepted"); return Promise.resolve(Response.json(true));
    }
    if (url.pathname.endsWith("/record_payment_sms_worker_health")) {
      assertEquals(JSON.parse(String(options?.body)).p_error, null); return Promise.resolve(new Response(null, { status: 204 }));
    }
    throw new Error("unexpected network route");
  };
  const response = await handler(request());
  assertEquals(response.status, 200); assertEquals((await response.json()).accepted, 1);
  assertEquals(calls.some(route => /email|resend|gmail/.test(route)), false);
}));
