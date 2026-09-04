import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  constantTimeBearerMatch,
  parseTicketIntakeCleanupBatch,
  processTicketIntakeCleanupClaims,
  type TicketIntakeCleanupClaim,
  TicketIntakeCleanupRequestError,
} from "../_shared/ticket-intake-draft-cleanup.ts";

const STORAGE_BUCKET = "assessment-tickets";
const MAX_REQUEST_BYTES = 1024;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: "cleanup_unavailable" });
  }
  if (
    !await constantTimeBearerMatch(
      request.headers.get("authorization"),
      serviceRoleKey,
    )
  ) {
    return jsonResponse(401, { error: "unauthorized" });
  }

  try {
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (!Number.isFinite(contentLength) || contentLength > MAX_REQUEST_BYTES) {
      throw new TicketIntakeCleanupRequestError("body_too_large", 413);
    }
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      throw new TicketIntakeCleanupRequestError("body_too_large", 413);
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new TicketIntakeCleanupRequestError("body_invalid");
    }
    const limit = parseTicketIntakeCleanupBatch(body);
    const claimId = crypto.randomUUID();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const claimResult = await supabase.rpc(
      "claim_expired_ticket_intake_drafts",
      { p_claim_id: claimId, p_limit: limit },
    );
    if (claimResult.error || !Array.isArray(claimResult.data)) {
      throw new Error("cleanup_claim_failed");
    }
    if (claimResult.data.length > limit) {
      throw new Error("cleanup_claim_overflow");
    }

    const summary = await processTicketIntakeCleanupClaims(
      claimResult.data as TicketIntakeCleanupClaim[],
      claimId,
      {
        recordTombstones: async (draftId, cleanupClaimId, pathHashes) => {
          const { data, error } = await supabase.rpc(
            "record_ticket_intake_draft_cleanup_tombstones",
            {
              p_id: draftId,
              p_claim_id: cleanupClaimId,
              p_path_hashes: pathHashes,
            },
          );
          if (error) throw new Error("cleanup_tombstone_failed");
          return data === new Set(pathHashes).size;
        },
        removeObjects: async (paths) => {
          const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(
            paths,
          );
          return { error };
        },
        finalize: async (draftId, cleanupClaimId) => {
          const { data, error } = await supabase.rpc(
            "finalize_ticket_intake_draft_cleanup",
            { p_id: draftId, p_claim_id: cleanupClaimId },
          );
          if (error) throw new Error("cleanup_finalize_failed");
          return data === true;
        },
        release: async (draftId, cleanupClaimId) => {
          const { data, error } = await supabase.rpc(
            "release_ticket_intake_draft_cleanup",
            { p_id: draftId, p_claim_id: cleanupClaimId },
          );
          if (error) throw new Error("cleanup_release_failed");
          return data === true;
        },
      },
    );

    return jsonResponse(200, summary);
  } catch (error) {
    if (error instanceof TicketIntakeCleanupRequestError) {
      return jsonResponse(error.status, { error: error.code });
    }
    return jsonResponse(500, { error: "cleanup_failed" });
  }
});
