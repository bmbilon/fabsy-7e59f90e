import { getFabsyEmailSignature } from "./email-signature.ts";
import type { PreferredLocale } from "./locale-policy.ts";

export interface TicketNotification {
  preferredLocale: PreferredLocale;
  submissionId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  ticketNumber: string;
  violation: string;
  fineAmount: string;
  submittedAt: string;
  smsOptIn?: boolean;
}


/** Escape for an HTML text/quoted-attribute context without altering Unicode. */
function escapeHtmlText(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function htmlData(original: TicketNotification): TicketNotification {
  // A display-only copy. Database fields, email subjects/recipients and SMS keep
  // their original text; escaping must never be written back to those sources.
  return {
    ...original,
    submissionId: escapeHtmlText(original.submissionId),
    firstName: escapeHtmlText(original.firstName),
    lastName: escapeHtmlText(original.lastName),
    email: escapeHtmlText(original.email),
    phone: escapeHtmlText(original.phone),
    ticketNumber: escapeHtmlText(original.ticketNumber),
    violation: escapeHtmlText(original.violation),
    fineAmount: escapeHtmlText(original.fineAmount),
    submittedAt: escapeHtmlText(original.submittedAt),
  };
}

/** Pure templates: no provider, database, file or environment access. */
export function renderTicketAdminEmailHtml(original: TicketNotification, siteOrigin: string): string {
  const ticketData = htmlData(original);
  const adminHref = escapeHtmlText(original.submissionId
    ? `${siteOrigin}/admin/submissions/${encodeURIComponent(original.submissionId)}`
    : `${siteOrigin}/admin/dashboard`);
  return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">
            🎫 Payment-Pending Ticket Submission
          </h1>

          <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h2 style="color: #4CAF50; margin-top: 0;">Client Information</h2>
            <p><strong>Name:</strong> ${ticketData.firstName} ${ticketData.lastName}</p>
            <p><strong>Email:</strong> ${ticketData.email}</p>
            <p><strong>Phone:</strong> ${ticketData.phone}</p>
          </div>

          <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h2 style="color: #4CAF50; margin-top: 0;">Quick Details</h2>
            <p><strong>Ticket Number:</strong> ${ticketData.ticketNumber}</p>
            <p><strong>Violation:</strong> ${ticketData.violation}</p>
            <p><strong>Fine Amount:</strong> ${ticketData.fineAmount}</p>
          </div>

      <div style="background-color: #e8f5e9; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center;">
        <p style="margin: 0 0 15px 0; font-weight: bold;">View Full Case Details</p>
        <a href="${adminHref}"
           style="display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white;
                  text-decoration: none; border-radius: 5px; font-weight: bold;">
          Open Admin Portal
        </a>
      </div>

          <p style="color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 15px;">
            <strong>Submitted:</strong> ${ticketData.submittedAt}<br>
            Preferred language: ${ticketData.preferredLocale}. Original intake text is retained for staff review.<br>
            This is an automated notification from your Fabsy case management system.
          </p>

          ${getFabsyEmailSignature()}
        </div>
      `;
}

export function renderTicketClientEmailHtml(original: TicketNotification): string {
  const ticketData = htmlData(original);
  return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">
            Thank You for Your Submission!
          </h1>

          <p style="font-size: 16px; color: #333;">
            Hi ${ticketData.firstName},
          </p>

          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            We've received your ticket submission. Complete Stripe Checkout before Fabsy begins
            service on the matter. Below is a summary of your submission, and attached you'll find
            a copy of the written consent form.
          </p>

          <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h2 style="color: #4CAF50; margin-top: 0;">Your Ticket Information</h2>
            <p><strong>Ticket Number:</strong> ${ticketData.ticketNumber}</p>
            <p><strong>Violation:</strong> ${ticketData.violation}</p>
            <p><strong>Fine Amount:</strong> ${ticketData.fineAmount}</p>
          </div>

          <div style="background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #333; margin-top: 0;">What Happens Next?</h3>
            <ul style="color: #555; line-height: 1.8;">
              <li>Complete the Stripe Checkout payment opened after submission</li>
              <li>After payment is confirmed, Fabsy's agent service will review your ticket information and court location</li>
              <li>We'll confirm whether Fabsy can assist with the matter</li>
              <li>You'll receive updates via email${ticketData.smsOptIn ? ' and SMS' : ''}</li>
              <li>Case outcomes depend on the facts and process in each matter</li>
            </ul>
          </div>

          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            If you have any questions, feel free to reach out to us at any time.
          </p>

          <p style="font-size: 14px; color: #333;">
            Best regards,<br>
            <strong>The Fabsy Team</strong>
          </p>

          <p style="color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 15px;">
            Submitted on ${ticketData.submittedAt}
          </p>

          ${getFabsyEmailSignature()}
        </div>
      `;
}
