import {
  deliveryId,
  parseChatwootEvent,
  type QueueEvent,
  readLimitedText,
  verifyChatwootSignature,
} from "../_shared/chatwoot-vapi.ts";

export interface WebhookDependencies {
  accountId: number;
  inboxId: number;
  signingSecret: string;
  accept(event: QueueEvent): Promise<void>;
  wake(): Promise<void>;
  defer(task: Promise<void>): void;
  now?: () => number;
}
function response(status: number): Response {
  return new Response(null, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function createChatwootWebhook(deps: WebhookDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return response(405);
    if (
      request.headers.get("content-type")?.split(";")[0].trim()
        .toLowerCase() !== "application/json"
    ) return response(415);
    let raw: string;
    try {
      raw = await readLimitedText(request);
    } catch (error) {
      return response(error instanceof RangeError ? 413 : 400);
    }
    if (
      !await verifyChatwootSignature(
        deps.signingSecret,
        request.headers.get("x-chatwoot-signature") ?? "",
        request.headers.get("x-chatwoot-timestamp") ?? "",
        raw,
        (deps.now ?? Date.now)(),
      )
    ) return response(403);
    let event: QueueEvent | null;
    try {
      event = parseChatwootEvent(
        JSON.parse(raw),
        deps.accountId,
        deps.inboxId,
        await deliveryId(
          request.headers.get("x-chatwoot-delivery"),
          deps.signingSecret,
          raw,
        ),
      );
    } catch {
      return response(400);
    }
    if (!event) return response(204);
    try {
      await deps.accept(event);
    } catch {
      return response(500);
    }
    // Queue commit precedes ACK. Cron recovers work if this best-effort wake fails.
    deps.defer(deps.wake().catch(() => {}));
    return response(204);
  };
}
