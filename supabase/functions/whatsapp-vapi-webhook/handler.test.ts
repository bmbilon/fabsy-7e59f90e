import assert from "node:assert/strict";
import {
  computeTwilioSignature,
  formParameters,
  WHATSAPP_OPENING_GREETING,
} from "../_shared/whatsapp-vapi.ts";
import {
  type ChatRequest,
  createWhatsAppVapiHandler,
  type HandlerDependencies,
  type InboundClaim,
  type InboundCompletion,
  type StatusUpdate,
} from "./handler.ts";

const accountSid = `AC${"a".repeat(32)}`;
const inboundSid = `SM${"1".repeat(32)}`;
const outboundSid = `SM${"2".repeat(32)}`;
const webhookUrl = "https://example.test/functions/v1/whatsapp-vapi-webhook";

function formRequest(
  url: string,
  body: Record<string, string>,
  authToken = "twilio-token",
): Promise<Request> {
  const encoded = new URLSearchParams(body);
  return computeTwilioSignature(authToken, url, formParameters(encoded)).then((
    signature,
  ) =>
    new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": signature,
      },
      body: encoded,
    })
  );
}

function fixture(claim: InboundClaim = {
  kind: "claimed",
  previousChatId: "chat_previous",
  optedOut: false,
  busy: false,
  rateLimited: false,
}) {
  const claims: unknown[] = [];
  const completions: InboundCompletion[] = [];
  const statuses: StatusUpdate[] = [];
  const chats: ChatRequest[] = [];
  const authorizations: unknown[] = [];
  const deps: HandlerDependencies = {
    config: {
      twilioAccountSid: accountSid,
      twilioAuthToken: "twilio-token",
      twilioWhatsAppNumber: "+18255550123",
      senderHashKey: "sender-hash-key".repeat(3),
      rateLimitPerTenMinutes: 10,
      globalRateLimitPerTenMinutes: 60,
      globalRateLimitPerDay: 500,
      webhookUrl,
      vapiAssistantId: "672c362f-c501-4cff-9c2b-977868dad856",
    },
    store: {
      claimInbound: (value) => {
        claims.push(value);
        return Promise.resolve(claim);
      },
      completeInbound: (value) => {
        completions.push(value);
        return Promise.resolve({ replyAllowed: true });
      },
      authorizeChat: (value) => {
        authorizations.push(value);
        return Promise.resolve({ allowed: true, reason: "allowed" as const });
      },
      recordStatus: (value) => {
        statuses.push(value);
        return Promise.resolve();
      },
    },
    chat: {
      createChat: (value) => {
        chats.push(value);
        return Promise.resolve({
          chatId: "chat_new",
          reply: "Hello & welcome",
        });
      },
    },
  };
  return { deps, claims, completions, statuses, chats, authorizations };
}

const inboundBody = (overrides: Record<string, string> = {}) => ({
  AccountSid: accountSid,
  MessageSid: inboundSid,
  From: "whatsapp:+14035550123",
  To: "whatsapp:+18255550123",
  Body: "Can you help with my ticket?",
  NumMedia: "0",
  ...overrides,
});

Deno.test("valid inbound message bridges to Vapi with continuity and metadata only", async () => {
  const ctx = fixture();
  const handler = createWhatsAppVapiHandler(ctx.deps);
  const response = await handler(await formRequest(webhookUrl, inboundBody()));
  const xml = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/xml; charset=utf-8");
  assert.match(xml, /Hello &amp; welcome/);
  assert.doesNotMatch(xml, /Fabsy AI:/);
  assert.match(xml, /event=status&amp;inbound=/);
  assert.deepEqual(ctx.claims, [{
    messageSid: inboundSid,
    senderHash: ctx.claims[0] &&
      (ctx.claims[0] as { senderHash: string }).senderHash,
    bodyLength: 28,
    numMedia: 0,
    assistantId: "672c362f-c501-4cff-9c2b-977868dad856",
    control: null,
    previousSenderHash: null,
    rateLimitPerTenMinutes: 10,
  }]);
  assert.equal(JSON.stringify(ctx.claims).includes("Can you help"), false);
  assert.equal(ctx.chats.length, 1);
  assert.equal(ctx.authorizations.length, 1);
  assert.deepEqual(ctx.authorizations[0], {
    messageSid: inboundSid,
    senderHash: (ctx.claims[0] as { senderHash: string }).senderHash,
    limitPerTenMinutes: 60,
    limitPerDay: 500,
  });
  assert.equal(ctx.chats[0].previousChatId, "chat_previous");
  assert.deepEqual(ctx.chats[0].input.map(({ role }) => role), [
    "system",
    "user",
  ]);
  assert.match(ctx.chats[0].input[0].content, /same language/i);
  assert.equal(
    ctx.chats[0].input[0].content.includes("Can you help with my ticket?"),
    false,
  );
  assert.equal(ctx.chats[0].input[1].content, "Can you help with my ticket?");
  assert.deepEqual(ctx.completions, [{
    messageSid: inboundSid,
    senderHash: (ctx.claims[0] as { senderHash: string }).senderHash,
    state: "replied",
    vapiChatId: "chat_new",
    replyLength: 15,
  }]);
});

Deno.test("Vapi failure still returns safe TwiML and records fallback", async () => {
  const ctx = fixture();
  ctx.deps.chat.createChat = () =>
    Promise.reject(new Error("Vapi unavailable"));
  const response = await createWhatsAppVapiHandler(ctx.deps)(
    await formRequest(webhookUrl, inboundBody()),
  );
  const xml = await response.text();

  assert.equal(response.status, 200);
  assert.match(xml, /temporarily unavailable/i);
  assert.equal(ctx.completions[0].state, "fallback");
  assert.equal(ctx.completions[0].vapiChatId, null);
  assert.equal(
    JSON.stringify(ctx.completions).includes("Vapi unavailable"),
    false,
  );
});

Deno.test("status callback validates and records without invoking Vapi", async () => {
  const ctx = fixture();
  const callbackUrl = `${webhookUrl}?event=status&inbound=${inboundSid}`;
  const request = await formRequest(callbackUrl, {
    AccountSid: accountSid,
    MessageSid: outboundSid,
    MessageStatus: "delivered",
    ErrorCode: "",
  });
  const response = await createWhatsAppVapiHandler(ctx.deps)(request);

  assert.equal(response.status, 204);
  assert.equal(ctx.chats.length, 0);
  assert.equal(ctx.authorizations.length, 0);
  assert.deepEqual(ctx.statuses, [{
    inboundMessageSid: inboundSid,
    outboundMessageSid: outboundSid,
    status: "delivered",
    errorCode: null,
  }]);
});

Deno.test("invalid Twilio signature is rejected before persistence", async () => {
  const ctx = fixture();
  const request = await formRequest(webhookUrl, inboundBody());
  request.headers.set("x-twilio-signature", "invalid");
  const response = await createWhatsAppVapiHandler(ctx.deps)(request);

  assert.equal(response.status, 403);
  assert.equal(ctx.claims.length, 0);
  assert.equal(ctx.chats.length, 0);
});

Deno.test("duplicate MessageSid returns empty TwiML without another chat", async () => {
  const ctx = fixture({ kind: "duplicate", control: null });
  const response = await createWhatsAppVapiHandler(ctx.deps)(
    await formRequest(webhookUrl, inboundBody()),
  );

  assert.equal(response.status, 200);
  assert.equal(
    await response.text(),
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
  );
  assert.equal(ctx.chats.length, 0);
  assert.equal(ctx.completions.length, 0);
});

Deno.test("duplicate STOP retries an unfinished opt-out completion", async () => {
  const ctx = fixture({ kind: "duplicate", control: true });
  const response = await createWhatsAppVapiHandler(ctx.deps)(
    await formRequest(webhookUrl, inboundBody({ Body: "STOP" })),
  );

  assert.equal(response.status, 200);
  assert.match(await response.text(), /opted out/i);
  assert.equal(ctx.chats.length, 0);
  assert.equal(ctx.completions[0].state, "opted_out");
  assert.equal(ctx.completions[0].setOptedOut, true);
});

Deno.test("already-completed duplicate STOP does not send a second acknowledgement", async () => {
  const ctx = fixture({ kind: "duplicate", control: true });
  ctx.deps.store.completeInbound = (value) => {
    ctx.completions.push(value);
    return Promise.resolve({ replyAllowed: false });
  };
  const response = await createWhatsAppVapiHandler(ctx.deps)(
    await formRequest(webhookUrl, inboundBody({ Body: "STOP" })),
  );

  assert.equal(response.status, 200);
  assert.equal(
    await response.text(),
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
  );
  assert.equal(ctx.completions.length, 1);
});

Deno.test("duplicate retry uses the originally stored control classification", async () => {
  const ctx = fixture({ kind: "duplicate", control: true });
  const response = await createWhatsAppVapiHandler(ctx.deps)(
    await formRequest(webhookUrl, inboundBody({ Body: "changed retry body" })),
  );

  assert.equal(response.status, 200);
  assert.match(await response.text(), /opted out/i);
  assert.equal((ctx.claims[0] as { control: boolean | null }).control, null);
  assert.equal(ctx.completions[0].setOptedOut, true);
});

Deno.test("standalone STOP opts out without invoking Vapi", async () => {
  const ctx = fixture({
    kind: "claimed",
    previousChatId: "chat_previous",
    optedOut: false,
    busy: false,
    rateLimited: false,
  });
  const response = await createWhatsAppVapiHandler(ctx.deps)(
    await formRequest(webhookUrl, inboundBody({ Body: "STOP" })),
  );

  assert.equal(response.status, 200);
  assert.match(await response.text(), /opted out/i);
  assert.equal(ctx.chats.length, 0);
  assert.equal(ctx.authorizations.length, 0);
  assert.equal(ctx.completions[0].setOptedOut, true);
  assert.equal(
    (ctx.claims[0] as { control: boolean | null }).control,
    true,
  );
  assert.equal(ctx.completions[0].resetChat, true);
});

Deno.test("STOP bypasses a busy conversation lease and opts out immediately", async () => {
  const ctx = fixture({
    kind: "claimed",
    previousChatId: "chat_previous",
    optedOut: false,
    busy: true,
    rateLimited: false,
  });
  const response = await createWhatsAppVapiHandler(ctx.deps)(
    await formRequest(webhookUrl, inboundBody({ Body: "STOP" })),
  );

  assert.equal(response.status, 200);
  assert.match(await response.text(), /opted out/i);
  assert.equal(ctx.chats.length, 0);
  assert.equal(ctx.authorizations.length, 0);
  assert.equal(ctx.completions[0].state, "opted_out");
  assert.equal(ctx.completions[0].setOptedOut, true);
});

Deno.test("STOP completion failure returns retryable empty TwiML", async () => {
  const ctx = fixture();
  ctx.deps.store.completeInbound = () =>
    Promise.reject(new Error("database unavailable"));
  const response = await createWhatsAppVapiHandler(ctx.deps)(
    await formRequest(webhookUrl, inboundBody({ Body: "STOP" })),
  );

  assert.equal(response.status, 503);
  assert.equal(
    await response.text(),
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
  );
  assert.equal(ctx.chats.length, 0);
});

Deno.test("ordinary inbound is suppressed while the sender is opted out", async () => {
  const ctx = fixture({
    kind: "claimed",
    previousChatId: null,
    optedOut: true,
    busy: false,
    rateLimited: false,
  });
  const response = await createWhatsAppVapiHandler(ctx.deps)(
    await formRequest(webhookUrl, inboundBody({ Body: "Can you help?" })),
  );

  assert.equal(response.status, 200);
  assert.equal(
    await response.text(),
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
  );
  assert.equal(ctx.chats.length, 0);
  assert.equal(ctx.completions[0].state, "suppressed");
  assert.equal(ctx.completions[0].replyLength, 0);
});

Deno.test("explicit START clears opt-out, resets chat context, and acknowledges", async () => {
  const ctx = fixture({
    kind: "claimed",
    previousChatId: null,
    optedOut: true,
    busy: false,
    rateLimited: false,
  });
  const response = await createWhatsAppVapiHandler(ctx.deps)(
    await formRequest(webhookUrl, inboundBody({ Body: "UNSTOP" })),
  );

  assert.equal(response.status, 200);
  assert.match(await response.text(), /enabled again/i);
  assert.equal(ctx.chats.length, 0);
  assert.equal(ctx.completions[0].state, "re_enabled");
  assert.equal(ctx.completions[0].setOptedOut, false);
  assert.equal(ctx.completions[0].resetChat, true);
  assert.equal(
    (ctx.claims[0] as { control: boolean | null }).control,
    false,
  );
});

Deno.test("a STOP completion that wins the database race suppresses an in-flight Vapi reply", async () => {
  const ctx = fixture();
  ctx.deps.store.completeInbound = (value) => {
    ctx.completions.push(value);
    return Promise.resolve({ replyAllowed: false });
  };
  const response = await createWhatsAppVapiHandler(ctx.deps)(
    await formRequest(webhookUrl, inboundBody()),
  );

  assert.equal(response.status, 200);
  assert.equal(
    await response.text(),
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
  );
  assert.equal(ctx.chats.length, 1);
  assert.equal(ctx.completions[0].state, "replied");
});

Deno.test("status callback signature must include the exact query string", async () => {
  const ctx = fixture();
  const callbackUrl = `${webhookUrl}?event=status&inbound=${inboundSid}`;
  const encoded = new URLSearchParams({
    AccountSid: accountSid,
    MessageSid: outboundSid,
    MessageStatus: "delivered",
  });
  const wrongSignature = await computeTwilioSignature(
    "twilio-token",
    webhookUrl,
    formParameters(encoded),
  );
  const response = await createWhatsAppVapiHandler(ctx.deps)(
    new Request(callbackUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": wrongSignature,
      },
      body: encoded,
    }),
  );

  assert.equal(response.status, 403);
  assert.equal(ctx.statuses.length, 0);
  assert.equal(ctx.chats.length, 0);
});

Deno.test("media is not downloaded or sent to Vapi", async () => {
  const ctx = fixture();
  const response = await createWhatsAppVapiHandler(ctx.deps)(
    await formRequest(
      webhookUrl,
      inboundBody({
        Body: "See attached",
        NumMedia: "1",
        MediaUrl0: "https://api.twilio.test/private-media",
        MediaContentType0: "application/pdf",
      }),
    ),
  );

  assert.equal(response.status, 200);
  assert.match(await response.text(), /cannot review attachments/i);
  assert.equal(ctx.chats.length, 0);
  assert.equal(ctx.completions[0].state, "media_rejected");
  assert.equal(JSON.stringify(ctx.claims).includes("private-media"), false);
});

Deno.test("rate-limited ordinary inbound is recorded without Vapi or an outbound message", async () => {
  const ctx = fixture({
    kind: "claimed",
    previousChatId: "chat_previous",
    optedOut: false,
    busy: false,
    rateLimited: true,
  });
  const response = await createWhatsAppVapiHandler(ctx.deps)(
    await formRequest(webhookUrl, inboundBody()),
  );

  assert.equal(response.status, 200);
  assert.equal(
    await response.text(),
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
  );
  assert.equal(ctx.chats.length, 0);
  assert.equal(ctx.authorizations.length, 0);
  assert.equal(ctx.completions[0].state, "rate_limited");
  assert.equal(ctx.completions[0].replyLength, 0);
});

Deno.test("global chat quota suppresses Vapi and records a distinct state", async () => {
  const ctx = fixture();
  ctx.deps.store.authorizeChat = (value) => {
    ctx.authorizations.push(value);
    return Promise.resolve({ allowed: false, reason: "daily_limit" });
  };
  const response = await createWhatsAppVapiHandler(ctx.deps)(
    await formRequest(webhookUrl, inboundBody()),
  );

  assert.equal(response.status, 200);
  assert.equal(
    await response.text(),
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
  );
  assert.equal(ctx.authorizations.length, 1);
  assert.equal(ctx.chats.length, 0);
  assert.equal(ctx.completions[0].state, "global_rate_limited");
  assert.equal(ctx.completions[0].replyLength, 0);
});

Deno.test("global authorization persistence failure fails closed before Vapi", async () => {
  const ctx = fixture();
  ctx.deps.store.authorizeChat = () =>
    Promise.reject(new Error("database unavailable"));
  const response = await createWhatsAppVapiHandler(ctx.deps)(
    await formRequest(webhookUrl, inboundBody()),
  );

  assert.equal(response.status, 200);
  assert.equal(
    await response.text(),
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
  );
  assert.equal(ctx.chats.length, 0);
});

Deno.test("completion persistence failure suppresses the prepared reply", async () => {
  const ctx = fixture();
  ctx.deps.store.completeInbound = () =>
    Promise.reject(new Error("database unavailable"));
  const response = await createWhatsAppVapiHandler(ctx.deps)(
    await formRequest(webhookUrl, inboundBody()),
  );

  assert.equal(response.status, 200);
  assert.equal(
    await response.text(),
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
  );
  assert.equal(ctx.chats.length, 1);
});

Deno.test("claim persistence failure is retryable and sends no customer message", async () => {
  const ctx = fixture();
  ctx.deps.store.claimInbound = () =>
    Promise.reject(new Error("database unavailable"));
  const response = await createWhatsAppVapiHandler(ctx.deps)(
    await formRequest(webhookUrl, inboundBody()),
  );

  assert.equal(response.status, 503);
  assert.equal(
    await response.text(),
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
  );
  assert.equal(ctx.chats.length, 0);
});

Deno.test("oversized unknown-length form bodies are bounded before persistence", async () => {
  const ctx = fixture();
  const response = await createWhatsAppVapiHandler(ctx.deps)(
    new Request(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": "not-evaluated",
      },
      body: `Body=${"x".repeat(70_000)}`,
    }),
  );

  assert.equal(response.status, 413);
  assert.equal(ctx.claims.length, 0);
});

Deno.test("oversized declared Content-Length is rejected before reading or persistence", async () => {
  const ctx = fixture();
  const response = await createWhatsAppVapiHandler(ctx.deps)(
    new Request(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "content-length": "70000",
        "x-twilio-signature": "not-evaluated",
      },
      body: "Body=small",
    }),
  );

  assert.equal(response.status, 413);
  assert.equal(ctx.claims.length, 0);
  assert.equal(ctx.chats.length, 0);
});

Deno.test("previous sender-hash key is supplied only for safe rotation", async () => {
  const ctx = fixture();
  ctx.deps.config.previousSenderHashKey = "previous-sender-hash-key".repeat(2);
  const response = await createWhatsAppVapiHandler(ctx.deps)(
    await formRequest(webhookUrl, inboundBody()),
  );

  assert.equal(response.status, 200);
  const claim = ctx.claims[0] as {
    senderHash: string;
    previousSenderHash: string | null;
  };
  assert.match(claim.senderHash, /^[0-9a-f]{64}$/);
  assert.match(claim.previousSenderHash ?? "", /^[0-9a-f]{64}$/);
  assert.notEqual(claim.senderHash, claim.previousSenderHash);
});

Deno.test("first simple English greeting returns exact welcome and retains Vapi continuity", async () => {
  const ctx = fixture({
    kind: "claimed",
    previousChatId: null,
    optedOut: false,
    busy: false,
    rateLimited: false,
  });
  const response = await createWhatsAppVapiHandler(ctx.deps)(
    await formRequest(webhookUrl, inboundBody({ Body: "Hi Fabsy!" })),
  );
  const xml = await response.text();
  assert.equal(
    xml.match(/<Message[^>]*>(.*?)<\/Message>/)?.[1],
    WHATSAPP_OPENING_GREETING,
  );
  assert.equal(ctx.chats.length, 1);
  assert.equal(ctx.chats[0].previousChatId, undefined);
  assert.match(ctx.chats[0].input[0].content, /Reply with exactly:/);
  assert.equal(ctx.completions[0].vapiChatId, "chat_new");
  assert.equal(
    ctx.completions[0].replyLength,
    WHATSAPP_OPENING_GREETING.length,
  );
  assert.equal(ctx.authorizations.length, 1);
});

Deno.test("substantive or non-English opening messages are answered rather than replaced by greeting", async () => {
  for (
    const body of [
      "Hi, can you help with my ticket?",
      "Are you an AI assistant?",
      "Bonjour",
    ]
  ) {
    const ctx = fixture({
      kind: "claimed",
      previousChatId: null,
      optedOut: false,
      busy: false,
      rateLimited: false,
    });
    const response = await createWhatsAppVapiHandler(ctx.deps)(
      await formRequest(webhookUrl, inboundBody({ Body: body })),
    );
    const xml = await response.text();
    assert.match(xml, /Hello &amp; welcome/);
    assert.doesNotMatch(xml, /Thanks for contacting us/);
    assert.doesNotMatch(ctx.chats[0].input[0].content, /Reply with exactly:/);
    assert.equal(ctx.chats[0].input[1].content, body);
  }
});

Deno.test("greetings in an existing conversation keep the assistant response", async () => {
  const ctx = fixture();
  const response = await createWhatsAppVapiHandler(ctx.deps)(
    await formRequest(webhookUrl, inboundBody({ Body: "Hello" })),
  );
  assert.match(await response.text(), /Hello &amp; welcome/);
  assert.equal(ctx.chats[0].previousChatId, "chat_previous");
  assert.doesNotMatch(ctx.chats[0].input[0].content, /Reply with exactly:/);
});

Deno.test("exact opening greeting still requires circuit authorization and durable completion", async () => {
  const claim: InboundClaim = {
    kind: "claimed",
    previousChatId: null,
    optedOut: false,
    busy: false,
    rateLimited: false,
  };
  const disabled = fixture(claim);
  disabled.deps.store.authorizeChat = () =>
    Promise.resolve({ allowed: false, reason: "disabled" });
  const disabledResponse = await createWhatsAppVapiHandler(disabled.deps)(
    await formRequest(webhookUrl, inboundBody({ Body: "hi" })),
  );
  assert.doesNotMatch(await disabledResponse.text(), /<Message/);
  assert.equal(disabled.chats.length, 0);
  const failedCompletion = fixture(claim);
  failedCompletion.deps.store.completeInbound = () =>
    Promise.reject(new Error("Synthetic persistence failure"));
  const failedResponse = await createWhatsAppVapiHandler(failedCompletion.deps)(
    await formRequest(webhookUrl, inboundBody({ Body: "hi" })),
  );
  assert.doesNotMatch(await failedResponse.text(), /<Message/);
});
