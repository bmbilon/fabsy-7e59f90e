type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as ObjectValue
    : {};
const text = (value: unknown, max = 12000) =>
  typeof value === "string" ? value.slice(0, max) : "";

export async function verifyTawkSignature(
  raw: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  if (!secret || !/^[a-f0-9]{40}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["verify"],
  );
  const bytes = Uint8Array.from(
    signature.match(/.{2}/g)!,
    (part) => parseInt(part, 16),
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    bytes,
    new TextEncoder().encode(raw),
  );
}

export function tawkActivity(input: unknown, propertyId: string) {
  const data = object(input);
  if (!propertyId || object(data.property).id !== propertyId) {
    throw new Error("wrong_property");
  }
  const common = {
    intake_source: "Tawk",
    source_event: text(data.event, 80),
    occurred_at: text(data.time, 60),
  };
  if (data.event === "chat:start") {
    const message = object(data.message);
    if (object(message.sender).type !== "visitor") return null;
    const visitor = object(data.visitor);
    if (!text(data.chatId)) throw new Error("missing_chat_id");
    return {
      event_type: "tawk_question",
      payload: {
        ...common,
        chat_id: text(data.chatId, 200),
        client_name: text(visitor.name, 120),
        client_email: text(visitor.email, 254),
        message: text(message.text) ||
          `Visitor sent ${text(message.type, 50) || "a message"}.`,
      },
    };
  }
  if (data.event === "chat:transcript_created") {
    const chat = object(data.chat);
    const messages = Array.isArray(chat.messages)
      ? chat.messages.map(object)
      : [];
    if (!messages.some((message) => object(message.sender).t === "v")) {
      return null;
    }
    if (!text(chat.id)) throw new Error("missing_chat_id");
    const visitor = object(chat.visitor);
    const transcript = messages.filter((message) =>
      ["v", "a"].includes(text(object(message.sender).t))
    )
      .map((message) =>
        `${object(message.sender).t === "v" ? "Visitor" : "Agent"}: ${
          text(message.msg) || "[attachment]"
        }`
      ).join("\n\n");
    return {
      event_type: "tawk_transcript",
      payload: {
        ...common,
        chat_id: text(chat.id, 200),
        client_name: text(visitor.name, 120),
        client_email: text(visitor.email, 254),
        message: transcript.slice(0, 50000),
      },
    };
  }
  if (data.event === "ticket:create") {
    const ticket = object(data.ticket), visitor = object(data.requester);
    if (!text(ticket.id)) throw new Error("missing_support_id");
    return {
      event_type: "tawk_ticket",
      payload: {
        ...common,
        support_request_id: text(ticket.id, 200),
        client_name: text(visitor.name, 120),
        client_email: text(visitor.email, 254),
        subject: text(ticket.subject, 200),
        message: text(ticket.message),
      },
    };
  }
  return null;
}
