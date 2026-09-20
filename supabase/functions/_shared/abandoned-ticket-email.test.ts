const completionUrl = `https://fabsy.ca/complete-ticket#access=c1.${"1".repeat(32)}.${"a".repeat(64)}.1999999999.${"b".repeat(64)}`;
import { renderAbandonedTicketEmail } from "./abandoned-ticket-email.ts";
import { getFabsyEmailSignature } from "./email-signature.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(JSON.stringify({ actual, expected }));
}
function check(condition: unknown, message: string) { if (!condition) throw new Error(message); }

Deno.test("abandoned ticket email confirms receipt and links directly to private consent and payment", () => {
  const email = renderAbandonedTicketEmail({ completionUrl, email: "ali@example.test", firstName: "Ali", ticketType: "Speeding", ticketNumber: "E24800635T" });
  equal(email.from, "Fabsy <hello@fabsy.ca>");
  equal(email.to, ["ali@example.test"]);
  equal(email.bcc, ["hello@fabsy.ca", "brett@execom.ca"]);
  equal(email.reply_to, "hello@fabsy.ca");
  equal(email.subject, "Ticket received — complete consent and payment (E24800635T)");
  const exactBody = [
    "Hi Ali,",
    "Thank you for submitting your ticket. We've received it and can help you take the next steps with Fabsy.",
    "Your ticket is already saved. You just need to review and sign your consent, then pay the service fee using your private link below. Any details you've already provided will be filled in. You do not need to upload or submit your ticket again.",
    completionUrl,
    "Please let us know if you have any questions.",
    "Kind regards,",
  ];
  check(email.text.startsWith(exactBody.join("\n\n") + "\n\n"), "Plain text body differs from supplied copy");
  for (const paragraph of exactBody) check(email.html.includes(paragraph.replaceAll("'", "&#039;")), `HTML copy missing: ${paragraph}`);
  check(email.html.includes(getFabsyEmailSignature()), "Requested shared signature is missing");
});

Deno.test("missing personal details get neutral greeting and omit unknown subject parts", () => {
  for (const changed of [{}, { firstName: null, ticketType: null, ticketNumber: null }, { firstName: "  ", ticketType: "  ", ticketNumber: "  " }]) {
    const email = renderAbandonedTicketEmail({ completionUrl, email: "fixture@example.test", ...changed });
    equal(email.subject, "Ticket received — complete consent and payment");
    check(email.text.startsWith("Hi there,\n\n"), "Missing name should get Hi there");
    check(!email.html.includes("undefined") && !email.html.includes("Hi null"), "Missing data leaked into HTML");
  }
  equal(renderAbandonedTicketEmail({ completionUrl, email: "fixture@example.test", ticketNumber: "T123" }).subject, "Ticket received — complete consent and payment (T123)");
  equal(renderAbandonedTicketEmail({ completionUrl, email: "fixture@example.test", ticketType: "Stop sign" }).subject, "Ticket received — complete consent and payment");
  equal(renderAbandonedTicketEmail({ completionUrl, email: "fixture@example.test", ticketType: "officer_issued" }).subject, "Ticket received — complete consent and payment");
});

Deno.test("personalization escapes HTML, removes header controls, and preserves Unicode", () => {
  const email = renderAbandonedTicketEmail({ completionUrl,
    email: "  fixture@example.test  ", firstName: " Zoë <img src=x onerror=alert(1)> & '李' ",
    ticketType: "Arrêt\r\nBcc: injected\u0000", ticketNumber: "É１２３\u2028\t\u0085",
  });
  equal(email.to, ["fixture@example.test"]);
  equal(email.bcc, ["hello@fabsy.ca", "brett@execom.ca"]);
  equal(email.subject, "Ticket received — complete consent and payment (É１２３)");
  check(!/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(email.subject), "Unsafe controls in subject");
  check(email.html.includes("Zoë &lt;img src=x onerror=alert(1)&gt; &amp; &#039;李&#039;"), "Personalization was not HTML escaped");
  check(!email.html.includes("<img src=x"), "Untrusted image tag rendered");
  check(email.text.startsWith("Hi Zoë <img src=x onerror=alert(1)> & '李',\n\n"), "Plain text lost Unicode or uses HTML entities");
});

Deno.test("plain text signature includes all supplied contact, pricing, and disclaimer details", () => {
  const { text, html } = renderAbandonedTicketEmail({ completionUrl, email: "fixture@example.test" });
  for (const copy of [
    "Fabsy", "Traffic ticket agent services for Alberta drivers", "(825) 793-2279", "hello@fabsy.ca", "https://fabsy.ca", "Alberta, Canada",
    "Rapid Resolution is $198 CAD plus GST for eligible Alberta pre-trial matters. Trial and government fines are separate.",
    "Confidentiality Notice: This email and any attachments are confidential and intended solely for the recipient. If you are not the intended recipient, please delete this email and notify the sender immediately.",
    "Service Disclaimer: Fabsy is an agent service for Alberta traffic matters, not a law firm. This communication is general information and does not constitute legal advice or create a solicitor-client relationship.",
  ]) check(text.includes(copy), `Signature text missing: ${copy}`);
  check(!html.includes("supabase.co/storage") && !text.includes("supabase.co/storage"), "Email exposes private ticket storage");
  check(!html.includes("/submit-ticket"), "Email must not restart intake");
});
