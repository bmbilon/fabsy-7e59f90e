import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { parseConfirmation, readBoundedJson, secretMatches, type ImprovEmail } from "../_shared/disclosure-confirmation.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  // ImprovMX accepts webhook destinations but does not sign the payload. Use a
  // dedicated random capability, never a Supabase service key, in the private alias URL.
  const token = new URL(req.url).searchParams.get("token") || "";
  if (!await secretMatches(token, Deno.env.get("DISCLOSURE_WEBHOOK_SECRET") || "")) return json({ error: "unauthorized" }, 401);
  let mail: ImprovEmail;
  try { mail = await readBoundedJson(req) as ImprovEmail; }
  catch (error) { return json({ error: error instanceof Error && error.message === "payload_too_large" ? "payload_too_large" : "invalid_json" }, error instanceof Error && error.message === "payload_too_large" ? 413 : 400); }
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }) },
    });
    const { error: heartbeatError } = await db.from("disclosure_automation_state").update({ last_webhook_at: new Date().toISOString() }).eq("id", true);
    if (heartbeatError) return json({ error: "storage_unavailable" }, 503);
    const event = await parseConfirmation(mail);
    if (!event) return json({ accepted: true, ignored: true });
    const { data, error } = await db.rpc("ingest_disclosure_confirmation", { p_event: event });
    if (error) return json({ error: "storage_unavailable" }, 503);
    // Acknowledge only after the transaction commits. The scheduled outbox owns delivery.
    return json({ accepted: true, status: data.status, replayed: data.replayed });
  } catch {
    return json({ error: "processing_unavailable" }, 503);
  }
}

if (import.meta.main) Deno.serve(handler);
