import {
  assert,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  cleanupObjectPaths,
  cleanupPathHashes,
  constantTimeBearerMatch,
  parseTicketIntakeCleanupBatch,
  processTicketIntakeCleanupClaims,
  processTicketIntakeObjectDeletionClaims,
  queuedObjectPath,
  type TicketIntakeCleanupClaim,
  ticketIntakeCleanupQueueLimits,
  TicketIntakeCleanupRequestError,
  type TicketIntakeObjectDeletionClaim,
} from "./ticket-intake-draft-cleanup.ts";

const DRAFT_ID = "00000000-0000-4000-8000-000000000501";
const CLAIM_ID = "00000000-0000-4000-8000-000000000601";
const CURRENT = `${DRAFT_ID}/representation-ticket-r1.pdf`;
const PENDING = `${DRAFT_ID}/representation-ticket-r2.jpg`;
const DELETION_ID = "00000000-0000-4000-8000-000000000701";

function claim(
  overrides: Partial<TicketIntakeCleanupClaim> = {},
): TicketIntakeCleanupClaim {
  return {
    draft_id: DRAFT_ID,
    claim_id: CLAIM_ID,
    current_path: CURRENT,
    pending_path: PENDING,
    ...overrides,
  };
}

function objectClaim(
  overrides: Partial<TicketIntakeObjectDeletionClaim> = {},
): TicketIntakeObjectDeletionClaim {
  return {
    deletion_id: DELETION_ID,
    draft_id: DRAFT_ID,
    claim_id: CLAIM_ID,
    object_path: CURRENT,
    ...overrides,
  };
}

Deno.test("cleanup batch is defaulted and bounded to 25", () => {
  assertEquals(parseTicketIntakeCleanupBatch({}), 10);
  assertEquals(parseTicketIntakeCleanupBatch({ limit: 25 }), 25);
  for (const value of [0, 26, 1.5, "10", null]) {
    assertThrows(
      () => parseTicketIntakeCleanupBatch({ limit: value }),
      TicketIntakeCleanupRequestError,
    );
  }
  assertThrows(
    () => parseTicketIntakeCleanupBatch({ limit: 1, contact: "secret" }),
    TicketIntakeCleanupRequestError,
  );
});

Deno.test("both queues retain bounded capacity when either queue is full", () => {
  assertEquals(ticketIntakeCleanupQueueLimits(25), {
    objectDeletions: 25,
    expiredDrafts: 25,
    maxClaims: 50,
  });
  assertEquals(ticketIntakeCleanupQueueLimits(1), {
    objectDeletions: 1,
    expiredDrafts: 1,
    maxClaims: 2,
  });
});

Deno.test("cleanup accepts only exact current and pending draft object paths", () => {
  assertEquals(cleanupObjectPaths(claim(), CLAIM_ID), [CURRENT, PENDING]);
  assertEquals(
    cleanupObjectPaths(claim({ pending_path: CURRENT }), CLAIM_ID),
    [CURRENT],
  );
  assertEquals(
    cleanupObjectPaths(
      claim({ current_path: `${DRAFT_ID}/other.pdf` }),
      CLAIM_ID,
    ),
    null,
  );
  assertEquals(
    cleanupObjectPaths(
      claim({ pending_path: `different/${PENDING}` }),
      CLAIM_ID,
    ),
    null,
  );
  assertEquals(
    cleanupObjectPaths(claim(), "00000000-0000-4000-8000-000000000699"),
    null,
  );
});

Deno.test("queued deletion accepts only its exact claimed draft object path", () => {
  assertEquals(queuedObjectPath(objectClaim(), CLAIM_ID), CURRENT);
  assertEquals(
    queuedObjectPath(
      objectClaim({ object_path: `${DRAFT_ID}/unbounded-private.pdf` }),
      CLAIM_ID,
    ),
    null,
  );
  assertEquals(
    queuedObjectPath(
      objectClaim({ deletion_id: "not-a-uuid" }),
      CLAIM_ID,
    ),
    null,
  );
  assertEquals(
    queuedObjectPath(
      objectClaim(),
      "00000000-0000-4000-8000-000000000699",
    ),
    null,
  );
});

Deno.test("known-path Storage failure stays queued and a later retry finalizes", async () => {
  const events: string[] = [];
  let storageAttempts = 0;
  let finalized = 0;
  let released = 0;
  const dependencies = {
    removeObjects: async (paths: string[]) => {
      storageAttempts += 1;
      events.push(`remove:${storageAttempts}`);
      assertEquals(paths, [CURRENT]);
      return {
        error: storageAttempts === 1
          ? new Error("ambiguous storage failure")
          : null,
      };
    },
    finalize: async () => {
      finalized += 1;
      events.push("finalize");
      return true;
    },
    release: async () => {
      released += 1;
      return true;
    },
  };

  const first = await processTicketIntakeObjectDeletionClaims(
    [objectClaim()],
    CLAIM_ID,
    dependencies,
  );
  assertEquals(first, { claimed: 1, deleted: 0, deferred: 1 });
  assertEquals(finalized, 0);
  assertEquals(released, 0);

  const nextClaimId = "00000000-0000-4000-8000-000000000602";
  const retry = await processTicketIntakeObjectDeletionClaims(
    [objectClaim({ claim_id: nextClaimId })],
    nextClaimId,
    dependencies,
  );
  assertEquals(retry, { claimed: 1, deleted: 1, deferred: 0 });
  assertEquals(events, ["remove:1", "remove:2", "finalize"]);
  assertEquals(finalized, 1);
  assertEquals(released, 0);
});

Deno.test("malformed known-path claim releases without a Storage call", async () => {
  let removed = false;
  let released = false;
  const result = await processTicketIntakeObjectDeletionClaims(
    [objectClaim({ object_path: "unexpected/private-ticket.pdf" })],
    CLAIM_ID,
    {
      removeObjects: async () => {
        removed = true;
      },
      finalize: async () => true,
      release: async (deletionId, claimId) => {
        assertEquals(deletionId, DELETION_ID);
        assertEquals(claimId, CLAIM_ID);
        released = true;
        return true;
      },
    },
  );
  assert(!removed);
  assert(released);
  assertEquals(result, { claimed: 1, deleted: 0, deferred: 1 });
});

Deno.test("Storage objects are removed before database finalization", async () => {
  const events: string[] = [];
  const result = await processTicketIntakeCleanupClaims([claim()], CLAIM_ID, {
    recordTombstones: async (_draftId, _claimId, hashes) => {
      events.push(`tombstone:${hashes.length}`);
      assertEquals(hashes, await cleanupPathHashes([CURRENT, PENDING]));
      return true;
    },
    removeObjects: async (paths) => {
      events.push(`remove:${paths.length}`);
      assertEquals(paths, [CURRENT, PENDING]);
      return { error: null };
    },
    finalize: async () => {
      events.push("finalize");
      return true;
    },
    release: async () => {
      events.push("release");
      return true;
    },
  });
  assertEquals(events, ["tombstone:2", "remove:2", "finalize"]);
  assertEquals(result, { claimed: 1, deleted: 1, deferred: 0 });
  assertEquals(Object.keys(result).sort(), ["claimed", "deferred", "deleted"]);
});

Deno.test("ambiguous Storage failures retain the lease and never finalize", async () => {
  for (const failure of ["returned", "thrown"] as const) {
    let finalized = false;
    let released = false;
    const result = await processTicketIntakeCleanupClaims(
      [claim()],
      CLAIM_ID,
      {
        recordTombstones: async () => true,
        removeObjects: async () => {
          if (failure === "thrown") throw new Error("network");
          return { error: new Error("storage") };
        },
        finalize: async () => {
          finalized = true;
          return true;
        },
        release: async () => {
          released = true;
          return true;
        },
      },
    );
    assert(!finalized);
    assert(!released);
    assertEquals(result, { claimed: 1, deleted: 0, deferred: 1 });
  }
});

Deno.test("tombstone failure prevents any Storage mutation", async () => {
  let removed = false;
  let finalized = false;
  const result = await processTicketIntakeCleanupClaims(
    [claim()],
    CLAIM_ID,
    {
      recordTombstones: async () => false,
      removeObjects: async () => {
        removed = true;
      },
      finalize: async () => {
        finalized = true;
        return true;
      },
      release: async () => true,
    },
  );
  assert(!removed);
  assert(!finalized);
  assertEquals(result, { claimed: 1, deleted: 0, deferred: 1 });
});

Deno.test("finalize loss remains retryable after idempotent object deletion", async () => {
  let removeCount = 0;
  const result = await processTicketIntakeCleanupClaims(
    [claim()],
    CLAIM_ID,
    {
      recordTombstones: async () => true,
      removeObjects: async () => {
        removeCount += 1;
        return { error: null };
      },
      finalize: async () => false,
      release: async () => true,
    },
  );
  assertEquals(removeCount, 1);
  assertEquals(result, { claimed: 1, deleted: 0, deferred: 1 });
});

Deno.test("malformed claim data is released without touching Storage", async () => {
  let removed = false;
  let released = false;
  const result = await processTicketIntakeCleanupClaims(
    [claim({ current_path: "unexpected/private-object.pdf" })],
    CLAIM_ID,
    {
      recordTombstones: async () => true,
      removeObjects: async () => {
        removed = true;
      },
      finalize: async () => true,
      release: async () => {
        released = true;
        return true;
      },
    },
  );
  assert(!removed);
  assert(released);
  assertEquals(result, { claimed: 1, deleted: 0, deferred: 1 });
});

Deno.test("service authorization requires the exact bearer secret", async () => {
  assert(
    await constantTimeBearerMatch("Bearer service-secret", "service-secret"),
  );
  assert(!await constantTimeBearerMatch("Bearer wrong", "service-secret"));
  assert(!await constantTimeBearerMatch(null, "service-secret"));
  assert(!await constantTimeBearerMatch("Bearer service-secret", ""));
});
