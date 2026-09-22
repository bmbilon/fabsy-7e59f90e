import assert from "node:assert/strict";
import { SERVICE_CONSENT_VERSION } from "../_shared/service-checkout.ts";
Deno.env.set("SUPABASE_URL", "https://service-checkout.example.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "synthetic-key");
Deno.env.set("STRIPE_SECRET_KEY", "sk_test_synthetic");
Deno.env.set("STRIPE_GST_TAX_RATE_ID", "txr_synthetic");
Deno.env.set("SITE_URL", "https://fabsy.example.test");
let activeFetch: typeof fetch = () => Promise.reject(new Error("Unexpected network"));
const original = globalThis.fetch;
globalThis.fetch = (...args) => activeFetch(...args);
const { handler } = await import("./index.ts");
const id = "11111111-1111-4111-8111-111111111111";
const token = "a".repeat(64);
const request = (body: Record<string, unknown>) => new Request("https://service-checkout.example.test/functions/v1/service-checkout", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: "https://fabsy.example.test" }, body: JSON.stringify({ orderId: id, accessToken: token, ...body }),
});
const form = { action: "prepare", name: "Synthetic Example", email: "synthetic@example.test", mode: "payment", product: "photo_radar", termsAccepted: true };
async function boundary(run: (s: any) => Promise<void>) {
  const s: any = { order: null, inserts: 0, sessions: 0, pdf: null, stripeBody: null, failCheckout: false };
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  activeFetch = async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = options?.method || "GET";
    if (url.hostname === "api.stripe.com") {
      if (url.pathname.includes("/tax_rates/")) return json({ id: "txr_synthetic", active: true, inclusive: false, percentage: 5 });
      if (url.pathname === "/v1/checkout/sessions" && method === "POST") {
        s.sessions++; s.stripeBody = new URLSearchParams(String(options?.body));
        return json({ id: "cs_test_synthetic", status: "open", payment_status: "unpaid", url: "https://checkout.stripe.com/c/pay/cs_test_synthetic" });
      }
      if (url.pathname === "/v1/checkout/sessions/cs_test_synthetic") return json({ id: "cs_test_synthetic", status: "open", payment_status: "unpaid", url: "https://checkout.stripe.com/c/pay/cs_test_synthetic" });
      throw new Error(`Unexpected Stripe request: ${method} ${url.pathname}`);
    }
    assert.equal(url.hostname, "service-checkout.example.test", "No real network allowed");
    const body = typeof options?.body === "string" ? JSON.parse(options.body) : null;
    if (url.pathname.endsWith("/service_orders")) {
      if (method === "POST") { s.inserts++; s.order = { ...body, created_at: new Date().toISOString(), checkout_attempt: 1, payment_status: "not_started" }; return json(s.order); }
      if (method === "PATCH") { Object.assign(s.order, body); return json(s.order); }
      const accept = new Headers(options?.headers).get("Accept") || "";
      return json(accept.includes("vnd.pgrst.object") ? s.order : s.order ? [s.order] : []);
    }
    if (url.pathname.endsWith("/clients")) return json({});
    if (url.pathname.includes("/rpc/")) return json(null);
    if (url.pathname.includes("/object/consent-forms/")) { s.pdf = options?.body; return json({ Key: url.pathname }); }
    if (url.pathname.endsWith("/auth/v1/user")) return json({ message: "not authenticated" }, 401);
    throw new Error(`Unexpected request ${method} ${url.pathname}`);
  };
  try { await run(s); } finally { activeFetch = () => Promise.reject(new Error("Unexpected network")); }
}

Deno.test("no-ticket public checkout records terms, uses exact Stripe price and reuses the existing session", async () => {
  await boundary(async s => {
    for (let i=0;i<2;i++) { const response = await handler(request(form)); assert.equal(response.status, 200, await response.text()); }
    assert.equal(s.inserts, 1); assert.equal(s.order.consent, null); assert.equal(s.pdf, null);
    for (let i=0;i<2;i++) { const response=await handler(request({ action: "checkout", amount: 1 })); assert.equal(response.status, 200, await response.text()); }
    assert.equal(s.sessions, 1);
    assert.equal(s.stripeBody.get("line_items[0][price_data][unit_amount]"), "7900");
    assert.equal(s.stripeBody.get("line_items[0][tax_rates][0]"), "txr_synthetic");
    assert.equal(s.stripeBody.get("customer_email"), "synthetic@example.test");
    assert.match(s.stripeBody.get("success_url"), /\/checkout\?result=success#order=/);
  });
});
Deno.test("consent-only creates its actual PDF and never permits checkout", async () => {
  await boundary(async s => {
    const input = { ...form, mode: "consent", consentAccepted: true, consentVersion: SERVICE_CONSENT_VERSION, pleadNotGuilty: false, registeredOwner: true };
    const response = await handler(request(input)); assert.equal(response.status, 200, await response.text());
    assert.ok(s.pdf?.length > 1000); assert.equal(s.order.consent.pleadNotGuilty, false);
    const denied = await handler(request({ action: "checkout" })); assert.equal(denied.status, 400); await denied.body?.cancel();
    assert.equal(s.sessions, 0);
  });
});
Deno.test("private order data rejects wrong capability and staff actions reject anonymous requests", async () => {
  await boundary(async s => {
    await (await handler(request(form))).body?.cancel();
    const denied = await handler(request({ action: "status", accessToken: "b".repeat(64) })); assert.equal(denied.status, 403); await denied.body?.cancel();
    const changed = await handler(request({ ...form, product: "bundle" })); assert.equal(changed.status, 409); await changed.body?.cancel();
    const staff = await handler(request({ action: "staff-list" })); assert.equal(staff.status, 401); await staff.body?.cancel();
    assert.equal(s.inserts, 1);
  });
});
Deno.test("a return URL claiming success never marks an unpaid Stripe session paid", async () => {
  await boundary(async s => {
    await (await handler(request(form))).body?.cancel();
    await (await handler(request({ action: "checkout" }))).body?.cancel();
    const result = await handler(request({ action: "status", result: "success", payment_status: "paid" }));
    assert.equal(result.status, 200); assert.equal((await result.json()).order.paymentStatus, "open"); assert.equal(s.order.payment_status,"open");
  });
});
globalThis.addEventListener("unload", () => { globalThis.fetch = original; });
