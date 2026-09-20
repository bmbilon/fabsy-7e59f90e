import { strict as assert } from "node:assert";
import { verifyDisclosureServiceOperator } from "./disclosure-operator-auth.ts";

const config = { supabaseUrl: "https://approval-fixture.invalid", anonKey: "fixture-anon-key" };
const authorization = "Bearer fixture-service-credential";

Deno.test("service verification forwards caller credentials to the fixed role-check RPC", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    assert.equal(String(input), "https://approval-fixture.invalid/rest/v1/rpc/verify_disclosure_automation_operator");
    assert.equal(init?.method, "POST");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), authorization);
    assert.equal(headers.get("apikey"), config.anonKey);
    assert.equal(init?.body, "{}");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal instanceof AbortSignal);
    calls++;
    return Response.json(true);
  };
  assert.equal(await verifyDisclosureServiceOperator(authorization, config, fetcher), true);
  assert.equal(calls, 1);
});

Deno.test("malformed credentials and missing configuration never reach the verifier", async () => {
  const fetcher: typeof fetch = () => { throw new Error("Unexpected network request"); };
  for (const value of ["", "Bearer", "Bearer ", "Basic abc", "Bearer a b", "Bearer " + "a".repeat(8193)]) {
    assert.equal(await verifyDisclosureServiceOperator(value, config, fetcher), false);
  }
  assert.equal(await verifyDisclosureServiceOperator(authorization, { ...config, anonKey: "" }, fetcher), false);
  for (const supabaseUrl of ["bad-url", "http://approval-fixture.invalid", "https://user@approval-fixture.invalid"]) {
    assert.equal(await verifyDisclosureServiceOperator(authorization, { ...config, supabaseUrl }, fetcher), false);
  }
});

Deno.test("only a successful literal boolean true grants service privilege", async () => {
  for (const body of [false, "true", 1, null, { verified: true }, [true]]) {
    assert.equal(await verifyDisclosureServiceOperator(authorization, config, () => Promise.resolve(Response.json(body))), false);
  }
  for (const status of [201, 301, 401, 403, 404, 500]) {
    assert.equal(await verifyDisclosureServiceOperator(authorization, config,
      () => Promise.resolve(new Response("true", { status }))), false);
  }
  assert.equal(await verifyDisclosureServiceOperator(authorization, config,
    () => Promise.resolve(new Response("not JSON"))), false);
  for (const failure of [new Error("Network failure"), new DOMException("Timeout", "TimeoutError")]) {
    assert.equal(await verifyDisclosureServiceOperator(authorization, config, () => Promise.reject(failure)), false);
  }
});
