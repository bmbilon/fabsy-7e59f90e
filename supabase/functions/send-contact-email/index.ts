import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ContactFormData {
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, phone, subject, message }: ContactFormData = await req.json();

    console.log("Processing contact form submission from:", email);

    // Send confirmation email to the user
    const userEmailResponse = await resend.emails.send({
      from: "Fabsy <hello@fabsy.ca>",
      reply_to: "brett@execom.ca",
      to: [email],
      subject: "We've Received Your Message - Fabsy",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px; }
              .footer { text-align: center; margin-top: 30px; padding: 20px; color: #6b7280; font-size: 14px; }
              .highlight { background: #f3f4f6; padding: 15px; border-left: 4px solid #667eea; margin: 20px 0; }
              .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">Welcome to Fabsy!</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">Alberta's Trusted Traffic Ticket Representation</p>
              </div>
              
              <div class="content">
                <h2 style="color: #667eea; margin-top: 0;">Thank you for contacting us, ${name}!</h2>
                
                <p>We've received your message and one of our traffic ticket specialists will review it shortly. We typically respond within 24 hours during business days.</p>
                
                <div class="highlight">
                  <strong>Your Message Summary:</strong><br>
                  ${subject ? `<strong>Subject:</strong> ${subject}<br>` : ''}
                  <strong>Email:</strong> ${email}<br>
                  ${phone ? `<strong>Phone:</strong> ${phone}<br>` : ''}
                </div>
                
                <p><strong>Your message:</strong></p>
                <p style="background: #f9fafb; padding: 15px; border-radius: 5px; white-space: pre-wrap;">${message}</p>
                
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                
                <h3 style="color: #667eea;">Ready to Submit Your Ticket?</h3>
                <p>If you have a traffic ticket you'd like us to handle, you can submit it online through our secure form. We'll analyze your case and fight to reduce or eliminate your fines.</p>
                
                <center>
                  <a href="https://fabsy.ca/ticket-form" class="button">Submit Your Ticket Now</a>
                </center>
                
                <div style="background: #fef3c7; border: 1px solid #fbbf24; padding: 15px; border-radius: 5px; margin: 20px 0;">
                  <strong style="color: #92400e;">💰 Zero Risk Guarantee</strong><br>
                  <span style="color: #92400e;">If we don't save you money on your total ticket costs, you don't pay our fee!</span>
                </div>
                
                <p style="margin-top: 30px;">Have questions? Simply reply to this email or call us during business hours.</p>
                
                <p style="margin-bottom: 0;"><strong>The Fabsy Team</strong><br>
                <span style="color: #6b7280;">Alberta's Traffic Ticket Specialists</span></p>
              </div>
              
              <div class="footer">
                <p style="margin: 5px 0;">📧 hello@fabsy.ca | 📞 (403) 123-4567</p>
                <p style="margin: 5px 0;">Monday-Friday: 9 AM - 6 PM MST | Saturday: 10 AM - 4 PM MST</p>
                <p style="margin: 15px 0 5px 0; font-size: 12px;">© ${new Date().getFullYear()} Fabsy. All rights reserved.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    console.log("User confirmation email sent:", userEmailResponse);

    // Send notification email to admin
    const adminEmailResponse = await resend.emails.send({
      from: "Fabsy Notifications <hello@fabsy.ca>",
      reply_to: email, // Set reply-to as the user's email so admin can reply directly
      to: ["brett@execom.ca"],
      subject: `New Contact Form Submission from ${name}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #1f2937; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
              .content { background: #ffffff; padding: 20px; border: 1px solid #e5e7eb; border-top: none; }
              .field { margin: 15px 0; padding: 10px; background: #f9fafb; border-left: 3px solid #667eea; }
              .label { font-weight: bold; color: #667eea; }
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
                  <span class="label">Email:</span> ${email}
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

    console.log("Admin notification email sent:", adminEmailResponse);

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
  } catch (error: any) {
    console.error("Error in send-contact-email function:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      {
        status: 500,
        headers: { 
          "Content-Type": "application/json", 
          ...corsHeaders 
        },
      }
    );
  }
};

serve(handler);
