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
  type TicketIntakeCleanupClaim,
  TicketIntakeCleanupRequestError,
} from "./ticket-intake-draft-cleanup.ts";

const DRAFT_ID = "00000000-0000-4000-8000-000000000501";
const CLAIM_ID = "00000000-0000-4000-8000-000000000601";
const CURRENT = `${DRAFT_ID}/representation-ticket-r1.pdf`;
const PENDING = `${DRAFT_ID}/representation-ticket-r2.jpg`;

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
