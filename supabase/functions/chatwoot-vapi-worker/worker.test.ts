// deno-lint-ignore-file require-await
// Async test doubles preserve the provider/database promise boundary.
import {
  CHATWOOT_REPLY_MARKER,
  HANDOFF_MARKER,
} from "../_shared/chatwoot-vapi.ts";
import { WHATSAPP_OPENING_GREETING } from "../_shared/whatsapp-vapi.ts";
import type {
  ChatRequest,
  InboundClaimRequest,
  InboundCompletion,
} from "../whatsapp-vapi-webhook/handler.ts";
import {
  type ChatwootJob,
  createChatwootWorkerHandler,
  findMarkedReply,
  type FinishState,
  processChatwootJob,
  type WorkerDependencies,
} from "./worker.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
const now = Date.UTC(2026, 8, 11, 20);
const from = "+15555550123";
function harness() {
  const job: ChatwootJob = {
    job_id: "11111111-1111-4111-8111-111111111111",
    account_id: 12,
    inbox_id: 34,
    conversation_id: 56,
    message_id: 123,
    message_sid: "SM" + "1".repeat(32),
    lease_token: "22222222-2222-4222-8222-222222222222",
    generation: 1,
    phase: "queued",
    marker: "fabsy-wa:test",
    previous_chat_id: null,
    vapi_chat_id: null,
    attempt_count: 1,
  };
  const state = {
    current: true,
    optedOut: false,
    duplicate: false,
    rateLimited: false,
    authAllowed: true,
    finish: [] as FinishState[],
    claims: [] as InboundClaimRequest[],
    completions: [] as InboundCompletion[],
    vapi: [] as ChatRequest[],
    sent: [] as string[],
    marked: 0,
    retries: 0,
    opened: 0,
    gets: 0,
    sendThrows: false,
    vapiThrows: false,
    staleControl: false,
    existingReply: null as number | null,
    onVapi: () => {},
    onGet: (_count: number) => {},
    onMark: () => {},
    oldPrevious: null as string | null,
  };
  const conversation: Record<string, unknown> = {
    id: 56,
    account_id: 12,
    inbox_id: 34,
    status: "pending",
    can_reply: true,
    meta: {
      channel: "Channel::TwilioSms",
      sender: { phone_number: from },
      assignee_type: "AgentBot",
      assignee: { id: 7 },
    },
    messages: [{
      conversation: { contact_inbox: { source_id: `whatsapp:${from}` } },
    }],
  };
  const message = {
    sid: job.message_sid,
    account_sid: "AC" + "a".repeat(32),
    from: `whatsapp:${from}`,
    to: "whatsapp:+18257932279",
    direction: "inbound",
    body: "Hi",
    num_media: "0",
    date_created: new Date(now - 1000).toUTCString(),
  };
  const claim = async (request: InboundClaimRequest) => {
    state.claims.push(request);
    if (state.duplicate) {
      return { kind: "duplicate" as const, control: request.control };
    }
    if (request.control !== null) state.optedOut = request.control;
    return {
      kind: "claimed" as const,
      previousChatId: state.oldPrevious,
      optedOut: state.optedOut,
      busy: false,
      rateLimited: state.rateLimited,
    };
  };
  const deps: WorkerDependencies = {
    config: {
      accountId: 12,
      inboxId: 34,
      botId: 7,
      twilioAccountSid: message.account_sid,
      twilioNumber: "+18257932279",
      senderHashKey: "s".repeat(32),
      assistantId: "82b869f5-d7bd-4cdd-8230-68f27fb0bf18",
    },
    now: () => now,
    jobs: {
      async claim() {
        return null;
      },
      async current() {
        return state.current;
      },
      async markSending() {
        state.marked++;
        state.onMark();
        return state.current;
      },
      async finish(_job, result) {
        state.finish.push(result);
      },
      async retry() {
        state.retries++;
      },
      async invalidate() {
        state.current = false;
      },
      async claimControl(_job, _created, request) {
        return state.staleControl ? null : await claim(request);
      },
    },
    legacy: {
      claimInbound: claim,
      async completeInbound(value) {
        state.completions.push(value);
        return { replyAllowed: true };
      },
      async authorizeChat() {
        return {
          allowed: state.authAllowed,
          reason: state.authAllowed ? "allowed" : "disabled",
        };
      },
      async recordStatus() {},
    },
    chatwoot: {
      async conversation() {
        state.gets++;
        state.onGet(state.gets);
        return structuredClone(conversation);
      },
      async send(_id, content) {
        state.sent.push(content);
        if (state.sendThrows) throw new Error("timeout after accepted POST");
        return 900;
      },
      async findReply() {
        return state.existingReply;
      },
      async open() {
        state.opened++;
        conversation.status = "open";
      },
    },
    async twilioMessage() {
      return message;
    },
    vapi: {
      async createChat(request) {
        state.vapi.push(request);
        state.onVapi();
        if (state.vapiThrows) throw new Error("vapi down");
        return {
          chatId: "chat-new",
          reply: "Use https://fabsy.ca/submit-ticket for secure intake.",
        };
      },
    },
  };
  return {
    job,
    deps,
    state,
    conversation,
    message,
    run: () => processChatwootJob(job, deps),
  };
}
Deno.test("verified first greeting remains exactly requested; sender HMAC only", async () => {
  const h = harness();
  await h.run();
  equal(h.state.sent, [WHATSAPP_OPENING_GREETING]);
  equal(h.state.finish, ["sent"]);
  equal(h.state.marked, 1);
  equal(h.state.claims[0].senderHash.length, 64);
  equal(JSON.stringify(h.job).includes(from), false);
});
Deno.test("substantive question and continuity do not use greeting override", async () => {
  const h = harness();
  h.message.body = "How do I submit my ticket?";
  h.job.previous_chat_id = "previous";
  h.state.oldPrevious = "previous";
  await h.run();
  equal(h.state.vapi[0].previousChatId, "previous");
  equal(h.state.sent[0].includes("submit-ticket"), true);
});
Deno.test("assistant/legacy context change cannot reuse stale queue continuity", async () => {
  const h = harness();
  h.job.previous_chat_id = "previous";
  await h.run();
  equal(h.state.vapi[0].previousChatId, undefined);
});
Deno.test("Twilio account, direction, recipient and channel are verified before claim", async () => {
  for (
    const mutation of [
      { account_sid: "AC" + "b".repeat(32) },
      { direction: "outbound-api" },
      { to: "whatsapp:+15555550999" },
      { from },
    ]
  ) {
    const h = harness();
    Object.assign(h.message, mutation);
    await h.run();
    equal(h.state.claims.length, 0);
    equal(h.state.sent.length, 0);
    equal(h.state.vapi.length, 0);
  }
});
Deno.test("mutable profile phone cannot override different native delivery route", async () => {
  const h = harness();
  h.conversation.contact_inbox = { source_id: "whatsapp:+15555550999" };
  await h.run();
  equal(h.state.claims.length, 0);
  equal(h.state.sent.length, 0);
});
Deno.test("absent native delivery route fails closed", async () => {
  const h = harness();
  h.conversation.messages = [];
  await h.run();
  equal(h.state.claims.length, 0);
  equal(h.state.sent.length, 0);
});
Deno.test("duplicate inbound never calls Vapi or sends again", async () => {
  const h = harness();
  h.state.duplicate = true;
  await h.run();
  equal(h.state.vapi.length, 0);
  equal(h.state.sent.length, 0);
  equal(h.state.finish, ["suppressed"]);
});
Deno.test("open, resolved, snoozed, assigned and locally held conversations suppress AI", async () => {
  for (const status of ["open", "resolved", "snoozed"]) {
    const h = harness();
    h.conversation.status = status;
    await h.run();
    equal(h.state.vapi.length, 0);
  }
  const h = harness();
  h.conversation.meta = {
    channel: "Channel::TwilioSms",
    assignee_type: "User",
    assignee: { id: 99 },
  };
  await h.run();
  equal(h.state.vapi.length, 0);
  const held = harness();
  held.state.current = false;
  await held.run();
  equal(held.state.vapi.length, 0);
});
Deno.test("human takeover while Vapi runs fences output", async () => {
  const h = harness();
  h.state.onVapi = () => {
    h.conversation.status = "open";
    h.state.current = false;
  };
  await h.run();
  equal(h.state.vapi.length, 1);
  equal(h.state.sent.length, 0);
  equal(h.state.marked, 0);
});
Deno.test("human takeover after durable send marker is checked before outgoing POST", async () => {
  const h = harness();
  h.state.onMark = () => {
    h.conversation.status = "open";
  };
  await h.run();
  equal(h.state.sent.length, 0);
  equal(h.state.finish, ["suppressed"]);
});
Deno.test("STOP/START is authoritative, applied while human owns conversation, and suppresses acknowledgments", async () => {
  for (const control of ["STOP", "START"]) {
    const h = harness();
    h.message.body = control;
    h.conversation.status = "open";
    h.state.current = false;
    await h.run();
    equal(h.state.optedOut, control === "STOP");
    equal(h.state.vapi.length, 0);
    equal(h.state.sent.length, 0);
    equal(h.state.completions[0].setOptedOut, control === "STOP");
  }
});
Deno.test("delayed older control rejected by atomic provider-order wrapper", async () => {
  const h = harness();
  h.message.body = "STOP";
  h.state.staleControl = true;
  await h.run();
  equal(h.state.claims.length, 0);
  equal(h.state.optedOut, false);
  equal(h.state.sent.length, 0);
});
Deno.test("opt-out and rate controls prevent Vapi calls", async () => {
  for (const field of ["optedOut", "rateLimited"] as const) {
    const h = harness();
    h.state[field] = true;
    await h.run();
    equal(h.state.vapi.length, 0);
    equal(h.state.sent.length, 0);
  }
  const h = harness();
  h.state.authAllowed = false;
  await h.run();
  equal(h.state.vapi.length, 0);
  equal(h.state.sent.length, 0);
});
Deno.test("media is never sent to Vapi and secure-upload guidance is preserved", async () => {
  const h = harness();
  h.message.num_media = "1";
  h.message.body = "my ticket";
  await h.run();
  equal(h.state.vapi.length, 0);
  equal(h.state.sent[0].includes("submit-ticket"), true);
});
Deno.test("24-hour boundary and closed provider window suppress free-form sends", async () => {
  const h = harness();
  h.message.date_created = new Date(now - 86400000).toUTCString();
  await h.run();
  equal(h.state.sent.length, 0);
  equal(h.state.vapi.length, 0);
  const closed = harness();
  closed.conversation.can_reply = false;
  await closed.run();
  equal(closed.state.sent.length, 0);
});
Deno.test("human request and bot failure open conversation without another bot reply", async () => {
  const human = harness();
  human.message.body = "Can I speak to a human?";
  await human.run();
  equal(human.state.opened, 1);
  equal(human.state.vapi.length, 0);
  equal(human.state.sent.length, 0);
  const failure = harness();
  failure.state.vapiThrows = true;
  await failure.run();
  equal(failure.state.opened, 1);
  equal(failure.state.finish, ["failed"]);
});
Deno.test("same-language model handoff sentinel is consumed and never sent", async () => {
  const h = harness();
  h.message.body = "कृपया मदद करें";
  h.deps.vapi.createChat = async () => ({
    chatId: "chat-new",
    reply: HANDOFF_MARKER,
  });
  await h.run();
  equal(h.state.opened, 1);
  equal(h.state.sent.length, 0);
});
Deno.test("send timeout becomes uncertain and never blindly repeats POST", async () => {
  const h = harness();
  h.state.sendThrows = true;
  await h.run();
  equal(h.state.sent.length, 1);
  equal(h.state.finish, ["uncertain"]);
  equal(h.state.retries, 0);
  h.job.phase = "uncertain";
  h.job.attempt_count = 2;
  h.state.existingReply = 900;
  await h.run();
  equal(h.state.sent.length, 1);
  equal(h.state.finish, ["uncertain", "sent"]);
});
Deno.test("missing reconciliation marker opens human inbox but cannot resend", async () => {
  const h = harness();
  h.job.phase = "sending";
  h.job.attempt_count = 4;
  await h.run();
  equal(h.state.sent.length, 0);
  equal(h.state.vapi.length, 0);
  equal(h.state.opened, 1);
  equal(h.state.finish, ["send_uncertain"]);
});
Deno.test("reconciliation ignores notes, human messages and wrong bot markers", () => {
  const valid = {
    id: 1,
    private: false,
    message_type: 1,
    sender_type: "AgentBot",
    sender_id: 7,
    content_attributes: { [CHATWOOT_REPLY_MARKER]: "mark" },
  };
  equal(
    findMarkedReply(
      [{ ...valid, private: true }, { ...valid, sender_type: "User" }, {
        ...valid,
        sender_id: 8,
      }],
      "mark",
      7,
    ),
    null,
  );
  equal(findMarkedReply([valid], "mark", 7), 1);
});
Deno.test("worker requires independent secret before claiming any jobs", async () => {
  const h = harness();
  let claims = 0;
  h.deps.jobs.claim = async () => {
    claims++;
    return null;
  };
  const handler = createChatwootWorkerHandler(h.deps, "w".repeat(32));
  equal(
    (await handler(
      new Request("https://example.invalid/worker", { method: "POST" }),
    )).status,
    403,
  );
  equal(claims, 0);
  equal(
    (await handler(
      new Request("https://example.invalid/worker", {
        method: "POST",
        headers: { authorization: "Bearer " + "w".repeat(32) },
      }),
    )).status,
    204,
  );
  equal(claims, 1);
});

Deno.test("authenticated worker acknowledges wake while background processing is pending", async () => {
  const h = harness();
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  h.deps.jobs.claim = async () => {
    await blocked;
    return null;
  };
  let task: Promise<void> | undefined;
  const handler = createChatwootWorkerHandler(
    h.deps,
    "w".repeat(32),
    (pending) => {
      task = pending;
    },
  );
  const response = await handler(
    new Request("https://example.invalid/worker", {
      method: "POST",
      headers: { authorization: "Bearer " + "w".repeat(32) },
    }),
  );
  equal(response.status, 202);
  release();
  await task;
});
