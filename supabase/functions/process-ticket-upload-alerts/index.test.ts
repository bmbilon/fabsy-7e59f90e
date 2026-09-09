import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
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
