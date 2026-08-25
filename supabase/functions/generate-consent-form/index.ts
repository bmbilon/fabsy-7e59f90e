import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

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
    const digitalSignature = requiredText(request.digitalSignature, "Digital signature", 200);
    if (!UUID_PATTERN.test(submissionId) || accessToken.length < 32) {
      throw new RequestError("Submission authorization is invalid.", 403);
    }
    const accessTokenHash = await sha256(accessToken);
    const { data: submission, error: submissionError } = await supabase
      .from("ticket_submissions")
      .select("id,first_name,last_name,email,phone,address,city,postal_code,drivers_license,ticket_number,violation,violation_date,status,service_type,representation_access_token_hash")
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
    if (digitalSignature.replace(/\s+/g, " ").toLocaleLowerCase("en-CA") !== expectedSignature) {
      throw new RequestError("Type the same full legal name shown on the consent form.");
    }

    console.log("Generating authorized consent form for submission:", submissionId);

    // Create PDF document using pdf-lib
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size
    const { width, height } = page.getSize();
    
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    let yPosition = height - 50;
    const leftMargin = 50;
    const fontSize = 11;
    const titleSize = 16;
    const sectionSize = 13;

    // Helper function to add text
    const addText = (text: string, size: number, fontType: typeof font, x: number, y: number) => {
      page.drawText(text, {
        x,
        y,
        size,
        font: fontType,
        color: rgb(0, 0, 0),
      });
    };

    // Title
    addText("CLIENT CONSENT FOR TRAFFIC TICKET AGENT SERVICES", fontSize + 2, boldFont, 70, yPosition);
    yPosition -= 20;
    addText("Fabsy Traffic Ticket Defense", fontSize, font, 190, yPosition);
    yPosition -= 30;

    // Client Information
    addText("CLIENT INFORMATION", sectionSize, boldFont, leftMargin, yPosition);
    yPosition -= 20;
    addText(`Name: ${formData.firstName} ${formData.lastName}`, fontSize, font, leftMargin, yPosition);
    yPosition -= 15;
    addText(`Email: ${formData.email}`, fontSize, font, leftMargin, yPosition);
    yPosition -= 15;
    addText(`Phone: ${formData.phone}`, fontSize, font, leftMargin, yPosition);
    yPosition -= 15;
    addText(`Address: ${formData.address}, ${formData.city}, ${formData.province}`, fontSize, font, leftMargin, yPosition);
    yPosition -= 15;
    addText(`Postal Code: ${formData.postalCode}`, fontSize, font, leftMargin, yPosition);
    yPosition -= 15;
    addText(`Driver's License: ${formData.driversLicense}`, fontSize, font, leftMargin, yPosition);
    yPosition -= 25;

    // Ticket Information
    addText("TICKET INFORMATION", sectionSize, boldFont, leftMargin, yPosition);
    yPosition -= 20;
    addText(`Ticket Number: ${formData.ticketNumber}`, fontSize, font, leftMargin, yPosition);
    yPosition -= 15;
    addText(`Violation: ${formData.violation}`, fontSize, font, leftMargin, yPosition);
    yPosition -= 15;
    addText(`Issue Date: ${formData.issueDate}`, fontSize, font, leftMargin, yPosition);
    yPosition -= 25;

    // Authorization
    addText("AUTHORIZATION FOR AGENT SERVICES", sectionSize, boldFont, leftMargin, yPosition);
    yPosition -= 20;
    
    const authLines = [
      "I authorize Fabsy Traffic Ticket Defense and its designated agents to assist with",
      "the ticket identified above, if the matter is eligible for Fabsy's agent services.",
      "",
      "Within the scope permitted by applicable law and court or tribunal rules, I authorize",
      "Fabsy's agents to:",
      "• Communicate with authorized court, tribunal, and prosecution contacts about this ticket",
      "• Submit permitted forms or information for this ticket using my instructions",
      "• Attend or arrange an appearance only when permitted and agreed with me",
      "• Take steps I have instructed Fabsy to take within the permitted agent scope",
      "",
      "I understand that:",
      "• Fabsy is an agent service, not a law firm, and does not provide legal advice",
      "• Fabsy will not choose or change a plea or strategy without my instructions",
      "• Fabsy may access only information actually needed and lawfully available for this matter",
      "• Outcomes vary and Fabsy does not promise a particular result",
      "• Representation uses a $488 base representation fee plus 30% of any fine",
      "  reduction achieved; there is no success fee if the fine is not reduced"
    ];

    authLines.forEach(line => {
      if (yPosition < 100) {
        // Would need new page, but keeping simple for now
        return;
      }
      addText(line, fontSize - 1, font, leftMargin, yPosition);
      yPosition -= 14;
    });

    yPosition -= 10;

    // Signature
    addText("CLIENT SIGNATURE", sectionSize, boldFont, leftMargin, yPosition);
    yPosition -= 20;
    addText(`Digital Signature: ${formData.digitalSignature}`, fontSize, font, leftMargin, yPosition);
    yPosition -= 15;
    addText(`Date: ${new Date().toLocaleDateString()}`, fontSize, font, leftMargin, yPosition);
    yPosition -= 25;

    // Consent text
    const consentLines = [
      "By signing this form, I consent to the processing of my personal information",
      "for this ticket matter as described in Fabsy's Privacy Policy. Fabsy may use only",
      "the information it actually accesses for the requested service and may disclose it",
      "to authorized service providers or public bodies when needed or required by law."
    ];

    consentLines.forEach(line => {
      if (yPosition > 50) {
        addText(line, fontSize - 2, font, leftMargin, yPosition);
        yPosition -= 12;
      }
    });

    // Save PDF
    const pdfBytes = await pdfDoc.save();
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
    const status = error instanceof RequestError ? error.status : 500;
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
