import { strict as assert } from "node:assert";

// Synthetic configuration only. Every request is intercepted; no SMS is sent.
Deno.env.set("SUPABASE_URL", "https://approval-fixture.invalid");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
Deno.env.set("SITE_URL", "https://fabsy.ca");
const realFetch = globalThis.fetch;
let mockFetch: typeof fetch = () => { throw new Error("Unexpected network request"); };
globalThis.fetch = (input, init) => mockFetch(input, init);
const { handler } = await import("./index.ts");
globalThis.fetch = realFetch;
const token = "A".repeat(43);
const termsHash = "d".repeat(64);

function request(body: unknown, extra: Record<string, string> = {}) {
  return new Request("https://approval-fixture.invalid/functions/v1/disclosure-approval", {
    method: "POST", headers: { "Content-Type": "application/json", ...extra }, body: JSON.stringify(body),
  });
}

Deno.test("GET and token preview never approve a request", async () => {
  const original = mockFetch;
  let requests = 0;
  mockFetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof Request ? input.url : input.href);
    assert.equal(url.hostname, "approval-fixture.invalid");
    assert.equal(init?.method || "GET", "GET");
    assert.equal(url.pathname, "/rest/v1/disclosure_portal_approvals");
    requests++;
    return new Response(JSON.stringify({ status: "pending", expires_at: new Date(Date.now() + 60_000).toISOString(),
      case_label: "Test C.", ticket_number: "E12345678T", scope: "Frozen scope", terms_sha256: termsHash,
      token_hash: "private", source_snapshot: { drivers_license: "private" }, recipient_phone: "private" }),
      { headers: { "Content-Type": "application/json" } });
  };
  try {
    assert.equal((await handler(new Request("https://approval-fixture.invalid/?token=" + token))).status, 405);
    assert.equal(requests, 0);
    const result = await handler(request({ action: "preview", token }));
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("cache-control"), "no-store");
    const publicData = await result.json();
    assert.equal(publicData.status, "pending"); assert.equal(publicData.ticket_suffix, "678T");
    assert.equal(JSON.stringify(publicData).includes("private"), false);
    assert.equal(requests, 1);
  } finally { mockFetch = original; }
});

Deno.test("operator actions and public decisions reject missing authentication or malformed input before I/O", async () => {
  const original = mockFetch;
  mockFetch = () => { throw new Error("Unexpected network request"); };
  try {
    assert.equal((await handler(request({ action: "create" }))).status, 401);
    assert.equal((await handler(request({ action: "consume" }))).status, 401);
    assert.equal((await handler(request({ action: "revoke" }))).status, 401);
    assert.equal((await handler(request({ action: "decide", token: "short", decision: "approved", terms_sha256: termsHash }))).status, 400);
    assert.equal((await handler(request({ action: "decide", token, decision: "approve", terms_sha256: termsHash }))).status, 400);
    assert.equal((await handler(request({ action: "decide", token, decision: "approved" }))).status, 400);
    assert.equal((await handler(request({ action: "preview", token }, { Origin: "https://evil.invalid" }))).status, 403);
  } finally { mockFetch = original; }
});

Deno.test("explicit phone POST binds the decision to the captured terms hash", async () => {
  const original = mockFetch;
  let calls = 0;
  mockFetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof Request ? input.url : input.href);
    assert.equal(url.hostname, "approval-fixture.invalid");
    assert.equal(url.pathname, "/rest/v1/rpc/decide_disclosure_portal_approval");
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.p_decision, "approved"); assert.equal(body.p_terms_sha256, termsHash);
    assert.match(body.p_token_hash, /^[a-f0-9]{64}$/); assert.notEqual(body.p_token_hash, token);
    calls++;
    return new Response(JSON.stringify("approved"), { headers: { "Content-Type": "application/json" } });
  };
  try {
    const result = await handler(request({ action: "decide", token, decision: "approved", terms_sha256: termsHash }));
    assert.equal(result.status, 200); assert.deepEqual(await result.json(), { status: "approved" });
    assert.equal(calls, 1);
  } finally { mockFetch = original; }
});
