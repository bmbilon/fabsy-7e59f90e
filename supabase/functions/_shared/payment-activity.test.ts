import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type ActivityCheckout,
  lineItemsIdentifyFabsy,
  metadataIdentifiesFabsy,
  paymentActivityPayload,
} from "./payment-activity.ts";

const checkout: ActivityCheckout = {
  id: "cs_live_standalone",
  livemode: true,
  mode: "payment",
  payment_status: "paid",
  amount_total: 8295,
  amount_subtotal: 7900,
  total_details: { amount_tax: 395 },
  currency: "cad",
  metadata: {},
  customer_details: { name: "Visitor", email: "visitor@example.test" },
  payment_intent: "pi_example",
};

Deno.test("standalone payment links need no Fabsy case metadata", () => {
  assertEquals(metadataIdentifiesFabsy(checkout), false);
  assertEquals(
    lineItemsIdentifyFabsy([{
      price: { product: { metadata: { fabsy_product: "photo_radar" } } },
    }], ""),
    true,
  );
  const payload = paymentActivityPayload(
    checkout,
    "evt_example",
    "2026-09-22T15:58:25Z",
  );
  assertEquals(payload.ticket_number, null);
  assertEquals(payload.amount_total_cents, 8295);
  assertEquals(payload.client_email, "visitor@example.test");
});

Deno.test("the shared Stripe account cannot notify unrelated payments by matching amount", () => {
  assertEquals(
    lineItemsIdentifyFabsy([{
      price: { id: "unrelated", product: { metadata: {} } },
    }], "photo_price"),
    false,
  );
  assertEquals(
    lineItemsIdentifyFabsy([{ price: { id: "photo_price" } }], "photo_price"),
    true,
  );
  assertEquals(
    lineItemsIdentifyFabsy([{
      price: {
        product: { deleted: true, metadata: { fabsy_product: "photo_radar" } },
      },
    }], ""),
    false,
  );
});
