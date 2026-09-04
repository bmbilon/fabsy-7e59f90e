export const DEFAULT_TICKET_INTAKE_CLEANUP_BATCH = 10;
export const MAX_TICKET_INTAKE_CLEANUP_BATCH = 25;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TICKET_OBJECT_SUFFIX =
  /^representation-ticket-r[1-9][0-9]*[.](?:pdf|jpg|png|webp|heic|heif)$/;

export class TicketIntakeCleanupRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export interface TicketIntakeCleanupClaim {
  draft_id: string;
  claim_id: string;
  current_path: string;
  pending_path: string | null;
}

export interface TicketIntakeObjectDeletionClaim {
  deletion_id: string;
  draft_id: string;
  claim_id: string;
  object_path: string;
}

export interface TicketIntakeCleanupSummary {
  claimed: number;
  deleted: number;
  deferred: number;
}

export interface TicketIntakeCleanupQueueLimits {
  objectDeletions: number;
  expiredDrafts: number;
  maxClaims: number;
}

export interface TicketIntakeCleanupDependencies {
  recordTombstones: (
    draftId: string,
    claimId: string,
    pathHashes: string[],
  ) => Promise<boolean>;
  removeObjects: (
    paths: string[],
  ) => Promise<{ error: unknown | null } | void>;
  finalize: (draftId: string, claimId: string) => Promise<boolean>;
  release: (draftId: string, claimId: string) => Promise<boolean>;
}

export interface TicketIntakeObjectDeletionDependencies {
  removeObjects: (
    paths: string[],
  ) => Promise<{ error: unknown | null } | void>;
  finalize: (deletionId: string, claimId: string) => Promise<boolean>;
  release: (deletionId: string, claimId: string) => Promise<boolean>;
}

export function parseTicketIntakeCleanupBatch(body: unknown): number {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new TicketIntakeCleanupRequestError("body_invalid");
  }
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some((key) => key !== "limit")) {
    throw new TicketIntakeCleanupRequestError("body_fields_invalid");
  }
  const limit = Object.hasOwn(value, "limit")
    ? value.limit
    : DEFAULT_TICKET_INTAKE_CLEANUP_BATCH;
  if (
    typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 ||
    limit > MAX_TICKET_INTAKE_CLEANUP_BATCH
  ) {
    throw new TicketIntakeCleanupRequestError("limit_invalid");
  }
  return limit;
}

export function ticketIntakeCleanupQueueLimits(
  perQueueLimit: number,
): TicketIntakeCleanupQueueLimits {
  if (
    !Number.isInteger(perQueueLimit) || perQueueLimit < 1 ||
    perQueueLimit > MAX_TICKET_INTAKE_CLEANUP_BATCH
  ) {
    throw new TicketIntakeCleanupRequestError("limit_invalid");
  }
  // Each independently bounded queue always receives capacity. A full stream
  // of superseded objects therefore cannot starve expired draft/PII cleanup.
  return {
    objectDeletions: perQueueLimit,
    expiredDrafts: perQueueLimit,
    maxClaims: perQueueLimit * 2,
  };
}

function isTicketPathForDraft(path: unknown, draftId: string): path is string {
  if (typeof path !== "string") return false;
  const prefix = `${draftId}/`;
  return path.startsWith(prefix) &&
    path.indexOf("/") === prefix.length - 1 &&
    TICKET_OBJECT_SUFFIX.test(path.slice(prefix.length));
}

export function queuedObjectPath(
  claim: TicketIntakeObjectDeletionClaim,
  expectedClaimId: string,
): string | null {
  if (
    !UUID_PATTERN.test(claim.deletion_id) ||
    !UUID_PATTERN.test(claim.draft_id) ||
    !UUID_PATTERN.test(claim.claim_id) ||
    claim.claim_id !== expectedClaimId ||
    !isTicketPathForDraft(claim.object_path, claim.draft_id)
  ) {
    return null;
  }
  return claim.object_path;
}

export function cleanupObjectPaths(
  claim: TicketIntakeCleanupClaim,
  expectedClaimId: string,
): string[] | null {
  if (
    !UUID_PATTERN.test(claim.draft_id) ||
    !UUID_PATTERN.test(claim.claim_id) ||
    claim.claim_id !== expectedClaimId ||
    !isTicketPathForDraft(claim.current_path, claim.draft_id) ||
    (claim.pending_path !== null &&
      !isTicketPathForDraft(claim.pending_path, claim.draft_id))
  ) {
    return null;
  }
  return [
    ...new Set(
      [claim.current_path, claim.pending_path].filter(
        (path): path is string => path !== null,
      ),
    ),
  ];
}

export async function cleanupPathHashes(paths: string[]): Promise<string[]> {
  const encoder = new TextEncoder();
  return await Promise.all(paths.map(async (path) => {
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(path)),
    );
    return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
  }));
}

export async function processTicketIntakeCleanupClaims(
  claims: TicketIntakeCleanupClaim[],
  expectedClaimId: string,
  dependencies: TicketIntakeCleanupDependencies,
): Promise<TicketIntakeCleanupSummary> {
  const summary: TicketIntakeCleanupSummary = {
    claimed: claims.length,
    deleted: 0,
    deferred: 0,
  };

  for (const claim of claims) {
    const paths = cleanupObjectPaths(claim, expectedClaimId);
    if (!paths) {
      // No Storage request has happened, so releasing this malformed claim is
      // safe. Do not include row identifiers or paths in the public result.
      try {
        await dependencies.release(claim.draft_id, claim.claim_id);
      } catch {
        // A retained lease is reclaimed after expiry.
      }
      summary.deferred += 1;
      continue;
    }

    try {
      if (
        !await dependencies.recordTombstones(
          claim.draft_id,
          claim.claim_id,
          await cleanupPathHashes(paths),
        )
      ) {
        summary.deferred += 1;
        continue;
      }
    } catch {
      summary.deferred += 1;
      continue;
    }

    let removed = false;
    try {
      const result = await dependencies.removeObjects(paths);
      removed = !result || !result.error;
    } catch {
      removed = false;
    }

    if (!removed) {
      // A Storage error can be outcome-ambiguous. Keep the lease so a ticket
      // submission cannot begin referencing an object that may be gone. A
      // later worker safely retries deletion after the lease expires.
      summary.deferred += 1;
      continue;
    }

    try {
      if (await dependencies.finalize(claim.draft_id, claim.claim_id)) {
        summary.deleted += 1;
      } else {
        summary.deferred += 1;
      }
    } catch {
      // Files are already absent. Retaining the lease lets a later worker
      // repeat the idempotent Storage delete before finalizing the row.
      summary.deferred += 1;
    }
  }

  return summary;
}

export async function processTicketIntakeObjectDeletionClaims(
  claims: TicketIntakeObjectDeletionClaim[],
  expectedClaimId: string,
  dependencies: TicketIntakeObjectDeletionDependencies,
): Promise<TicketIntakeCleanupSummary> {
  const summary: TicketIntakeCleanupSummary = {
    claimed: claims.length,
    deleted: 0,
    deferred: 0,
  };

  for (const claim of claims) {
    const path = queuedObjectPath(claim, expectedClaimId);
    if (!path) {
      // No Storage request has happened. Only the owner of this exact malformed
      // claim may release it for a later, well-formed retry.
      try {
        await dependencies.release(claim.deletion_id, claim.claim_id);
      } catch {
        // A retained lease is reclaimed after expiry.
      }
      summary.deferred += 1;
      continue;
    }

    let removed = false;
    try {
      const result = await dependencies.removeObjects([path]);
      removed = !result || !result.error;
    } catch {
      removed = false;
    }

    if (!removed) {
      // Storage failures are outcome-ambiguous. Keep the durable queue row and
      // lease so a later claimant repeats the idempotent exact-path deletion.
      summary.deferred += 1;
      continue;
    }

    try {
      if (await dependencies.finalize(claim.deletion_id, claim.claim_id)) {
        summary.deleted += 1;
      } else {
        summary.deferred += 1;
      }
    } catch {
      summary.deferred += 1;
    }
  }

  return summary;
}

export async function constantTimeBearerMatch(
  authorization: string | null,
  expectedSecret: string,
): Promise<boolean> {
  if (!authorization || expectedSecret.length === 0) return false;
  const encoder = new TextEncoder();
  const [actual, expected] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(authorization)),
    crypto.subtle.digest("SHA-256", encoder.encode(`Bearer ${expectedSecret}`)),
  ]);
  const actualBytes = new Uint8Array(actual);
  const expectedBytes = new Uint8Array(expected);
  let difference = 0;
  for (let index = 0; index < expectedBytes.length; index += 1) {
    difference |= actualBytes[index] ^ expectedBytes[index];
  }
  return difference === 0;
}
