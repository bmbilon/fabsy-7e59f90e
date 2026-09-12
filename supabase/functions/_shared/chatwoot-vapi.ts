import { classifyControlMessage, isMessageSid } from "./whatsapp-vapi.ts";

export const CHATWOOT_REPLY_MARKER = "fabsy_reply_key";
export const MAX_CHATWOOT_BODY_BYTES = 64 * 1024;
export const HANDOFF_MARKER = "[[FABSY_HUMAN_HANDOFF]]";

export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
export function positiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
export function safeEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    difference |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return difference === 0;
}
export async function hmacHex(key: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const result = new Uint8Array(
    await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(body)),
  );
  return Array.from(result, (value) => value.toString(16).padStart(2, "0"))
    .join("");
}
export async function verifyChatwootSignature(
  secret: string,
  signature: string,
  timestamp: string,
  rawBody: string,
  now: number,
): Promise<boolean> {
  if (
    secret.length < 24 || !/^\d{10}$/.test(timestamp) ||
    !/^sha256=[0-9a-f]{64}$/.test(signature)
  ) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  return safeEqual(
    signature,
    `sha256=${await hmacHex(secret, `${timestamp}.${rawBody}`)}`,
  );
}
export async function readLimitedText(request: Request): Promise<string> {
  const length = request.headers.get("content-length");
  if (
    length &&
    (!/^\d+$/.test(length) || Number(length) > MAX_CHATWOOT_BODY_BYTES)
  ) throw new RangeError("body_limit");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let lengthRead = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    lengthRead += part.value.byteLength;
    if (lengthRead > MAX_CHATWOOT_BODY_BYTES) {
      await reader.cancel();
      throw new RangeError("body_limit");
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(lengthRead);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
export function timestampIso(value: unknown): string | null {
  const millis = typeof value === "number"
    ? value * 1000
    : typeof value === "string"
    ? Date.parse(value)
    : NaN;
  return Number.isFinite(millis) && millis > 0
    ? new Date(millis).toISOString()
    : null;
}
export function humanAssigned(value: unknown): boolean {
  const conversation = object(value);
  const meta = object(conversation.meta);
  if (positiveId(conversation.assignee_id)) return true;
  const assignee = object(meta.assignee ?? conversation.assignee);
  if (!positiveId(assignee.id)) return false;
  return (meta.assignee_type ?? conversation.assignee_type) !== "AgentBot";
}
export type QueueEvent =
  & {
    accountId: number;
    inboxId: number;
    conversationId: number;
    deliveryId: string;
    eventAt: string;
  }
  & (
    | {
      kind: "incoming";
      messageId: number;
      messageSid: string;
      controlHint: boolean;
    }
    | { kind: "invalidate" }
    | { kind: "status"; status: string; humanAssigned: boolean }
  );

// Delivery UUID is stable even when older Chatwoot releases omit the header.
// A signed payload is never retained; only this digest-derived identifier is stored.
export async function deliveryId(
  header: string | null,
  secret: string,
  body: string,
): Promise<string> {
  if (
    header &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(header)
  ) return header;
  const hash = await hmacHex(secret, body);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${
    hash.slice(17, 20)
  }-${hash.slice(20, 32)}`;
}

export function parseChatwootEvent(
  input: unknown,
  accountId: number,
  inboxId: number,
  delivery: string,
): QueueEvent | null {
  const value = object(input);
  const c = object(value.conversation ?? value);
  const account = object(value.account).id ?? c.account_id;
  const inbox = object(value.inbox).id ?? c.inbox_id;
  if (account !== accountId || inbox !== inboxId || !positiveId(c.id)) {
    throw new Error("wrong_scope");
  }
  if (
    (c.account_id !== undefined && c.account_id !== accountId) ||
    (object(c.account).id !== undefined &&
      object(c.account).id !== accountId) ||
    (c.inbox_id !== undefined && c.inbox_id !== inboxId)
  ) throw new Error("wrong_scope");
  const eventAt = timestampIso(
    value.created_at ?? c.updated_at ?? c.created_at,
  );
  if (!eventAt) throw new Error("invalid_event_time");
  const base = {
    accountId,
    inboxId,
    conversationId: c.id,
    deliveryId: delivery,
    eventAt,
  };
  if (value.event === "message_created") {
    if (value.private !== false) return null;
    if (value.message_type === "incoming" || value.message_type === 0) {
      if (!positiveId(value.id) || !isMessageSid(value.source_id)) {
        throw new Error("invalid_incoming");
      }
      const sender = object(value.sender);
      const senderAccount = object(sender.account).id;
      // Contact#webhook_data omits `type`, unlike Contact#push_event_data
      // used by the conversation API. Native webhooks identify the contact
      // by its ID and account. Twilio and the native delivery route are still
      // independently verified by the worker before any reply.
      if (
        !positiveId(sender.id) ||
        (sender.type !== undefined && sender.type !== "contact") ||
        (senderAccount !== undefined && senderAccount !== accountId) ||
        (sender.type === undefined && senderAccount !== accountId)
      ) {
        throw new Error("invalid_sender");
      }
      return {
        ...base,
        kind: "incoming",
        messageId: value.id,
        messageSid: value.source_id,
        controlHint: typeof value.content === "string" &&
          classifyControlMessage(value.content) !== null,
      };
    }
    if (
      (value.message_type === "outgoing" || value.message_type === 1) &&
      object(value.sender).type === "user"
    ) return { ...base, kind: "invalidate" };
    return null;
  }
  if (
    [
      "conversation_status_changed",
      "conversation_updated",
      "conversation_opened",
      "conversation_resolved",
    ].includes(String(value.event))
  ) {
    const status = c.status;
    if (!["pending", "open", "resolved", "snoozed"].includes(String(status))) {
      return null;
    }
    const changed = Array.isArray(value.changed_attributes)
      ? value.changed_attributes
      : [];
    // Conversation updates carry previous_changes in native Chatwoot. The
    // separate status_changed notification can omit changed_attributes.
    // Require the explicit transition in either event before releasing a hold.
    const explicitStatus =
      ["conversation_status_changed", "conversation_updated"].includes(
        String(value.event),
      ) &&
      changed.some((item) => {
        const change = object(object(item).status);
        return typeof change.current_value === "string" &&
          change.current_value === status &&
          ["pending", "open", "resolved", "snoozed"].includes(
            String(change.previous_value),
          ) && change.previous_value !== status;
      });
    const changedAt = timestampIso(c.updated_at);
    if (explicitStatus && changedAt) {
      return {
        ...base,
        eventAt: changedAt,
        kind: "status",
        status: String(status),
        humanAssigned: humanAssigned(c),
      };
    }
    if (status !== "pending" || humanAssigned(c)) {
      return { ...base, eventAt: changedAt ?? eventAt, kind: "invalidate" };
    }
  }
  return null;
}

export function requestsHuman(body: string): boolean {
  const text = body.normalize("NFKC").trim().toLocaleLowerCase("en-CA");
  return /^(?:human|agent|person|brett|live agent|representative)[.!?]*$/.test(
    text,
  ) ||
    /\b(?:speak|talk|connect|transfer|chat)\s+(?:me\s+)?(?:with|to)\s+(?:a\s+|an\s+|the\s+)?(?:human|person|agent|representative|brett)\b/
      .test(text) ||
    /(?:hablar con (?:una persona|un agente|un humano)|parler [àa] (?:un humain|une personne|un agent)|किसी इंसान से बात|ਕਿਸੇ ਇਨਸਾਨ ਨਾਲ ਗੱਲ|与人工|人工客服)/u
      .test(text);
}
