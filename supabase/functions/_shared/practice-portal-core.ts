/**
 * Client portal for anderhue.ca/files (ARCHITECTURE.md 4.2). Pure handler
 * with injected dependencies: practice-portal/index.ts wires the Supabase
 * service client, and scripts/test-practice-files.mjs wires in-memory fakes.
 *
 * Every action except request_link needs a signed portal token. The token's
 * client id is the only identity ever passed to the database, and every
 * file-scoped RPC re-checks that the file belongs to that client. Raw rows
 * are mapped to client shapes with the catalog, so internal notes, staff
 * labels and review data never reach the browser.
 */
import { cleanText, validDate } from "./ltb-intake-core.ts";
import {
  areaFromParam,
  AREAS,
  clientStageLabel,
  DOCUMENT_KINDS,
  isArea,
  isTerminalStage,
  labelFor,
  matterTitle,
  outcomeDef,
  PRACTICE_AREAS,
  type PracticeArea,
  stageDef,
  UPLOAD_LIMITS,
} from "./practice-catalog.ts";
import {
  allowedOrigins,
  cleanMultiline,
  clientIp,
  corsHeaders,
  createRateLimiter,
  isBot,
  isEmail,
  isUuid,
  MESSAGES,
  parseFileSpecs,
  PRACTICE_DEFAULT_ID,
  practiceErrorCode,
  presentDocumentIds,
  readJsonBody,
  RequestError,
  type RpcCall,
  type RpcError,
  type StorageBucket,
} from "./practice-intake-core.ts";
import {
  PORTAL_SECRET_MIN_LENGTH,
  type PortalTokenClaims,
  portalTokenRevoked,
  verifyPortalToken,
} from "./practice-portal-token.ts";

export const PORTAL_MESSAGES = {
  expired: "This link has expired. Enter your email and we will send a fresh one.",
  fileNotFound: "That file could not be found.",
  documentNotFound: "That document could not be found.",
  invalidEmail: "Enter a valid email address.",
  tooManyLinks: "Too many link requests. Please try again later or call the office.",
  unavailable: "Your files are not available right now. Please try again later or call the office.",
  linkUnavailable: "We could not send a link right now. Please try again or call the office.",
  fileClosed: "This file is closed, so it cannot take new uploads. Call or email the office if you need to send something.",
  uploadLimit: "This file has reached the limit for online uploads. Email or call the office to send more documents.",
  uploadUnavailable: "Your upload could not be prepared. Please try again or call the office.",
  confirmUnavailable: "Your upload could not be confirmed. Please try again or call the office.",
  downloadUnavailable: "The download could not be started. Please try again.",
  unknownAction: "Unknown portal action.",
} as const;

/** Signed download links stay valid this long (seconds). */
export const DOWNLOAD_URL_SECONDS = 120;

// ---------------------------------------------------------------------------
// Client-facing labels
// ---------------------------------------------------------------------------

/** Key date labels shown to clients, in display order for equal dates. */
export const KEY_DATE_LABELS: readonly (readonly [string, string])[] = [
  ["noticeTerminationDate", "Earliest termination date"],
  ["hearingDate", "Hearing date"],
  ["optionDeadline", "Response deadline (estimate)"],
  ["offenceDate", "Offence date"],
  ["meetingDate", "Meeting with the prosecutor"],
  ["trialDate", "Trial date"],
  ["deadlineDate", "Deadline"],
];

/** Known key dates in date order: [{key, label, date}] with ISO YYYY-MM-DD dates. */
export function keyDateList(keyDates: unknown): { key: string; label: string; date: string }[] {
  const source = asRecord(keyDates) || {};
  return KEY_DATE_LABELS
    .map(([key, label], order) => ({ key, label, order, date: validDate(text(source[key]).slice(0, 10)) }))
    .filter((entry): entry is { key: string; label: string; order: number; date: string } => Boolean(entry.date))
    .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)
    .map(({ key, label, date }) => ({ key, label, date }));
}

export function historyLabel(area: PracticeArea, entry: Record<string, unknown>): string | null {
  switch (entry.event) {
    case "intake_received":
      return "File opened";
    case "stage_changed":
      return stageDef(area, text(entry.stage))?.clientLabel || null;
    case "client_uploaded": {
      const count = Number(entry.count);
      return Number.isInteger(count) && count > 0
        ? `You added ${count} document${count === 1 ? "" : "s"}`
        : "You added documents";
    }
    case "document_shared":
      return "New document from the practice";
    case "documents_requested":
      return "Documents requested";
    default:
      return null;
  }
}

export function documentKindLabel(area: PracticeArea, kind: string): string {
  if (!kind) return "";
  return labelFor(DOCUMENT_KINDS[area], kind) ||
    PRACTICE_AREAS.map(other => labelFor(DOCUMENT_KINDS[other], kind)).find(Boolean) || "";
}

/**
 * A download name close to the original that survives the signed URL's query
 * string: letters, digits, spaces, dots, dashes, underscores and brackets,
 * ending in the stored type's extension.
 */
export function downloadName(original: string, contentType: string): string {
  const extension = UPLOAD_LIMITS.contentTypes[contentType] || "";
  let name = cleanText(original, 200).replace(/[^\p{L}\p{N} ._()-]+/gu, "_").replace(/_{2,}/g, "_")
    .replace(/^[\s._]+/, "").trim();
  if (!name) name = "document";
  const current = (name.match(/\.([a-z0-9]{1,8})$/i)?.[1] || "").toLowerCase();
  if (extension && UPLOAD_LIMITS.extensionTypes[current] !== contentType) name = `${name}.${extension}`;
  if (name.length > 120) {
    const suffix = name.slice(name.lastIndexOf("."));
    name = `${name.slice(0, 120 - suffix.length).trim()}${suffix}`;
  }
  return name;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

const time = (value: unknown) => {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function mapPortalSession(session: Record<string, unknown>, claims: PortalTokenClaims) {
  const client = asRecord(session.client) || {};
  const practice = asRecord(session.practice) || {};
  const firstName = text(client.firstName).trim();
  const email = text(client.email);
  const displayName = [firstName, text(client.lastName).trim()].filter(Boolean).join(" ") ||
    text(client.organizationName).trim() || email;
  const files = (Array.isArray(session.files) ? session.files : [])
    .map(asRecord)
    .filter((row): row is Record<string, unknown> => Boolean(row && isArea(row.area) && isUuid(row.id)))
    .map(row => {
      const area = row.area as PracticeArea;
      const stage = text(row.stage);
      return {
        area,
        id: text(row.id).toLowerCase(),
        number: text(row.number),
        title: matterTitle(area, { issue: text(row.issue), ticket_type: text(row.ticketType), category: text(row.category) }),
        stage,
        stageLabel: clientStageLabel(area, stage),
        phase: stageDef(area, stage)?.phase || "received",
        closed: row.closed === true || isTerminalStage(area, stage),
        requestOpen: row.requestOpen === true,
        updatedAt: text(row.updatedAt) || null,
        createdAt: text(row.createdAt) || null,
      };
    });
  return {
    ok: true as const,
    client: { firstName, displayName, email },
    practice: {
      name: text(practice.name),
      displayName: text(practice.displayName) || text(practice.name),
      phone: text(practice.phone),
      publicEmail: text(practice.publicEmail),
      siteUrl: text(practice.siteUrl),
    },
    files,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
  };
}

export function mapPortalFile(area: PracticeArea, row: Record<string, unknown>) {
  const stage = text(row.stage);
  const def = stageDef(area, stage);
  const closed = isTerminalStage(area, stage);
  const outcome = text(row.outcome);
  const documents = (Array.isArray(row.documents) ? row.documents : [])
    .map(asRecord)
    .filter((doc): doc is Record<string, unknown> => Boolean(doc && isUuid(doc.id)))
    .map(doc => ({
      id: text(doc.id).toLowerCase(),
      name: text(doc.name) || "Document",
      contentType: text(doc.contentType),
      sizeBytes: Number.isFinite(Number(doc.sizeBytes)) ? Number(doc.sizeBytes) : null,
      uploadedAt: text(doc.uploadedAt) || null,
      from: doc.uploadedBy === "staff" ? "practice" as const : "you" as const,
      kindLabel: documentKindLabel(area, text(doc.kind)),
    }))
    .sort((a, b) => time(b.uploadedAt) - time(a.uploadedAt));
  const history = (Array.isArray(row.history) ? row.history : [])
    .map(asRecord)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map(entry => ({ at: text(entry.at) || null, label: historyLabel(area, entry) }))
    .filter((entry): entry is { at: string | null; label: string } => Boolean(entry.label))
    .sort((a, b) => time(b.at) - time(a.at));
  const request = asRecord(row.request);
  const requestMessage = text(request?.message).trim();
  const requestAt = text(request?.at);
  const clientUploadedAt = text(row.clientUploadedAt);
  const remaining = Math.max(0,
    UPLOAD_LIMITS.maxClientDocumentsPerFile - documents.filter(doc => doc.from === "you").length);
  const canUpload = !closed && remaining > 0;
  return {
    area,
    id: text(row.id).toLowerCase(),
    number: text(row.number),
    title: matterTitle(area, { issue: text(row.issue), ticket_type: text(row.ticketType), category: text(row.category) }),
    areaLabel: AREAS[area].clientLabel,
    stage,
    stageLabel: clientStageLabel(area, stage),
    clientNext: def?.clientNext || "",
    phase: def?.phase || "received",
    closed,
    outcomeLabel: outcome ? outcomeDef(area, outcome)?.clientLabel || null : null,
    createdAt: text(row.createdAt) || null,
    updatedAt: text(row.updatedAt) || null,
    keyDates: keyDateList(row.keyDates).map(({ label, date }) => ({ label, date })),
    request: requestMessage
      ? {
        message: requestMessage,
        at: requestAt || null,
        answered: Boolean(requestAt && clientUploadedAt && time(clientUploadedAt) > time(requestAt)),
      }
      : null,
    documents,
    history,
    canUpload,
    limits: {
      maxFiles: canUpload ? Math.min(UPLOAD_LIMITS.maxFilesPerBatch, remaining) : 0,
      maxBytes: UPLOAD_LIMITS.maxBytes,
    },
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export interface PortalHandlerDeps {
  rpc: RpcCall;
  storage: (bucket: string) => StorageBucket;
  env: (key: string) => string | undefined;
  /** Keeps background work alive after the response (EdgeRuntime.waitUntil). */
  background?: (task: Promise<unknown>) => void;
  /** Wakes the notice worker so queued emails go out before the next cron tick. */
  wakeNotices?: () => Promise<unknown>;
  randomUUID?: () => string;
  /** Milliseconds since the epoch. */
  now?: () => number;
  /** Receives codes only, never personal data. */
  log?: (...parts: string[]) => void;
}

type Session = { claims: PortalTokenClaims; session: Record<string, unknown> };

export function createPortalHandler(deps: PortalHandlerDeps): (req: Request) => Promise<Response> {
  const now = deps.now || (() => Date.now());
  const log = deps.log || ((...parts: string[]) => console.error(...parts));
  const randomUUID = deps.randomUUID || (() => crypto.randomUUID());
  const linkLimiter = createRateLimiter(5, 3_600_000);

  const wake = () => {
    if (!deps.background || !deps.wakeNotices) return;
    deps.background(Promise.resolve().then(deps.wakeNotices).catch(() => log("practice-portal wake failed")));
  };

  const failure = (step: string, error: RpcError, fallback: string, status = 503): RequestError => {
    const code = practiceErrorCode(error);
    if (code === "PRACTICE_CASE_NOT_FOUND") return new RequestError(PORTAL_MESSAGES.fileNotFound, 404);
    if (code === "PRACTICE_DOCUMENT_NOT_FOUND") return new RequestError(PORTAL_MESSAGES.documentNotFound, 404);
    if (code === "PRACTICE_FILE_CLOSED") return new RequestError(PORTAL_MESSAGES.fileClosed, 403);
    if (code === "PRACTICE_UPLOAD_LIMIT") return new RequestError(PORTAL_MESSAGES.uploadLimit, 422);
    if (code === "PRACTICE_DOCUMENT_INVALID") return new RequestError(MESSAGES.fileRules, 400);
    log(`practice-portal ${step} failed`, error?.code || "unknown", code || "");
    return new RequestError(fallback, status);
  };

  async function authorize(body: Record<string, unknown>): Promise<Session> {
    const secret = deps.env("PRACTICE_PORTAL_SIGNING_SECRET") || "";
    if (secret.length < PORTAL_SECRET_MIN_LENGTH) {
      log("practice-portal configuration missing", "signing_secret");
      throw new RequestError(PORTAL_MESSAGES.unavailable, 503);
    }
    const claims = await verifyPortalToken(secret, body.token, now());
    if (!claims) throw new RequestError(PORTAL_MESSAGES.expired, 401);
    const { data, error } = await deps.rpc("practice_portal_session", { p_client_id: claims.clientId });
    if (error) throw failure("session", error, PORTAL_MESSAGES.unavailable);
    const session = asRecord(data);
    const sessionClient = asRecord(session?.client);
    if (!session || portalTokenRevoked(claims, session.revokedBefore) ||
        (sessionClient?.id && text(sessionClient.id).toLowerCase() !== claims.clientId)) {
      throw new RequestError(PORTAL_MESSAGES.expired, 401);
    }
    return { claims, session };
  }

  function fileRef(body: Record<string, unknown>): { area: PracticeArea; id: string } {
    const area = areaFromParam(typeof body.area === "string" ? body.area : "");
    if (!area || !isUuid(body.id)) throw new RequestError(PORTAL_MESSAGES.fileNotFound, 404);
    return { area, id: body.id.toLowerCase() };
  }

  async function requestLink(body: Record<string, unknown>, req: Request) {
    const practiceId = cleanText(body.practiceId, 60) || PRACTICE_DEFAULT_ID;
    if (!/^[a-z0-9-]{3,60}$/.test(practiceId)) throw new RequestError(MESSAGES.unknownPractice);
    // Bots get the same answer as everyone else and nothing is queued.
    if (isBot(body)) return { ok: true };
    const email = cleanText(body.email, 254).toLowerCase();
    if (!isEmail(email)) throw new RequestError(PORTAL_MESSAGES.invalidEmail, 422);
    if (!linkLimiter(`link:${clientIp(req)}`, now())) throw new RequestError(PORTAL_MESSAGES.tooManyLinks, 429);
    const { data, error } = await deps.rpc("practice_request_portal_link", { p_practice_id: practiceId, p_email: email });
    if (error) throw failure("request_link", error, PORTAL_MESSAGES.linkUnavailable);
    if (data === true) wake();
    // Never reveal whether the email has a file with the practice.
    return { ok: true };
  }

  async function file(body: Record<string, unknown>) {
    const { claims } = await authorize(body);
    const { area, id } = fileRef(body);
    const { data, error } = await deps.rpc("practice_portal_file", {
      p_client_id: claims.clientId, p_area: area, p_case_id: id,
    });
    if (error) throw failure("file", error, PORTAL_MESSAGES.unavailable);
    const row = asRecord(data);
    if (!row || (row.area !== undefined && row.area !== area) || (row.id !== undefined && text(row.id).toLowerCase() !== id)) {
      throw new RequestError(PORTAL_MESSAGES.fileNotFound, 404);
    }
    return { ok: true, file: mapPortalFile(area, { ...row, id }) };
  }

  async function download(body: Record<string, unknown>) {
    const { claims } = await authorize(body);
    const { area, id } = fileRef(body);
    if (!isUuid(body.documentId)) throw new RequestError(PORTAL_MESSAGES.documentNotFound, 404);
    const { data, error } = await deps.rpc("practice_portal_document", {
      p_client_id: claims.clientId, p_area: area, p_case_id: id, p_document_id: body.documentId.toLowerCase(),
    });
    if (error) throw failure("download", error, PORTAL_MESSAGES.downloadUnavailable);
    const row = asRecord(Array.isArray(data) ? data[0] : data);
    const bucket = text(row?.bucket);
    const path = text(row?.storage_path);
    // The object must sit in this area's bucket, inside this file's folder.
    if (!row || bucket !== AREAS[area].bucket || !path.toLowerCase().startsWith(`${id}/`)) {
      throw new RequestError(PORTAL_MESSAGES.documentNotFound, 404);
    }
    const original = text(row.original_name);
    const name = downloadName(original, text(row.content_type));
    const { data: signed, error: signError } = await deps.storage(bucket).createSignedUrl(
      path, DOWNLOAD_URL_SECONDS, { download: name });
    if (signError || !signed?.signedUrl) {
      log("practice-portal download signing failed", "storage");
      throw new RequestError(PORTAL_MESSAGES.downloadUnavailable, 503);
    }
    return { ok: true, url: signed.signedUrl, name: original || name };
  }

  async function prepareUpload(body: Record<string, unknown>) {
    const { claims } = await authorize(body);
    const { area, id } = fileRef(body);
    const files = parseFileSpecs(body.files, { required: true });
    const documents = files.map((file, index) => ({
      id: randomUUID().toLowerCase(), extension: file.extension, contentType: file.contentType,
      size: file.size, name: file.name, index,
    }));
    const { data, error } = await deps.rpc("practice_portal_register_uploads", {
      p_client_id: claims.clientId, p_area: area, p_case_id: id,
      p_documents: documents.map(({ index: _index, ...doc }) => doc),
    });
    if (error) throw failure("prepare_upload", error, PORTAL_MESSAGES.uploadUnavailable);
    const bucket = AREAS[area].bucket;
    const uploads: { documentId: string; index: number; signedUrl: string; contentType: string }[] = [];
    for (const [position, raw] of (Array.isArray(data) ? data : []).entries()) {
      const slot = asRecord(raw);
      const documentId = text(slot?.documentId).toLowerCase();
      const storagePath = text(slot?.storagePath);
      const doc = documents.find(item => item.id === documentId) || documents[position];
      if (!slot || !doc || !isUuid(documentId) || text(slot.bucket) !== bucket ||
          !storagePath.toLowerCase().startsWith(`${id}/${documentId}.`)) {
        log("practice-portal prepare_upload unexpected slot", "shape");
        continue;
      }
      const { data: signed, error: signError } = await deps.storage(bucket).createSignedUploadUrl(storagePath);
      if (signError || !signed?.signedUrl) {
        log("practice-portal prepare_upload signing failed", "storage");
        continue;
      }
      uploads.push({ documentId, index: doc.index, signedUrl: signed.signedUrl, contentType: doc.contentType });
    }
    if (!uploads.length) throw new RequestError(PORTAL_MESSAGES.uploadUnavailable, 503);
    return { ok: true, uploads };
  }

  async function confirmUpload(body: Record<string, unknown>) {
    const { claims } = await authorize(body);
    const { area, id } = fileRef(body);
    const claimed = [...new Set((Array.isArray(body.documentIds) ? body.documentIds : [])
      .filter(isUuid).map(value => value.toLowerCase()))].slice(0, UPLOAD_LIMITS.maxClientDocumentsPerFile);
    if (!claimed.length) return { ok: true, received: 0 };
    const bucket = AREAS[area].bucket;
    // Trust storage, not the browser, for which files actually arrived.
    const { data: objects, error: listError } = await deps.storage(bucket).list(id, { limit: 1000 });
    if (listError) {
      log("practice-portal confirm_upload listing failed", "storage");
      throw new RequestError(PORTAL_MESSAGES.confirmUnavailable, 503);
    }
    const present = presentDocumentIds(objects);
    const confirmed = claimed.filter(documentId => present.has(documentId));
    if (!confirmed.length) return { ok: true, received: 0 };
    const note = cleanMultiline(body.note, 1000);
    const { data, error } = await deps.rpc("practice_portal_confirm_uploads", {
      p_client_id: claims.clientId, p_area: area, p_case_id: id, p_document_ids: confirmed, p_note: note || null,
    });
    if (error) throw failure("confirm_upload", error, PORTAL_MESSAGES.confirmUnavailable);
    wake();
    return { ok: true, received: typeof data === "number" && Number.isInteger(data) ? data : confirmed.length };
  }

  return async function handler(req: Request): Promise<Response> {
    const origin = req.headers.get("origin");
    const headers = corsHeaders(origin, allowedOrigins(deps.env("PRACTICE_ALLOWED_ORIGINS")));
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (req.method === "OPTIONS") {
      return new Response(null, { status: headers["Access-Control-Allow-Origin"] ? 204 : 403, headers });
    }
    if (req.method !== "POST") return json({ error: MESSAGES.usePost }, 405);
    if (origin && !headers["Access-Control-Allow-Origin"]) return json({ error: MESSAGES.originNotAllowed }, 403);
    try {
      const body = await readJsonBody(req);
      switch (body.action) {
        case "request_link":
          return json(await requestLink(body, req));
        case "session": {
          const { claims, session } = await authorize(body);
          return json(mapPortalSession(session, claims));
        }
        case "file":
          return json(await file(body));
        case "download":
          return json(await download(body));
        case "prepare_upload":
          return json(await prepareUpload(body));
        case "confirm_upload":
          return json(await confirmUpload(body));
        default:
          throw new RequestError(PORTAL_MESSAGES.unknownAction);
      }
    } catch (error) {
      if (error instanceof RequestError) return json({ error: error.message }, error.status);
      log("practice-portal error", error instanceof Error ? error.name : "unknown");
      return json({ error: MESSAGES.unexpected }, 503);
    }
  };
}
