import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { handler } from "./index.ts";

Deno.test("public callers cannot trigger customer reminders", async () => {
  assertEquals((await handler(new Request("https://example.com"))).status, 405);
  assertEquals(
    (await handler(new Request("https://example.com", { method: "POST" })))
      .status,
    401,
  );
  assertEquals(
    (await handler(
      new Request("https://example.com", {
        method: "POST",
        headers: { authorization: "Bearer bogus", "x-cron-secret": "bogus" },
      }),
    )).status,
    401,
  );
});
