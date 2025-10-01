import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

interface TicketNotification {
  submissionId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  ticketNumber: string;
  violation: string;
  fineAmount: string;
  submittedAt: string;
  smsOptIn?: boolean;
  couponCode?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ticketData: TicketNotification = await req.json();
    const siteOrigin = req.headers.get("origin") || "https://fabsy.ca";
    const isTestUser = ticketData.couponCode?.toUpperCase() === "TESTUSER";
    
    console.log("Sending notification email for ticket:", ticketData.ticketNumber, "| Test User:", isTestUser);

    const emailResponse = await resend.emails.send({
      from: "Fabsy Notifications <onboarding@resend.dev>",
      to: isTestUser ? ["brett@plume.ca"] : ["brett@execom.ca"],
      subject: `${isTestUser ? '[TEST] ' : ''}New Ticket Submission - ${ticketData.firstName} ${ticketData.lastName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">
            🎫 New Ticket Submission Alert
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
            <p><strong>Fine Amount:</strong> $${ticketData.fineAmount}</p>
          </div>
          
      <div style="background-color: #e8f5e9; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center;">
        <p style="margin: 0 0 15px 0; font-weight: bold;">View Full Case Details</p>
        <a href="${ticketData.submissionId ? `${siteOrigin}/admin/submissions/${ticketData.submissionId}` : `${siteOrigin}/admin/dashboard`}" 
           style="display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; 
                  text-decoration: none; border-radius: 5px; font-weight: bold;">
          Open Admin Portal
        </a>
      </div>
          
          <p style="color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 15px;">
            <strong>Submitted:</strong> ${ticketData.submittedAt}<br>
            This is an automated notification from your Fabsy case management system.
          </p>
        </div>
      `,
    });

    console.log("Admin email sent successfully:", emailResponse);

    // Fetch the consent PDF from the site origin to attach it
    let pdfBuffer: ArrayBuffer | null = null;
    try {
      const pdfResponse = await fetch(`${siteOrigin}/forms/Form-SRA12675-Written-Consent.pdf`);
      if (pdfResponse.ok) {
        pdfBuffer = await pdfResponse.arrayBuffer();
        console.log("Consent PDF fetched successfully");
      } else {
        console.error("Failed to fetch consent PDF:", pdfResponse.status);
      }
    } catch (pdfError: any) {
      console.error("Error fetching consent PDF:", pdfError.message);
    }

    // Send CLIENT confirmation email with consent PDF
    const clientEmailResponse = await resend.emails.send({
      from: "Fabsy <onboarding@resend.dev>",
      to: [ticketData.email],
      bcc: isTestUser ? ["brett@plume.ca"] : undefined,
      subject: "Your Ticket Submission Confirmation",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">
            Thank You for Your Submission!
          </h1>
          
          <p style="font-size: 16px; color: #333;">
            Hi ${ticketData.firstName},
          </p>
          
          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            We've received your ticket submission and our team will begin reviewing your case right away. 
            Below is a summary of your submission, and attached you'll find a copy of the written consent form.
          </p>
          
          <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h2 style="color: #4CAF50; margin-top: 0;">Your Ticket Information</h2>
            <p><strong>Ticket Number:</strong> ${ticketData.ticketNumber}</p>
            <p><strong>Violation:</strong> ${ticketData.violation}</p>
            <p><strong>Fine Amount:</strong> $${ticketData.fineAmount}</p>
          </div>
          
          <div style="background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #333; margin-top: 0;">What Happens Next?</h3>
            <ul style="color: #555; line-height: 1.8;">
              <li>Our legal team will review your ticket within 24 hours</li>
              <li>We'll analyze the best defense strategy for your case</li>
              <li>You'll receive updates via email${ticketData.smsOptIn ? ' and SMS' : ''}</li>
              <li>We'll keep you informed every step of the way</li>
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
        </div>
      `,
      attachments: pdfBuffer ? [{
        filename: 'Written-Consent-Form.pdf',
        content: arrayBufferToBase64(pdfBuffer),
      }] : [],
    });

    console.log("Client confirmation email sent successfully:", clientEmailResponse);

    // Send SMS notification to admin
    let adminSmsResponse = null;
    try {
      const adminSmsMessage = `${isTestUser ? '[TEST] ' : ''}New Ticket Submission!\nName: ${ticketData.firstName} ${ticketData.lastName}\nTicket: ${ticketData.ticketNumber}\nViolation: ${ticketData.violation}\nFine: $${ticketData.fineAmount}`;
      
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
      const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
      
      const adminSmsResult = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${twilioAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: isTestUser ? "+14036695353" : "+14036695353",
          From: twilioPhoneNumber || "",
          Body: adminSmsMessage,
        }).toString(),
      });

      if (!adminSmsResult.ok) {
        const errorText = await adminSmsResult.text();
        console.error("Admin Twilio SMS error:", errorText);
      } else {
        adminSmsResponse = await adminSmsResult.json();
        console.log("Admin SMS sent successfully:", adminSmsResponse);
      }
    } catch (smsError: any) {
      console.error("Error sending admin SMS:", smsError.message);
      // Continue even if SMS fails
    }

    // Send SMS notification to CLIENT if opted in
    let clientSmsResponse = null;
    if (ticketData.smsOptIn) {
      try {
        const clientSmsMessage = `Hi ${ticketData.firstName}! Your ticket submission has been received. We've emailed you copies of your forms and consent agreement. Our team will review your case within 24 hours. - Fabsy`;
        
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
        const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
        
        const clientSmsResult = await fetch(twilioUrl, {
          method: "POST",
          headers: {
            "Authorization": `Basic ${twilioAuth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: ticketData.phone,
            From: twilioPhoneNumber || "",
            Body: clientSmsMessage,
          }).toString(),
        });

        if (!clientSmsResult.ok) {
          const errorText = await clientSmsResult.text();
          console.error("Client Twilio SMS error:", errorText);
        } else {
          clientSmsResponse = await clientSmsResult.json();
          console.log("Client SMS sent successfully:", clientSmsResponse);
        }
      } catch (smsError: any) {
        console.error("Error sending client SMS:", smsError.message);
        // Continue even if SMS fails
      }
    } else {
      console.log("Client opted out of SMS notifications");
    }

    return new Response(JSON.stringify({ 
      success: true, 
      adminEmail: emailResponse, 
      clientEmail: clientEmailResponse,
      adminSms: adminSmsResponse,
      clientSms: clientSmsResponse 
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-notification function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
