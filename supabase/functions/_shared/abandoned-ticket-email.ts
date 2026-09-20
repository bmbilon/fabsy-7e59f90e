import { validTicketCompletionUrl } from "./ticket-completion.ts";
import { getFabsyEmailSignature } from "./email-signature.ts";
import { FABSY_INTERNAL_NOTIFICATION_DELIVERY } from "./resend-email.ts";

export interface AbandonedTicketEmail {
  from: string;
  to: string[];
  bcc: string[];
  reply_to: string;
  subject: string;
  html: string;
  text: string;
}

const receiptCopy = "Thank you for submitting your ticket. We've received it and can help you take the next steps with Fabsy.";
const checkoutCopy = "Your ticket is already saved. You just need to review and sign your consent, then pay the service fee using your private link below. Any details you've already provided will be filled in. You do not need to upload or submit your ticket again.";
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
  completionUrl: string;
  firstName?: string | null;
  ticketType?: string | null;
  ticketNumber?: string | null;
}): AbandonedTicketEmail {
  if (!validTicketCompletionUrl(input.completionUrl)) throw new Error("A private ticket completion link is required.");
  const submissionUrl = input.completionUrl;
  const greeting = `Hi ${singleLine(input.firstName) || "there"},`;
  const number = singleLine(input.ticketNumber);
  const subject = `Ticket received — complete consent and payment${number ? ` (${number})` : ""}`;
  const text = [greeting, receiptCopy, checkoutCopy, submissionUrl, questionsCopy, "Kind regards,", plainTextSignature].join("\n\n");
  const paragraph = (copy: string) => `<p style="margin:0 0 28px;">${escapeHtml(copy)}</p>`;

  return {
    from: "Fabsy <hello@fabsy.ca>",
    to: [input.email.trim()],
    bcc: [
      ...FABSY_INTERNAL_NOTIFICATION_DELIVERY.to,
      ...FABSY_INTERNAL_NOTIFICATION_DELIVERY.bcc,
    ],
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
      <p style="margin:0 0 28px;"><a href="${submissionUrl}" style="color:#2563eb;text-decoration:underline;">Complete consent and payment</a></p>
      ${paragraph("This private link is for your ticket only. Please do not forward it.")}
      ${paragraph(questionsCopy)}
      <p style="margin:0;">Kind regards,</p>
      ${getFabsyEmailSignature()}
    </td></tr>
  </table>
</body>
</html>`,
  };
}
