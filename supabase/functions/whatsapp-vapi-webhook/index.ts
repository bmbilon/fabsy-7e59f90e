import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  extractVapiChatResult,
  parseInboundCompletionResult,
  twiml,
} from "../_shared/whatsapp-vapi.ts";
import {
  type ChatAuthorizationRequest,
  type ChatAuthorizationResult,
  type ChatRequest,
  createWhatsAppVapiHandler,
  type InboundClaim,
  type InboundClaimRequest,
  type InboundCompletion,
  type InboundCompletionResult,
  type StatusUpdate,
  type VapiChatClient,
  type WhatsAppVapiStore,
} from "./handler.ts";

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function requireMatch(name: string, value: string, pattern: RegExp): string {
  if (!pattern.test(value)) {
    throw new Error(`Invalid environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  return Deno.env.get(name)?.trim() || undefined;
}

function integerEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = optionalEnv(name);
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Invalid environment variable: ${name}`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Invalid environment variable: ${name}`);
  }
  return value;
}

function exactWebhookUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.search ||
    url.hash ||
    !url.pathname.endsWith("/functions/v1/whatsapp-vapi-webhook")
  ) {
    throw new Error(
      "WHATSAPP_WEBHOOK_URL must be the exact public HTTPS function URL without query or fragment",
    );
  }
  return url.toString();
}

const supabase = createClient(
  requiredEnv("SUPABASE_URL"),
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const store: WhatsAppVapiStore = {
  async claimInbound(request: InboundClaimRequest): Promise<InboundClaim> {
    const { data, error } = await supabase.rpc("claim_whatsapp_vapi_inbound", {
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
        throw new Error("WhatsApp duplicate claim returned an invalid result");
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
    const { data, error } = await supabase.rpc(
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
      throw new Error("WhatsApp inbound completion returned an invalid result");
    }
    return { replyAllowed: result.replyAllowed };
  },

  async authorizeChat(
    request: ChatAuthorizationRequest,
  ): Promise<ChatAuthorizationResult> {
    const { data, error } = await supabase.rpc(
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
    const { data, error } = await supabase.rpc("record_whatsapp_vapi_status", {
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

class VapiClient implements VapiChatClient {
  constructor(private readonly apiKey: string) {}

  async createChat(request: ChatRequest) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9_000);
    try {
      const response = await fetch("https://api.vapi.ai/chat", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          assistantId: request.assistantId,
          input: request.input,
          ...(request.previousChatId
            ? { previousChatId: request.previousChatId }
            : {}),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Vapi Chat API failed with status ${response.status}`);
      }
      const contentLength = Number(
        response.headers.get("content-length") || "0",
      );
      if (Number.isFinite(contentLength) && contentLength > 1_000_000) {
        throw new Error("Vapi Chat API response was too large");
      }
      const rawResponse = await response.text();
      if (rawResponse.length > 1_000_000) {
        throw new Error("Vapi Chat API response was too large");
      }
      let payload: unknown;
      try {
        payload = JSON.parse(rawResponse);
      } catch {
        throw new Error("Vapi Chat API returned invalid JSON");
      }
      const result = extractVapiChatResult(payload);
      if (!result) {
        throw new Error("Vapi Chat API returned an invalid response");
      }
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }
}

const config = {
  twilioAccountSid: requireMatch(
    "TWILIO_ACCOUNT_SID",
    requiredEnv("TWILIO_ACCOUNT_SID"),
    /^AC[0-9a-fA-F]{32}$/,
  ),
  twilioAuthToken: requiredEnv("TWILIO_AUTH_TOKEN"),
  twilioWhatsAppNumber: requireMatch(
    "TWILIO_WHATSAPP_NUMBER",
    requiredEnv("TWILIO_WHATSAPP_NUMBER"),
    /^\+[1-9]\d{7,14}$/,
  ),
  senderHashKey: requiredEnv("WHATSAPP_SENDER_HASH_KEY"),
  previousSenderHashKey: optionalEnv("WHATSAPP_SENDER_HASH_KEY_PREVIOUS"),
  rateLimitPerTenMinutes: integerEnv(
    "WHATSAPP_RATE_LIMIT_PER_10_MINUTES",
    10,
    1,
    100,
  ),
  globalRateLimitPerTenMinutes: integerEnv(
    "WHATSAPP_GLOBAL_RATE_LIMIT_PER_10_MINUTES",
    60,
    1,
    1_000,
  ),
  globalRateLimitPerDay: integerEnv(
    "WHATSAPP_GLOBAL_RATE_LIMIT_PER_DAY",
    500,
    1,
    10_000,
  ),
  webhookUrl: exactWebhookUrl(requiredEnv("WHATSAPP_WEBHOOK_URL")),
  vapiAssistantId: requireMatch(
    "WHATSAPP_VAPI_ASSISTANT_ID",
    requiredEnv("WHATSAPP_VAPI_ASSISTANT_ID"),
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  ),
};

const handler = createWhatsAppVapiHandler({
  config,
  store,
  chat: new VapiClient(requiredEnv("VAPI_PRIVATE_API_KEY")),
  log(event, metadata) {
    console.warn(event, metadata ?? {});
  },
});

serve(async (request) => {
  try {
    return await handler(request);
  } catch {
    console.error("whatsapp_vapi_unexpected_failure");
    return new Response(twiml(), {
      status: 500,
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
});
