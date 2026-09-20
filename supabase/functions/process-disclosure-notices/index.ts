import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { secretMatches } from "../_shared/disclosure-confirmation.ts";
import { processDisclosureNotices } from "../_shared/disclosure-delivery.ts";
import { pollDisclosureConfirmations } from "../_shared/gmail-disclosure-inbox.ts";

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  // Reuses the existing private Supabase cron credential, never a browser/session key.
  if (
    !await secretMatches(
      req.headers.get("x-cron-secret") || "",
      Deno.env.get("IDR_CRON_SECRET") || "",
    )
  ) {
    return new Response("Unauthorized", { status: 401 });
  }
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      global: {
        fetch: (url, options) =>
          fetch(url, { ...options, signal: AbortSignal.timeout(15000) }),
      },
    },
  );
  let status = 200;
  let inbox: Awaited<ReturnType<typeof pollDisclosureConfirmations>> | {
    error: string;
  };
  let delivery: { sent: number; failed: number } | { error: string };
  try {
    inbox = await pollDisclosureConfirmations(db);
  } catch {
    status = 503;
    inbox = { error: "disclosure_inbox_poll_failed" };
  }
  try {
    delivery = await processDisclosureNotices(db);
  } catch {
    status = 503;
    delivery = { error: "disclosure_notice_delivery_failed" };
  }
  const inboxIssue = "error" in inbox ? inbox.error : inbox.cursor_reset
    ? "disclosure_inbox_page_token_reset; resuming the same scan window" : null;
  const errors = [
    inboxIssue,
    "error" in delivery
      ? delivery.error
      : delivery.failed
      ? `${delivery.failed} notification attempt(s) need delivery review; automatic resend is held.`
      : null,
  ].filter(Boolean);
  const { error } = await db.from("disclosure_automation_state").update({
    last_worker_at: new Date().toISOString(),
    last_inbox_poll_at: new Date().toISOString(),
    last_inbox_error: inboxIssue,
    last_worker_error: errors.length ? errors.join(" ") : null,
  }).eq("id", true);
  if (error) {
    return new Response("Unable to save worker health", { status: 503 });
  }
  return new Response(JSON.stringify({ inbox, delivery }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

if (import.meta.main) Deno.serve(handler);
