import {
  createWorkerDependencies,
  requiredEnv,
} from "../_shared/chatwoot-vapi-runtime.ts";
import { createChatwootWorkerHandler } from "./worker.ts";

Deno.serve(async (request) => {
  try {
    const edge = (globalThis as unknown as {
      EdgeRuntime?: { waitUntil(task: Promise<unknown>): void };
    }).EdgeRuntime;
    return await createChatwootWorkerHandler(
      createWorkerDependencies(),
      requiredEnv("CHATWOOT_WORKER_SECRET", 32),
      edge ? (task) => edge.waitUntil(task) : undefined,
    )(request);
  } catch {
    // Uncompleted leases are retried by the durable queue; never log provider bodies or credentials.
    return new Response(null, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
});
