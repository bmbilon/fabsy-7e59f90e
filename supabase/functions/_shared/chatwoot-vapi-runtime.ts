import {
  extractVapiChatResult,
  parseInboundCompletionResult,
} from "./whatsapp-vapi.ts";
import {
  CHATWOOT_REPLY_MARKER,
  object,
  positiveId,
  type QueueEvent,
} from "./chatwoot-vapi.ts";
import type {
  ChatAuthorizationRequest,
  ChatAuthorizationResult,
  ChatRequest,
  InboundClaim,
  InboundClaimRequest,
  InboundCompletion,
  InboundCompletionResult,
  StatusUpdate,
  WhatsAppVapiStore,
} from "../whatsapp-vapi-webhook/handler.ts";
import {
  type ChatwootClient,
  type ChatwootJob,
  findMarkedReply,
  type JobStore,
  type TwilioInbound,
  type WorkerDependencies,
} from "../chatwoot-vapi-worker/worker.ts";

type Rpc = (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;
export function legacyStore(rpc: Rpc): WhatsAppVapiStore {
  return {
    async claimInbound(request: InboundClaimRequest): Promise<InboundClaim> {
      const { data, error } = await rpc("claim_whatsapp_vapi_inbound", {
        p_message_sid: request.messageSid,
        p_sender_hash: request.senderHash,
        p_body_length: request.bodyLength,
        p_num_media: request.numMedia,
        p_assistant_id: request.assistantId,
        p_control: request.control,
        p_previous_sender_hash: request.previousSenderHash,
        p_rate_limit: request.rateLimitPerTenMinutes,
      });
      if (error) throw new Error("WhatsApp inbound claim failed");
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("WhatsApp inbound claim returned an invalid result");
      }
      const result = data as Record<string, unknown>;
      if (result.duplicate === true) {
        if (
          result.control !== null && typeof result.control !== "boolean"
        ) {
          throw new Error(
            "WhatsApp duplicate claim returned an invalid result",
          );
        }
        return { kind: "duplicate", control: result.control };
      }
      if (
        result.duplicate !== false ||
        typeof result.opted_out !== "boolean" ||
        typeof result.busy !== "boolean" ||
        typeof result.rate_limited !== "boolean"
      ) {
        throw new Error("WhatsApp inbound claim returned an invalid result");
      }
      return {
        kind: "claimed",
        previousChatId: typeof result.previous_chat_id === "string"
          ? result.previous_chat_id
          : null,
        optedOut: result.opted_out === true,
        busy: result.busy === true,
        rateLimited: result.rate_limited === true,
      };
    },

    async completeInbound(
      completion: InboundCompletion,
    ): Promise<InboundCompletionResult> {
      const { data, error } = await rpc(
        "complete_whatsapp_vapi_inbound",
        {
          p_message_sid: completion.messageSid,
          p_sender_hash: completion.senderHash,
          p_state: completion.state,
          p_vapi_chat_id: completion.vapiChatId,
          p_reply_length: completion.replyLength,
          p_set_opted_out: completion.setOptedOut ?? null,
          p_reset_chat: completion.resetChat ?? false,
        },
      );
      if (error) throw new Error("WhatsApp inbound completion failed");
      const result = parseInboundCompletionResult(data);
      if (!result?.completed) {
        throw new Error(
          "WhatsApp inbound completion returned an invalid result",
        );
      }
      return { replyAllowed: result.replyAllowed };
    },

    async authorizeChat(
      request: ChatAuthorizationRequest,
    ): Promise<ChatAuthorizationResult> {
      const { data, error } = await rpc(
        "authorize_whatsapp_vapi_chat",
        {
          p_message_sid: request.messageSid,
          p_sender_hash: request.senderHash,
          p_limit_per_ten_minutes: request.limitPerTenMinutes,
          p_limit_per_day: request.limitPerDay,
        },
      );
      if (error || !data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("WhatsApp global chat authorization failed");
      }
      const result = data as Record<string, unknown>;
      const validReason = result.reason === "allowed" ||
        result.reason === "disabled" ||
        result.reason === "not_current" ||
        result.reason === "ten_minute_limit" ||
        result.reason === "daily_limit";
      if (typeof result.allowed !== "boolean" || !validReason) {
        throw new Error(
          "WhatsApp global chat authorization returned an invalid result",
        );
      }
      return {
        allowed: result.allowed,
        reason: result.reason,
      } as ChatAuthorizationResult;
    },

    async recordStatus(update: StatusUpdate): Promise<void> {
      const { data, error } = await rpc("record_whatsapp_vapi_status", {
        p_inbound_message_sid: update.inboundMessageSid,
        p_outbound_message_sid: update.outboundMessageSid,
        p_status: update.status,
        p_error_code: update.errorCode,
      });
      if (error || data !== true) {
        throw new Error("WhatsApp status update failed");
      }
    },
  };
}

export function requiredEnv(name: string, minimum = 1): string {
  const value = Deno.env.get(name)?.trim();
  if (!value || value.length < minimum) {
    throw new Error("missing_configuration");
  }
  return value;
}
export function idEnv(name: string): number {
  const raw = requiredEnv(name);
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !positiveId(value)) {
    throw new Error("invalid_configuration");
  }
  return value;
}
function httpsOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" || url.username || url.password || url.search ||
    url.hash || url.pathname !== "/"
  ) throw new Error("invalid_origin");
  return url.origin;
}
export async function requestJson(
  url: string,
  init: RequestInit,
  timeout = 5000,
): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`provider_status_${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("provider_empty_response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 1000000) {
      await reader.cancel();
      throw new Error("provider_body_limit");
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
export function makeRpc(base: string, serviceRole: string): Rpc {
  const origin = httpsOrigin(base);
  return async (name, args = {}) => {
    if (!/^[a-z_]+$/.test(name)) throw new Error("invalid_rpc_name");
    try {
      const data = await requestJson(`${origin}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: {
          apikey: serviceRole,
          Authorization: `Bearer ${serviceRole}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
      });
      return { data, error: null };
    } catch {
      return { data: null, error: true };
    }
  };
}
async function call(
  rpc: Rpc,
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const result = await rpc(name, args);
  if (result.error) throw new Error("database_operation_failed");
  return result.data;
}
export async function acceptQueueEvent(
  rpc: Rpc,
  event: QueueEvent,
): Promise<void> {
  const common = {
    p_account_id: event.accountId,
    p_conversation_id: event.conversationId,
    p_delivery_id: event.deliveryId,
  };
  if (event.kind === "incoming") {
    const result = object(
      await call(rpc, "enqueue_chatwoot_vapi_job", {
        ...common,
        p_inbox_id: event.inboxId,
        p_message_id: event.messageId,
        p_message_sid: event.messageSid,
        p_control_hint: event.controlHint,
      }),
    );
    if (
      typeof result.enqueued !== "boolean" ||
      typeof result.duplicate !== "boolean" || typeof result.job_id !== "string"
    ) throw new Error("invalid_queue_receipt");
  } else if (event.kind === "status") {
    const result = object(
      await call(rpc, "observe_chatwoot_vapi_conversation", {
        ...common,
        p_status: event.status,
        p_human_assigned: event.humanAssigned,
        p_status_changed_at: event.eventAt,
      }),
    );
    if (
      !Number.isSafeInteger(result.generation) ||
      typeof result.held !== "boolean"
    ) throw new Error("invalid_status_receipt");
  } else {
    const result = object(
      await call(rpc, "invalidate_chatwoot_vapi_conversation", {
        ...common,
        p_event_at: event.eventAt,
      }),
    );
    if (!Number.isSafeInteger(result.generation)) {
      throw new Error("invalid_hold_receipt");
    }
  }
}
const jobArgs = (job: ChatwootJob) => ({
  p_job_id: job.job_id,
  p_lease_token: job.lease_token,
  p_generation: job.generation,
});
export function makeJobStore(rpc: Rpc): JobStore {
  return {
    async claim() {
      const data = await call(rpc, "claim_chatwoot_vapi_job");
      if (data === null) return null;
      const job = object(data);
      if (
        typeof job.job_id !== "string" || typeof job.lease_token !== "string" ||
        !positiveId(job.account_id) ||
        !positiveId(job.inbox_id) || !positiveId(job.conversation_id) ||
        !positiveId(job.message_id) || typeof job.message_sid !== "string" ||
        !Number.isSafeInteger(job.generation) ||
        !Number.isSafeInteger(job.attempt_count) ||
        !["queued", "sending", "uncertain"].includes(String(job.phase)) ||
        typeof job.marker !== "string"
      ) throw new Error("invalid_job");
      return job as unknown as ChatwootJob;
    },
    async current(job) {
      return await call(rpc, "current_chatwoot_vapi_job", jobArgs(job)) ===
        true;
    },
    async markSending(job, chatId) {
      return await call(rpc, "mark_chatwoot_vapi_sending", {
        ...jobArgs(job),
        p_vapi_chat_id: chatId,
      }) === true;
    },
    async finish(job, state, outgoingId, chatId) {
      // false means another worker/takeover already fenced this lease; don't undo it.
      await call(rpc, "finish_chatwoot_vapi_job", {
        ...jobArgs(job),
        p_state: state,
        p_outgoing_message_id: outgoingId ?? null,
        p_vapi_chat_id: chatId ?? null,
      });
    },
    async retry(job) {
      await call(rpc, "retry_chatwoot_vapi_job", jobArgs(job));
    },
    async invalidate(job) {
      await call(rpc, "invalidate_chatwoot_vapi_conversation", {
        p_account_id: job.account_id,
        p_conversation_id: job.conversation_id,
      });
    },
    async claimControl(job, createdAt, request) {
      const data = await call(rpc, "claim_chatwoot_vapi_control", {
        ...jobArgs(job),
        p_provider_created_at: createdAt,
        p_sender_hash: request.senderHash,
        p_previous_sender_hash: request.previousSenderHash,
        p_body_length: request.bodyLength,
        p_num_media: request.numMedia,
        p_assistant_id: request.assistantId,
        p_control: request.control,
      });
      if (object(data).stale_control === true) return null;
      // Use the existing strict response parser without another database operation.
      return await legacyStore(() => Promise.resolve({ data, error: null }))
        .claimInbound(request);
    },
  };
}
export function makeChatwootClient(
  base: string,
  accountId: number,
  botId: number,
  botToken: string,
  readToken: string,
): ChatwootClient {
  const origin = httpsOrigin(base);
  const path = (conversationId: number) => {
    if (!positiveId(conversationId)) throw new Error("invalid_conversation");
    return `${origin}/api/v1/accounts/${accountId}/conversations/${conversationId}`;
  };
  const request = (
    url: string,
    token: string,
    method = "GET",
    body?: Record<string, unknown>,
  ) =>
    requestJson(url, {
      method,
      headers: {
        api_access_token: token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  return {
    async conversation(id) {
      return object(await request(path(id), botToken));
    },
    async send(id, content, marker) {
      const data = object(
        await request(`${path(id)}/messages`, botToken, "POST", {
          content,
          message_type: "outgoing",
          private: false,
          content_type: "text",
          content_attributes: { [CHATWOOT_REPLY_MARKER]: marker },
        }),
      );
      if (!positiveId(data.id)) throw new Error("send_result_uncertain");
      return data.id;
    },
    async findReply(id, marker) {
      let before: number | null = null;
      for (let i = 0; i < 10; i++) {
        const data = object(
          await request(
            `${path(id)}/messages${before ? `?before=${before}` : ""}`,
            readToken,
          ),
        );
        if (!Array.isArray(data.payload)) {
          throw new Error("invalid_message_list");
        }
        const found = findMarkedReply(data.payload, marker, botId);
        if (found) return found;
        const ids = data.payload.map((message) => object(message).id).filter(
          positiveId,
        );
        if (!ids.length) break;
        const next = Math.min(...ids);
        if (before !== null && next >= before) break;
        before = next;
      }
      return null;
    },
    async open(id) {
      await request(`${path(id)}/toggle_status`, botToken, "POST", {
        status: "open",
      });
    },
  };
}
export function createWorkerDependencies(): WorkerDependencies {
  const accountId = idEnv("CHATWOOT_ACCOUNT_ID");
  const inboxId = idEnv("CHATWOOT_WHATSAPP_INBOX_ID");
  const botId = idEnv("CHATWOOT_AGENT_BOT_ID");
  const twilioAccountSid = requiredEnv("TWILIO_ACCOUNT_SID");
  const twilioAuthToken = requiredEnv("TWILIO_AUTH_TOKEN");
  const twilioNumber = requiredEnv("TWILIO_WHATSAPP_NUMBER");
  if (
    !/^AC[0-9a-f]{32}$/i.test(twilioAccountSid) ||
    !/^\+[1-9]\d{7,14}$/.test(twilioNumber)
  ) throw new Error("invalid_twilio_configuration");
  const assistantId = requiredEnv("WHATSAPP_VAPI_ASSISTANT_ID");
  if (!/^[0-9a-f-]{36}$/i.test(assistantId)) {
    throw new Error("invalid_assistant");
  }
  const rpc = makeRpc(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
  const vapiKey = requiredEnv("VAPI_PRIVATE_API_KEY");
  return {
    config: {
      accountId,
      inboxId,
      botId,
      twilioAccountSid,
      twilioNumber,
      assistantId,
      senderHashKey: requiredEnv("WHATSAPP_SENDER_HASH_KEY", 32),
      previousSenderHashKey:
        Deno.env.get("WHATSAPP_SENDER_HASH_KEY_PREVIOUS")?.trim() || undefined,
    },
    jobs: makeJobStore(rpc),
    legacy: legacyStore(rpc),
    chatwoot: makeChatwootClient(
      Deno.env.get("CHATWOOT_BASE_URL")?.trim() || "https://app.chatwoot.com",
      accountId,
      botId,
      requiredEnv("CHATWOOT_AGENT_BOT_TOKEN"),
      requiredEnv("CHATWOOT_API_ACCESS_TOKEN"),
    ),
    async twilioMessage(sid) {
      if (!/^SM[0-9a-f]{32}$/i.test(sid)) {
        throw new Error("invalid_message_sid");
      }
      return await requestJson(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages/${sid}.json`,
        {
          headers: {
            Authorization: `Basic ${
              btoa(`${twilioAccountSid}:${twilioAuthToken}`)
            }`,
            Accept: "application/json",
          },
        },
      ) as TwilioInbound;
    },
    vapi: {
      async createChat(request: ChatRequest) {
        const payload = await requestJson("https://api.vapi.ai/chat", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${vapiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            assistantId: request.assistantId,
            input: request.input,
            ...(request.previousChatId
              ? { previousChatId: request.previousChatId }
              : {}),
          }),
        }, 9000);
        const result = extractVapiChatResult(payload);
        if (!result) throw new Error("invalid_vapi_result");
        return result;
      },
    },
  };
}
