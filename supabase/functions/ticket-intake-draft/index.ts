import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  LocaleRequestError,
  requireReleasedServiceLocale,
} from "../_shared/locale-policy.ts";
import {
  assertAllowedKeys,
  createDraftAccessToken,
  DraftRequestError,
  draftStoragePath,
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
  sanitizeDraftData,
  sha256Hex,
  storageObjectMatches,
  syncContactIntoDraftData,
  ticketIntakeResponseHeaders,
} from "../_shared/ticket-intake-draft.ts";

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
  converted_submission_id: string | null;
  client_id: string | null;
  expires_at: string;
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
    status: row.status,
    expiresAt: row.expires_at,
    convertedSubmissionId: row.converted_submission_id,
    clientId: row.client_id,
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
  if (error?.message?.includes("TICKET_INTAKE_REVISION_CONFLICT")) {
    throw new DraftStateError(
      "This saved intake changed in another tab. Reload it before saving again.",
      409,
      "draft_revision_conflict",
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
      "id,access_token_hash,email,phone,preferred_locale,alberta_confirmed,contact_permission,draft_data,current_step,completed_step,revision,status,ticket_document_path,ticket_document_content_type,ticket_document_size_bytes,ticket_uploaded_at,converted_submission_id,client_id,expires_at",
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

async function saveDraft(admin: SupabaseAdmin, body: JsonRecord) {
  assertAllowedKeys(body, [
    "action",
    "draftId",
    "accessToken",
    "revision",
    "currentStep",
    "completedStep",
    "draftData",
  ]);
  const { row, accessTokenHash } = await activeDraft(admin, body);
  requireMutable(row);
  const revision = parseRevision(body.revision);
  const currentStep = parseDraftStep(body.currentStep, "currentStep");
  const completedStep = parseDraftStep(body.completedStep, "completedStep");
  const draftData = sanitizeDraftData(body.draftData);
  const contact = mergeDraftContact(
    { email: row.email, phone: row.phone },
    draftData,
  );
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
  });
  if (error) mapDatabaseFailure(error);
  return responseForDraft(rowFromResult(data));
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
  if (row.ticket_document_path !== prepared.ticket_document_path) {
    const { error: cleanupError } = await admin.storage.from(STORAGE_BUCKET)
      .remove([row.ticket_document_path]);
    if (cleanupError) {
      // Cleanup is best effort; the old path is no longer accepted by this draft.
    }
  }
  return { ...responseForDraft(prepared), upload };
}

async function confirmUpload(admin: SupabaseAdmin, body: JsonRecord) {
  assertAllowedKeys(body, ["action", "draftId", "accessToken", "revision"]);
  const { row, accessTokenHash } = await activeDraft(admin, body);
  requireMutable(row);
  const revision = body.revision === undefined
    ? row.revision
    : parseRevision(body.revision);
  if (revision !== Number(row.revision)) {
    throw new DraftStateError(
      "This saved intake changed in another tab. Reload it before confirming the upload.",
      409,
      "draft_revision_conflict",
    );
  }
  if (row.ticket_uploaded_at) return responseForDraft(row);

  const slash = row.ticket_document_path.indexOf("/");
  const folder = row.ticket_document_path.slice(0, slash);
  const filename = row.ticket_document_path.slice(slash + 1);
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
        contentType: row.ticket_document_content_type,
        size: row.ticket_document_size_bytes,
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
  return responseForDraft(rowFromResult(data));
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
      ? await saveDraft(admin, body)
      : body.action === "prepare_upload"
      ? await prepareUpload(admin, body)
      : body.action === "confirm_upload"
      ? await confirmUpload(admin, body)
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
