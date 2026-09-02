import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { isSessionHash } from "../_shared/meta-capi.ts";

const siteUrl = (Deno.env.get("SITE_URL") || "https://fabsy.ca").replace(/\/$/, "");
const allowedOrigins = new Set([
  siteUrl,
  "https://www.fabsy.ca",
  "https://fabsy-execom.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:8080",
]);
const WITHDRAWAL_WAIT_MS = 16_000;
const WITHDRAWAL_POLL_MS = 200;

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function headers(origin: string) {
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : siteUrl,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

function json(origin: string, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers(origin), "Content-Type": "application/json" },
  });
}

serve(async (request) => {
  const origin = request.headers.get("origin") || "";
  if (!allowedOrigins.has(origin)) return json(origin, { error: "Origin is not allowed." }, 403);
  if (request.method === "OPTIONS") return new Response(null, { headers: headers(origin) });
  if (request.method !== "POST") return json(origin, { error: "Method not allowed." }, 405);

  try {
    const declaredLength = Number(request.headers.get("content-length") || "0");
    if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > 4096) {
      return json(origin, { error: "Request is too large." }, 413);
    }
    const raw = await request.text();
    if (raw.length > 4096) return json(origin, { error: "Request is too large." }, 413);
    const parsed: unknown = JSON.parse(raw);
    const handles = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { handles?: unknown }).handles
      : null;
    if (!Array.isArray(handles) || handles.length < 1 || handles.length > 16 ||
        handles.some(handle => !isSessionHash(handle)) || new Set(handles).size !== handles.length) {
      return json(origin, { error: "Withdrawal request is invalid." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || serviceRoleKey.length < 24) throw new Error("configuration");
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // A false result means the worker has crossed its just-in-time send boundary
    // and may have one bounded provider request in flight. Wait until it records
    // the result, then withdraw; never report success while delivery can continue.
    let pending = [...handles];
    const deadline = Date.now() + WITHDRAWAL_WAIT_MS;
    while (pending.length > 0) {
      const stillSending: string[] = [];
      for (const handle of pending) {
        const { data, error } = await admin.rpc("withdraw_meta_checkout_attribution", {
          p_session_hash: handle,
        });
        if (error || (data !== true && data !== false)) throw new Error("withdrawal");
        if (data === false) stillSending.push(handle);
      }
      if (stillSending.length === 0) break;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("withdrawal_busy");
      await wait(Math.min(WITHDRAWAL_POLL_MS, remaining));
      pending = stillSending;
    }
    return json(origin, { ok: true });
  } catch {
    // Never log or echo a revocation handle or database/provider response.
    console.warn("[withdraw-meta-measurement] unavailable");
    return json(origin, { error: "Measurement withdrawal is temporarily unavailable." }, 503);
  }
});
