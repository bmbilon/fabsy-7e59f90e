import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { renderTicketAdminEmailHtml, renderTicketClientEmailHtml, type TicketNotification } from "../_shared/ticket-notification-html.ts";
import { parsePreferredLocale } from "../_shared/locale-policy.ts";
import { notificationLocale, prepareClientEmail, prepareClientSms } from "../_shared/notification-locale.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface NotificationRequest {
  submissionId: string;
  accessToken: string;
}

interface NotificationClaim {
  acquired?: unknown;
  status?: unknown;
  failureCode?: unknown;
  manualReviewRequired?: unknown;
}

class RequestError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((part) => part.toString(16).padStart(2, "0")).join("");
}

function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string") throw new RequestError(`${label} is required.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw new RequestError(`${label} is invalid.`);
  return normalized;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let claimedSubmissionId: string | null = null;
  let dispatchClaimId: string | null = null;
  let providerRequestStarted = false;
  const providerDeliveryFailures: string[] = [];

  try {
    const request = await req.json() as Partial<NotificationRequest>;
    const submissionId = requiredText(request.submissionId, "Submission", 36).toLowerCase();
    const accessToken = requiredText(request.accessToken, "Submission access token", 200);
    if (!UUID_PATTERN.test(submissionId) || accessToken.length < 32) {
      throw new RequestError("Submission authorization is invalid.", 403);
    }
    const accessTokenHash = await sha256(accessToken);
    const { data: submission, error: submissionError } = await supabase
      .from("ticket_submissions")
      .select("id,first_name,last_name,email,phone,ticket_number,violation,fine_amount,created_at,sms_opt_in,status,service_type,consent_form_path,representation_access_token_hash,preferred_locale")
      .eq("id", submissionId)
      .maybeSingle();
    if (submissionError) throw submissionError;
    if (
      !submission ||
      submission.service_type !== "representation" ||
      submission.status !== "awaiting_payment" ||
      submission.representation_access_token_hash !== accessTokenHash ||
      typeof submission.consent_form_path !== "string" ||
      !submission.consent_form_path.startsWith(`${submissionId}/`) ||
      submission.consent_form_path.includes("..")
    ) {
      throw new RequestError("Submission authorization or stored consent is invalid.", 403);
    }
    const ticketData: TicketNotification = {
      preferredLocale: parsePreferredLocale(submission.preferred_locale),
      submissionId: submission.id,
      firstName: String(submission.first_name || ""),
      lastName: String(submission.last_name || ""),
      email: String(submission.email || ""),
      phone: String(submission.phone || ""),
      ticketNumber: String(submission.ticket_number || ""),
      violation: String(submission.violation || ""),
      fineAmount: String(submission.fine_amount || ""),
      submittedAt: submission.created_at ? String(submission.created_at) : new Date().toISOString(),
      smsOptIn: submission.sms_opt_in === true,
    };
    const localeContext = { preferredLocale: ticketData.preferredLocale, template: "ticket_received" as const };
    const configuredSiteUrl = Deno.env.get("SITE_URL") || "https://fabsy.ca";
    const siteOrigin = new URL(configuredSiteUrl).origin;

    dispatchClaimId = crypto.randomUUID();
    const { data: rawClaim, error: claimError } = await supabase.rpc(
      "claim_ticket_submission_notification",
      { p_submission_id: submissionId, p_claim_id: dispatchClaimId },
    );
    if (claimError) throw claimError;
    const claim = rawClaim as NotificationClaim | null;
    if (claim?.acquired !== true) {
      const deliveryStatus = typeof claim?.status === "string" ? claim.status : "indeterminate";
      return new Response(JSON.stringify({
        success: true,
        deduplicated: true,
        deliveryStatus,
        manualReviewRequired: deliveryStatus === "indeterminate" || claim?.manualReviewRequired === true,
        ...(typeof claim?.failureCode === "string" ? { failureCode: claim.failureCode } : {}),
        localization: notificationLocale(localeContext),
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    claimedSubmissionId = submissionId;
    
    console.log("Sending notification email for ticket:", ticketData.ticketNumber);

    // SECURITY: Fetch admin users from database to ensure only authorized users receive client data
    const { data: adminUsers, error: adminError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    if (adminError || !adminUsers || adminUsers.length === 0) {
      console.error("Failed to fetch admin users:", adminError);
      throw new Error("No admin users found to send notifications to");
    }

    // Fetch email addresses for admin users
    const { data: adminProfiles, error: profileError } = await supabase.auth.admin.listUsers();
    
    if (profileError) {
      console.error("Failed to fetch admin emails:", profileError);
      throw new Error("Failed to retrieve admin email addresses");
    }

    const adminUserIds = adminUsers.map(u => u.user_id);
    const adminEmails = adminProfiles.users
      .filter(user => adminUserIds.includes(user.id))
      .map(user => user.email)
      .filter((email): email is string => email !== undefined);

    if (adminEmails.length === 0) {
      throw new Error("No valid admin email addresses found");
    }

    console.log(`Sending admin notification to ${adminEmails.length} admin(s)`);

    // SECURITY: This email contains ALL client data and should ONLY go to verified admin users
    // Mark the dispatch outcome as ambiguous before the first provider call.
    // A network error can happen after a provider accepts a message, so an
    // automatic retry from this point could duplicate client/admin delivery.
    providerRequestStarted = true;
    const emailResponse = await resend.emails.send({
      from: "Fabsy <hello@fabsy.ca>",
      reply_to: "brett@execom.ca",
      to: adminEmails,
      subject: `Payment Pending - ${ticketData.firstName} ${ticketData.lastName}`,
      html: renderTicketAdminEmailHtml(ticketData, siteOrigin),
    });
    if (emailResponse && typeof emailResponse === "object" && "error" in emailResponse && emailResponse.error) {
      providerDeliveryFailures.push("admin_email_rejected");
      console.error("Admin email provider rejected delivery:", emailResponse.error);
    } else {
      console.log("Admin email accepted by provider:", emailResponse);
    }

    // Fetch the dynamically generated consent form from storage with retry logic
    let pdfBuffer: ArrayBuffer | null = null;
    
    if (ticketData.submissionId) {
      const fileName = submission.consent_form_path;
      let retries = 3;
      let retryDelay = 1000; // Start with 1 second delay
      
      while (retries > 0 && !pdfBuffer) {
        try {
          console.log(`Attempting to download consent form (${4 - retries}/3):`, fileName);
          
          // Download the consent form from storage
          const { data: pdfData, error: downloadError } = await supabase.storage
            .from('consent-forms')
            .download(fileName);
          
          if (downloadError) {
            console.error(`Error downloading consent form (attempt ${4 - retries}):`, downloadError);
            retries--;
            
            if (retries > 0) {
              console.log(`Retrying in ${retryDelay}ms...`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
              retryDelay *= 2; // Exponential backoff
            }
          } else if (pdfData) {
            pdfBuffer = await pdfData.arrayBuffer();
            console.log("Consent form fetched successfully from storage, size:", pdfBuffer.byteLength, "bytes");
          } else {
            console.warn("PDF data is null");
            retries--;
          }
        } catch (pdfError: unknown) {
          console.error(`Error fetching consent form (attempt ${4 - retries}):`, getErrorMessage(pdfError));
          retries--;
          
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            retryDelay *= 2;
          }
        }
      }
      
      if (!pdfBuffer) {
        console.error("Failed to fetch consent form after 3 attempts");
      }
    } else {
      console.warn("No submission ID provided, cannot fetch consent form");
    }

    // SECURITY: Send CLIENT confirmation email - contains ONLY this client's own data
    // Client should NEVER receive other clients' information or admin-only data
    const clientEmailResponse = await resend.emails.send(prepareClientEmail({
      from: "Fabsy <hello@fabsy.ca>",
      reply_to: "brett@execom.ca",
      to: [ticketData.email],
      subject: "Your Ticket Submission Confirmation",
      html: renderTicketClientEmailHtml(ticketData),
      attachments: pdfBuffer ? [{
        filename: 'Written-Consent-Form.pdf',
        content: arrayBufferToBase64(pdfBuffer),
      }] : [],
    }, localeContext));
    if (clientEmailResponse && typeof clientEmailResponse === "object" && "error" in clientEmailResponse && clientEmailResponse.error) {
      providerDeliveryFailures.push("client_email_rejected");
      console.error("Client email provider rejected delivery:", clientEmailResponse.error);
    } else {
      console.log("Client email accepted by provider:", clientEmailResponse);
    }

    // SECURITY: Send SMS notification to admin - contains client data, only for verified admin
    // TODO: Consider storing admin phone numbers in database for better security
    let adminSmsResponse = null;
    try {
      const adminSmsMessage = `Payment-pending ticket submission. Do not begin service until payment is confirmed.\nName: ${ticketData.firstName} ${ticketData.lastName}\nTicket: ${ticketData.ticketNumber}\nViolation: ${ticketData.violation}\nFine: ${ticketData.fineAmount}`;
      
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
      const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
      
      const adminSmsResult = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${twilioAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: "+14036695353", // SECURITY: Hardcoded admin phone - only brett@execom.ca
          From: twilioPhoneNumber || "",
          Body: adminSmsMessage,
        }).toString(),
      });

      if (!adminSmsResult.ok) {
        const errorText = await adminSmsResult.text();
        console.error("Admin Twilio SMS error:", errorText);
        providerDeliveryFailures.push("admin_sms_rejected");
      } else {
        adminSmsResponse = await adminSmsResult.json();
        console.log("Admin SMS sent successfully:", adminSmsResponse);
      }
    } catch (smsError: unknown) {
      console.error("Error sending admin SMS:", getErrorMessage(smsError));
      providerDeliveryFailures.push("admin_sms_error");
      // Attempt the remaining channel, then fence this dispatch as indeterminate.
    }

    // SECURITY: Send SMS notification to CLIENT - generic confirmation only, no sensitive data
    // Client SMS should NEVER contain other clients' information
    let clientSmsResponse = null;
    if (ticketData.smsOptIn) {
      try {
        const clientSmsMessage = prepareClientSms(`Hi ${ticketData.firstName}! Your ticket submission has been received. Complete Stripe Checkout before service begins. We've emailed copies of your forms and consent agreement. - Fabsy`, localeContext);
        
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
          providerDeliveryFailures.push("client_sms_rejected");
        } else {
          clientSmsResponse = await clientSmsResult.json();
          console.log("Client SMS sent successfully:", clientSmsResponse);
        }
      } catch (smsError: unknown) {
        console.error("Error sending client SMS:", getErrorMessage(smsError));
        providerDeliveryFailures.push("client_sms_error");
        // Finish the bundle below as indeterminate; never auto-repeat it.
      }
    } else {
      console.log("Client opted out of SMS notifications");
    }

    if (providerDeliveryFailures.length) {
      console.error("One or more notification providers rejected delivery:", providerDeliveryFailures);
      throw new Error("One or more notification deliveries were not accepted by the provider.");
    }

    const { data: finished, error: finishError } = await supabase.rpc(
      "finish_ticket_submission_notification",
      {
        p_submission_id: submissionId,
        p_claim_id: dispatchClaimId,
        p_status: "sent",
        p_failure_code: null,
      },
    );
    if (finishError || finished !== true) {
      throw finishError || new Error("Notification dispatch state could not be finalized.");
    }

    return new Response(JSON.stringify({ 
      success: true, 
      localization: notificationLocale(localeContext),
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
  } catch (error: unknown) {
    console.error("Error in send-notification function:", error);
    if (claimedSubmissionId && dispatchClaimId) {
      const completionStatus = providerRequestStarted ? "indeterminate" : "failed_before_delivery";
      const failureCode = error instanceof RequestError ? "request_error" : "dispatch_error";
      const { error: finishError } = await supabase.rpc(
        "finish_ticket_submission_notification",
        {
          p_submission_id: claimedSubmissionId,
          p_claim_id: dispatchClaimId,
          p_status: completionStatus,
          p_failure_code: failureCode,
        },
      );
      if (finishError) console.error("Notification dispatch failure state could not be recorded:", finishError);
    }
    const status = error instanceof RequestError ? error.status : 500;
    return new Response(
      JSON.stringify({ error: getErrorMessage(error) }),
      {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
