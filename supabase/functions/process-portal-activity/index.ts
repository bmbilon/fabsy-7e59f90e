// deno-lint-ignore-file no-import-prefix
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  consentTicketReference,
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

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type ActivityDatabase = SupabaseClient;

async function consentAttachment(
  db: ActivityDatabase,
  bucket: string,
  path: string,
  filename: string,
  expectedHash?: string,
) {
  const { data, error } = await db.storage.from(bucket).download(path);
  if (error || !data) throw new Error("consent_attachment_unavailable");
  const bytes = await data.arrayBuffer();
  if (
    !bytes.byteLength || bytes.byteLength > 10 * 1024 * 1024 ||
    new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
  ) throw new Error("consent_attachment_invalid");
  if (expectedHash !== undefined) {
    if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
      throw new Error("consent_attachment_hash_required");
    }
    const digest = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((byte) => byte.toString(16).padStart(2, "0")).join("");
    if (digest !== expectedHash) {
      throw new Error("consent_attachment_hash_mismatch");
    }
  }
  return { filename, content: arrayBufferToBase64(bytes) };
}

/** Resolve only consent events against their current private source before sending. */
export async function preparePortalConsentEmail(
  db: ActivityDatabase,
  row: PortalActivityEvent,
) {
  if (!row.entity_id || !UUID.test(row.entity_id)) {
    throw new Error("consent_source_invalid");
  }
  if (row.entity_type === "ticket_submission") {
    const { data: ticket, error } = await db.from("ticket_submissions")
      .select(
        "id,first_name,last_name,email,ticket_number,consent_form_path,service_type,deleted_at,intake_mode,intake_review_status",
      )
      .eq("id", row.entity_id).maybeSingle();
    if (
      error || !ticket || ticket.deleted_at ||
      ticket.service_type !== "representation" ||
      (ticket.intake_mode === "photo_only" &&
        ["pending_scan", "scanning"].includes(ticket.intake_review_status))
    ) throw new Error("consent_source_not_ready");
    const ticketNumber = consentTicketReference(ticket.ticket_number);
    const path = typeof ticket.consent_form_path === "string"
      ? ticket.consent_form_path
      : "";
    if (
      !path.startsWith(`${row.entity_id}/`) || !path.endsWith(".pdf") ||
      /[\\%\x00-\x1f]/.test(path) || path.includes("..") ||
      row.payload.submission_id !== row.entity_id ||
      row.payload.consent_form_path !== path
    ) throw new Error("consent_attachment_path_mismatch");
    const attachment = await consentAttachment(
      db,
      "consent-forms",
      path,
      `Fabsy-consent-${ticketNumber}.pdf`,
    );
    return {
      event: {
        ...row,
        payload: {
          ...row.payload,
          client_name: [ticket.first_name, ticket.last_name].filter(Boolean)
            .join(" "),
          client_email: ticket.email,
          ticket_number: ticketNumber,
          ticket_numbers: [ticketNumber],
          submission_id: ticket.id,
          signature_method: "electronic",
          consent_form_path: path,
        },
      },
      attachments: [attachment],
    };
  }
  if (row.entity_type !== "representation_consent_invite") {
    throw new Error("consent_source_invalid");
  }
  const { data: invite, error } = await db.from(
    "representation_consent_invites",
  )
    .select(
      "id,status,access_revoked_at,ticket_submission_id,client_legal_name,client_email,ticket_number,ticket_numbers,signature_method,pdf_path,pdf_sha256,manual_scan_pdf_path,manual_scan_pdf_sha256,signed_client_date_of_birth,disclosure_lookup_type,disclosure_lookup_value",
    )
    .eq("id", row.entity_id).maybeSingle();
  if (
    error || !invite || invite.status !== "completed" ||
    invite.access_revoked_at || row.payload.legacy_invite_id !== invite.id
  ) throw new Error("consent_source_not_ready");
  const ticketNumber = consentTicketReference(invite.ticket_number);
  const ticketNumbers =
    Array.isArray(invite.ticket_numbers) && invite.ticket_numbers.length
      ? [...new Set(invite.ticket_numbers.map(consentTicketReference))]
      : [ticketNumber];
  if (!ticketNumbers.includes(ticketNumber)) {
    throw new Error("consent_ticket_reference_mismatch");
  }
  const path = typeof invite.pdf_path === "string" ? invite.pdf_path : "";
  const parts = path.split("/");
  if (
    parts.length !== 4 || parts[0] !== "standalone" || parts[1] !== invite.id ||
    !UUID.test(parts[2]) ||
    parts[3] !== "signed-consent.pdf" || row.payload.consent_form_path !== path
  ) throw new Error("consent_attachment_path_mismatch");
  const attachments = [
    await consentAttachment(
      db,
      "consent-forms",
      path,
      `Fabsy-consent-audit-${ticketNumber}.pdf`,
      String(invite.pdf_sha256 || ""),
    ),
  ];
  if (invite.signature_method === "manual_scan") {
    const scanPath = `manual/${invite.id}/${parts[2]}/signed-scan.pdf`;
    if (invite.manual_scan_pdf_path !== scanPath) {
      throw new Error("consent_scan_path_mismatch");
    }
    attachments.unshift(
      await consentAttachment(
        db,
        "representation-consent-scans",
        scanPath,
        `Fabsy-signed-consent-${ticketNumber}.pdf`,
        String(invite.manual_scan_pdf_sha256 || ""),
      ),
    );
  } else if (invite.signature_method !== "typed") {
    throw new Error("consent_signature_method_invalid");
  }
  return {
    event: {
      ...row,
      payload: {
        ...row.payload,
        client_name: invite.client_legal_name,
        client_email: invite.client_email,
        ticket_number: ticketNumber,
        ticket_numbers: ticketNumbers,
        submission_id: invite.ticket_submission_id,
        signature_method: invite.signature_method,
        client_date_of_birth: invite.signed_client_date_of_birth,
        disclosure_lookup_type: invite.disclosure_lookup_type,
        disclosure_lookup_value: invite.disclosure_lookup_value,
        consent_form_path: path,
      },
    },
    attachments,
  };
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
  let held = 0;

  for (const row of (data || []) as PortalActivityEvent[]) {
    let consentProviderStarted = false;
    let providerId: string | null = null;
    const claim =
      (row as PortalActivityEvent & { claim_token: string }).claim_token;
    try {
      const prepared = row.event_type === "representation_consent_signed"
        ? await preparePortalConsentEmail(db, row)
        : { event: row, attachments: [] };
      if (row.event_type === "representation_consent_signed") {
        // A persisted marker fences an interrupted Gmail attempt. The claimant
        // holds an expired marked consent lease for review instead of resending.
        const { data: marked, error: markError } = await db.from(
          "portal_activity_events",
        )
          .update({ last_error: "consent_provider_request_started" })
          .eq("id", row.id).eq("claim_token", claim).eq("status", "processing")
          .select("id").maybeSingle();
        if (markError || !marked) {
          throw new Error("consent_delivery_reservation_failed");
        }
        consentProviderStarted = true;
      }
      providerId = await sendPortalActivityEmail(
        prepared.event,
        siteUrl,
        prepared.attachments,
      );
      const { data: completed, error: completionError } = await db.rpc(
        "complete_portal_activity_event",
        {
          p_id: row.id,
          p_claim: claim,
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
      if (consentProviderStarted) {
        held++;
        // A timeout can follow provider acceptance. Preserve known acceptance
        // evidence and never route this consent attempt into automatic retries.
        await db.from("portal_activity_events").update({
          status: "needs_review",
          claim_token: null,
          lease_until: null,
          last_error: providerId
            ? "consent_delivery_recording_failed"
            : "consent_delivery_uncertain",
          ...(providerId
            ? {
              provider_email_id: providerId,
              sent_at: new Date().toISOString(),
            }
            : {}),
        }).eq("id", row.id).eq("claim_token", claim).eq("status", "processing");
        continue;
      }
      await db.rpc("complete_portal_activity_event", {
        p_id: row.id,
        p_claim: claim,
        p_provider_id: null,
        p_error: message.slice(0, 500),
      });
    }
  }

  await db.from("portal_activity_state").update({
    last_worker_at: new Date().toISOString(),
    last_worker_error: failed
      ? `${failed} portal alert(s) failed; ${held} consent attempt(s) held for delivery review.`
      : null,
  }).eq("id", true);
  return json(
    { claimed: (data || []).length, sent, failed, held },
    failed ? 207 : 200,
  );
}

if (import.meta.main) Deno.serve(handler);
