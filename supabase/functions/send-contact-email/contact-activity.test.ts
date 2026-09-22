import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handler } from "./index.ts";

Deno.test("a customer confirmation failure cannot lose the internal website question", async () => {
  const settings = {
    SUPABASE_URL: "https://contact.example.test",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-key",
    RESEND_API_KEY: "re_synthetic",
  };
  const saved = Object.fromEntries(
    Object.keys(settings).map((key) => [key, Deno.env.get(key)]),
  );
  for (const [key, value] of Object.entries(settings)) Deno.env.set(key, value);
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("enqueue_portal_activity")) {
      const queued = JSON.parse(String(init?.body));
      assertEquals(queued.p_entity_id, null);
      assertEquals(queued.p_payload.message, "Can I use your service?");
      calls.push("internal_saved");
      return Response.json(null);
    }
    if (url.hostname === "api.resend.com") {
      calls.push("customer_confirmation");
      return Response.json({
        name: "validation_error",
        message: "Synthetic provider rejection",
      }, { status: 422 });
    }
    throw new Error("Unexpected network request");
  };
  try {
    const response = await handler(
      new Request("https://contact.example.test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Visitor",
          email: "visitor@example.test",
          message: "Can I use your service?",
          preferred_locale: "en",
        }),
      }),
    );
    await response.text();
    assertEquals(calls, ["internal_saved", "customer_confirmation"]);
    assertEquals(response.status, 500);
  } finally {
    globalThis.fetch = original;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});
