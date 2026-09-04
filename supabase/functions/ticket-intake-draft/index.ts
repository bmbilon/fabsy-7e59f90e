import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  LocaleRequestError,
  requireReleasedServiceLocale,
} from "../_shared/locale-policy.ts";
import {
  assertAllowedKeys,
  createDraftAccessToken,
  discardedPendingObjectForCleanup,
  draftCapabilityWasRotated,
  draftContactChangeRequiresCapabilityRotation,
  DraftRequestError,
  draftStoragePath,
  draftUploadVerificationTarget,
  isAllowedTicketIntakeOrigin,
  MAX_TICKET_FILE_BYTES,
  mergeDraftContact,
  parseDraftAccessToken,
  parseDraftContact,
  parseDraftStep,
  parseJsonBody,
  parseOptionalDraftId,
  parsePreferredDraftLocale,
  parseRevision,
  parseTicketFileMetadata,
  requestAddress,
  requestFingerprint,
  resolveDraftReplacementAccessToken,
  sanitizeDraftData,
  sha256Hex,
  storageObjectMatches,
  syncContactIntoDraftData,
  ticketIntakeResponseHeaders,
} from "../_shared/ticket-intake-draft.ts";
import {
  deliverTicketIntakeResume,
  MAX_RESUME_DELIVERY_ATTEMPTS,
  preserveConfirmedDraftOnDeliveryFailure,
  publicResumeDeliveryState,
  type ResumeDeliveryChannel,
  resumeDeliveryEnabled,
  type ResumeDeliveryFailureCode,
  type ResumeDeliveryStatus,
  safeResumeDeliveryAttempt,
} from "../_shared/ticket-intake-resume-delivery.ts";

const STORAGE_BUCKET = "assessment-tickets";
const FUNCTION_ALLOWED_ORIGINS =
  Deno.env.get("TICKET_INTAKE_ALLOWED_ORIGINS") || "";

type JsonRecord = Record<string, unknown>;
type DraftRow = {
  id: string;
  access_token_hash: string;
  email: string | null;
  phone: string | null;
  preferred_locale: string;
  alberta_confirmed: boolean;
  contact_permission: boolean;
  draft_data: JsonRecord;
  current_step: number;
  completed_step: number;
  revision: number;
  status: "active" | "converted" | "expired";
  ticket_document_path: string;
  ticket_document_content_type: string;
  ticket_document_size_bytes: number;
  ticket_uploaded_at: string | null;
  pending_ticket_document_path: string | null;
  pending_ticket_document_content_type: string | null;
  pending_ticket_document_size_bytes: number | null;
  converted_submission_id: string | null;
  client_id: string | null;
  expires_at: string;
  resume_delivery_status: ResumeDeliveryStatus;
  resume_delivery_generation: number;
  resume_delivery_channel: ResumeDeliveryChannel | null;
  resume_delivery_claim_id: string | null;
  resume_delivery_claimed_at: string | null;
  resume_delivery_claim_expires_at: string | null;
  resume_delivery_attempted_at: string | null;
  resume_delivery_sent_at: string | null;
  resume_delivery_failed_at: string | null;
  resume_delivery_attempt_count: number;
  resume_delivery_lifetime_attempt_count: number;
  resume_delivery_failure_code: ResumeDeliveryFailureCode | null;
};

type AdminDatabase = {
  public: {
    Tables: {
      ticket_intake_drafts: {
        Row: DraftRow;
        Insert: Partial<DraftRow>;
        Update: Partial<DraftRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_ticket_intake_draft: {
        Args: {
          p_id: string;
          p_access_token_hash: string;
          p_request_fingerprint: string;
          p_email: string | null;
          p_phone: string | null;
          p_preferred_locale: string;
          p_draft_data: JsonRecord;
          p_current_step: number;
          p_completed_step: number;
          p_ticket_document_path: string;
          p_ticket_document_content_type: string;
          p_ticket_document_size_bytes: number;
        };
        Returns: DraftRow;
      };
      save_ticket_intake_draft: {
        Args: {
          p_id: string;
          p_access_token_hash: string;
          p_expected_revision: number;
          p_email: string | null;
          p_phone: string | null;
          p_current_step: number;
          p_completed_step: number;
          p_draft_data: JsonRecord;
          p_replacement_access_token_hash: string | null;
        };
        Returns: DraftRow;
      };
      prepare_ticket_intake_draft_upload: {
        Args: {
          p_id: string;
          p_access_token_hash: string;
          p_expected_revision: number;
          p_ticket_document_path: string;
          p_ticket_document_content_type: string;
          p_ticket_document_size_bytes: number;
        };
        Returns: DraftRow;
      };
      confirm_ticket_intake_draft_upload: {
        Args: {
          p_id: string;
          p_access_token_hash: string;
          p_expected_revision: number;
        };
        Returns: DraftRow;
      };
      claim_ticket_intake_resume_delivery: {
        Args: {
          p_id: string;
          p_access_token_hash: string;
          p_claim_id: string;
          p_retry: boolean;
        };
        Returns: DraftRow;
      };
      complete_ticket_intake_resume_delivery: {
        Args: {
          p_id: string;
          p_claim_id: string;
          p_outcome: "sent" | "failed" | "indeterminate";
          p_failure_code: ResumeDeliveryFailureCode | null;
        };
        Returns: DraftRow;
      };
      consume_ticket_intake_resume_action_limit: {
        Args: { p_request_fingerprint: string };
        Returns: boolean;
      };
      discard_pending_ticket_intake_draft_upload: {
        Args: {
          p_id: string;
          p_access_token_hash: string;
          p_expected_revision: number;
        };
        Returns: DraftRow;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
type SupabaseAdmin = ReturnType<typeof createClient<AdminDatabase>>;

class DraftStateError extends DraftRequestError {}

function json(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: ticketIntakeResponseHeaders(origin, FUNCTION_ALLOWED_ORIGINS),
  });
}

function rowFromResult(value: unknown): DraftRow {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Draft operation returned no record.");
  }
  return candidate as DraftRow;
}

function responseForDraft(row: DraftRow) {
  return {
    success: true,
    draftId: row.id,
    revision: Number(row.revision),
    contact: { email: row.email || "", phone: row.phone || "" },
    albertaConfirmed: row.alberta_confirmed,
    contactPermission: row.contact_permission,
    preferredLocale: row.preferred_locale,
    currentStep: row.current_step,
    completedStep: row.completed_step,
    draftData: row.draft_data || {},
    ticketDocumentPath: row.ticket_document_path,
    ticketUploadedAt: row.ticket_uploaded_at,
    hasPendingTicketUpload: Boolean(row.pending_ticket_document_path),
    status: row.status,
    expiresAt: row.expires_at,
    convertedSubmissionId: row.converted_submission_id,
    clientId: row.client_id,
    resumeDelivery: publicResumeDeliveryState(
      row,
      row.status === "active" && resumeDeliveryEnabled(
        Deno.env.get("TICKET_INTAKE_RESUME_DELIVERY_ENABLED"),
      ),
    ),
  };
}

function mapDatabaseFailure(error: { message?: string } | null) {
  if (error?.message?.includes("TICKET_INTAKE_CREATE_RATE_LIMIT")) {
    throw new DraftStateError(
      "Too many saved intakes. Please try again later.",
      429,
      "draft_create_rate_limit",
    );
  }
  if (error?.message?.includes("TICKET_INTAKE_RESUME_ACTION_RATE_LIMIT")) {
    throw new DraftStateError(
      "Too many resume-link changes. Please try again later.",
      429,
      "draft_resume_action_rate_limit",
    );
  }
  if (error?.message?.includes("TICKET_INTAKE_REVISION_CONFLICT")) {
    throw new DraftStateError(
      "This saved intake changed in another tab. Reload it before saving again.",
      409,
      "draft_revision_conflict",
    );
  }
  if (
    error?.message?.includes("TICKET_INTAKE_REPLACEMENT_CAPABILITY_INVALID")
  ) {
    throw new DraftStateError(
      "Reload this page before changing resume-link contact details.",
      409,
      "draft_rotation_requires_reload",
    );
  }
  if (error?.message?.includes("TICKET_INTAKE_DELIVERY_NOT_READY")) {
    throw new DraftStateError(
      "Upload the ticket before sending a resume link.",
      409,
      "draft_delivery_not_ready",
    );
  }
  if (error?.message?.includes("TICKET_INTAKE_DELIVERY_ACCESS_DENIED")) {
    throw new DraftStateError(
      "This saved intake is not available.",
      404,
      "draft_not_found",
    );
  }
  if (
    error?.message?.includes("TICKET_INTAKE_PENDING_UPLOAD_NOT_DISCARDABLE")
  ) {
    throw new DraftStateError(
      "There is no confirmed ticket to keep.",
      409,
      "draft_pending_upload_not_discardable",
    );
  }
  throw new Error("Draft database operation failed.");
}

async function activeDraft(
  admin: SupabaseAdmin,
  body: JsonRecord,
): Promise<{ row: DraftRow; accessToken: string; accessTokenHash: string }> {
  const accessToken = parseDraftAccessToken(body.accessToken);
  const draftId = parseOptionalDraftId(body.draftId);
  const accessTokenHash = await sha256Hex(accessToken);
  let query = admin
    .from("ticket_intake_drafts")
    .select(
      "id,access_token_hash,email,phone,preferred_locale,alberta_confirmed,contact_permission,draft_data,current_step,completed_step,revision,status,ticket_document_path,ticket_document_content_type,ticket_document_size_bytes,ticket_uploaded_at,pending_ticket_document_path,pending_ticket_document_content_type,pending_ticket_document_size_bytes,converted_submission_id,client_id,expires_at,resume_delivery_status,resume_delivery_generation,resume_delivery_channel,resume_delivery_claim_id,resume_delivery_claimed_at,resume_delivery_claim_expires_at,resume_delivery_attempted_at,resume_delivery_sent_at,resume_delivery_failed_at,resume_delivery_attempt_count,resume_delivery_lifetime_attempt_count,resume_delivery_failure_code",
    )
    .eq("access_token_hash", accessTokenHash);
  if (draftId) query = query.eq("id", draftId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("Draft lookup failed.");
  if (!data) {
    throw new DraftStateError(
      "This saved intake is not available.",
      404,
      "draft_not_found",
    );
  }
  const row = data as DraftRow;
  if (Date.parse(row.expires_at) <= Date.now()) {
    if (row.status === "active") {
      await admin.from("ticket_intake_drafts").update({ status: "expired" })
        .eq("id", row.id).eq("status", "active");
    }
    throw new DraftStateError(
      "This saved intake has expired.",
      410,
      "draft_expired",
    );
  }
  if (row.status === "expired") {
    throw new DraftStateError(
      "This saved intake has expired.",
      410,
      "draft_expired",
    );
  }
  return { row, accessToken, accessTokenHash };
}

async function activeDraftForSave(
  admin: SupabaseAdmin,
  body: JsonRecord,
): Promise<{
  row: DraftRow;
  accessTokenHash: string;
  replacementAccessTokenHash: string | null;
  replacementClientRetained: boolean;
}> {
  const accessToken = parseDraftAccessToken(body.accessToken);
  const replacement = resolveDraftReplacementAccessToken(
    body.replacementAccessToken,
    accessToken,
  );
  const accessTokenHash = await sha256Hex(accessToken);
  const replacementAccessTokenHash = replacement.clientRetained
    ? await sha256Hex(replacement.accessToken)
    : null;

  try {
    const { row } = await activeDraft(admin, body);
    return {
      row,
      accessTokenHash,
      replacementAccessTokenHash,
      replacementClientRetained: replacement.clientRetained,
    };
  } catch (error) {
    if (
      !(error instanceof DraftStateError) || error.code !== "draft_not_found"
    ) {
      throw error;
    }
    if (!replacement.clientRetained) throw error;
  }

  // A lost response may follow an atomic rotation. The old capability is
  // already revoked, so authenticate the exact client-retained candidate and
  // let the RPC verify an unchanged replay of expected revision + 1.
  const { row } = await activeDraft(admin, {
    ...body,
    accessToken: replacement.accessToken,
  });
  return {
    row,
    accessTokenHash,
    replacementAccessTokenHash,
    replacementClientRetained: true,
  };
}

function requireMutable(row: DraftRow) {
  if (row.status !== "active") {
    throw new DraftStateError(
      "This intake has already been submitted.",
      409,
      "draft_already_converted",
    );
  }
}

async function signedUpload(
  admin: SupabaseAdmin,
  row: DraftRow,
) {
  const { data, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(row.ticket_document_path, { upsert: false });
  if (error || !data?.token) {
    throw new Error("Private ticket upload could not be prepared.");
  }
  return {
    bucket: STORAGE_BUCKET,
    path: row.ticket_document_path,
    token: data.token,
    contentType: row.ticket_document_content_type,
    maxBytes: MAX_TICKET_FILE_BYTES,
  };
}

async function removeStorageObjectsBestEffort(
  admin: SupabaseAdmin,
  paths: string[],
) {
  if (!paths.length) return;
  try {
    await admin.storage.from(STORAGE_BUCKET).remove(paths);
  } catch {
    // Never expose or log private object paths. Every path passed here was
    // durably queued by the same database transaction that moved its reference,
    // so the scheduled cleanup worker will retry this exact path.
  }
}

async function completeResumeDelivery(
  admin: SupabaseAdmin,
  row: DraftRow,
  claimId: string,
  outcome: "sent" | "failed" | "indeterminate",
  failureCode: ResumeDeliveryFailureCode | null,
) {
  const { data, error } = await admin.rpc(
    "complete_ticket_intake_resume_delivery",
    {
      p_id: row.id,
      p_claim_id: claimId,
      p_outcome: outcome,
      p_failure_code: failureCode,
    },
  );
  if (error) mapDatabaseFailure(error);
  return rowFromResult(data);
}

async function attemptResumeDelivery(
  admin: SupabaseAdmin,
  row: DraftRow,
  accessToken: string,
  accessTokenHash: string,
  retry: boolean,
): Promise<DraftRow> {
  const deliveryEnabled = resumeDeliveryEnabled(
    Deno.env.get("TICKET_INTAKE_RESUME_DELIVERY_ENABLED"),
  );
  if (!deliveryEnabled) return row;

  const claimId = crypto.randomUUID();
  const { data, error } = await admin.rpc(
    "claim_ticket_intake_resume_delivery",
    {
      p_id: row.id,
      p_access_token_hash: accessTokenHash,
      p_claim_id: claimId,
      p_retry: retry,
    },
  );
  if (error) mapDatabaseFailure(error);
  const claimed = rowFromResult(data);
  if (
    claimed.resume_delivery_status !== "sending" ||
    claimed.resume_delivery_claim_id !== claimId
  ) {
    return claimed;
  }

  const recipient = claimed.resume_delivery_channel === "email"
    ? claimed.email
    : claimed.phone;
  if (!recipient || !claimed.resume_delivery_channel) {
    try {
      return await completeResumeDelivery(
        admin,
        claimed,
        claimId,
        "failed",
        "configuration_missing",
      );
    } catch {
      return claimed;
    }
  }
  const attempt = await safeResumeDeliveryAttempt(() =>
    deliverTicketIntakeResume({
      draftId: claimed.id,
      accessToken,
      generation: claimed.resume_delivery_generation,
      channel: claimed.resume_delivery_channel!,
      recipient,
      preferredLocale: claimed.preferred_locale as Parameters<
        typeof deliverTicketIntakeResume
      >[0]["preferredLocale"],
      configuration: {
        siteUrl: Deno.env.get("SITE_URL"),
        resendApiKey: Deno.env.get("RESEND_API_KEY"),
        resendFrom: Deno.env.get("TICKET_INTAKE_RESUME_FROM_EMAIL"),
        resendReplyTo: Deno.env.get("TICKET_INTAKE_RESUME_REPLY_TO"),
        twilioAccountSid: Deno.env.get("TWILIO_ACCOUNT_SID"),
        twilioAuthToken: Deno.env.get("TWILIO_AUTH_TOKEN"),
        twilioPhoneNumber: Deno.env.get("TWILIO_PHONE_NUMBER"),
      },
    })
  );
  try {
    return await completeResumeDelivery(
      admin,
      claimed,
      claimId,
      attempt.outcome,
      attempt.failureCode,
    );
  } catch {
    return claimed;
  }
}

async function safeAttemptResumeDelivery(
  admin: SupabaseAdmin,
  row: DraftRow,
  accessToken: string,
  accessTokenHash: string,
  retry: boolean,
) {
  return await preserveConfirmedDraftOnDeliveryFailure(
    row,
    () =>
      attemptResumeDelivery(
        admin,
        row,
        accessToken,
        accessTokenHash,
        retry,
      ),
  );
}

async function consumeResumeActionLimit(
  admin: SupabaseAdmin,
  serviceRoleKey: string,
  req: Request,
) {
  const fingerprint = await requestFingerprint(
    serviceRoleKey,
    `resume:${requestAddress(req)}`,
  );
  const { data, error } = await admin.rpc(
    "consume_ticket_intake_resume_action_limit",
    { p_request_fingerprint: fingerprint },
  );
  if (error) mapDatabaseFailure(error);
  if (data !== true) throw new Error("Resume action limit was not recorded.");
}

async function createDraft(
  admin: SupabaseAdmin,
  body: JsonRecord,
  serviceRoleKey: string,
  req: Request,
) {
  assertAllowedKeys(body, [
    "action",
    "contact",
    "albertaConfirmed",
    "contactPermission",
    "preferredLocale",
    "currentStep",
    "completedStep",
    "draftData",
    "file",
  ]);
  if (body.albertaConfirmed !== true) {
    throw new DraftRequestError(
      "Confirm that this is an Alberta ticket before saving.",
    );
  }
  if (body.contactPermission !== true) {
    throw new DraftRequestError(
      "Permission to contact you about this intake is required before saving.",
    );
  }
  const contact = parseDraftContact(body.contact);
  const locale = parsePreferredDraftLocale(body.preferredLocale);
  requireReleasedServiceLocale(
    locale,
    Deno.env.get("FABSY_LIVE_SERVICE_LOCALES"),
    Deno.env.get("FABSY_REVIEWED_SERVICE_LOCALES"),
  );
  const currentStep = body.currentStep === undefined
    ? 1
    : parseDraftStep(body.currentStep, "currentStep");
  const completedStep = body.completedStep === undefined
    ? 0
    : parseDraftStep(body.completedStep, "completedStep");
  const draftData = syncContactIntoDraftData(
    sanitizeDraftData(body.draftData),
    contact,
  );
  const file = parseTicketFileMetadata(body.file);
  const id = crypto.randomUUID();
  const accessToken = createDraftAccessToken();
  const accessTokenHash = await sha256Hex(accessToken);
  const fingerprint = await requestFingerprint(
    serviceRoleKey,
    requestAddress(req),
  );
  const path = draftStoragePath(id, 1, file.extension);

  const { data, error } = await admin.rpc("create_ticket_intake_draft", {
    p_id: id,
    p_access_token_hash: accessTokenHash,
    p_request_fingerprint: fingerprint,
    p_email: contact.email,
    p_phone: contact.phone,
    p_preferred_locale: locale,
    p_draft_data: draftData,
    p_current_step: currentStep,
    p_completed_step: completedStep,
    p_ticket_document_path: path,
    p_ticket_document_content_type: file.contentType,
    p_ticket_document_size_bytes: file.size,
  });
  if (error) mapDatabaseFailure(error);
  const row = rowFromResult(data);
  try {
    return {
      ...responseForDraft(row),
      accessToken,
      upload: await signedUpload(admin, row),
    };
  } catch (error) {
    await admin.from("ticket_intake_drafts").delete().eq("id", row.id).eq(
      "status",
      "active",
    );
    throw error;
  }
}

async function readDraft(admin: SupabaseAdmin, body: JsonRecord) {
  assertAllowedKeys(body, ["action", "draftId", "accessToken"]);
  const { row } = await activeDraft(admin, body);
  return responseForDraft(row);
}

async function saveDraft(
  admin: SupabaseAdmin,
  body: JsonRecord,
  serviceRoleKey: string,
  req: Request,
) {
  assertAllowedKeys(body, [
    "action",
    "draftId",
    "accessToken",
    "revision",
    "currentStep",
    "completedStep",
    "draftData",
    "replacementAccessToken",
  ]);
  const {
    row,
    accessTokenHash,
    replacementAccessTokenHash,
    replacementClientRetained,
  } = await activeDraftForSave(admin, body);
  requireMutable(row);
  const revision = parseRevision(body.revision);
  const currentStep = parseDraftStep(body.currentStep, "currentStep");
  const completedStep = parseDraftStep(body.completedStep, "completedStep");
  const draftData = sanitizeDraftData(body.draftData);
  const contact = mergeDraftContact(
    { email: row.email, phone: row.phone },
    draftData,
  );
  const contactChangeRequiresRotation =
    draftContactChangeRequiresCapabilityRotation(
      { email: row.email, phone: row.phone },
      contact,
      {
        status: row.resume_delivery_status,
        attemptCount: row.resume_delivery_attempt_count,
      },
    );
  if (!replacementClientRetained && contactChangeRequiresRotation) {
    throw new DraftStateError(
      "Reload this page before changing resume-link contact details.",
      409,
      "draft_rotation_requires_reload",
    );
  }
  if (contactChangeRequiresRotation) {
    await consumeResumeActionLimit(admin, serviceRoleKey, req);
  }
  const synchronizedDraft = syncContactIntoDraftData(draftData, contact);
  const { data, error } = await admin.rpc("save_ticket_intake_draft", {
    p_id: row.id,
    p_access_token_hash: accessTokenHash,
    p_expected_revision: revision,
    p_email: contact.email,
    p_phone: contact.phone,
    p_current_step: currentStep,
    p_completed_step: completedStep,
    p_draft_data: synchronizedDraft,
    p_replacement_access_token_hash: replacementAccessTokenHash,
  });
  if (error) mapDatabaseFailure(error);
  const saved = rowFromResult(data);
  const capabilityRotated = draftCapabilityWasRotated(
    accessTokenHash,
    saved.access_token_hash,
    replacementAccessTokenHash || "",
  );
  return {
    ...responseForDraft(saved),
    ...(capabilityRotated ? { capabilityRotated: true } : {}),
  };
}

async function prepareUpload(admin: SupabaseAdmin, body: JsonRecord) {
  assertAllowedKeys(body, [
    "action",
    "draftId",
    "accessToken",
    "revision",
    "file",
  ]);
  const { row, accessTokenHash } = await activeDraft(admin, body);
  requireMutable(row);
  const revision = parseRevision(body.revision);
  const file = parseTicketFileMetadata(body.file);
  const path = draftStoragePath(row.id, revision + 1, file.extension);
  const candidate = {
    ...row,
    ticket_document_path: path,
    ticket_document_content_type: file.contentType,
    ticket_document_size_bytes: file.size,
  };
  const upload = await signedUpload(admin, candidate);
  const { data, error } = await admin.rpc(
    "prepare_ticket_intake_draft_upload",
    {
      p_id: row.id,
      p_access_token_hash: accessTokenHash,
      p_expected_revision: revision,
      p_ticket_document_path: path,
      p_ticket_document_content_type: file.contentType,
      p_ticket_document_size_bytes: file.size,
    },
  );
  if (error) mapDatabaseFailure(error);
  const prepared = rowFromResult(data);
  const obsoletePath = row.pending_ticket_document_path ||
    (!row.ticket_uploaded_at ? row.ticket_document_path : null);
  if (obsoletePath && obsoletePath !== path) {
    await removeStorageObjectsBestEffort(admin, [obsoletePath]);
  }
  return { ...responseForDraft(prepared), upload };
}

async function discardPendingUpload(admin: SupabaseAdmin, body: JsonRecord) {
  assertAllowedKeys(body, ["action", "draftId", "accessToken", "revision"]);
  const { row, accessTokenHash } = await activeDraft(admin, body);
  requireMutable(row);
  const revision = parseRevision(body.revision);
  if (!row.pending_ticket_document_path) return responseForDraft(row);
  const pendingPath = row.pending_ticket_document_path;
  const { data, error } = await admin.rpc(
    "discard_pending_ticket_intake_draft_upload",
    {
      p_id: row.id,
      p_access_token_hash: accessTokenHash,
      p_expected_revision: revision,
    },
  );
  if (error) mapDatabaseFailure(error);
  const discarded = rowFromResult(data);
  const cleanupPath = discardedPendingObjectForCleanup(pendingPath, discarded);
  if (cleanupPath) await removeStorageObjectsBestEffort(admin, [cleanupPath]);
  return responseForDraft(discarded);
}

async function confirmUpload(admin: SupabaseAdmin, body: JsonRecord) {
  assertAllowedKeys(body, ["action", "draftId", "accessToken", "revision"]);
  const { row, accessToken, accessTokenHash } = await activeDraft(admin, body);
  requireMutable(row);
  const revision = body.revision === undefined
    ? row.revision
    : parseRevision(body.revision);
  if (row.ticket_uploaded_at && !row.pending_ticket_document_path) {
    const delivered = await safeAttemptResumeDelivery(
      admin,
      row,
      accessToken,
      accessTokenHash,
      false,
    );
    return responseForDraft(delivered);
  }
  if (revision !== Number(row.revision)) {
    throw new DraftStateError(
      "This saved intake changed in another tab. Reload it before confirming the upload.",
      409,
      "draft_revision_conflict",
    );
  }
  const target = draftUploadVerificationTarget(row);
  const slash = target.path.indexOf("/");
  const folder = target.path.slice(0, slash);
  const filename = target.path.slice(slash + 1);
  if (folder !== row.id || !filename) {
    throw new Error("Stored ticket path is invalid.");
  }
  const { data: objects, error: listError } = await admin.storage
    .from(STORAGE_BUCKET)
    .list(folder, { limit: 20, search: filename });
  if (listError) {
    throw new Error("Private ticket upload could not be verified.");
  }
  const object = objects?.find((candidate) => candidate.name === filename);
  const metadata = object?.metadata as
    | { mimetype?: unknown; size?: unknown }
    | undefined;
  if (
    !storageObjectMatches(
      {
        contentType: target.contentType,
        size: target.size,
      },
      metadata,
    )
  ) {
    throw new DraftStateError(
      "The ticket upload is missing or does not match the selected file. Upload it again.",
      422,
      "draft_upload_unverified",
    );
  }

  const { data, error } = await admin.rpc(
    "confirm_ticket_intake_draft_upload",
    {
      p_id: row.id,
      p_access_token_hash: accessTokenHash,
      p_expected_revision: revision,
    },
  );
  if (error) mapDatabaseFailure(error);
  const confirmed = rowFromResult(data);
  if (
    target.replacement &&
    row.ticket_document_path !== confirmed.ticket_document_path
  ) {
    await removeStorageObjectsBestEffort(admin, [row.ticket_document_path]);
  }
  const delivered = await safeAttemptResumeDelivery(
    admin,
    confirmed,
    accessToken,
    accessTokenHash,
    false,
  );
  return responseForDraft(delivered);
}

async function retryResumeDelivery(
  admin: SupabaseAdmin,
  body: JsonRecord,
  serviceRoleKey: string,
  req: Request,
) {
  assertAllowedKeys(body, ["action", "draftId", "accessToken"]);
  const { row, accessToken, accessTokenHash } = await activeDraft(admin, body);
  requireMutable(row);
  if (!row.ticket_uploaded_at) {
    throw new DraftStateError(
      "Upload the ticket before sending a resume link.",
      409,
      "draft_delivery_not_ready",
    );
  }
  const automaticEnabled = resumeDeliveryEnabled(
    Deno.env.get("TICKET_INTAKE_RESUME_DELIVERY_ENABLED"),
  );
  const retryFailure = row.resume_delivery_status === "failed" &&
    row.resume_delivery_attempt_count < MAX_RESUME_DELIVERY_ATTEMPTS &&
    row.resume_delivery_lifetime_attempt_count < MAX_RESUME_DELIVERY_ATTEMPTS;
  const sendPending = row.resume_delivery_status === "pending" &&
    row.resume_delivery_lifetime_attempt_count < MAX_RESUME_DELIVERY_ATTEMPTS;
  if (!automaticEnabled || (!retryFailure && !sendPending)) {
    throw new DraftStateError(
      "This resume delivery cannot be retried.",
      409,
      "draft_delivery_not_retryable",
    );
  }
  await consumeResumeActionLimit(admin, serviceRoleKey, req);
  const delivered = await safeAttemptResumeDelivery(
    admin,
    row,
    accessToken,
    accessTokenHash,
    retryFailure,
  );
  return responseForDraft(delivered);
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (!isAllowedTicketIntakeOrigin(origin, FUNCTION_ALLOWED_ORIGINS)) {
    return json(origin, {
      success: false,
      error: "Origin is not allowed.",
      code: "origin_denied",
    }, 403);
  }
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: ticketIntakeResponseHeaders(origin, FUNCTION_ALLOWED_ORIGINS),
    });
  }
  if (req.method !== "POST") {
    return json(origin, { success: false, error: "Method not allowed." }, 405);
  }

  try {
    const suppliedLength = Number(req.headers.get("content-length") || 0);
    if (Number.isFinite(suppliedLength) && suppliedLength > 64 * 1024) {
      throw new DraftRequestError(
        "The draft request is too large.",
        413,
        "draft_request_too_large",
      );
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Draft service configuration is incomplete.");
    }
    const body = parseJsonBody(await req.text());
    if (typeof body.action !== "string") {
      throw new DraftRequestError("action is required.");
    }
    const admin = createClient<AdminDatabase>(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const result = body.action === "create"
      ? await createDraft(admin, body, serviceRoleKey, req)
      : body.action === "read"
      ? await readDraft(admin, body)
      : body.action === "save"
      ? await saveDraft(admin, body, serviceRoleKey, req)
      : body.action === "prepare_upload"
      ? await prepareUpload(admin, body)
      : body.action === "confirm_upload"
      ? await confirmUpload(admin, body)
      : body.action === "discard_pending_upload"
      ? await discardPendingUpload(admin, body)
      : body.action === "retry_delivery"
      ? await retryResumeDelivery(admin, body, serviceRoleKey, req)
      : (() => {
        throw new DraftRequestError("action is invalid.");
      })();
    return json(origin, result);
  } catch (error) {
    const status =
      error instanceof DraftRequestError || error instanceof LocaleRequestError
        ? error.status
        : 500;
    if (status >= 500) console.error("ticket-intake-draft failed");
    return json(origin, {
      success: false,
      error: status >= 500
        ? "Your saved intake could not be updated."
        : (error as Error).message,
      ...(error instanceof DraftRequestError ||
          error instanceof LocaleRequestError
        ? { code: error.code }
        : {}),
    }, status);
  }
});
