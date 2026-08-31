import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { createConsentPdf } from "../_shared/consent-pdf.ts";
import { ConsentTextError } from "../_shared/consent-unicode.ts";
import { LocaleRequestError, parsePreferredLocale } from "../_shared/locale-policy.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ConsentRequest {
  submissionId: string;
  accessToken: string;
  digitalSignature: string;
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request = await req.json() as Partial<ConsentRequest>;
    const submissionId = requiredText(request.submissionId, "Submission", 36).toLowerCase();
    const accessToken = requiredText(request.accessToken, "Submission access token", 200);
    requiredText(request.digitalSignature, "Digital signature", 200);
    // Validate a comparison form without replacing the exact submitted spelling,
    // script, marks, or whitespace in the generated consent record.
    const digitalSignature = request.digitalSignature!;
    if (digitalSignature.length > 200) throw new RequestError("Digital signature is invalid.");
    if (!UUID_PATTERN.test(submissionId) || accessToken.length < 32) {
      throw new RequestError("Submission authorization is invalid.", 403);
    }
    const accessTokenHash = await sha256(accessToken);
    const { data: submission, error: submissionError } = await supabase
      .from("ticket_submissions")
      .select("id,first_name,last_name,email,phone,address,city,postal_code,drivers_license,ticket_number,violation,violation_date,status,service_type,preferred_locale,representation_access_token_hash,ticket_type,registered_owner_on_offence_date")
      .eq("id", submissionId)
      .maybeSingle();
    if (submissionError) throw submissionError;
    if (
      !submission ||
      submission.service_type !== "representation" ||
      submission.status !== "awaiting_payment" ||
      submission.representation_access_token_hash !== accessTokenHash
    ) {
      throw new RequestError("Submission authorization is invalid or expired.", 403);
    }

    const formData = {
      ticketType: submission.ticket_type === "photo_radar" ? "photo_radar" as const : "officer_issued" as const,
      registeredOwnerOnOffenceDate: submission.registered_owner_on_offence_date,
      submissionId: submission.id,
      firstName: String(submission.first_name || ""),
      lastName: String(submission.last_name || ""),
      email: String(submission.email || ""),
      phone: String(submission.phone || ""),
      address: String(submission.address || ""),
      city: String(submission.city || ""),
      province: "Alberta",
      postalCode: String(submission.postal_code || ""),
      driversLicense: String(submission.drivers_license || ""),
      ticketNumber: String(submission.ticket_number || ""),
      violation: String(submission.violation || ""),
      issueDate: submission.violation_date ? String(submission.violation_date) : "Not supplied",
      digitalSignature,
    };
    const expectedSignature = `${formData.firstName} ${formData.lastName}`.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-CA");
    if (digitalSignature.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-CA") !== expectedSignature) {
      throw new RequestError("Type the same full legal name shown on the consent form.");
    }

    console.log("Generating authorized consent form for submission:", submissionId);

    // English authorization remains controlling. Original client fields are
    // shaped and embedded in their own scripts, with an exact UTF-8 attachment.
    // This pure generator makes no external font/shaping/translation requests.
    const pdfBytes = await createConsentPdf(formData, parsePreferredLocale(submission.preferred_locale));
    console.log("PDF generated, size:", pdfBytes.length, "bytes");

    // Upload to storage
    const fileName = `${formData.submissionId}/consent-form-${accessTokenHash.slice(0, 16)}.pdf`;
    console.log("Uploading to storage:", fileName);
    
    const { error: uploadError } = await supabase.storage
      .from('consent-forms')
      .upload(fileName, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      console.error("Error uploading consent form:", uploadError);
      throw uploadError;
    }

    console.log("Consent form uploaded successfully to storage:", fileName);

    // Update ticket submission with consent form path
    const { data: updatedSubmission, error: updateError } = await supabase
      .from('ticket_submissions')
      .update({ consent_form_path: fileName })
      .eq('id', formData.submissionId)
      .eq('status', 'awaiting_payment')
      .eq('representation_access_token_hash', accessTokenHash)
      .select('id')
      .maybeSingle();

    if (updateError || !updatedSubmission) {
      console.error("Error updating submission with consent form path:", updateError);
      throw updateError || new RequestError("Submission authorization expired before consent was stored.", 409);
    }

    console.log("Submission updated with consent form path");

    return new Response(JSON.stringify({ 
      success: true, 
      consentFormPath: fileName 
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: unknown) {
    console.error("Error in generate-consent-form function:", error);
    const errorMessage = error instanceof Error ? error.message : "Consent form generation failed";
    const status = error instanceof RequestError || error instanceof ConsentTextError || error instanceof LocaleRequestError ? error.status : 500;
    return new Response(
      JSON.stringify({ error: errorMessage, ...(error instanceof ConsentTextError || error instanceof LocaleRequestError ? { code: error.code } : {}) }),
      {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
