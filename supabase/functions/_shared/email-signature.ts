/**
 * Fabsy Email Signature Template
 * Matches the current fabsy.ca brand and uses conservative, table-based markup
 * for reliable rendering across email clients.
 */

export const getFabsyEmailSignature = () => {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px; margin-top: 40px; border-collapse: collapse; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
      <tr>
        <td style="padding-top: 24px; border-top: 2px solid #E2E8F0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td width="64" valign="top" style="width: 64px; padding: 0 16px 0 0; vertical-align: top;">
                <a href="https://fabsy.ca" style="text-decoration: none;">
                  <img src="https://fabsy.ca/apple-touch-icon.png?v=4" width="64" height="64" alt="Fabsy" style="display: block; width: 64px; height: 64px; border: 0; border-radius: 12px; outline: none; text-decoration: none;" />
                </a>
              </td>
              <td valign="top" style="padding: 0; vertical-align: top;">
                <a href="https://fabsy.ca" style="color: #3B82F6; font-size: 24px; font-weight: 700; line-height: 1.15; letter-spacing: -0.5px; text-decoration: none;">Fabsy</a>
                <div style="margin-top: 4px; color: #475569; font-size: 13px; font-weight: 500; line-height: 1.5;">
                  Traffic ticket agent services for Alberta drivers
                </div>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top: 12px; border-collapse: collapse; color: #334155; font-size: 13px; line-height: 1.5;">
                  <tr>
                    <td style="padding: 0 12px 4px 0; color: #64748B; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;">Phone</td>
                    <td style="padding: 0 0 4px 0;"><a href="tel:+18257932279" style="color: #334155; text-decoration: none;">(825) 793-2279</a></td>
                  </tr>
                  <tr>
                    <td style="padding: 0 12px 4px 0; color: #64748B; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;">Email</td>
                    <td style="padding: 0 0 4px 0;"><a href="mailto:hello@fabsy.ca" style="color: #334155; text-decoration: none;">hello@fabsy.ca</a></td>
                  </tr>
                  <tr>
                    <td style="padding: 0 12px 4px 0; color: #64748B; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;">Web</td>
                    <td style="padding: 0 0 4px 0;"><a href="https://fabsy.ca" style="color: #3B82F6; font-weight: 600; text-decoration: none;">fabsy.ca</a></td>
                  </tr>
                  <tr>
                    <td style="padding: 0 12px 0 0; color: #64748B; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;">Area</td>
                    <td style="padding: 0; color: #334155;">Alberta, Canada</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin-top: 16px; border: 1px solid #BFDBFE; border-radius: 8px; border-collapse: separate; background-color: #EFF6FF;">
            <tr>
              <td style="padding: 10px 12px; color: #0F172A; font-size: 12px; font-weight: 600; line-height: 1.5;">
                <span style="color: #1D4ED8; font-weight: 700;">Rapid Resolution</span> is $198 CAD plus GST for eligible Alberta pre-trial matters. Trial and government fines are separate.
              </td>
            </tr>
          </table>

          <div style="margin-top: 24px; padding-top: 18px; border-top: 1px solid #E2E8F0; color: #64748B; font-size: 11px; line-height: 1.6;">
            <p style="margin: 0 0 8px 0;">
              <strong style="color: #64748B;">Confidentiality Notice:</strong> This email and any attachments are confidential and intended solely for the recipient.
              If you are not the intended recipient, please delete this email and notify the sender immediately.
            </p>
            <p style="margin: 0;">
              <strong style="color: #64748B;">Service Disclaimer:</strong> Fabsy is an agent service for Alberta traffic matters, not a law firm. This communication is general information and does not constitute legal advice or create a solicitor-client relationship.
            </p>
          </div>
        </td>
      </tr>
    </table>
  `;
};

/**
 * Get a simplified signature for SMS notifications
 */
export const getFabsySMSSignature = () => {
  return `\n\n---\nFabsy Traffic Ticket Services\n📞 (825) 793-2279 | hello@fabsy.ca\nfabsy.ca`;
};
