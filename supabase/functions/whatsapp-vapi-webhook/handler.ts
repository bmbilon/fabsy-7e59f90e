import {
  buildStatusCallbackUrl,
  buildVapiInput,
  classifyControlMessage,
  formatAssistantReply,
  formParameters,
  isChatId,
  isMessageSid,
  isSimpleEnglishGreeting,
  normalizeWhatsAppAddress,
  senderHash,
  twiml,
  validateTwilioSignature,
  validationUrl,
  type VapiInputMessage,
  WHATSAPP_OPENING_GREETING,
} from "../_shared/whatsapp-vapi.ts";

export type InboundState =
  | "busy"
  | "rate_limited"
  | "global_rate_limited"
  | "opted_out"
  | "re_enabled"
  | "suppressed"
  | "media_rejected"
  | "empty"
  | "replied"
  | "fallback";

export type InboundClaim =
  | { kind: "duplicate"; control: boolean | null }
  | {
    kind: "claimed";
    previousChatId: string | null;
    optedOut: boolean;
    busy: boolean;
    rateLimited: boolean;
  };

export interface InboundClaimRequest {
  messageSid: string;
  senderHash: string;
  bodyLength: number;
  numMedia: number;
  assistantId: string;
  control: boolean | null;
  previousSenderHash: string | null;
  rateLimitPerTenMinutes: number;
}

export interface InboundCompletion {
  messageSid: string;
  senderHash: string;
  state: InboundState;
  vapiChatId: string | null;
  replyLength: number;
  setOptedOut?: boolean;
  resetChat?: boolean;
}

export interface InboundCompletionResult {
  replyAllowed: boolean;
}

export type ChatAuthorizationReason =
  | "allowed"
  | "disabled"
  | "not_current"
  | "ten_minute_limit"
  | "daily_limit";

export interface ChatAuthorizationRequest {
  messageSid: string;
  senderHash: string;
  limitPerTenMinutes: number;
  limitPerDay: number;
}

export interface ChatAuthorizationResult {
  allowed: boolean;
  reason: ChatAuthorizationReason;
}

export interface StatusUpdate {
  inboundMessageSid: string;
  outboundMessageSid: string;
  status: string;
  errorCode: string | null;
}

export interface WhatsAppVapiStore {
  claimInbound(request: InboundClaimRequest): Promise<InboundClaim>;
  completeInbound(
    completion: InboundCompletion,
  ): Promise<InboundCompletionResult>;
  authorizeChat(
    request: ChatAuthorizationRequest,
  ): Promise<ChatAuthorizationResult>;
  recordStatus(update: StatusUpdate): Promise<void>;
}

export interface ChatRequest {
  assistantId: string;
  input: VapiInputMessage[];
  previousChatId?: string;
}

export interface ChatResult {
  chatId: string;
  reply: string;
}

export interface VapiChatClient {
  createChat(request: ChatRequest): Promise<ChatResult>;
}

export interface HandlerConfig {
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioWhatsAppNumber: string;
  senderHashKey: string;
  previousSenderHashKey?: string;
  rateLimitPerTenMinutes: number;
  globalRateLimitPerTenMinutes: number;
  globalRateLimitPerDay: number;
  webhookUrl?: string;
  vapiAssistantId: string;
}

export interface HandlerDependencies {
  config: HandlerConfig;
  store: WhatsAppVapiStore;
  chat: VapiChatClient;
  log?: (event: string, metadata?: Record<string, unknown>) => void;
}

const FALLBACK_MESSAGE = formatAssistantReply(
  "The assistant is temporarily unavailable. Please try again shortly or request human help at https://fabsy.ca/contact. Do not send documents, identity information, or payment details here.",
);
const BUSY_MESSAGE = formatAssistantReply(
  "Your previous message is still being processed. Please wait a moment, then send your question again.",
);
const MEDIA_MESSAGE = formatAssistantReply(
  "I cannot review attachments. Please send only a text question here. Use https://fabsy.ca/submit-ticket for secure intake or https://fabsy.ca/portal/cases for an existing file.",
);
const EMPTY_MESSAGE = formatAssistantReply(
  "Please send a text question so I can help.",
);
const OPT_OUT_MESSAGE = formatAssistantReply(
  "You are opted out of Fabsy WhatsApp replies. I will not automate further replies here. Send START to enable them again, or request human help at https://fabsy.ca/contact.",
);
const OPT_IN_MESSAGE = formatAssistantReply(
  "Fabsy WhatsApp replies are enabled again. Send your question when ready. Do not send documents, identity information, or payment details here.",
);
const MAX_INBOUND_CHARACTERS = 4_000;
const MAX_WEBHOOK_BODY_BYTES = 64 * 1_024;

function xmlResponse(
  message?: string,
  statusCallbackUrl?: string,
  status = 200,
): Response {
  return new Response(twiml(message, statusCallbackUrl), {
    status,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

type LimitedBodyResult =
  | { ok: true; text: string }
  | { ok: false; status: 400 | 413 };

async function readLimitedBody(request: Request): Promise<LimitedBodyResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    if (!/^\d+$/.test(contentLength)) return { ok: false, status: 400 };
    if (Number(contentLength) > MAX_WEBHOOK_BODY_BYTES) {
      return { ok: false, status: 413 };
    }
  }
  if (!request.body) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_WEBHOOK_BODY_BYTES) {
      await reader.cancel();
      return { ok: false, status: 413 };
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return {
      ok: true,
      text: new TextDecoder("utf-8", { fatal: true }).decode(body),
    };
  } catch {
    return { ok: false, status: 400 };
  }
}

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function firstParameter(params: URLSearchParams, key: string): string {
  return params.get(key) ?? "";
}

function parseMediaCount(value: string): number | null {
  if (!/^\d{1,2}$/.test(value || "0")) return null;
  const count = Number(value || "0");
  return Number.isSafeInteger(count) && count >= 0 && count <= 10
    ? count
    : null;
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function safeStatus(value: string): string | null {
  const normalized = value.trim().toLocaleLowerCase("en-CA");
  return /^[a-z][a-z0-9_-]{0,31}$/.test(normalized) ? normalized : null;
}

function safeErrorCode(value: string): string | null {
  const normalized = value.trim();
  return /^\d{1,10}$/.test(normalized) ? normalized : null;
}

async function bestEffortComplete(
  deps: HandlerDependencies,
  completion: InboundCompletion,
): Promise<InboundCompletionResult | null> {
  try {
    return await deps.store.completeInbound(completion);
  } catch {
    deps.log?.("whatsapp_vapi_completion_failed", {
      messageSid: completion.messageSid,
      state: completion.state,
    });
    return null;
  }
}

function callbackBase(
  requestUrl: string,
  configuredWebhookUrl?: string,
): string {
  if (configuredWebhookUrl) return configuredWebhookUrl;
  const url = new URL(requestUrl);
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function handleStatusCallback(
  deps: HandlerDependencies,
  requestUrl: string,
  params: URLSearchParams,
): Promise<Response> {
  const url = new URL(requestUrl);
  const inboundMessageSid = url.searchParams.get("inbound") ?? "";
  const outboundMessageSid = firstParameter(params, "MessageSid");
  const status = safeStatus(
    firstParameter(params, "MessageStatus") ||
      firstParameter(params, "SmsStatus"),
  );
  if (
    !isMessageSid(inboundMessageSid) || !isMessageSid(outboundMessageSid) ||
    !status
  ) {
    return textResponse("Invalid status callback", 400);
  }

  try {
    await deps.store.recordStatus({
      inboundMessageSid,
      outboundMessageSid,
      status,
      errorCode: safeErrorCode(firstParameter(params, "ErrorCode")),
    });
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    deps.log?.("whatsapp_vapi_status_persistence_failed", {
      inboundMessageSid,
      outboundMessageSid,
      status,
    });
    return textResponse("Status callback persistence failed", 500);
  }
}

export function createWhatsAppVapiHandler(
  deps: HandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return textResponse("Method not allowed", 405);
    }
    const contentType =
      request.headers.get("content-type")?.toLocaleLowerCase("en-CA") ?? "";
    if (!contentType.includes("application/x-www-form-urlencoded")) {
      return textResponse("Unsupported content type", 415);
    }
    if (
      !deps.config.twilioAccountSid ||
      !deps.config.twilioAuthToken ||
      !/^\+[1-9]\d{7,14}$/.test(deps.config.twilioWhatsAppNumber) ||
      new TextEncoder().encode(deps.config.senderHashKey).length < 32 ||
      (deps.config.previousSenderHashKey !== undefined &&
        (new TextEncoder().encode(deps.config.previousSenderHashKey).length <
            32 ||
          deps.config.previousSenderHashKey === deps.config.senderHashKey)) ||
      !Number.isInteger(deps.config.rateLimitPerTenMinutes) ||
      deps.config.rateLimitPerTenMinutes < 1 ||
      deps.config.rateLimitPerTenMinutes > 100 ||
      !Number.isInteger(deps.config.globalRateLimitPerTenMinutes) ||
      deps.config.globalRateLimitPerTenMinutes < 1 ||
      deps.config.globalRateLimitPerTenMinutes > 1_000 ||
      !Number.isInteger(deps.config.globalRateLimitPerDay) ||
      deps.config.globalRateLimitPerDay < 1 ||
      deps.config.globalRateLimitPerDay > 10_000 ||
      !deps.config.vapiAssistantId
    ) {
      return textResponse("Webhook is not configured", 503);
    }

    let params: URLSearchParams;
    try {
      const body = await readLimitedBody(request);
      if (!body.ok) return textResponse("Invalid form body", body.status);
      params = new URLSearchParams(body.text);
    } catch {
      return textResponse("Invalid form body", 400);
    }

    const exactValidationUrl = validationUrl(
      request.url,
      deps.config.webhookUrl,
    );
    const signature = request.headers.get("x-twilio-signature") ?? "";
    const signatureValid = await validateTwilioSignature(
      deps.config.twilioAuthToken,
      signature,
      exactValidationUrl,
      formParameters(params),
    );
    if (!signatureValid) {
      return textResponse("Twilio request validation failed", 403);
    }
    if (firstParameter(params, "AccountSid") !== deps.config.twilioAccountSid) {
      return textResponse("Twilio account mismatch", 403);
    }

    const requestUrl = new URL(request.url);
    if (requestUrl.searchParams.get("event") === "status") {
      return await handleStatusCallback(deps, request.url, params);
    }

    const messageSid = firstParameter(params, "MessageSid");
    const from = normalizeWhatsAppAddress(firstParameter(params, "From"));
    const to = normalizeWhatsAppAddress(firstParameter(params, "To"));
    if (
      !isMessageSid(messageSid) ||
      !from ||
      to !== deps.config.twilioWhatsAppNumber
    ) {
      return textResponse("Invalid WhatsApp webhook", 400);
    }
    const numMedia = parseMediaCount(firstParameter(params, "NumMedia"));
    if (numMedia === null) return textResponse("Invalid media count", 400);

    const body = firstParameter(params, "Body");
    const bodyLength = codePointLength(body);
    const requestedControl = classifyControlMessage(body);
    const controlFlag = requestedControl === "opt_out"
      ? true
      : requestedControl === "opt_in"
      ? false
      : null;
    const hashedSender = await senderHash(from, deps.config.senderHashKey);
    const previousHashedSender = deps.config.previousSenderHashKey
      ? await senderHash(from, deps.config.previousSenderHashKey)
      : null;
    const callbackUrl = buildStatusCallbackUrl(
      callbackBase(request.url, deps.config.webhookUrl),
      messageSid,
    );

    let claim: InboundClaim;
    try {
      claim = await deps.store.claimInbound({
        messageSid,
        senderHash: hashedSender,
        bodyLength,
        numMedia,
        assistantId: deps.config.vapiAssistantId,
        control: controlFlag,
        previousSenderHash: previousHashedSender,
        rateLimitPerTenMinutes: deps.config.rateLimitPerTenMinutes,
      });
    } catch {
      deps.log?.("whatsapp_vapi_claim_failed", { messageSid });
      return xmlResponse(undefined, undefined, 503);
    }

    const control = claim.kind === "duplicate"
      ? claim.control === true
        ? "opt_out"
        : claim.control === false
        ? "opt_in"
        : null
      : requestedControl;
    const completeControl = async (
      kind: Exclude<typeof control, null>,
    ): Promise<Response> => {
      const isOptOut = kind === "opt_out";
      const responseMessage = isOptOut ? OPT_OUT_MESSAGE : OPT_IN_MESSAGE;
      const completion = await bestEffortComplete(deps, {
        messageSid,
        senderHash: hashedSender,
        state: isOptOut ? "opted_out" : "re_enabled",
        vapiChatId: null,
        replyLength: codePointLength(responseMessage),
        setOptedOut: isOptOut,
        resetChat: true,
      });
      if (completion === null) return xmlResponse(undefined, undefined, 503);
      if (!completion.replyAllowed) return xmlResponse();
      return xmlResponse(responseMessage, callbackUrl);
    };

    if (claim.kind === "duplicate") {
      return control ? await completeControl(control) : xmlResponse();
    }

    if (control) return await completeControl(control);
    if (claim.rateLimited) {
      await bestEffortComplete(deps, {
        messageSid,
        senderHash: hashedSender,
        state: "rate_limited",
        vapiChatId: null,
        replyLength: 0,
      });
      return xmlResponse();
    }
    if (claim.busy) {
      const completion = await bestEffortComplete(deps, {
        messageSid,
        senderHash: hashedSender,
        state: "busy",
        vapiChatId: null,
        replyLength: codePointLength(BUSY_MESSAGE),
      });
      if (completion?.replyAllowed !== true) return xmlResponse();
      return xmlResponse(BUSY_MESSAGE, callbackUrl);
    }
    if (claim.optedOut) {
      await bestEffortComplete(deps, {
        messageSid,
        senderHash: hashedSender,
        state: "suppressed",
        vapiChatId: null,
        replyLength: 0,
      });
      return xmlResponse();
    }
    if (numMedia > 0) {
      const completion = await bestEffortComplete(deps, {
        messageSid,
        senderHash: hashedSender,
        state: "media_rejected",
        vapiChatId: null,
        replyLength: codePointLength(MEDIA_MESSAGE),
      });
      if (completion?.replyAllowed !== true) return xmlResponse();
      return xmlResponse(MEDIA_MESSAGE, callbackUrl);
    }
    if (!body.trim()) {
      const completion = await bestEffortComplete(deps, {
        messageSid,
        senderHash: hashedSender,
        state: "empty",
        vapiChatId: null,
        replyLength: codePointLength(EMPTY_MESSAGE),
      });
      if (completion?.replyAllowed !== true) return xmlResponse();
      return xmlResponse(EMPTY_MESSAGE, callbackUrl);
    }
    if (bodyLength > MAX_INBOUND_CHARACTERS) {
      const completion = await bestEffortComplete(deps, {
        messageSid,
        senderHash: hashedSender,
        state: "fallback",
        vapiChatId: null,
        replyLength: codePointLength(FALLBACK_MESSAGE),
      });
      if (completion?.replyAllowed !== true) return xmlResponse();
      return xmlResponse(FALLBACK_MESSAGE, callbackUrl);
    }

    let authorization: ChatAuthorizationResult;
    try {
      authorization = await deps.store.authorizeChat({
        messageSid,
        senderHash: hashedSender,
        limitPerTenMinutes: deps.config.globalRateLimitPerTenMinutes,
        limitPerDay: deps.config.globalRateLimitPerDay,
      });
    } catch {
      deps.log?.("whatsapp_vapi_global_authorization_failed", { messageSid });
      await bestEffortComplete(deps, {
        messageSid,
        senderHash: hashedSender,
        state: "global_rate_limited",
        vapiChatId: null,
        replyLength: 0,
      });
      return xmlResponse();
    }
    if (!authorization.allowed) {
      deps.log?.("whatsapp_vapi_global_rate_limited", {
        messageSid,
        reason: authorization.reason,
      });
      await bestEffortComplete(deps, {
        messageSid,
        senderHash: hashedSender,
        state: "global_rate_limited",
        vapiChatId: null,
        replyLength: 0,
      });
      return xmlResponse();
    }

    const openingGreeting = !isChatId(claim.previousChatId) &&
      isSimpleEnglishGreeting(body);
    try {
      const chat = await deps.chat.createChat({
        assistantId: deps.config.vapiAssistantId,
        input: buildVapiInput(body, openingGreeting),
        ...(claim.previousChatId && isChatId(claim.previousChatId)
          ? { previousChatId: claim.previousChatId }
          : {}),
      });
      if (!isChatId(chat.chatId)) {
        throw new Error("Vapi returned an invalid chat ID");
      }
      const reply = openingGreeting
        ? WHATSAPP_OPENING_GREETING
        : formatAssistantReply(chat.reply);
      if (!reply) throw new Error("Vapi returned an empty reply");
      const completion = await bestEffortComplete(deps, {
        messageSid,
        senderHash: hashedSender,
        state: "replied",
        vapiChatId: chat.chatId,
        replyLength: codePointLength(reply),
      });
      if (completion?.replyAllowed !== true) return xmlResponse();
      return xmlResponse(reply, callbackUrl);
    } catch {
      deps.log?.("whatsapp_vapi_chat_failed", { messageSid });
      const completion = await bestEffortComplete(deps, {
        messageSid,
        senderHash: hashedSender,
        state: "fallback",
        vapiChatId: null,
        replyLength: codePointLength(FALLBACK_MESSAGE),
      });
      if (completion?.replyAllowed !== true) return xmlResponse();
      return xmlResponse(FALLBACK_MESSAGE, callbackUrl);
    }
  };
}
