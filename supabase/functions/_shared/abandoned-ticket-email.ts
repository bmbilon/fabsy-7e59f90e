import { getFabsyEmailSignature } from "./email-signature.ts";

export interface AbandonedTicketEmail {
  from: string;
  to: string[];
  bcc: string[];
  reply_to: string;
  subject: string;
  html: string;
  text: string;
}

const submissionUrl = "https://fabsy.ca/submit-ticket";
const receiptCopy = "Thank you for submitting your ticket- we are confirming receipt, and are happy to advise that we can get the ticket reduced or withdrawn for you. If we are unable to do that, we will refund any fees we charge you for our service.";
const checkoutCopy = "If you can kindly click through the below form it will let you attach that same image, sign the consent form, and process payment for us to fight your ticket for you in about 90sec";
const questionsCopy = "Please let us know if you have any questions.";

// Normalize header-breaking controls without dropping names in other alphabets.
function singleLine(value?: string | null): string {
  return (value ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
    .replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function subjectTicketType(value?: string | null): string {
  const type = singleLine(value);
  // Generic intake categories are not a specific allegation. Only known
  // speeding wording is shortened; other supplied allegations stay verbatim.
  if (/^(unknown|not provided|n\/a|ticket|officer_issued)$/i.test(type)) return "";
  if (/\bspeeding\b|\bexceed(?:ing|ed|s)?\b.{0,48}\bspeed(?:\s+limit)?\b/i.test(type)) return "Speeding";
  return type;
}

const plainTextSignature = `Fabsy
Traffic ticket agent services for Alberta drivers

Phone: (825) 793-2279
Email: hello@fabsy.ca
Web: https://fabsy.ca
Area: Alberta, Canada

Rapid Resolution is $198 CAD plus GST for eligible Alberta pre-trial matters. Trial and government fines are separate.

Confidentiality Notice: This email and any attachments are confidential and intended solely for the recipient. If you are not the intended recipient, please delete this email and notify the sender immediately.

Service Disclaimer: Fabsy is an agent service for Alberta traffic matters, not a law firm. This communication is general information and does not constitute legal advice or create a solicitor-client relationship.`;

/** Pure rendering only: calling this function never sends email. */
export function renderAbandonedTicketEmail(input: {
  email: string;
  firstName?: string | null;
  ticketType?: string | null;
  ticketNumber?: string | null;
}): AbandonedTicketEmail {
  const greeting = `Hi ${singleLine(input.firstName) || "there"},`;
  const subject = ["Alberta", subjectTicketType(input.ticketType), singleLine(input.ticketNumber), "Ticket Inquiry"]
    .filter(Boolean).join(" ");
  const text = [greeting, receiptCopy, checkoutCopy, submissionUrl, questionsCopy, "Kind regards,", plainTextSignature].join("\n\n");
  const paragraph = (copy: string) => `<p style="margin:0 0 28px;">${escapeHtml(copy)}</p>`;

  return {
    from: "Fabsy <hello@fabsy.ca>",
    to: [input.email.trim()],
    bcc: ["brett@execom.ca"],
    reply_to: "hello@fabsy.ca",
    subject,
    text,
    html: `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#ffffff;color:#111111;font-family:Arial,sans-serif;font-size:16px;line-height:1.55;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:720px;border-collapse:collapse;">
    <tr><td style="padding:0;">
      ${paragraph(greeting)}
      ${paragraph(receiptCopy)}
      ${paragraph(checkoutCopy)}
      <p style="margin:0 0 28px;"><a href="${submissionUrl}" style="color:#2563eb;text-decoration:underline;">${submissionUrl}</a></p>
      ${paragraph(questionsCopy)}
      <p style="margin:0;">Kind regards,</p>
      ${getFabsyEmailSignature()}
    </td></tr>
  </table>
</body>
</html>`,
  };
}
