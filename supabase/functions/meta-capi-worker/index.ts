import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  buildMetaPurchasePayload,
  META_CAPI_EXPECTED_PIXEL_ID,
  META_CAPI_GRAPH_VERSION,
  type MetaPurchaseClaim,
  type MetaPurchaseLease,
  parseMetaPurchaseClaim,
  parseMetaPurchaseLease,
} from "../_shared/meta-capi.ts";

// This worker is an internal service-role endpoint. Supabase JWT verification
// remains enabled by default, and the function also verifies the exact bearer
// credential before claiming private rows.

// This Edge Function intentionally uses the dynamic service-role client without
// generated database types.
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = ReturnType<typeof createClient<any>>;

type SafeWorkerCode =
  | "unauthorized"
  | "configuration_invalid"
  | "claim_rpc_failed"
  | "begin_rpc_failed"
  | "invalid_claim"
  | "complete_rpc_failed"
  | "retry_rpc_failed"
  | "terminal_rpc_failed"
  | "dead_letter"
  | "purge_rpc_failed"
  | "worker_exception";

type FailureCode =
  | "network_error"
  | "request_timeout"
  | "invalid_response"
  | "zero_events_received"
  | "worker_exception"
  | `meta_http_${number}`
  | `meta_graph_${number}`;

interface MetaGraphResult {
  events_received?: unknown;
  error?: { code?: unknown; is_transient?: unknown };
}

interface DeliveryFailure {
  ok: false;
  code: FailureCode;
  httpStatus: number | null;
  retryAfterSeconds: number;
  permanent: boolean;
}

interface DeliverySuccess {
  ok: true;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function safeWarn(code: SafeWorkerCode): void {
  // Never add caught errors, request headers, provider bodies, payloads, or URLs
  // to this logger. In particular, the Meta access token must remain server-only.
  console.warn(`[meta-capi-worker] ${code}`);
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function isAuthorized(request: Request, serviceRoleKey: string): boolean {
  const authorization = request.headers.get("authorization") || "";
  const prefix = "Bearer ";
  return authorization.startsWith(prefix) &&
    constantTimeEqual(authorization.slice(prefix.length), serviceRoleKey);
}

function hasUnsafeSecretCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) || 0;
    if (code <= 32 || (code >= 127 && code <= 159)) return true;
  }
  return false;
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    return Math.min(21600, Math.max(15, Number(value)));
  }
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return null;
  return Math.min(21600, Math.max(15, Math.ceil((date - Date.now()) / 1000)));
}

function backoffSeconds(claim: MetaPurchaseClaim): number {
  const exponential = Math.min(21600, 30 * (2 ** Math.max(0, claim.attemptCount - 1)));
  const jitter = Number.parseInt(claim.eventId.slice(-2), 16) % 15;
  return Math.min(21600, Math.max(15, exponential + jitter));
}

function graphCode(result: MetaGraphResult | null): number | null {
  const value = result?.error?.code;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function isRetryableGraphCode(code: number | null): boolean {
  return code !== null && [1, 2, 4, 17, 32, 190, 341, 613].includes(code);
}

function failureForResponse(
  response: Response,
  result: MetaGraphResult | null,
  claim: MetaPurchaseClaim,
): DeliveryFailure {
  const providerCode = graphCode(result);
  const retryableStatus = [408, 409, 425, 429].includes(response.status) || response.status >= 500;
  const retryable = retryableStatus ||
    isRetryableGraphCode(providerCode) ||
    result?.error?.is_transient === true;
  const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
  return {
    ok: false,
    code: providerCode === null
      ? `meta_http_${response.status}`
      : `meta_graph_${providerCode}`,
    httpStatus: response.status,
    retryAfterSeconds: retryAfter ?? backoffSeconds(claim),
    permanent: !retryable,
  };
}

async function readGraphResult(response: Response): Promise<MetaGraphResult | null> {
  try {
    const body = await response.text();
    if (body.length > 65536) return null;
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as MetaGraphResult
      : null;
  } catch {
    return null;
  }
}

async function deliver(
  claim: MetaPurchaseClaim,
  pixelId: string,
  accessToken: string,
): Promise<DeliverySuccess | DeliveryFailure> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(
      `https://graph.facebook.com/${META_CAPI_GRAPH_VERSION}/${pixelId}/events`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildMetaPurchasePayload(claim)),
        signal: controller.signal,
      },
    );
    const result = await readGraphResult(response);
    if (!response.ok) return failureForResponse(response, result, claim);
    if (result?.error) return failureForResponse(response, result, claim);
    if (!result) {
      return {
        ok: false,
        code: "invalid_response",
        httpStatus: response.status,
        retryAfterSeconds: backoffSeconds(claim),
        permanent: false,
      };
    }
    if (result.events_received !== 1) {
      return {
        ok: false,
        code: "zero_events_received",
        httpStatus: response.status,
        retryAfterSeconds: backoffSeconds(claim),
        permanent: false,
      };
    }
    return { ok: true };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    return {
      ok: false,
      code: timedOut ? "request_timeout" : "network_error",
      httpStatus: null,
      retryAfterSeconds: backoffSeconds(claim),
      permanent: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}

type DeliveryStart =
  | { kind: "ready"; claim: MetaPurchaseClaim }
  | { kind: "cancelled" }
  | { kind: "settled"; disposition: RetryDisposition }
  | { kind: "unresolved" };

type RetryDisposition = "pending" | "dead" | "cancelled";

async function settleLease(
  admin: SupabaseAdmin,
  lease: MetaPurchaseLease,
  code: FailureCode,
  retryAfterSeconds: number,
  permanent: boolean,
  httpStatus: number | null = null,
): Promise<RetryDisposition | null> {
  const { data, error } = await admin.rpc("retry_meta_capi_purchase", {
    p_outbox_id: lease.outboxId,
    p_lease_token: lease.leaseToken,
    p_error_code: code,
    p_http_status: httpStatus,
    p_retry_after_seconds: retryAfterSeconds,
    p_permanent: permanent,
  });
  if (error || (data !== "pending" && data !== "dead" && data !== "cancelled")) {
    safeWarn("retry_rpc_failed");
    return null;
  }
  return data;
}

/** Revalidate consent and obtain identifiers immediately before the fetch. */
async function beginDelivery(admin: SupabaseAdmin, lease: MetaPurchaseLease): Promise<DeliveryStart> {
  const { data, error } = await admin.rpc("begin_meta_capi_purchase_delivery", {
    p_outbox_id: lease.outboxId,
    p_lease_token: lease.leaseToken,
  });
  if (error || !Array.isArray(data)) {
    safeWarn("begin_rpc_failed");
    const disposition = await settleLease(admin, lease, "worker_exception", 30, false);
    return disposition ? { kind: "settled", disposition } : { kind: "unresolved" };
  }
  // Empty means withdrawal, terminal cleanup, or lease expiry won before the
  // send boundary. No provider request is permitted in any of those cases.
  if (data.length === 0) return { kind: "cancelled" };
  if (data.length !== 1) {
    safeWarn("invalid_claim");
    const disposition = await rejectInvalidClaim(admin, data[0], lease);
    return disposition ? { kind: "settled", disposition } : { kind: "unresolved" };
  }
  const claim = parseMetaPurchaseClaim(data[0]);
  if (!claim || claim.outboxId !== lease.outboxId || claim.leaseToken !== lease.leaseToken) {
    safeWarn("invalid_claim");
    const disposition = await rejectInvalidClaim(admin, data[0], lease);
    return disposition ? { kind: "settled", disposition } : { kind: "unresolved" };
  }
  if (claim.leaseExpiresEpoch * 1000 - Date.now() < 15_000) {
    const disposition = await settleLease(admin, lease, "worker_exception", 30, false);
    return disposition ? { kind: "settled", disposition } : { kind: "unresolved" };
  }
  return { kind: "ready", claim };
}

async function completeClaim(admin: SupabaseAdmin, claim: MetaPurchaseClaim): Promise<boolean> {
  const { data, error } = await admin.rpc("complete_meta_capi_purchase", {
    p_outbox_id: claim.outboxId,
    p_lease_token: claim.leaseToken,
  });
  if (error || data !== true) {
    safeWarn("complete_rpc_failed");
    return false;
  }
  return true;
}

async function retryClaim(
  admin: SupabaseAdmin,
  claim: MetaPurchaseClaim,
  failure: DeliveryFailure,
): Promise<RetryDisposition | null> {
  return settleLease(
    admin,
    claim,
    failure.code,
    failure.retryAfterSeconds,
    failure.permanent,
    failure.httpStatus,
  );
}

async function rejectInvalidClaim(
  admin: SupabaseAdmin,
  row: unknown,
  fallback?: MetaPurchaseLease,
): Promise<RetryDisposition | null> {
  let lease = parseMetaPurchaseLease(row);
  if (fallback && (!lease || lease.outboxId !== fallback.outboxId || lease.leaseToken !== fallback.leaseToken)) {
    lease = fallback;
  }
  if (!lease) {
    safeWarn("invalid_claim");
    return null;
  }
  return settleLease(admin, lease, "invalid_response", 15, true);
}

async function purgeHistory(admin: SupabaseAdmin): Promise<boolean> {
  const { error } = await admin.rpc("purge_meta_capi_history");
  if (error) {
    safeWarn("purge_rpc_failed");
    return false;
  }
  return true;
}

async function countTerminalFailures(admin: SupabaseAdmin): Promise<number | null> {
  const { data, error } = await admin.rpc("count_meta_capi_terminal_failures");
  if (
    error || typeof data !== "number" || !Number.isSafeInteger(data) || data < 0
  ) {
    safeWarn("terminal_rpc_failed");
    return null;
  }
  return data;
}

serve(async (request) => {
  try {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || serviceRoleKey.length < 24) {
      safeWarn("configuration_invalid");
      return json({ error: "Worker configuration unavailable" }, 503);
    }
    if (!isAuthorized(request, serviceRoleKey)) {
      safeWarn("unauthorized");
      return json({ error: "Unauthorized" }, 401);
    }

    const admin: SupabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const purgeOk = await purgeHistory(admin);

    if (Deno.env.get("META_CAPI_ENABLED") !== "true") {
      const terminalFailures = await countTerminalFailures(admin);
      const healthy = purgeOk && terminalFailures === 0;
      if ((terminalFailures ?? 0) > 0) safeWarn("dead_letter");
      return healthy
        ? json({ ok: true, disabled: true, terminal_failures: 0 }, 202)
        : json({
          ok: false,
          disabled: true,
          error: "Queue maintenance unavailable",
          terminal_failures: terminalFailures ?? 0,
        }, 503);
    }

    const pixelId = Deno.env.get("META_PIXEL_ID") || "";
    const accessToken = Deno.env.get("META_CAPI_ACCESS_TOKEN") || "";
    if (
      pixelId !== META_CAPI_EXPECTED_PIXEL_ID ||
      accessToken.length < 20 ||
      accessToken.length > 4096 ||
      hasUnsafeSecretCharacter(accessToken)
    ) {
      safeWarn("configuration_invalid");
      return json({ error: "Worker configuration unavailable" }, 503);
    }

    const { data, error } = await admin.rpc("claim_meta_capi_purchases", {
      // Reservations contain no identifiers. Each row is authorized separately
      // immediately before its bounded provider request.
      p_limit: 5,
      p_lease_seconds: 90,
    });
    if (error || !Array.isArray(data)) {
      safeWarn("claim_rpc_failed");
      return json({ error: "Queue unavailable" }, 503);
    }

    let sent = 0;
    let retried = 0;
    let dead = 0;
    let invalid = 0;
    let cancelled = 0;
    let unresolved = purgeOk ? 0 : 1;
    for (const row of data) {
      const lease = parseMetaPurchaseLease(row);
      if (!lease) {
        invalid += 1;
        unresolved += 1;
        continue;
      }
      const started = await beginDelivery(admin, lease);
      if (started.kind === "cancelled") {
        cancelled += 1;
        continue;
      }
      if (started.kind === "settled") {
        if (started.disposition === "dead") dead += 1;
        else if (started.disposition === "cancelled") cancelled += 1;
        else retried += 1;
        continue;
      }
      if (started.kind === "unresolved") {
        unresolved += 1;
        continue;
      }
      const claim = started.claim;
      const result = await deliver(claim, pixelId, accessToken);
      if (result.ok) {
        if (await completeClaim(admin, claim)) sent += 1;
        else unresolved += 1;
        continue;
      }
      const disposition = await retryClaim(admin, claim, result);
      if (disposition === "dead") dead += 1;
      else if (disposition === "cancelled") cancelled += 1;
      else if (disposition === "pending") retried += 1;
      else unresolved += 1;
    }

    const terminalFailures = await countTerminalFailures(admin);
    if (terminalFailures === null) unresolved += 1;
    if (dead > 0 || (terminalFailures ?? 0) > 0) safeWarn("dead_letter");
    const healthy = unresolved === 0 && dead === 0 && terminalFailures === 0;
    const body = {
      ok: healthy,
      claimed: data.length,
      sent,
      retried,
      dead,
      invalid,
      cancelled,
      unresolved,
      terminal_failures: terminalFailures ?? 0,
    };
    return healthy ? json(body) : json(body, 503);
  } catch {
    safeWarn("worker_exception");
    return json({ error: "Worker unavailable" }, 500);
  }
});
