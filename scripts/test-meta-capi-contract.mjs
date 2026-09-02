import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const thisFile = fileURLToPath(import.meta.url);
if (!process.execArgv.includes("--experimental-strip-types")) {
  const child = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", thisFile],
    { stdio: "inherit" },
  );
  process.exit(child.status ?? 1);
}

const repoRoot = path.resolve(path.dirname(thisFile), "..");
const migrationPath = path.join(
  repoRoot,
  "supabase/migrations/20260902124500_meta_capi_purchase_outbox.sql",
);
const terminalMigrationPath = path.join(
  repoRoot,
  "supabase/migrations/20260902160000_meta_capi_terminal_health.sql",
);
const sharedPath = path.join(repoRoot, "supabase/functions/_shared/meta-capi.ts");
const workerPath = path.join(repoRoot, "supabase/functions/meta-capi-worker/index.ts");
const withdrawalPath = path.join(repoRoot, "supabase/functions/withdraw-meta-measurement/index.ts");
const workflowPath = path.join(repoRoot, ".github/workflows/meta-capi-delivery.yml");
const migration = `${fs.readFileSync(migrationPath, "utf8")}\n${
  fs.readFileSync(terminalMigrationPath, "utf8")
}`;
const sharedSource = fs.readFileSync(sharedPath, "utf8");
const worker = fs.readFileSync(workerPath, "utf8");
const withdrawal = fs.readFileSync(withdrawalPath, "utf8");
const workflow = fs.readFileSync(workflowPath, "utf8");
const meta = await import(pathToFileURL(sharedPath).href);

let assertions = 0;
function check(condition, message) {
  assertions += 1;
  assert.ok(condition, message);
}

function rpcClient(handler) {
  return { rpc: handler };
}

const sessionId = "cs_test_abcdefghijklmnop1234567890";
const expectedHash = crypto.createHash("sha256").update(sessionId).digest("hex");
assert.equal(await meta.sha256CheckoutSessionId(sessionId), expectedHash);
assert.match(expectedHash, /^[0-9a-f]{64}$/);
assert.notEqual(expectedHash, sessionId);
assert.equal(meta.META_CAPI_EXPECTED_PIXEL_ID, "2917050565322500");
assert.equal(meta.META_CAPI_GRAPH_VERSION, "v25.0");
assert.equal(meta.META_CAPI_EVENT_SOURCE_URL, "https://fabsy.ca/rapid-resolution");
assert.deepEqual([...meta.META_CAPI_CONTENT_IDS], [
  "rapid_resolution",
  "rapid_resolution_bundle",
]);
assertions += 7;

const validFbp = "fb.1.1788350000000.1234567890";
const nowIso = new Date().toISOString();
const calls = [];
const recordResult = await meta.recordMetaCheckoutAttributionBestEffort(
  rpcClient(async (name, args) => {
    calls.push({ name, args });
    return { data: true, error: null };
  }),
  {
    checkoutSessionId: sessionId,
    consentGranted: true,
    consentVersion: "measurement-v1",
    consentedAt: nowIso,
    fbp: validFbp,
    fbc: "malformed value is dropped",
    clientUserAgent: "Server\nDerived Agent/1.0",
  },
);
assert.deepEqual(recordResult, { ok: true, recorded: true, cleared: false });
assert.equal(calls.length, 1);
assert.equal(calls[0].name, "record_meta_checkout_attribution");
assert.equal(calls[0].args.p_session_hash, expectedHash);
assert.equal(calls[0].args.p_fbp, validFbp);
assert.equal(calls[0].args.p_fbc, null);
assert.equal(calls[0].args.p_client_user_agent, "Server Derived Agent/1.0");
assert.ok(!JSON.stringify(calls[0].args).includes(sessionId));
assertions += 8;

let clearCalls = 0;
const withdrawn = await meta.recordMetaCheckoutAttributionBestEffort(
  rpcClient(async (name, args) => {
    clearCalls += 1;
    assert.equal(name, "clear_meta_checkout_attribution");
    assert.deepEqual(args, { p_session_hash: expectedHash });
    return { data: true, error: null };
  }),
  { checkoutSessionId: sessionId, consentGranted: false },
);
assert.deepEqual(withdrawn, {
  ok: true,
  recorded: false,
  cleared: true,
  reason: "not_consented",
});
assert.equal(clearCalls, 1);
assertions += 4;

const insufficient = await meta.recordMetaCheckoutAttributionBestEffort(
  rpcClient(async (name, args) => {
    assert.equal(name, "clear_meta_checkout_attribution");
    assert.deepEqual(args, { p_session_hash: expectedHash });
    return { data: true, error: null };
  }),
  {
    checkoutSessionId: sessionId,
    consentGranted: true,
    consentVersion: "measurement-v1",
    consentedAt: nowIso,
    clientUserAgent: "Server Derived Agent/1.0",
  },
);
assert.deepEqual(insufficient, {
  ok: true,
  recorded: false,
  cleared: true,
  reason: "insufficient_attribution",
});
assertions += 3;

const staleConsentCalls = [];
const staleConsent = await meta.recordMetaCheckoutAttributionBestEffort(
  rpcClient(async (name, args) => {
    staleConsentCalls.push({ name, args });
    return { data: true, error: null };
  }),
  {
    checkoutSessionId: sessionId,
    consentGranted: true,
    consentVersion: "measurement-v1",
    consentedAt: new Date(Date.now() - 181 * 24 * 60 * 60 * 1000).toISOString(),
    fbp: validFbp,
    clientUserAgent: "Server Derived Agent/1.0",
  },
);
assert.deepEqual(staleConsent, {
  ok: false,
  recorded: false,
  cleared: true,
  reason: "invalid_consent",
});
assert.equal(staleConsentCalls.length, 1);
assert.equal(staleConsentCalls[0].name, "clear_meta_checkout_attribution");
assertions += 3;

const uncertainRecordCalls = [];
const uncertainRecord = await meta.recordMetaCheckoutAttributionBestEffort(
  rpcClient(async (name) => {
    uncertainRecordCalls.push(name);
    return name === "record_meta_checkout_attribution"
      ? { data: null, error: { code: "synthetic" } }
      : { data: true, error: null };
  }),
  {
    checkoutSessionId: sessionId,
    consentGranted: true,
    consentVersion: "measurement-v1",
    consentedAt: nowIso,
    fbp: validFbp,
    clientUserAgent: "Server Derived Agent/1.0",
  },
);
assert.deepEqual(uncertainRecord, {
  ok: false,
  recorded: false,
  cleared: true,
  reason: "attribution_rpc_failed",
});
assert.deepEqual(uncertainRecordCalls, [
  "record_meta_checkout_attribution",
  "clear_meta_checkout_attribution",
]);
assertions += 2;

const uncertainUncleared = await meta.recordMetaCheckoutAttributionBestEffort(
  rpcClient(async (name) => ({ data: null, error: { code: name } })),
  {
    checkoutSessionId: sessionId,
    consentGranted: true,
    consentVersion: "measurement-v1",
    consentedAt: nowIso,
    fbp: validFbp,
    clientUserAgent: "Server Derived Agent/1.0",
  },
);
assert.deepEqual(uncertainUncleared, {
  ok: false,
  recorded: false,
  cleared: false,
  reason: "clear_rpc_failed",
});
assertions += 1;

let requiredClearArgs;
await meta.clearMetaCheckoutAttribution(rpcClient(async (name, args) => {
  assert.equal(name, "clear_meta_checkout_attribution");
  requiredClearArgs = args;
  return { data: true, error: null };
}), sessionId);
assert.deepEqual(requiredClearArgs, { p_session_hash: expectedHash });
assertions += 2;

const eventCreated = Math.floor(Date.now() / 1000) - 5;
let enqueueArgs;
const queued = await meta.enqueueMetaPurchase(
  rpcClient(async (name, args) => {
    assert.equal(name, "enqueue_meta_capi_purchase");
    enqueueArgs = args;
    return { data: "5f7e4716-22d5-4a77-83f1-36f0a5eefceb", error: null };
  }),
  {
    checkoutSessionId: sessionId,
    valueCents: 19800,
    eventTimeEpochSeconds: eventCreated,
    contentId: "rapid_resolution",
  },
);
assert.deepEqual(queued, {
  ok: true,
  queued: true,
  outboxId: "5f7e4716-22d5-4a77-83f1-36f0a5eefceb",
});
assert.equal(enqueueArgs.p_session_hash, expectedHash);
assert.equal(enqueueArgs.p_value_cents, 19800);
assert.equal(enqueueArgs.p_event_time, new Date(eventCreated * 1000).toISOString());
assert.equal(enqueueArgs.p_content_id, "rapid_resolution");
assert.ok(!JSON.stringify(enqueueArgs).includes(sessionId));
assertions += 7;

const notAttributed = await meta.enqueueMetaPurchase(
  rpcClient(async () => ({ data: null, error: null })),
  {
    checkoutSessionId: sessionId,
    valueCents: 22900,
    eventTimeEpochSeconds: eventCreated,
    contentId: "rapid_resolution_bundle",
  },
);
assert.deepEqual(notAttributed, {
  ok: true,
  queued: false,
  reason: "no_consented_attribution",
});
assertions += 1;

await assert.rejects(
  () => meta.enqueueMetaPurchase(
    rpcClient(async () => ({ data: null, error: { code: "synthetic" } })),
    {
      checkoutSessionId: sessionId,
      valueCents: 19800,
      eventTimeEpochSeconds: eventCreated,
      contentId: "rapid_resolution",
    },
  ),
  (error) => error instanceof meta.MetaCapiDeliveryError && error.code === "enqueue_rpc_failed",
);
await assert.rejects(
  () => meta.enqueueMetaPurchase(
    rpcClient(async () => {
      throw new Error("must not reach RPC");
    }),
    {
      checkoutSessionId: sessionId,
      valueCents: 7900,
      eventTimeEpochSeconds: eventCreated,
      contentId: "photo_radar",
    },
  ),
  (error) => error instanceof meta.MetaCapiDeliveryError && error.code === "invalid_purchase",
);
await assert.rejects(
  () => meta.enqueueMetaPurchase(
    rpcClient(async () => {
      throw new Error("cross-paired value must not reach RPC");
    }),
    {
      checkoutSessionId: sessionId,
      valueCents: 19800,
      eventTimeEpochSeconds: eventCreated,
      contentId: "rapid_resolution_bundle",
    },
  ),
  (error) => error instanceof meta.MetaCapiDeliveryError && error.code === "invalid_purchase",
);
await assert.rejects(
  () => meta.enqueueMetaPurchase(
    rpcClient(async () => {
      throw new Error("cross-paired value must not reach RPC");
    }),
    {
      checkoutSessionId: sessionId,
      valueCents: 22900,
      eventTimeEpochSeconds: eventCreated,
      contentId: "rapid_resolution",
    },
  ),
  (error) => error instanceof meta.MetaCapiDeliveryError && error.code === "invalid_purchase",
);
assertions += 4;

const claimRow = {
  outbox_id: "5f7e4716-22d5-4a77-83f1-36f0a5eefceb",
  lease_token: "aaae4716-22d5-4a77-83f1-36f0a5eefceb",
  event_id: expectedHash,
  event_time_epoch: eventCreated,
  value_cents: 22900,
  currency: "CAD",
  content_id: "rapid_resolution_bundle",
  fbp: validFbp,
  fbc: null,
  client_user_agent: "Server Derived Agent/1.0",
  attempt_count: 1,
  lease_expires_epoch: Math.floor(Date.now() / 1000) + 90,
};
assert.deepEqual(meta.parseMetaPurchaseLease(claimRow), {
  outboxId: claimRow.outbox_id,
  leaseToken: claimRow.lease_token,
});
assert.equal(meta.parseMetaPurchaseLease({ ...claimRow, lease_token: "invalid" }), null);
const claim = meta.parseMetaPurchaseClaim(claimRow);
assert.ok(claim);
const payload = meta.buildMetaPurchasePayload(claim);
assert.deepEqual(payload, {
  data: [{
    event_name: "Purchase",
    event_time: eventCreated,
    event_id: expectedHash,
    action_source: "website",
    event_source_url: "https://fabsy.ca/rapid-resolution",
    user_data: {
      client_user_agent: "Server Derived Agent/1.0",
      fbp: validFbp,
    },
    custom_data: {
      currency: "CAD",
      value: 229,
      content_ids: ["rapid_resolution_bundle"],
      content_type: "product",
    },
  }],
});
assert.deepEqual(Object.keys(payload.data[0].user_data).sort(), [
  "client_user_agent",
  "fbp",
]);
assert.equal(meta.parseMetaPurchaseClaim({ ...claimRow, event_id: `Purchase:${expectedHash}` }), null);
assert.equal(meta.parseMetaPurchaseClaim({ ...claimRow, client_user_agent: null }), null);
assert.equal(meta.parseMetaPurchaseClaim({ ...claimRow, value_cents: 19800 }), null);
assert.ok(meta.parseMetaPurchaseClaim({ ...claimRow, attempt_count: 13 }),
  "A retryable event must remain deliverable after twelve attempts");
assert.equal(meta.parseMetaPurchaseClaim({ ...claimRow, attempt_count: 0 }), null);
assert.equal(meta.parseMetaPurchaseClaim({
  ...claimRow,
  lease_expires_epoch: Math.floor(Date.now() / 1000) - 1,
}), null);
assertions += 11;

for (const fragment of [
  "create schema if not exists meta_private",
  "alter table meta_private.meta_checkout_attribution enable row level security",
  "alter table meta_private.meta_capi_outbox enable row level security",
  "revoke all on all tables in schema meta_private from public, anon, authenticated, service_role",
  "constraint meta_capi_outbox_purchase_session_unique unique (event_name, session_hash)",
  "event_id text generated always as (session_hash) stored",
  "check (content_id in ('rapid_resolution', 'rapid_resolution_bundle'))",
  "content_id = 'rapid_resolution' and value_cents in (19800, 15840)",
  "content_id = 'rapid_resolution_bundle' and value_cents in (22900, 18320)",
  "create or replace function public.clear_meta_checkout_attribution",
  "create or replace function public.withdraw_meta_checkout_attribution",
  "create or replace function public.claim_meta_capi_purchases",
  "create or replace function public.begin_meta_capi_purchase_delivery",
  "for update of queued skip locked",
  "and attribution.client_user_agent is not null",
  "set fbp = null, fbc = null, client_user_agent = null",
  "last_error_code = 'consent_withdrawn'",
  "and attribution.withdrawn_at is null",
  "and existing.withdrawn_at is not null then",
  "status = 'sending'",
  "send_started_at = clock_timestamp()",
  "lease_expires_at = clock_timestamp() + interval '90 seconds'",
  "send_started_at <= clock_timestamp() - interval '15 minutes'",
  "attempts = queued.attempts + 1",
  "event_time < clock_timestamp() - interval '7 days'",
  "create or replace function public.purge_meta_capi_history",
  "create or replace function public.count_meta_capi_terminal_failures",
  "interval '90 days'",
  "interval '30 days'",
  "interval '180 days'",
  "delivery_window_expired",
  "fabsy-meta-capi-retention",
  "grant execute on function public.purge_meta_capi_history()",
  "grant execute on function public.count_meta_capi_terminal_failures()",
  "grant execute on function public.begin_meta_capi_purchase_delivery(uuid, uuid)",
  "revoke all on function public.begin_meta_capi_purchase_delivery(uuid, uuid)",
]) check(migration.toLowerCase().includes(fragment.toLowerCase()), `Migration must contain: ${fragment}`);

const claimFunction = migration.match(
  /create or replace function public\.claim_meta_capi_purchases[\s\S]*?\nend;\n\$\$;/i,
)?.[0] || "";
check(/returns table \(\s*outbox_id uuid,\s*lease_token uuid\s*\)/i.test(claimFunction),
  "Claim must return only the opaque reservation identity");
check(!/attempts\s*=\s*queued\.attempts\s*\+\s*1/i.test(claimFunction),
  "Claim must not increment attempts before send authorization");
check(!/queued\.attempts\s*<\s*\d+/i.test(claimFunction) &&
    !/attempts_exhausted/i.test(claimFunction),
  "Retryable claims must remain governed by the seven-day age horizon, not an attempt cap");

const beginFunction = migration.match(
  /create or replace function public\.begin_meta_capi_purchase_delivery[\s\S]*?\nend;\n\$\$;/i,
)?.[0] || "";
check(/attribution\.withdrawn_at is null/i.test(beginFunction),
  "Begin must revalidate the irreversible withdrawal fence");
check(/event_time < clock_timestamp\(\) - interval '7 days'/i.test(beginFunction),
  "Begin must revalidate the seven-day delivery window");
check(/attempts\s*=\s*queued\.attempts\s*\+\s*1/i.test(beginFunction),
  "Begin must increment the attempt exactly at the send boundary");

const recordFunction = migration.match(
  /create or replace function public\.record_meta_checkout_attribution[\s\S]*?\nend;\n\$\$;/i,
)?.[0] || "";
check(/where meta_checkout_attribution\.withdrawn_at is null/i.test(recordFunction),
  "A delayed record conflict must not clear a compensation tombstone");
check(/get diagnostics affected = row_count;[\s\S]*?if affected <> 1 then[\s\S]*?return false;/i.test(recordFunction),
  "Record must report failure when a concurrent tombstone blocks its write");

const browserWithdrawFunction = migration.match(
  /create or replace function public\.withdraw_meta_checkout_attribution[\s\S]*?\nend;\n\$\$;/i,
)?.[0] || "";
check(!/insert into meta_private\.meta_checkout_attribution/i.test(browserWithdrawFunction),
  "The public-endpoint-backed withdrawal RPC must not create unknown hashes");

const trustedClearFunction = migration.match(
  /create or replace function public\.clear_meta_checkout_attribution[\s\S]*?\nend;\n\$\$;/i,
)?.[0] || "";
check(/insert into meta_private\.meta_checkout_attribution/i.test(trustedClearFunction) &&
    /withdrawal-tombstone-v1/i.test(trustedClearFunction) &&
    /on conflict \(session_hash\) do update/i.test(trustedClearFunction),
  "Trusted ambiguous-write compensation must upsert an irreversible missing-row tombstone");
check(trustedClearFunction.indexOf("insert into meta_private.meta_checkout_attribution") <
    trustedClearFunction.indexOf("public.withdraw_meta_checkout_attribution"),
  "Trusted compensation must lock the tombstone before inspecting or cancelling the outbox");

check(
  /delete from meta_private\.meta_checkout_attribution attribution\s+where attribution\.created_at < clock_timestamp\(\) - interval '30 days'/i.test(migration),
  "Purge must delete every unqueued attribution after 30 days, including rows that still have browser identifiers",
);

const attributionTable = migration.match(
  /create table meta_private\.meta_checkout_attribution \(([\s\S]*?)\n\);/,
)?.[1] || "";
for (const forbiddenColumn of [
  "email",
  "phone",
  "ticket",
  "case_id",
  "upload",
  "free_text",
  "checkout_session_id",
]) {
  check(
    !new RegExp(`^\\s*${forbiddenColumn}\\s`, "im").test(attributionTable),
    `Private attribution must not define ${forbiddenColumn}`,
  );
}

for (const fragment of [
  'Deno.env.get("META_CAPI_ACCESS_TOKEN")',
  'Deno.env.get("META_CAPI_ENABLED")',
  'Deno.env.get("META_PIXEL_ID")',
  '"Authorization": `Bearer ${accessToken}`',
  'admin.rpc("purge_meta_capi_history")',
  'admin.rpc("count_meta_capi_terminal_failures")',
  'admin.rpc("claim_meta_capi_purchases"',
  'admin.rpc("begin_meta_capi_purchase_delivery"',
  'admin.rpc("complete_meta_capi_purchase"',
  'admin.rpc("retry_meta_capi_purchase"',
]) check(worker.includes(fragment), `Worker must contain: ${fragment}`);

const workerLoop = worker.match(/for \(const row of data\) \{[\s\S]*?\n    \}/)?.[0] || "";
check(workerLoop.indexOf("beginDelivery(admin, lease)") >= 0,
  "Each opaque lease must pass the begin boundary");
check(workerLoop.indexOf("beginDelivery(admin, lease)") < workerLoop.indexOf("deliver(claim, pixelId, accessToken)"),
  "Provider delivery must occur only after just-in-time consent revalidation");
check(worker.includes("claim.leaseExpiresEpoch * 1000 - Date.now() < 15_000"),
  "Worker must reject a claim without enough provider-send lease remaining");
check(worker.includes("const healthy = unresolved === 0 && dead === 0 && terminalFailures === 0"),
  "Unresolved or dead-letter queue state must fail the worker invocation");
check(workflow.includes("((.unresolved // 0) == 0)"),
  "Scheduler must fail when a worker reports unresolved state");
check(workflow.includes("((.dead // 0) == 0)"),
  "Scheduler must fail when a worker reports a dead-letter state");
check(workflow.includes("((.terminal_failures // 0) == 0)"),
  "Scheduler must fail while a retained terminal delivery failure exists");
const terminalFunction = migration.match(
  /create or replace function public\.count_meta_capi_terminal_failures\(\)[\s\S]*?\nend;\n\$\$;/i,
)?.[0] || "";
check(/status\s*=\s*'dead'/i.test(terminalFunction) &&
    /last_error_code is distinct from 'consent_withdrawn'/i.test(terminalFunction),
  "Terminal health must expose all retained dead letters except expected consent withdrawal");
check(!/attempts\s*(?:>=|<)\s*12/i.test(migration),
  "The migration must not silently expire retryable delivery at twelve attempts");

check(!worker.includes("test_event_code"), "Production worker must not add a test event code");
check(!sharedSource.includes("client_ip_address"), "Payload must not send a client IP address");
check(!/\b(?:em|ph)\s*:/.test(sharedSource), "Payload must not send hashed contact identifiers");
check((worker.match(/console\.(?:log|warn|error)/g) || []).length === 1, "Worker logging must stay on the closed safe-code path");
check(!/console\.(?:log|warn|error)[^\n]*(?:accessToken|serviceRoleKey)/.test(worker), "Secrets must never enter logs");

for (const fragment of [
  'allowedOrigins.has(origin)',
  'handles.length > 16',
  'isSessionHash(handle)',
  'admin.rpc("withdraw_meta_checkout_attribution"',
  'data !== true && data !== false',
  'stillSending.push(handle)',
]) check(withdrawal.includes(fragment), `Withdrawal function must contain: ${fragment}`);
check(!withdrawal.includes("checkout.session"), "Withdrawal function must never accept a raw Stripe session");

console.log(`Meta CAPI contract checks passed (${assertions} assertions).`);
