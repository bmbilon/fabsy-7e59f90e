import { createChatwootWebhook } from "./handler.ts";
import {
  acceptQueueEvent,
  idEnv,
  makeRpc,
  requiredEnv,
} from "../_shared/chatwoot-vapi-runtime.ts";

Deno.serve(async (request) => {
  try {
    const rpc = makeRpc(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );
    const workerUrl = `${
      requiredEnv("SUPABASE_URL").replace(/\/$/, "")
    }/functions/v1/chatwoot-vapi-worker`;
    const workerSecret = requiredEnv("CHATWOOT_WORKER_SECRET", 32);
    const handler = createChatwootWebhook({
      accountId: idEnv("CHATWOOT_ACCOUNT_ID"),
      inboxId: idEnv("CHATWOOT_WHATSAPP_INBOX_ID"),
      signingSecret: requiredEnv("CHATWOOT_AGENT_BOT_SIGNING_SECRET", 24),
      accept: (event) => acceptQueueEvent(rpc, event),
      async wake() {
        const result = await fetch(workerUrl, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(5000),
          headers: {
            Authorization: `Bearer ${workerSecret}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        });
        await result.body?.cancel();
      },
      defer(task) {
        const edge = (globalThis as unknown as {
          EdgeRuntime?: { waitUntil(task: Promise<unknown>): void };
        }).EdgeRuntime;
        if (edge) edge.waitUntil(task);
        // The durable queue and disabled-by-default cron provide recovery on hosts without waitUntil.
        else void task;
      },
    });
    return await handler(request);
  } catch {
    return new Response(null, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
});
