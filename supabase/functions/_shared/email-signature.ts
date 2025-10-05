/**
 * Fabsy Email Signature Template
 * Professional email signature with brand colors and contact information
 */

export const getFabsyEmailSignature = () => {
  return `
    <div style="margin-top: 40px; padding-top: 30px; border-top: 2px solid #E5E7EB;">
      <table cellpadding="0" cellspacing="0" border="0" style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px;">
        <tr>
          <td style="padding-right: 20px; vertical-align: top;">
            <!-- Logo/Icon -->
            <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #E879F9 0%, #C084FC 50%, #A78BFA 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
              <span style="font-size: 32px; font-weight: bold; color: white;">⚖️</span>
            </div>
          </td>
          <td style="vertical-align: top;">
            <!-- Company Name -->
            <div style="font-size: 24px; font-weight: 700; background: linear-gradient(135deg, #E879F9 0%, #C084FC 50%, #A78BFA 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 4px;">
              Fabsy
            </div>
            
            <!-- Tagline -->
            <div style="font-size: 13px; color: #6B7280; margin-bottom: 12px; font-weight: 500;">
              Expert Traffic Ticket Defense for Alberta Women
            </div>
            
            <!-- Contact Info -->
            <div style="font-size: 13px; color: #374151; line-height: 1.8;">
              <div style="margin-bottom: 4px;">
                <span style="color: #A78BFA; font-weight: 600;">📞</span>
                <a href="tel:825-793-2279" style="color: #374151; text-decoration: none; margin-left: 8px;">(825) 793-2279</a>
              </div>
              <div style="margin-bottom: 4px;">
                <span style="color: #A78BFA; font-weight: 600;">✉️</span>
                <a href="mailto:hello@fabsy.ca" style="color: #374151; text-decoration: none; margin-left: 8px;">hello@fabsy.ca</a>
              </div>
              <div style="margin-bottom: 4px;">
                <span style="color: #A78BFA; font-weight: 600;">🌐</span>
                <a href="https://fabsy.ca" style="color: #374151; text-decoration: none; margin-left: 8px;">fabsy.ca</a>
              </div>
              <div style="margin-bottom: 4px;">
                <span style="color: #A78BFA; font-weight: 600;">📍</span>
                <span style="margin-left: 8px;">Alberta, Canada</span>
              </div>
            </div>
            
            <!-- Trust Badge -->
            <div style="margin-top: 12px; padding: 8px 12px; background: linear-gradient(135deg, #FDF2F8 0%, #FAE8FF 100%); border-radius: 6px; display: inline-block;">
              <span style="font-size: 11px; color: #86198F; font-weight: 600;">✓ 100% Success Rate | No Win, No Fee Guarantee</span>
            </div>
          </td>
        </tr>
      </table>
      
      <!-- Disclaimer -->
      <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #E5E7EB; font-size: 11px; color: #9CA3AF; line-height: 1.6;">
        <p style="margin: 0 0 8px 0;">
          <strong>Confidentiality Notice:</strong> This email and any attachments are confidential and intended solely for the recipient. 
          If you are not the intended recipient, please delete this email and notify the sender immediately.
        </p>
        <p style="margin: 0;">
          <strong>Legal Disclaimer:</strong> This communication does not constitute legal advice and does not create a solicitor-client relationship. 
          For specific legal advice, please consult with a qualified legal professional.
        </p>
      </div>
    </div>
  `;
};

/**
 * Get a simplified signature for SMS notifications
 */
export const getFabsySMSSignature = () => {
  return `\n\n---\nFabsy - Traffic Ticket Defense\n📞 (825) 793-2279 | hello@fabsy.ca\nfabsy.ca`;
};
