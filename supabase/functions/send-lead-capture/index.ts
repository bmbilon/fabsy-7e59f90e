import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LeadCaptureRequest {
  name: string;
  email: string;
  ticketType: string;
  aiAnswer?: string;
  hasTicketUpload?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, ticketType, aiAnswer, hasTicketUpload }: LeadCaptureRequest = await req.json();

    console.log("Processing lead capture:", { name, email, ticketType, hasTicketUpload });

    // Send confirmation email to user
    const userEmailResponse = await resend.emails.send({
      from: "Fabsy <onboarding@resend.dev>",
      to: [email],
      subject: "Your Free Eligibility Check is Being Reviewed",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #6366f1;">Thank you, ${name}!</h1>
          
          <p>We've received your eligibility check request for your <strong>${ticketType}</strong> ticket.</p>
          
          <h2 style="color: #333; font-size: 18px;">What happens next?</h2>
          <ul style="line-height: 1.8;">
            <li>Our team will review your case within 24 hours</li>
            <li>You'll receive a detailed email with your eligibility assessment</li>
            <li>If qualified, we'll explain your options and next steps</li>
          </ul>

          ${aiAnswer ? `
            <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #333; font-size: 16px; margin-top: 0;">AI Quick Answer</h3>
              <p style="color: #555; margin-bottom: 0;">${aiAnswer}</p>
            </div>
          ` : ''}

          <div style="background: #fef3c7; padding: 16px; border-left: 4px solid #f59e0b; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px;">
              <strong>Questions?</strong> Call us at <a href="tel:403-669-5353" style="color: #6366f1;">403-669-5353</a>
            </p>
          </div>

          <p style="color: #666; font-size: 14px;">
            This is general information only and not legal advice. A licensed professional will review your specific case.
          </p>

          <p style="margin-top: 30px;">
            Best regards,<br>
            <strong>The Fabsy Team</strong>
          </p>
        </div>
      `,
    });

    console.log("User confirmation email sent:", userEmailResponse);

    // Send notification to admin
    const adminEmail = "admin@fabsy.ca"; // Replace with actual admin email
    const adminEmailResponse = await resend.emails.send({
      from: "Fabsy Leads <onboarding@resend.dev>",
      to: [adminEmail],
      subject: `New AI Lead: ${name} - ${ticketType}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #6366f1;">New Lead Captured via AI Helper</h1>
          
          <h2>Lead Details:</h2>
          <ul style="line-height: 1.8;">
            <li><strong>Name:</strong> ${name}</li>
            <li><strong>Email:</strong> ${email}</li>
            <li><strong>Ticket Type:</strong> ${ticketType}</li>
            <li><strong>Ticket Upload:</strong> ${hasTicketUpload ? "Yes" : "No"}</li>
          </ul>

          ${aiAnswer ? `
            <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #333;">AI Answer Provided:</h3>
              <p style="color: #555;">${aiAnswer}</p>
            </div>
          ` : ''}

          <p style="background: #fef3c7; padding: 16px; border-left: 4px solid #f59e0b;">
            <strong>Action Required:</strong> Review this case and respond within 24 hours.
          </p>
        </div>
      `,
    });

    console.log("Admin notification email sent:", adminEmailResponse);

    return new Response(
      JSON.stringify({ 
        success: true, 
        userEmail: userEmailResponse,
        adminEmail: adminEmailResponse 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error) {
    console.error("Error in send-lead-capture:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
