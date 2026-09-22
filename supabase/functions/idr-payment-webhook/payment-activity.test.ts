import Stripe from "https://esm.sh/stripe@18.5.0";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handler } from "./index.ts";

async function scenario(
  options: {
    unrelated?: boolean;
    queueFailure?: boolean;
    badSignature?: boolean;
  } = {},
) {
  const settings = {
    STRIPE_SECRET_KEY: "sk_test_synthetic",
    STRIPE_WEBHOOK_SECRET: "whsec_synthetic",
    SUPABASE_URL: "https://queue.example.test",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service",
  };
  const saved = Object.fromEntries(
    Object.keys(settings).map((key) => [key, Deno.env.get(key)]),
  );
  for (const [key, value] of Object.entries(settings)) Deno.env.set(key, value);
  const original = globalThis.fetch;
  const enqueued: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (
      url.hostname === "api.stripe.com" && url.pathname.endsWith("/line_items")
    ) {
      assertEquals(url.searchParams.get("expand[0]"), "data.price.product");
      return Response.json({
        object: "list",
        has_more: false,
        data: [{
          price: {
            product: {
              metadata: options.unrelated
                ? {}
                : { fabsy_product: "photo_radar" },
            },
          },
        }],
      });
    }
    if (url.pathname.endsWith("/enqueue_portal_activity")) {
      enqueued.push(JSON.parse(String(init?.body)));
      return options.queueFailure
        ? Response.json({ message: "unavailable" }, { status: 503 })
        : Response.json(null);
    }
    throw new Error("Unexpected network request");
  };
  try {
    const payload = JSON.stringify({
      id: "evt_standalone",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000),
      livemode: true,
      data: {
        object: {
          id: "cs_live_standalone",
          livemode: true,
          mode: "payment",
          payment_status: "paid",
          metadata: {},
          customer_details: { name: "Anonymous payer" },
          amount_subtotal: 7900,
          amount_total: 8295,
          currency: "cad",
        },
      },
    });
    const stripe = new Stripe(settings.STRIPE_SECRET_KEY);
    const signature = options.badSignature
      ? "bad"
      : await stripe.webhooks.generateTestHeaderStringAsync({
        payload,
        secret: settings.STRIPE_WEBHOOK_SECRET,
        cryptoProvider: Stripe.createSubtleCryptoProvider(),
      });
    const response = await handler(
      new Request("https://webhook.example.test", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      }),
    );
    await response.text();
    return { status: response.status, enqueued };
  } finally {
    globalThis.fetch = original;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

Deno.test("signed standalone Fabsy Payment Link queues an email without an intake", async () => {
  const result = await scenario();
  assertEquals(result.status, 200);
  assertEquals(result.enqueued.length, 1);
  assertEquals(result.enqueued[0].p_entity_id, null);
  assertEquals(
    result.enqueued[0].p_event_key,
    "payment:checkout:cs_live_standalone",
  );
});
Deno.test("payment queue failures ask Stripe to retry", async () =>
  assertEquals((await scenario({ queueFailure: true })).status, 500));
Deno.test("unrelated account payments and invalid signatures cannot queue emails", async () => {
  assertEquals((await scenario({ unrelated: true })).enqueued.length, 0);
  const invalid = await scenario({ badSignature: true });
  assertEquals(invalid.status, 400);
  assertEquals(invalid.enqueued.length, 0);
});
