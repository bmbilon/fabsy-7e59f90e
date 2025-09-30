import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TicketNotification {
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

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ticketData: TicketNotification = await req.json();
    
    console.log("Sending notification email for ticket:", ticketData.ticketNumber);

    // Send email notification
    const emailResponse = await resend.emails.send({
      from: "Fabsy Notifications <onboarding@resend.dev>",
      to: ["brett@execom.ca"],
      subject: `New Ticket Submission - ${ticketData.firstName} ${ticketData.lastName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">
            New Ticket Form Submission
          </h1>
          
          <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h2 style="color: #4CAF50; margin-top: 0;">Client Information</h2>
            <p><strong>Name:</strong> ${ticketData.firstName} ${ticketData.lastName}</p>
            <p><strong>Email:</strong> ${ticketData.email}</p>
            <p><strong>Phone:</strong> ${ticketData.phone}</p>
          </div>
          
          <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h2 style="color: #4CAF50; margin-top: 0;">Ticket Details</h2>
            <p><strong>Ticket Number:</strong> ${ticketData.ticketNumber}</p>
            <p><strong>Violation:</strong> ${ticketData.violation}</p>
            <p><strong>Fine Amount:</strong> $${ticketData.fineAmount}</p>
          </div>
          
          <div style="background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Submitted:</strong> ${ticketData.submittedAt}</p>
          </div>
          
          <p style="color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 15px;">
            This is an automated notification from your Fabsy ticket submission system.
          </p>
        </div>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    // Send SMS notification to admin
    let smsResponse = null;
    try {
      const smsMessage = `New Ticket Submission!\nName: ${ticketData.firstName} ${ticketData.lastName}\nTicket: ${ticketData.ticketNumber}\nViolation: ${ticketData.violation}\nFine: $${ticketData.fineAmount}`;
      
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
      const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
      
      const smsResult = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${twilioAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: "+14036695353",
          From: twilioPhoneNumber || "",
          Body: smsMessage,
        }).toString(),
      });

      if (!smsResult.ok) {
        const errorText = await smsResult.text();
        console.error("Twilio SMS error:", errorText);
      } else {
        smsResponse = await smsResult.json();
        console.log("SMS sent successfully:", smsResponse);
      }
    } catch (smsError: any) {
      console.error("Error sending SMS:", smsError.message);
      // Continue even if SMS fails
    }

    return new Response(JSON.stringify({ success: true, emailResponse, smsResponse }), {
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
