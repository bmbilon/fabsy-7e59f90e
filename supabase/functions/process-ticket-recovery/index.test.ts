import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handler } from "./index.ts";
import { unsubscribeSignature } from "../_shared/ticket-recovery.ts";
const secret = "test-secret-".repeat(4),
  service = "fixture-service-key".repeat(3);
Deno.env.set("SUPABASE_URL", "https://fixture.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", service);
Deno.env.set("IDR_CRON_SECRET", secret);
const savedFetch = globalThis.fetch;
const id = "00000000-0000-4000-8000-000000000001";
const snapshot = {
  eligible: true,
  reason: null,
  email: "person@example.com",
  phone: "",
  can_email: true,
  sms_opt_in: false,
  first_name: "Pat",
  ticket_number: "B12345678C",
  paid: false,
  has_consent: true,
  mode: "payment",
  uploaded_at: "2026-09-20T12:00:00Z",
  legacy_sent_at: null,
  session_ids: [],
  preferred_locale: "en",
};
const response = (v: unknown) =>
  new Response(JSON.stringify(v), {
    headers: { "Content-Type": "application/json" },
  });
function intercept(handler: (url: URL, method: string) => Response) {
  const calls: Array<{ path: string; method: string }> = [];
  globalThis.fetch = (async (u: RequestInfo | URL, o?: RequestInit) => {
    const url = new URL(
      typeof u === "string" ? u : u instanceof URL ? u.href : u.url,
    );
    const method = o?.method || "GET";
    calls.push({ path: url.pathname, method });
    return await Promise.resolve(handler(url, method));
  }) as typeof fetch;
  return calls;
}
const request = (body: unknown = {}) =>
  new Request(
    "https://fixture.supabase.co/functions/v1/process-ticket-recovery",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${service}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
Deno.test("unauthorized caller cannot inspect customers or dispatch", async () => {
  const calls = intercept(() => {
    throw Error("unexpected I/O");
  });
  try {
    assertEquals(
      (await handler(
        new Request(request().url, { method: "POST", body: "{}" }),
      )).status,
      401,
    );
    assertEquals(calls.length, 0);
  } finally {
    globalThis.fetch = savedFetch;
  }
});
Deno.test("dry-run reads candidates without enqueuing or provider calls", async () => {
  const calls = intercept((url) => {
    if (url.pathname.endsWith("ticket_recovery_settings")) {
      return response({
        enabled: false,
        mailing_address: null,
        cadence_hours: [24, 72, 168],
      });
    }
    if (url.pathname.endsWith("ticket_recovery_sources")) {
      return response([{ source_kind: "submission", source_id: id }]);
    }
    if (url.pathname.endsWith("ticket_recovery_snapshot")) {
      return response(snapshot);
    }
    if (url.pathname.endsWith("ticket_recovery_suppressions")) {
      return response(null);
    }
    throw Error("unexpected path");
  });
  try {
    const res = await handler(request({ dry_run: true }));
    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.messages_sent, 0);
    assertEquals(data.candidates[0].url, "https://fabsy.ca/payment");
    assertEquals(data.candidates[0].channels.sms.hold, "sms_opt_in_required");
    assertEquals(
      calls.some((c) => c.path.includes("enqueue") || c.path.includes("claim")),
      false,
    );
  } finally {
    globalThis.fetch = savedFetch;
  }
});
Deno.test("disabled automation cannot enqueue or send", async () => {
  const calls = intercept(() => response({ enabled: false }));
  try {
    const res = await handler(request());
    assertEquals(await res.json(), { enabled: false, messages_sent: 0 });
    assertEquals(calls.length, 1);
  } finally {
    globalThis.fetch = savedFetch;
  }
});
Deno.test("unsubscribe link GET is confirmation only; POST records recipient suppression", async () => {
  const calls = intercept((url) =>
    url.pathname.endsWith("ticket_recovery_events")
      ? response({ channel: "email", recipient: "person@example.com" })
      : response(null)
  );
  try {
    const sig = await unsubscribeSignature(id, secret);
    const url =
      `https://fixture.supabase.co/functions/v1/process-ticket-recovery?action=unsubscribe&id=${id}&signature=${sig}`;
    const get = await handler(new Request(url));
    assertEquals(get.status, 303);
    assertStringIncludes(
      get.headers.get("location")!,
      "https://fabsy.ca/reminder-preferences.html#id=",
    );
    assertEquals(calls.length, 0);
    const post = await handler(new Request(url, { method: "POST" }));
    assertEquals(post.status, 200);
    assertEquals(await post.json(), { unsubscribed: true });
    assertEquals(calls.at(-1), {
      path: "/rest/v1/ticket_recovery_suppressions",
      method: "POST",
    });
  } finally {
    globalThis.fetch = savedFetch;
  }
});
Deno.test("forged unsubscribe signature cannot alter preferences", async () => {
  const calls = intercept(() => {
    throw Error("unexpected I/O");
  });
  try {
    const res = await handler(
      new Request(
        `https://fixture.supabase.co/functions/v1/process-ticket-recovery?action=unsubscribe&id=${id}&signature=bad`,
        { method: "POST" },
      ),
    );
    assertEquals(res.status, 400);
    assertEquals(calls.length, 0);
  } finally {
    globalThis.fetch = savedFetch;
  }
});
