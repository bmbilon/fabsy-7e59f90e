import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { secretMatches } from "../_shared/disclosure-confirmation.ts";
import { processDisclosureNotices } from "../_shared/disclosure-delivery.ts";

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  // Reuses the existing private Supabase cron credential, never a browser/session key.
  if (!await secretMatches(req.headers.get("x-cron-secret") || "", Deno.env.get("IDR_CRON_SECRET") || "")) {
    return new Response("Unauthorized", { status: 401 });
  }
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }) },
  });
  let status = 200;
  let result: { sent: number; failed: number } | { error: string };
  try {
    result = await processDisclosureNotices(db, Deno.env.get("RESEND_API_KEY") || "");
  } catch {
    status = 503;
    result = { error: "disclosure_worker_failed" };
  }
  const { error } = await db.from("disclosure_automation_state").update({
    last_worker_at: new Date().toISOString(),
    last_worker_error: "error" in result ? result.error : result.failed ? `${result.failed} notification attempt(s) failed; retries are queued.` : null,
  }).eq("id", true);
  if (error) return new Response("Unable to save worker health", { status: 503 });
  return new Response(JSON.stringify(result), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

if (import.meta.main) Deno.serve(handler);
