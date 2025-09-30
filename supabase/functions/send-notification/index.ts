import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

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
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ticketData: TicketNotification = await req.json();
    
    console.log("Sending notification email for ticket:", ticketData.ticketNumber);

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

    return new Response(JSON.stringify({ success: true, emailResponse }), {
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
