import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handler } from "./index.ts";

Deno.test("Tawk acknowledges only after authenticated anonymous activity is durably queued", async () => {
  const settings = {
    TAWK_WEBHOOK_SECRET: "synthetic-secret",
    TAWK_PROPERTY_ID: "fabsy",
    SUPABASE_URL: "https://tawk.example.test",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-key",
  };
  const saved = Object.fromEntries(
    Object.keys(settings).map((key) => [key, Deno.env.get(key)]),
  );
  for (const [key, value] of Object.entries(settings)) Deno.env.set(key, value);
  const original = globalThis.fetch;
  const queue: Record<string, unknown>[] = [];
  let rejectQueue = false;
  globalThis.fetch = async (input, init) => {
    assertEquals(
      new URL(String(input)).pathname,
      "/rest/v1/rpc/enqueue_portal_activity",
    );
    queue.push(JSON.parse(String(init?.body)));
    return rejectQueue
      ? Response.json({ message: "Queue unavailable" }, { status: 503 })
      : Response.json(null);
  };
  try {
    const raw = JSON.stringify({
      event: "chat:start",
      property: { id: "fabsy" },
      chatId: "chat123",
      visitor: {},
      message: { text: "A question", sender: { type: "visitor" } },
    });
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(settings.TAWK_WEBHOOK_SECRET),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"],
    );
    const signature = Array.from(
      new Uint8Array(
        await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    const request = (sig = signature) =>
      new Request("https://tawk.example.test", {
        method: "POST",
        headers: { "x-tawk-signature": sig, "x-hook-event-id": "hook_123" },
        body: raw,
      });
    const invalid = await handler(request("bad"));
    assertEquals(invalid.status, 401);
    await invalid.text();
    assertEquals(queue.length, 0);
    for (let i = 0; i < 2; i++) {
      const response = await handler(request());
      assertEquals(response.status, 200);
      await response.text();
    }
    assertEquals(queue[0].p_entity_id, null);
    assertEquals(queue[0].p_event_key, queue[1].p_event_key);
    rejectQueue = true;
    const failure = await handler(request());
    assertEquals(failure.status, 503);
    await failure.text();
  } finally {
    globalThis.fetch = original;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});
