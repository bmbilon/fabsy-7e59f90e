import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { tawkActivity, verifyTawkSignature } from "./tawk-activity.ts";

const event = {
  event: "chat:start",
  time: "2026-09-22T20:00:00Z",
  property: { id: "fabsy" },
  chatId: "chat1",
  visitor: { name: "Anonymous visitor" },
  message: { text: "Can you help?", sender: { type: "visitor" } },
};

Deno.test("anonymous Tawk questions require neither email nor traffic ticket", () => {
  const result = tawkActivity(event, "fabsy")!;
  assertEquals(result.event_type, "tawk_question");
  assertEquals(result.payload.client_email, "");
  assertEquals(result.payload.message, "Can you help?");
  assertThrows(() => tawkActivity(event, "another-property"));
  assertEquals(
    tawkActivity({ ...event, message: { sender: { type: "agent" } } }, "fabsy"),
    null,
  );
});

Deno.test("full transcripts capture visitor questions after an agent opens the chat", () => {
  const transcript = {
    event: "chat:transcript_created",
    property: { id: "fabsy" },
    chat: {
      id: "chat1",
      visitor: {},
      messages: [{ sender: { t: "s" }, msg: "Welcome" }, {
        sender: { t: "a" },
        msg: "Hello",
      }, { sender: { t: "v" }, msg: "How much?" }],
    },
  };
  assertEquals(
    tawkActivity(transcript, "fabsy")!.payload.message,
    "Agent: Hello\n\nVisitor: How much?",
  );
  assertEquals(
    tawkActivity({
      ...transcript,
      chat: {
        ...transcript.chat,
        messages: [{ sender: { t: "s" }, msg: "Welcome" }],
      },
    }, "fabsy"),
    null,
  );
});

Deno.test("Tawk authenticates the exact body and rejects tampering", async () => {
  const raw = JSON.stringify(event), secret = "test-only-secret";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
  );
  const signature = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("");
  assertEquals(await verifyTawkSignature(raw, signature, secret), true);
  assertEquals(await verifyTawkSignature(raw + " ", signature, secret), false);
  assertEquals(await verifyTawkSignature(raw, signature, "wrong"), false);
  assertEquals(await verifyTawkSignature(raw, "", secret), false);
});
