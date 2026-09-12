import {
  buildVapiInput,
  classifyControlMessage,
  formatAssistantReply,
  isChatId,
  isMessageSid,
  isSimpleEnglishGreeting,
  normalizeWhatsAppAddress,
  senderHash,
  WHATSAPP_OPENING_GREETING,
} from "../_shared/whatsapp-vapi.ts";
import {
  CHATWOOT_REPLY_MARKER,
  HANDOFF_MARKER,
  humanAssigned,
  object,
  positiveId,
  requestsHuman,
  safeEqual,
} from "../_shared/chatwoot-vapi.ts";
import type {
  InboundClaim,
  InboundClaimRequest,
  InboundCompletion,
  VapiChatClient,
  WhatsAppVapiStore,
} from "../whatsapp-vapi-webhook/handler.ts";

export interface ChatwootJob {
  job_id: string;
  account_id: number;
  inbox_id: number;
  conversation_id: number;
  message_id: number;
  message_sid: string;
  lease_token: string;
  generation: number;
  phase: "queued" | "sending" | "uncertain";
  marker: string;
  previous_chat_id: string | null;
  vapi_chat_id: string | null;
  attempt_count: number;
}
export type FinishState =
  | "sent"
  | "suppressed"
  | "failed"
  | "uncertain"
  | "send_uncertain";
export interface JobStore {
  claim(): Promise<ChatwootJob | null>;
  current(job: ChatwootJob): Promise<boolean>;
  markSending(job: ChatwootJob, chatId: string | null): Promise<boolean>;
  finish(
    job: ChatwootJob,
    state: FinishState,
    outgoingId?: number,
    chatId?: string | null,
  ): Promise<void>;
  retry(job: ChatwootJob): Promise<void>;
  invalidate(job: ChatwootJob): Promise<void>;
  claimControl(
    job: ChatwootJob,
    createdAt: string,
    request: InboundClaimRequest,
  ): Promise<InboundClaim | null>;
}
export interface TwilioInbound {
  sid: string;
  account_sid: string;
  from: string;
  to: string;
  direction: string;
  body: string;
  num_media: string;
  date_created: string;
}
export interface ChatwootClient {
  conversation(id: number): Promise<Record<string, unknown>>;
  send(id: number, content: string, marker: string): Promise<number>;
  findReply(id: number, marker: string): Promise<number | null>;
  open(id: number): Promise<void>;
}
export interface WorkerDependencies {
  config: {
    accountId: number;
    inboxId: number;
    botId: number;
    twilioAccountSid: string;
    twilioNumber: string;
    senderHashKey: string;
    previousSenderHashKey?: string;
    assistantId: string;
  };
  jobs: JobStore;
  legacy: WhatsAppVapiStore;
  chatwoot: ChatwootClient;
  vapi: VapiChatClient;
  twilioMessage(sid: string): Promise<TwilioInbound>;
  now?: () => number;
}
const MEDIA =
  "I cannot review attachments. Please use https://fabsy.ca/submit-ticket for secure intake or https://fabsy.ca/portal/cases for an existing file. You can ask a text question here.";
const OPT_OUT =
  "You are opted out of automated Fabsy WhatsApp replies. Send START to enable them again.";
const OPT_IN =
  "Automated Fabsy WhatsApp replies are enabled again. How can I help? Please use secure intake for documents.";

function verifiedInbound(
  message: TwilioInbound,
  job: ChatwootJob,
  deps: WorkerDependencies,
): { from: string; created: number; media: number } {
  const from = normalizeWhatsAppAddress(message.from);
  const created = Date.parse(message.date_created);
  if (
    !isMessageSid(job.message_sid) || message.sid !== job.message_sid ||
    message.account_sid !== deps.config.twilioAccountSid ||
    message.direction !== "inbound" ||
    !from ||
    normalizeWhatsAppAddress(message.to) !== deps.config.twilioNumber ||
    typeof message.body !== "string" || message.body.length > 20000 ||
    !/^\d{1,2}$/.test(message.num_media) || Number(message.num_media) > 10 ||
    !Number.isFinite(created) || created > (deps.now ?? Date.now)() + 60000
  ) throw new Error("unverified_inbound");
  return { from, created, media: Number(message.num_media) };
}
function matchesConversation(
  c: Record<string, unknown>,
  job: ChatwootJob,
  from: string,
): boolean {
  const latest = Array.isArray(c.messages) ? c.messages[0] : undefined;
  const source = object(c.contact_inbox).source_id ??
    object(object(latest).conversation).contact_inbox;
  const meta = object(c.meta);
  const sourcePhone = typeof source === "string"
    ? normalizeWhatsAppAddress(source)
    : null;
  // The contact-inbox source is the actual native delivery route. A mutable
  // contact profile phone must never override an absent or different route.
  const nestedSource = normalizeWhatsAppAddress(object(source).source_id);
  return c.id === job.conversation_id && c.account_id === job.account_id &&
    c.inbox_id === job.inbox_id &&
    meta.channel === "Channel::TwilioSms" &&
    (sourcePhone === from || nestedSource === from);
}
function aiOwned(c: Record<string, unknown>, botId: number): boolean {
  if (
    c.status !== "pending" || c.can_reply !== true || c.muted === true ||
    humanAssigned(c)
  ) return false;
  const meta = object(c.meta);
  const assignee = object(meta.assignee);
  return !positiveId(assignee.id) ||
    (meta.assignee_type === "AgentBot" && assignee.id === botId);
}
export async function processChatwootJob(
  job: ChatwootJob,
  deps: WorkerDependencies,
): Promise<void> {
  if (
    job.account_id !== deps.config.accountId ||
    job.inbox_id !== deps.config.inboxId
  ) {
    await deps.jobs.finish(job, "failed");
    return;
  }
  const handoff = async () => {
    await deps.jobs.invalidate(job);
    // Authoritative GET above (or below for failures) bounds handoff to our inbox.
    const c = await deps.chatwoot.conversation(job.conversation_id);
    if (
      c.account_id === job.account_id && c.inbox_id === job.inbox_id &&
      c.id === job.conversation_id && c.status === "pending"
    ) await deps.chatwoot.open(job.conversation_id);
  };
  if (job.phase === "sending" || job.phase === "uncertain") {
    // A prior POST may have succeeded. Reconcile only; absence is not proof of failure.
    try {
      const id = await deps.chatwoot.findReply(job.conversation_id, job.marker);
      if (id) {
        await deps.jobs.finish(job, "sent", id, job.vapi_chat_id);
        return;
      }
      await handoff();
      if (job.attempt_count >= 4) await deps.jobs.finish(job, "send_uncertain");
      else await deps.jobs.finish(job, "uncertain");
    } catch {
      await deps.jobs.finish(
        job,
        job.attempt_count >= 4 ? "send_uncertain" : "uncertain",
      );
    }
    return;
  }
  let hashedSender: string | null = null;
  let claimed = false;
  let sendingMarked = false;
  let completed = false;
  const complete = async (
    state: InboundCompletion["state"],
    reply: string,
    chatId: string | null = null,
    control?: boolean,
  ) => {
    if (!hashedSender || !claimed || completed) return false;
    const result = await deps.legacy.completeInbound({
      messageSid: job.message_sid,
      senderHash: hashedSender,
      state,
      vapiChatId: chatId,
      replyLength: Array.from(reply).length,
      ...(control !== undefined
        ? { setOptedOut: control, resetChat: true }
        : {}),
    });
    completed = true;
    return result.replyAllowed;
  };
  try {
    const message = await deps.twilioMessage(job.message_sid);
    const inbound = verifiedInbound(message, job, deps);
    let conversation = await deps.chatwoot.conversation(job.conversation_id);
    if (!matchesConversation(conversation, job, inbound.from)) {
      throw new Error("conversation_mismatch");
    }
    hashedSender = await senderHash(inbound.from, deps.config.senderHashKey);
    const control = classifyControlMessage(message.body);
    const claimRequest: InboundClaimRequest = {
      messageSid: job.message_sid,
      senderHash: hashedSender,
      bodyLength: Array.from(message.body).length,
      numMedia: inbound.media,
      assistantId: deps.config.assistantId,
      control: control === "opt_out"
        ? true
        : control === "opt_in"
        ? false
        : null,
      previousSenderHash: deps.config.previousSenderHashKey
        ? await senderHash(inbound.from, deps.config.previousSenderHashKey)
        : null,
      rateLimitPerTenMinutes: 10,
    };
    const claim = control
      ? await deps.jobs.claimControl(
        job,
        new Date(inbound.created).toISOString(),
        claimRequest,
      )
      : await deps.legacy.claimInbound(claimRequest);
    if (claim === null) {
      await deps.jobs.finish(job, "suppressed");
      return;
    }
    if (claim.kind === "duplicate") {
      // A crashed attempt may have committed the legacy claim before its response
      // arrived. Its reply was never durably marked sending: ask staff to review.
      if (job.attempt_count > 1) await handoff();
      await deps.jobs.finish(job, "suppressed");
      return;
    }
    claimed = true;
    const allowed = async () => {
      conversation = await deps.chatwoot.conversation(job.conversation_id);
      return matchesConversation(conversation, job, inbound.from) &&
        aiOwned(conversation, deps.config.botId) &&
        (deps.now ?? Date.now)() - inbound.created < 24 * 60 * 60 * 1000 &&
        await deps.jobs.current(job);
    };
    let reply = "";
    let chatId: string | null = null;
    let completionState: InboundCompletion["state"] = "replied";
    if (control) {
      reply = control === "opt_out" ? OPT_OUT : OPT_IN;
      completionState = control === "opt_out" ? "opted_out" : "re_enabled";
      // Control state is applied even during human ownership or a closed window.
      if (
        !await complete(completionState, reply, null, control === "opt_out")
      ) {
        await deps.jobs.finish(job, "suppressed");
        return;
      }
    } else {
      if (
        claim.optedOut || claim.busy || claim.rateLimited || !await allowed()
      ) {
        await complete("suppressed", "");
        await deps.jobs.finish(job, "suppressed");
        return;
      }
      if (requestsHuman(message.body)) {
        await handoff();
        await complete("suppressed", "");
        await deps.jobs.finish(job, "suppressed");
        return;
      }
      if (inbound.media > 0) {
        reply = MEDIA;
        completionState = "media_rejected";
      } else if (!message.body.trim()) {
        reply = "Please send a text question so I can help.";
        completionState = "empty";
      } else if (Array.from(message.body).length > 4000) {
        await handoff();
        await complete("suppressed", "");
        await deps.jobs.finish(job, "suppressed");
        return;
      } else {
        const auth = await deps.legacy.authorizeChat({
          messageSid: job.message_sid,
          senderHash: hashedSender,
          limitPerTenMinutes: 60,
          limitPerDay: 500,
        });
        if (!auth.allowed) {
          await complete("global_rate_limited", "");
          await deps.jobs.finish(job, "suppressed");
          return;
        }
        if (!await allowed()) {
          await complete("suppressed", "");
          await deps.jobs.finish(job, "suppressed");
          return;
        }
        const previousChatId = job.previous_chat_id === claim.previousChatId
          ? job.previous_chat_id
          : null;
        const opening = !isChatId(previousChatId) &&
          isSimpleEnglishGreeting(message.body);
        const input = buildVapiInput(message.body, opening);
        input[0].content = input[0].content.replace(
          "- If the customer asks for a human, direct them to https://fabsy.ca/contact or hello@fabsy.ca.",
          `- If the customer requests a human in any language, output exactly ${HANDOFF_MARKER}. The system will open the conversation for the Fabsy team. Never promise when a person will respond.`,
        );
        const result = await deps.vapi.createChat({
          assistantId: deps.config.assistantId,
          input,
          ...(isChatId(previousChatId) ? { previousChatId } : {}),
        });
        if (!isChatId(result.chatId)) throw new Error("invalid_chat");
        if (!await allowed()) {
          await complete("suppressed", "");
          await deps.jobs.finish(job, "suppressed");
          return;
        }
        if (result.reply.includes(HANDOFF_MARKER)) {
          await handoff();
          await complete("suppressed", "");
          await deps.jobs.finish(job, "suppressed");
          return;
        }
        chatId = result.chatId;
        reply = opening
          ? WHATSAPP_OPENING_GREETING
          : formatAssistantReply(result.reply);
        if (!reply) throw new Error("empty_reply");
      }
      if (!await complete(completionState, reply, chatId)) {
        await deps.jobs.finish(job, "suppressed");
        return;
      }
    }
    if (!await allowed() || !await deps.jobs.markSending(job, chatId)) {
      await deps.jobs.finish(job, "suppressed");
      return;
    }
    sendingMarked = true;
    // Last authoritative check follows the durable sending marker. After this point
    // any uncertainty is reconciled, never retried as another outgoing POST.
    if (!await allowed()) {
      await deps.jobs.finish(job, "suppressed");
      return;
    }
    const outgoingId = await deps.chatwoot.send(
      job.conversation_id,
      reply,
      job.marker,
    );
    await deps.jobs.finish(job, "sent", outgoingId, chatId);
  } catch {
    if (sendingMarked) {
      await deps.jobs.finish(job, "uncertain");
      return;
    }
    try {
      if (claimed && !completed) await complete("suppressed", "");
    } catch { /* lease expires; no customer text logged */ }
    if (claimed) {
      try {
        await handoff();
      } catch {
        await deps.jobs.retry(job);
        return;
      }
      await deps.jobs.finish(job, "failed");
    } else {
      if (job.attempt_count >= 3) {
        try {
          await handoff();
        } catch { /* terminal metadata remains visible */ }
        await deps.jobs.finish(job, "failed");
      } else await deps.jobs.retry(job);
    }
  }
}
export function createChatwootWorkerHandler(
  deps: WorkerDependencies,
  bearer: string,
  defer?: (task: Promise<void>) => void,
) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return new Response(null, { status: 405 });
    if (
      bearer.length < 32 ||
      !safeEqual(request.headers.get("authorization") ?? "", `Bearer ${bearer}`)
    ) return new Response(null, { status: 403 });
    // ACK the authenticated wake quickly. waitUntil keeps work alive after the
    // webhook/pg_net caller disconnects; committed leases and cron recover crashes.
    const run = async () => {
      for (let i = 0; i < 3; i++) {
        const job = await deps.jobs.claim();
        if (!job) break;
        await processChatwootJob(job, deps);
      }
    };
    if (defer) defer(run().catch(() => {}));
    else await run();
    return new Response(null, {
      status: defer ? 202 : 204,
      headers: { "Cache-Control": "no-store" },
    });
  };
}

export function findMarkedReply(
  messages: unknown[],
  marker: string,
  botId: number,
): number | null {
  for (const item of messages) {
    const m = object(item);
    const sender = object(m.sender);
    if (
      positiveId(m.id) && m.private === false &&
      (m.message_type === 1 || m.message_type === "outgoing") &&
      (m.sender_type === "AgentBot" || sender.type === "agent_bot" ||
        sender.type === "agentbot") &&
      (m.sender_id ?? sender.id) === botId &&
      object(m.content_attributes)[CHATWOOT_REPLY_MARKER] === marker
    ) return m.id;
  }
  return null;
}
