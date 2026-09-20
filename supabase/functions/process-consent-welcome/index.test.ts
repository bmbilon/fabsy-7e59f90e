import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { handler } from "./index.ts";

const settings = { SUPABASE_URL: "https://welcome.example.test", SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key", IDR_CRON_SECRET: "synthetic-cron-".repeat(3), RESEND_API_KEY: "synthetic-resend", STRIPE_SECRET_KEY: "synthetic-stripe" };
async function isolated(run: () => Promise<void>) {
  const original = globalThis.fetch; const saved = Object.fromEntries(Object.keys(settings).map(key => [key, Deno.env.get(key)]));
  for (const [key, value] of Object.entries(settings)) Deno.env.set(key, value);
  try { await run(); } finally { globalThis.fetch = original; for (const [key, value] of Object.entries(saved)) if (value === undefined) Deno.env.delete(key); else Deno.env.set(key, value); }
}
const request = (body = {}, authorized = true) => new Request("https://worker.example.test", { method: "POST", headers: authorized ? { "x-cron-secret": settings.IDR_CRON_SECRET } : {}, body: JSON.stringify(body) });
Deno.test("welcome unauthorized and config-only dryrun never claim, inspect clients, or send", () => isolated(async () => {
  globalThis.fetch = () => { throw new Error("network forbidden"); };
  assertEquals((await handler(request({}, false))).status, 401);
  const response = await handler(request({ dryRun: true })); assertEquals(response.status, 200);
  assertEquals(await response.json(), { ok: true, dryRun: true, databaseConfigured: true, emailConfigured: true, paymentReadConfigured: true });
}));
Deno.test("zero-job worker success persists health", () => isolated(async () => {
  const calls: string[] = [];
  globalThis.fetch = (input, options) => {
    const route = new URL(String(input)).pathname; calls.push(route);
    if (route.endsWith("claim_consent_welcome_notifications")) return Promise.resolve(Response.json([]));
    if (route.endsWith("record_consent_welcome_worker_health")) { assertEquals(JSON.parse(String(options?.body)).p_error, null); return Promise.resolve(new Response(null, { status: 204 })); }
    throw new Error("Unexpected call");
  };
  const response = await handler(request()); assertEquals(response.status, 200); assertEquals(calls.length, 2);
}));
Deno.test("missing email configuration records failure without claiming", () => isolated(async () => {
  Deno.env.delete("RESEND_API_KEY");
  globalThis.fetch = (input, options) => {
    assertEquals(new URL(String(input)).pathname.endsWith("record_consent_welcome_worker_health"), true);
    assertEquals(JSON.parse(String(options?.body)).p_error, "welcome_configuration_missing");
    return Promise.resolve(new Response(null, { status: 204 }));
  };
  assertEquals((await handler(request())).status, 503);
}));
