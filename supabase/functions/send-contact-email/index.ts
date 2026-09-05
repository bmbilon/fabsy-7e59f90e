import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { getFabsyEmailSignature } from "../_shared/email-signature.ts";
import { LocaleRequestError, parsePreferredLocale } from "../_shared/locale-policy.ts";
import { prepareClientEmail } from "../_shared/notification-locale.ts";
import { ContactRequestError, escapeContactHtml, parseContactRequest } from "../_shared/contact-request.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const request = parseContactRequest(await req.json());
    const preferredLocale = parsePreferredLocale(request.preferredLocale);
    const { email, inquiryType } = request;
    const name = escapeContactHtml(request.name);
    const phone = escapeContactHtml(request.phone);
    const subject = escapeContactHtml(request.subject);
    const message = escapeContactHtml(request.message);
    const emailHtml = escapeContactHtml(email);
    const isFleet = inquiryType === "fleet";

    // Send confirmation email to the user
    const userEmailResponse = await resend.emails.send(prepareClientEmail({
      from: "Fabsy <hello@fabsy.ca>",
      reply_to: "brett@execom.ca",
      to: [email],
      subject: isFleet ? "We've Received Your Fleet Enquiry - Fabsy" : "We've Received Your Message - Fabsy",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #0F172A; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px; }
              .footer { text-align: center; margin-top: 30px; padding: 20px; color: #6b7280; font-size: 14px; }
              .highlight { background: #EFF6FF; padding: 15px; border-left: 4px solid #3B82F6; margin: 20px 0; }
              .button { display: inline-block; background: #2563EB; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header" style="background-color: #0F172A; color: #FFFFFF; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto; border-collapse: collapse;">
                  <tr>
                    <td valign="middle" style="padding-right: 12px;"><img src="https://fabsy.ca/apple-touch-icon.png?v=4" width="48" height="48" alt="Fabsy" style="display: block; width: 48px; height: 48px; border: 0; border-radius: 8px;" /></td>
                    <td valign="middle"><h1 style="margin: 0; color: #FFFFFF; font-family: Arial, sans-serif; font-size: 32px; line-height: 1.2; font-weight: 700;">Fabsy</h1></td>
                  </tr>
                </table>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">Traffic ticket agent services for Alberta drivers</p>
              </div>
              
              <div class="content">
                <h2 style="color: #1D4ED8; margin-top: 0;">Thank you for contacting us, ${name}!</h2>
                
                <p>We've received your message. A member of our team will review it and respond using the contact information you provided.</p>
                
                <div class="highlight">
                  <strong>Your Message Summary:</strong><br>
                  ${subject ? `<strong>Subject:</strong> ${subject}<br>` : ''}
                  <strong>Email:</strong> ${emailHtml}<br>
                  ${phone ? `<strong>Phone:</strong> ${phone}<br>` : ''}
                </div>
                
                <p><strong>Your message:</strong></p>
                <p style="background: #f9fafb; padding: 15px; border-radius: 5px; white-space: pre-wrap;">${message}</p>
                
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                
                <h3 style="color: #1D4ED8;">Ready to Submit Your Ticket?</h3>
                <p>If you have an Alberta traffic ticket, you can submit it online for assessment. Fabsy will review the ticket and confirm whether agent representation is permitted for the matter and court location.</p>
                
                <center>
                  <a href="https://fabsy.ca/${isFleet ? "fleet" : "submit-ticket"}" class="button" style="display: inline-block; background-color: #2563EB; color: #FFFFFF; padding: 12px 30px; text-decoration: none; border-radius: 5px;">${isFleet ? "Review Fleet Service" : "Submit Your Ticket Now"}</a>
                </center>
                
                <div style="background: #EFF6FF; border: 1px solid #BFDBFE; padding: 15px; border-radius: 5px; margin: 20px 0;">
                  <strong style="color: #1E3A8A;">Pricing</strong><br>
                  <span style="color: #1E3A8A;">${isFleet ? "Photo radar and red-light owner notices cost $79 + 5% GST ($82.95 total) per ticket. Account pricing at 5+ tickets per month and monthly QuickBooks invoicing are confirmed before work begins. No trial and no success fee. You approve every deal. This enquiry does not retain Fabsy or pause a deadline." : "Rapid Resolution costs $198 CAD plus GST for eligible Alberta pre-trial matters. Photo radar and red-light owner notices cost $79 + 5% GST ($82.95 total). Trial and government fines are separate."}</span>
                </div>
                
                <p style="margin-top: 30px;">Have questions? Simply reply to this email or call us during business hours.</p>
                
                <p style="margin-bottom: 0;"><strong>The Fabsy Team</strong><br>
                <span style="color: #6b7280;">Agent services for Alberta traffic matters. Fabsy is not a law firm.</span></p>
                
                ${getFabsyEmailSignature()}
              </div>
              
              <div class="footer">
                <p style="margin: 5px 0;">📧 hello@fabsy.ca | 📞 (825) 793-2279</p>
                <p style="margin: 5px 0;">Monday-Friday: 9 AM - 6 PM MST | Saturday: 10 AM - 4 PM MST</p>
                <p style="margin: 15px 0 5px 0; font-size: 12px;">© ${new Date().getFullYear()} Fabsy. All rights reserved.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    }, { preferredLocale, template: "contact_received" }));

    if (userEmailResponse.error) throw new Error("Contact confirmation delivery failed.");

    // Send notification email to admin
    const adminEmailResponse = await resend.emails.send({
      from: "Fabsy Notifications <hello@fabsy.ca>",
      reply_to: email, // Set reply-to as the user's email so admin can reply directly
      to: ["brett@execom.ca"],
      subject: `${isFleet ? "Fleet Account Enquiry" : "New Contact Form Submission"} from ${request.name}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #0F172A; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
              .content { background: #ffffff; padding: 20px; border: 1px solid #e5e7eb; border-top: none; }
              .field { margin: 15px 0; padding: 10px; background: #EFF6FF; border-left: 3px solid #3B82F6; }
              .label { font-weight: bold; color: #1D4ED8; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2 style="margin: 0;">🔔 New Contact Form Submission</h2>
              </div>
              
              <div class="content">
                <div class="field">
                  <span class="label">Name:</span> ${name}
                </div>
                
                <div class="field">
                  <span class="label">Email:</span> ${emailHtml}
                </div>
                
                ${phone ? `
                  <div class="field">
                    <span class="label">Phone:</span> ${phone}
                  </div>
                ` : ''}
                
                ${subject ? `
                  <div class="field">
                    <span class="label">Subject:</span> ${subject}
                  </div>
                ` : ''}
                
                <div class="field">
                  <span class="label">Preferred language:</span> ${preferredLocale}<br>
                  <span class="label">Message:</span><br>
                  <div style="margin-top: 10px; white-space: pre-wrap;">${message}</div>
                </div>
                
                <div style="margin-top: 20px; padding: 15px; background: #eff6ff; border-radius: 5px;">
                  <strong>Quick Actions:</strong><br>
                  <p style="margin: 10px 0 0 0;">Reply directly to this email to respond to ${name}.</p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    if (adminEmailResponse.error) throw new Error("Contact notification delivery failed.");

    return new Response(
      JSON.stringify({ 
        success: true,
        message: "Emails sent successfully" 
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error: unknown) {
    console.error("Contact request failed", error instanceof ContactRequestError ? "invalid_request" : "delivery_or_locale_error");
    return new Response(
      JSON.stringify({ 
        error: error instanceof ContactRequestError || error instanceof LocaleRequestError ? error.message : 'Unable to confirm receipt. Please try again or call Fabsy.',
        ...(error instanceof LocaleRequestError ? { error_code: error.code } : {}),
        success: false 
      }),
      {
        status: error instanceof LocaleRequestError ? error.status : error instanceof ContactRequestError ? 400 : 500,
        headers: { 
          "Content-Type": "application/json", 
          ...corsHeaders 
        },
      }
    );
  }
};

serve(handler);
