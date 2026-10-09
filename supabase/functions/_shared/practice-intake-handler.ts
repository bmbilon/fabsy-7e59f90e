/**
 * Public intake for traffic tickets and other matters on anderhue.ca
 * (ARCHITECTURE.md 4.1). Pure handler with injected dependencies:
 * practice-intake/index.ts wires the Supabase service client, and
 * scripts/test-practice-files.mjs wires in-memory fakes.
 *
 * submit   -> registers or reuses the client, opens a matter, returns one-time
 *             private upload URLs (bucket practice-documents).
 * finalize -> confirms which uploads landed (from storage, not the browser)
 *             and, for traffic files with uploads, starts the ticket reader.
 *
 * The browser only ever holds a random intake token; its SHA-256 hash
 * authorizes finalize for that one matter.
 */
import { AREAS } from "./practice-catalog.ts";
import {
  allowedOrigins,
  corsHeaders,
  documentPath,
  intakeRecord,
  isUuid,
  MESSAGES,
  parsePracticeSubmission,
  practiceErrorCode,
  presentDocumentIds,
  RATE_LIMITS,
  rateLimitAllows,
  readJsonBody,
  requestAddress,
  RequestError,
  type RpcCall,
  type StorageBucket,
} from "./practice-intake-core.ts";

export const PRACTICE_DOCUMENTS_BUCKET = AREAS.traffic.bucket;

export const INTAKE_MESSAGES = {
  tooMany: "Too many submissions. Please try again later or call the office.",
  notOpened: "Your file could not be opened. Please try again or call the office.",
  unauthorized: "Your upload could not be confirmed. Please call the office.",
  notConfirmed: "Your upload could not be confirmed. Please try again in a moment.",
  unknownAction: "Unknown intake action.",
} as const;

export interface IntakeHandlerDeps {
  rpc: RpcCall;
  storage: (bucket: string) => StorageBucket;
  env: (key: string) => string | undefined;
  /** Keeps background work alive after the response (EdgeRuntime.waitUntil). */
  background?: (task: Promise<unknown>) => void;
  /** Reads the uploaded ticket images of a traffic matter (process-practice-intake.ts). */
  startReader?: (matterId: string) => Promise<unknown>;
  /** Wakes the notice worker so queued emails go out before the next cron tick. */
  wakeNotices?: () => Promise<unknown>;
  randomUUID?: () => string;
  /** 64 hex characters. */
  randomToken?: () => string;
  now?: () => Date;
  /** Receives codes only, never personal data. */
  log?: (...parts: string[]) => void;
}

const encoder = new TextEncoder();

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export function randomHexToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32))).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export function createIntakeHandler(deps: IntakeHandlerDeps): (req: Request) => Promise<Response> {
  const log = deps.log || ((...parts: string[]) => console.error(...parts));
  const randomUUID = deps.randomUUID || (() => crypto.randomUUID());
  const randomToken = deps.randomToken || randomHexToken;
  const now = deps.now || (() => new Date());
  const limits = { rpc: deps.rpc, env: deps.env, log };

  const later = (task: () => Promise<unknown>, label: string) => {
    if (!deps.background) return;
    deps.background(Promise.resolve().then(task).catch(() => log(`practice-intake ${label} failed`)));
  };
  const wake = () => {
    if (deps.wakeNotices) later(deps.wakeNotices, "wake");
  };

  async function submit(input: Record<string, unknown>, req: Request) {
    const submission = parsePracticeSubmission(input, now());
    // Bots get an ordinary-looking receipt and nothing is stored.
    if (submission.bot) return { ok: true, matterId: null, matterNumber: null, intakeToken: null, uploads: [] };
    if (!await rateLimitAllows(limits, RATE_LIMITS.intakeAddress, requestAddress(req))) {
      throw new RequestError(INTAKE_MESSAGES.tooMany, 429);
    }
    const intakeToken = randomToken();
    const documents = submission.files.map((file, index) => ({
      id: randomUUID().toLowerCase(), extension: file.extension, contentType: file.contentType,
      size: file.size, name: file.name, index,
    }));
    const { data, error } = await deps.rpc("practice_register_intake", {
      p_practice_id: submission.practiceId,
      p_area: submission.area,
      p_intake: intakeRecord(submission, req.headers.get("user-agent") || ""),
      p_token_hash: await sha256Hex(intakeToken),
      p_documents: documents.map(({ index: _index, ...doc }) => doc),
    });
    const row = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
    const matterId = typeof row?.matter_id === "string" ? row.matter_id.toLowerCase() : "";
    if (error || !isUuid(matterId)) {
      const code = practiceErrorCode(error);
      log("practice_register_intake failed", error?.code || "no_row", code || "");
      // The parser should already have caught these; answer plainly if the SQL disagrees.
      if (code === "PRACTICE_PRACTICE_UNKNOWN") throw new RequestError(MESSAGES.unknownPractice);
      if (code === "PRACTICE_EMAIL_INVALID") throw new RequestError("Check these fields: email.", 422);
      if (code === "PRACTICE_DOCUMENT_INVALID") throw new RequestError(MESSAGES.fileRules);
      if (code === "PRACTICE_UPLOAD_LIMIT") throw new RequestError(MESSAGES.tooManyFiles);
      throw new RequestError(INTAKE_MESSAGES.notOpened, 503);
    }
    const uploads: { documentId: string; index: number; path: string; signedUrl: string; contentType: string }[] = [];
    for (const doc of documents) {
      const path = documentPath(matterId, doc.id, doc.extension);
      const { data: signed, error: signError } = await deps.storage(PRACTICE_DOCUMENTS_BUCKET).createSignedUploadUrl(path);
      if (!signError && signed?.signedUrl) {
        uploads.push({ documentId: doc.id, index: doc.index, path, signedUrl: signed.signedUrl, contentType: doc.contentType });
      } else {
        log("practice-intake upload signing failed", "storage");
      }
    }
    // Without documents the file is finalized at once, so its emails are queued now.
    if (!documents.length) wake();
    return { ok: true, matterId, matterNumber: row?.matter_number ?? null, intakeToken, uploads };
  }

  async function finalize(input: Record<string, unknown>) {
    if (!isUuid(input.matterId) || typeof input.intakeToken !== "string" || !/^[a-f0-9]{64}$/.test(input.intakeToken)) {
      throw new RequestError(INTAKE_MESSAGES.unauthorized, 403);
    }
    const matterId = input.matterId.toLowerCase();
    const claimed = [...new Set((Array.isArray(input.uploaded) ? input.uploaded : [])
      .filter(isUuid).map(id => id.toLowerCase()))].slice(0, 6);
    // Trust storage, not the browser, for which files actually arrived.
    const { data: objects, error: listError } = await deps.storage(PRACTICE_DOCUMENTS_BUCKET).list(matterId, { limit: 100 });
    if (listError) {
      // Finalizing now would record the uploads as missing; let the browser retry.
      log("practice-intake finalize listing failed", "storage");
      throw new RequestError(INTAKE_MESSAGES.notConfirmed, 503);
    }
    const present = presentDocumentIds(objects);
    const confirmed = claimed.filter(id => present.has(id));
    const { data: status, error } = await deps.rpc("practice_finalize_intake", {
      p_matter_id: matterId, p_token_hash: await sha256Hex(input.intakeToken), p_uploaded: confirmed,
    });
    if (error) {
      log("practice_finalize_intake failed", error.code || "unknown");
      throw new RequestError(INTAKE_MESSAGES.unauthorized, 403);
    }
    // Only traffic files with uploads wait for the reader; general files go straight to review.
    if (status === "pending_scan" && deps.startReader) {
      const startReader = deps.startReader;
      later(() => startReader(matterId), "reader");
    } else {
      wake();
    }
    return { ok: true, received: confirmed.length };
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
      const input = await readJsonBody(req);
      if (input.action === "submit") return json(await submit(input, req));
      if (input.action === "finalize") return json(await finalize(input));
      throw new RequestError(INTAKE_MESSAGES.unknownAction);
    } catch (error) {
      if (error instanceof RequestError) return json({ error: error.message }, error.status);
      log("practice-intake error", error instanceof Error ? error.name : "unknown");
      return json({ error: MESSAGES.unexpected }, 503);
    }
  };
}
