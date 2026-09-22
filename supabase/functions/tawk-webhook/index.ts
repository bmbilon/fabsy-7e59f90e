import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { tawkActivity, verifyTawkSignature } from "../_shared/tawk-activity.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const secret = Deno.env.get("TAWK_WEBHOOK_SECRET");
  const propertyId = Deno.env.get("TAWK_PROPERTY_ID") ||
    "6aa1fe19a9c2983442420e67";
  if (!secret) return json({ error: "webhook_not_configured" }, 503);
  if (Number(req.headers.get("content-length")) > 1048576) {
    return json({ error: "payload_too_large" }, 413);
  }
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > 1048576) {
    return json({ error: "payload_too_large" }, 413);
  }
  if (
    !await verifyTawkSignature(
      raw,
      req.headers.get("x-tawk-signature") || "",
      secret,
    )
  ) {
    return json({ error: "invalid_signature" }, 401);
  }
  const hookId = req.headers.get("x-hook-event-id") || "";
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(hookId)) {
    return json({ error: "invalid_event_id" }, 400);
  }
  let activity;
  try {
    activity = tawkActivity(JSON.parse(raw), propertyId);
  } catch {
    return json({ error: "invalid_event" }, 400);
  }
  if (!activity) return json({ received: true, queued: false });
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url, options) =>
          fetch(url, { ...options, signal: AbortSignal.timeout(15000) }),
      },
    },
  );
  const { error } = await db.rpc("enqueue_portal_activity", {
    p_event_key: `tawk:${propertyId}:${hookId}`,
    p_event_type: activity.event_type,
    p_entity_type: "tawk",
    p_entity_id: null,
    p_payload: activity.payload,
  });
  if (error) return json({ error: "queue_unavailable" }, 503);
  return json({ received: true, queued: true });
}

if (import.meta.main) Deno.serve(handler);
