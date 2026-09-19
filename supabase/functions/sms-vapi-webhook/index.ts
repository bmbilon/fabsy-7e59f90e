import {
  createSmsDatabaseFetch,
  SmsVapiClient,
} from "../_shared/sms-vapi-client.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { parseInboundCompletionResult, twiml } from "../_shared/sms-vapi.ts";
import {
  type ChatAuthorizationRequest,
  type ChatAuthorizationResult,
  createSmsVapiHandler,
  type InboundClaim,
  type InboundClaimRequest,
  type InboundCompletion,
  type InboundCompletionResult,
  type SmsVapiStore,
  type StatusUpdate,
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
    !url.pathname.endsWith("/functions/v1/sms-vapi-webhook")
  ) {
    throw new Error(
      "SMS_WEBHOOK_URL must be the exact public HTTPS function URL without query or fragment",
    );
  }
  return url.toString();
}

const supabase = createClient(
  requiredEnv("SUPABASE_URL"),
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: createSmsDatabaseFetch() },
  },
);

const store: SmsVapiStore = {
  async claimInbound(request: InboundClaimRequest): Promise<InboundClaim> {
    const { data, error } = await supabase.rpc("claim_sms_intake_inbound", {
      p_message_sid: request.messageSid,
      p_sender_hash: request.senderHash,
      p_body_length: request.bodyLength,
      p_from_number: request.fromNumber,
      p_to_number: request.toNumber,
      p_body: request.body,
      p_is_help: request.isHelp,
      p_num_media: request.numMedia,
      p_assistant_id: request.assistantId,
      p_control: request.control,
      p_previous_sender_hash: request.previousSenderHash,
      p_rate_limit: request.rateLimitPerTenMinutes,
    });
    if (error) throw new Error("Sms inbound claim failed");
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Sms inbound claim returned an invalid result");
    }
    const result = data as Record<string, unknown>;
    if (result.duplicate === true) {
      if (
        result.control !== null && typeof result.control !== "boolean"
      ) {
        throw new Error("Sms duplicate claim returned an invalid result");
      }
      return { kind: "duplicate", control: result.control };
    }
    if (
      result.duplicate !== false ||
      typeof result.opted_out !== "boolean" ||
      typeof result.busy !== "boolean" ||
      typeof result.rate_limited !== "boolean"
    ) {
      throw new Error("Sms inbound claim returned an invalid result");
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
      "complete_sms_intake_inbound",
      {
        p_message_sid: completion.messageSid,
        p_sender_hash: completion.senderHash,
        p_state: completion.state,
        p_vapi_chat_id: completion.vapiChatId,
        p_reply_length: completion.replyLength,
        p_reply_text: completion.replyText ?? null,
        p_set_opted_out: completion.setOptedOut ?? null,
        p_reset_chat: completion.resetChat ?? false,
      },
    );
    if (error) throw new Error("Sms inbound completion failed");
    const result = parseInboundCompletionResult(data);
    if (!result?.completed) {
      throw new Error("Sms inbound completion returned an invalid result");
    }
    return { replyAllowed: result.replyAllowed };
  },

  async authorizeChat(
    request: ChatAuthorizationRequest,
  ): Promise<ChatAuthorizationResult> {
    const { data, error } = await supabase.rpc(
      "authorize_sms_vapi_chat",
      {
        p_message_sid: request.messageSid,
        p_sender_hash: request.senderHash,
        p_limit_per_ten_minutes: request.limitPerTenMinutes,
        p_limit_per_day: request.limitPerDay,
      },
    );
    if (error || !data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Sms global chat authorization failed");
    }
    const result = data as Record<string, unknown>;
    const validReason = result.reason === "allowed" ||
      result.reason === "disabled" ||
      result.reason === "not_current" ||
      result.reason === "ten_minute_limit" ||
      result.reason === "daily_limit";
    if (typeof result.allowed !== "boolean" || !validReason) {
      throw new Error(
        "Sms global chat authorization returned an invalid result",
      );
    }
    return {
      allowed: result.allowed,
      reason: result.reason,
    } as ChatAuthorizationResult;
  },

  async recordStatus(update: StatusUpdate): Promise<void> {
    const { data, error } = await supabase.rpc("record_sms_vapi_status", {
      p_inbound_message_sid: update.inboundMessageSid,
      p_outbound_message_sid: update.outboundMessageSid,
      p_status: update.status,
      p_error_code: update.errorCode,
    });
    if (error || data !== true) {
      throw new Error("Sms status update failed");
    }
  },
};

const config = {
  twilioAccountSid: requireMatch(
    "TWILIO_ACCOUNT_SID",
    requiredEnv("TWILIO_ACCOUNT_SID"),
    /^AC[0-9a-fA-F]{32}$/,
  ),
  twilioAuthToken: requiredEnv("TWILIO_AUTH_TOKEN"),
  twilioSmsNumber: requireMatch(
    "TWILIO_SMS_NUMBER",
    requiredEnv("TWILIO_SMS_NUMBER"),
    /^\+[1-9]\d{7,14}$/,
  ),
  senderHashKey: requiredEnv("SMS_SENDER_HASH_KEY"),
  previousSenderHashKey: optionalEnv("SMS_SENDER_HASH_KEY_PREVIOUS"),
  rateLimitPerTenMinutes: integerEnv(
    "SMS_RATE_LIMIT_PER_10_MINUTES",
    10,
    1,
    100,
  ),
  globalRateLimitPerTenMinutes: integerEnv(
    "SMS_GLOBAL_RATE_LIMIT_PER_10_MINUTES",
    60,
    1,
    1_000,
  ),
  globalRateLimitPerDay: integerEnv(
    "SMS_GLOBAL_RATE_LIMIT_PER_DAY",
    500,
    1,
    10_000,
  ),
  webhookUrl: exactWebhookUrl(requiredEnv("SMS_WEBHOOK_URL")),
  vapiAssistantId: requireMatch(
    "SMS_VAPI_ASSISTANT_ID",
    requiredEnv("SMS_VAPI_ASSISTANT_ID"),
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  ),
};

const handler = createSmsVapiHandler({
  config,
  store,
  chat: new SmsVapiClient(requiredEnv("VAPI_PRIVATE_API_KEY")),
  log(event, metadata) {
    console.warn(event, metadata ?? {});
  },
});

serve(async (request) => {
  try {
    return await handler(request);
  } catch {
    console.error("sms_vapi_unexpected_failure");
    return new Response(twiml(), {
      status: 500,
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
});
