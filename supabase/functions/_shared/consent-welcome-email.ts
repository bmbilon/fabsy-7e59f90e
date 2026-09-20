import { prepareClientEmail } from "./notification-locale.ts";
import { getFabsyEmailSignature } from "./email-signature.ts";
import { type ConsentWelcomeContext, type ConsentWelcomeDocuments, type ConsentWelcomeEmail, type ConsentWelcomePayment, ConsentWelcomeError, welcomeTicketNumbers, WELCOME_VERSION } from "./consent-welcome-types.ts";

const html = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
export function consentWelcomeEmail(context: ConsentWelcomeContext, documents: ConsentWelcomeDocuments, payment: ConsentWelcomePayment): ConsentWelcomeEmail {
  const ticket = welcomeTicketNumbers(context).join(", "), email = context.recipient || "";
  if (!/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(email) || email.length > 254
    || !documents.attachments.length) throw new ConsentWelcomeError("welcome_identity_invalid", true);
  if (payment.paymentUrl && !/^https:\/\/fabsy\.ca\/pay\/[A-Za-z0-9_-]{22}$/.test(payment.paymentUrl)) throw new ConsentWelcomeError("welcome_payment_link_invalid", true);
  const first = typeof context.first_name === "string" ? context.first_name.trim().slice(0, 100) : "";
  const greeting = first ? `Hi ${first},` : "Hello,";
  const receipt = context.source_type === "invite" && !context.submission_id
    ? "Welcome to Fabsy. We’ve received your completed consent form. A copy is attached for your records."
    : "Welcome to Fabsy. We’ve received your ticket upload and completed consent. A copy of your consent is attached for your records.";
  const manual = context.signature_method === "manual_scan"
    ? "The attachments include your uploaded signed consent scan and its signing record. This email confirms receipt; it does not confirm that a staff review of the scan is complete."
    : "Keep the attached consent copy with your ticket records.";
  const next = "Once payment and the required information are confirmed, we’ll review your ticket and take the steps you authorized. We’ll email you when disclosure has been requested and contact you about the evidence and next options. Reply here if you receive new court documents or your contact details change. This email confirms receipt of your consent; it does not confirm that a plea or disclosure request has been filed.";
  let paymentText = "";
  if (payment.state === "unpaid" && context.submission_id && !context.payment_unknown) {
    paymentText = payment.paymentUrl
      ? `Your representation payment is still outstanding. Complete payment securely using this existing checkout link: ${payment.paymentUrl}`
      : "Your representation payment is still outstanding. Complete payment from your ticket upload screen. If you closed it, reply to this email and we’ll help you finish payment.";
  }
  const paymentHtml = paymentText && payment.paymentUrl
    ? `<p>Your representation payment is still outstanding. <a href="${html(payment.paymentUrl)}">Complete payment securely</a> using your existing checkout link.</p>`
    : paymentText ? `<p>${html(paymentText)}</p>` : "";
  const text = [greeting, receipt, `Ticket: ${ticket}`, manual, next, paymentText, "Questions? Reply to this email or contact hello@fabsy.ca.", "Fabsy Traffic Ticket Services"].filter(Boolean).join("\n\n");
  const english: ConsentWelcomeEmail = {
    from: "Fabsy <hello@fabsy.ca>", to: [email], reply_to: "hello@fabsy.ca",
    subject: `Ticket ${ticket} — Welcome and your consent copy`, text,
    html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#172033"><h1>Welcome to Fabsy</h1><p>${html(greeting)}</p><p>${html(receipt)}</p><p><strong>Ticket:</strong> ${html(ticket)}</p><p>${html(manual)}</p><p>${html(next)}</p>${paymentHtml}<p>Questions? Reply to this email or contact <a href="mailto:hello@fabsy.ca">hello@fabsy.ca</a>.</p>${getFabsyEmailSignature()}</div>`,
    headers: { "X-Fabsy-Consent-Welcome-Version": WELCOME_VERSION }, attachments: documents.attachments,
  };
  return prepareClientEmail(english, { preferredLocale: context.preferred_locale, template: "case_update" });
}
