import { renderAbandonedTicketEmail } from "./abandoned-ticket-email.ts";
import { getFabsyEmailSignature } from "./email-signature.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(JSON.stringify({ actual, expected }));
}
function check(condition: unknown, message: string) { if (!condition) throw new Error(message); }

Deno.test("abandoned ticket email preserves the supplied English body, subject, and sender", () => {
  const email = renderAbandonedTicketEmail({ email: "ali@example.test", firstName: "Ali", ticketType: "Speeding", ticketNumber: "E24800635T" });
  equal(email.from, "Fabsy <hello@fabsy.ca>");
  equal(email.to, ["ali@example.test"]);
  equal(email.reply_to, "hello@fabsy.ca");
  equal(email.subject, "Alberta Speeding E24800635T Ticket Inquiry");
  const exactBody = [
    "Hi Ali,",
    "Thank you for submitting your ticket- we are confirming receipt, and are happy to advise that we can get the ticket reduced or withdrawn for you. If we are unable to do that, we will refund any fees we charge you for our service.",
    "If you can kindly click through the below form it will let you attach that same image, sign the consent form, and process payment for us to fight your ticket for you in about 90sec",
    "https://fabsy.ca/submit-ticket",
    "Please let us know if you have any questions.",
    "Kind regards,",
  ];
  check(email.text.startsWith(exactBody.join("\n\n") + "\n\n"), "Plain text body differs from supplied copy");
  for (const paragraph of exactBody) check(email.html.includes(paragraph), `HTML copy missing: ${paragraph}`);
  check(email.html.includes(getFabsyEmailSignature()), "Requested shared signature is missing");
});

Deno.test("missing personal details get neutral greeting and omit unknown subject parts", () => {
  for (const changed of [{}, { firstName: null, ticketType: null, ticketNumber: null }, { firstName: "  ", ticketType: "  ", ticketNumber: "  " }]) {
    const email = renderAbandonedTicketEmail({ email: "fixture@example.test", ...changed });
    equal(email.subject, "Alberta Ticket Inquiry");
    check(email.text.startsWith("Hi there,\n\n"), "Missing name should get Hi there");
    check(!email.html.includes("undefined") && !email.html.includes("Hi null"), "Missing data leaked into HTML");
  }
  equal(renderAbandonedTicketEmail({ email: "fixture@example.test", ticketNumber: "T123" }).subject, "Alberta T123 Ticket Inquiry");
  equal(renderAbandonedTicketEmail({ email: "fixture@example.test", ticketType: "Stop sign" }).subject, "Alberta Stop sign Ticket Inquiry");
  equal(renderAbandonedTicketEmail({ email: "fixture@example.test", ticketType: "officer_issued" }).subject, "Alberta Ticket Inquiry");
});

Deno.test("specific speeding descriptions are shortened without inventing other ticket types", () => {
  for (const ticketType of ["speeding", "Speeding 20 km/h over", "Exceed maximum speed limit", "Exceeding posted speed limit"]) {
    equal(renderAbandonedTicketEmail({ email: "fixture@example.test", ticketType }).subject, "Alberta Speeding Ticket Inquiry");
  }
  for (const ticketType of ["Fail to stop at stop sign", "Distracted driving", "Conduite dangereuse"]) {
    equal(renderAbandonedTicketEmail({ email: "fixture@example.test", ticketType }).subject, `Alberta ${ticketType} Ticket Inquiry`);
  }
});

Deno.test("personalization escapes HTML, removes header controls, and preserves Unicode", () => {
  const email = renderAbandonedTicketEmail({
    email: "  fixture@example.test  ", firstName: " Zoë <img src=x onerror=alert(1)> & '李' ",
    ticketType: "Arrêt\r\nBcc: injected\u0000", ticketNumber: "É１２３\u2028\t\u0085",
  });
  equal(email.to, ["fixture@example.test"]);
  equal(email.subject, "Alberta Arrêt Bcc: injected É１２３ Ticket Inquiry");
  check(!/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(email.subject), "Unsafe controls in subject");
  check(email.html.includes("Zoë &lt;img src=x onerror=alert(1)&gt; &amp; &#039;李&#039;"), "Personalization was not HTML escaped");
  check(!email.html.includes("<img src=x"), "Untrusted image tag rendered");
  check(email.text.startsWith("Hi Zoë <img src=x onerror=alert(1)> & '李',\n\n"), "Plain text lost Unicode or uses HTML entities");
});

Deno.test("plain text signature includes all supplied contact, pricing, and disclaimer details", () => {
  const { text, html } = renderAbandonedTicketEmail({ email: "fixture@example.test" });
  for (const copy of [
    "Fabsy", "Traffic ticket agent services for Alberta drivers", "(825) 793-2279", "hello@fabsy.ca", "https://fabsy.ca", "Alberta, Canada",
    "Rapid Resolution is $198 CAD plus GST for eligible Alberta pre-trial matters. Trial and government fines are separate.",
    "Confidentiality Notice: This email and any attachments are confidential and intended solely for the recipient. If you are not the intended recipient, please delete this email and notify the sender immediately.",
    "Service Disclaimer: Fabsy is an agent service for Alberta traffic matters, not a law firm. This communication is general information and does not constitute legal advice or create a solicitor-client relationship.",
  ]) check(text.includes(copy), `Signature text missing: ${copy}`);
  check(!html.includes("supabase.co/storage") && !text.includes("supabase.co/storage"), "Email exposes private ticket storage");
  equal((html.match(/https:\/\/fabsy.ca\/submit-ticket/g) || []).length, 2);
});
