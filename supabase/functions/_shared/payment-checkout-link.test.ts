import {
  assertEquals,
  assertMatch,
  assertNotEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  generatePaymentLinkCode,
  paymentCheckoutUrl,
  PAYMENT_LINK_CODE_PATTERN,
} from "./payment-checkout-link.ts";

Deno.test("payment link codes are compact, URL-safe and random", () => {
  const first = generatePaymentLinkCode();
  const second = generatePaymentLinkCode();
  assertEquals(first.length, 22);
  assertMatch(first, PAYMENT_LINK_CODE_PATTERN);
  assertNotEquals(first, second);
});

Deno.test("payment checkout URL keeps only the opaque checkout code", () => {
  const code = "AbCdEfGhIjKlMnOpQrStUv";
  const url = new URL(paymentCheckoutUrl("https://fabsy.ca/internal", code));
  assertEquals(url.href, `https://fabsy.ca/pay/${code}`);
  assertEquals(url.search, "");
  assertEquals(url.hash, "");
});

Deno.test("payment checkout URL rejects unsafe origins and codes", async () => {
  assertThrows(() => paymentCheckoutUrl("https://fabsy.ca", "short"));
  await assertRejects(
    async () => paymentCheckoutUrl("http://fabsy.ca", "AbCdEfGhIjKlMnOpQrStUv"),
    Error,
    "HTTPS",
  );
});
