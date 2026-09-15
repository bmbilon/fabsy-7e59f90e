// deno-lint-ignore-file no-import-prefix
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  type PortalActivityEvent,
  sendPortalActivityEmail,
} from "../_shared/portal-activity-email.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

async function secretMatches(received: string, expected: string) {
  if (!received || !expected) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(received)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let mismatch = a.length ^ b.length;
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    mismatch |= a[index] ^ b[index];
  }
  return mismatch === 0;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)),
    );
  }
  return btoa(binary);
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (
    !await secretMatches(
      req.headers.get("x-cron-secret") || "",
      Deno.env.get("IDR_CRON_SECRET") || "",
    )
  ) {
    return json({ error: "Unauthorized." }, 401);
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url, options) =>
          fetch(url, { ...options, signal: AbortSignal.timeout(20_000) }),
      },
    },
  );
  const { data, error } = await db.rpc("claim_portal_activity_events", {
    p_limit: 10,
  });
  if (error) {
    return json({ error: "Portal activity queue is unavailable." }, 503);
  }

  const siteUrl = Deno.env.get("SITE_URL") || "https://fabsy.ca";
  let sent = 0;
  let failed = 0;

  for (const row of (data || []) as PortalActivityEvent[]) {
    try {
      const attachments: Array<{ filename: string; content: string }> = [];
      if (row.event_type === "representation_consent_signed") {
        const path = typeof row.payload?.consent_form_path === "string"
          ? row.payload.consent_form_path
          : "";
        const submissionId = typeof row.payload?.submission_id === "string"
          ? row.payload.submission_id
          : "";
        const legacyInviteId = typeof row.payload?.legacy_invite_id === "string"
          ? row.payload.legacy_invite_id
          : "";
        const currentSubmissionPath = Boolean(
          submissionId && path.startsWith(`${submissionId}/`),
        );
        const legacyInvitePath = Boolean(
          legacyInviteId && row.entity_id === legacyInviteId &&
            path.startsWith(`standalone/${legacyInviteId}/`) &&
            path.endsWith("/signed-consent.pdf"),
        );
        if (
          (!currentSubmissionPath && !legacyInvitePath) || path.includes("..")
        ) {
          throw new Error("The queued consent attachment path is invalid.");
        }
        const { data: consent, error: downloadError } = await db.storage.from(
          "consent-forms",
        ).download(path);
        if (downloadError || !consent) {
          throw downloadError ||
            new Error("The signed consent PDF is unavailable.");
        }
        attachments.push({
          filename: `Fabsy-signed-consent-${
            submissionId || legacyInviteId
          }.pdf`,
          content: arrayBufferToBase64(await consent.arrayBuffer()),
        });
      }
      const providerId = await sendPortalActivityEmail(
        row,
        siteUrl,
        attachments,
      );
      const { data: completed, error: completionError } = await db.rpc(
        "complete_portal_activity_event",
        {
          p_id: row.id,
          p_claim:
            (row as PortalActivityEvent & { claim_token: string }).claim_token,
          p_provider_id: providerId,
          p_error: null,
        },
      );
      if (completionError || completed !== true) {
        throw completionError ||
          new Error("Portal activity lease was lost after email acceptance.");
      }
      sent++;
    } catch (caught) {
      failed++;
      const message = caught instanceof Error
        ? caught.message
        : "Portal activity delivery failed.";
      await db.rpc("complete_portal_activity_event", {
        p_id: row.id,
        p_claim:
          (row as PortalActivityEvent & { claim_token: string }).claim_token,
        p_provider_id: null,
        p_error: message.slice(0, 500),
      });
    }
  }

  await db.from("portal_activity_state").update({
    last_worker_at: new Date().toISOString(),
    last_worker_error: failed
      ? `${failed} portal alert(s) failed; retry is queued.`
      : null,
  }).eq("id", true);
  return json(
    { claimed: (data || []).length, sent, failed },
    failed ? 207 : 200,
  );
}

if (import.meta.main) Deno.serve(handler);
