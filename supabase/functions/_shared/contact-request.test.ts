import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ContactRequestError, escapeContactHtml, parseContactRequest } from "./contact-request.ts";

Deno.test("fleet intake preserves multiline lists without accepting header injection", () => {
  const request = { name: "Fleet contact", email: "fleet@example.com", inquiry_type: "fleet", message: "Plates:\nEXAMPLE1\nEXAMPLE2" };
  assertEquals(parseContactRequest(request).message, request.message);
  assertEquals(parseContactRequest(request).inquiryType, "fleet");
  assertThrows(() => parseContactRequest({ ...request, email: "fleet@example.com\r\nBcc: attacker@example.com" }), ContactRequestError);
  assertThrows(() => parseContactRequest({ ...request, subject: "Hello\nInjected" }), ContactRequestError);
  assertThrows(() => parseContactRequest({ ...request, message: "a".repeat(6001) }), ContactRequestError);
  assertThrows(() => parseContactRequest({ ...request, inquiry_type: "billing" }), ContactRequestError);
});

Deno.test("contact HTML cannot render client supplied tags or attributes", () => {
  assertEquals(escapeContactHtml('<img src=x onerror="run()"> & \'quoted\''), '&lt;img src=x onerror=&quot;run()&quot;&gt; &amp; &#39;quoted&#39;');
});
