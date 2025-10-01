import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ConsentFormData {
  submissionId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  driversLicense: string;
  ticketNumber: string;
  violation: string;
  issueDate: string;
  digitalSignature: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData: ConsentFormData = await req.json();
    
    console.log("Generating consent form for submission:", formData.submissionId);

    // Create PDF document
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 20;

    // Header
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("WRITTEN CONSENT FOR LEGAL REPRESENTATION", pageWidth / 2, yPos, { align: "center" });
    
    yPos += 15;
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("Fabsy Traffic Ticket Defense Services", pageWidth / 2, yPos, { align: "center" });
    
    yPos += 20;

    // Client Information Section
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("CLIENT INFORMATION", 20, yPos);
    yPos += 10;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Name: ${formData.firstName} ${formData.lastName}`, 20, yPos);
    yPos += 7;
    doc.text(`Email: ${formData.email}`, 20, yPos);
    yPos += 7;
    doc.text(`Phone: ${formData.phone}`, 20, yPos);
    yPos += 7;
    doc.text(`Address: ${formData.address}, ${formData.city}, ${formData.province} ${formData.postalCode}`, 20, yPos);
    yPos += 7;
    doc.text(`Driver's License: ${formData.driversLicense}`, 20, yPos);
    yPos += 15;

    // Ticket Information Section
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("TICKET INFORMATION", 20, yPos);
    yPos += 10;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Ticket Number: ${formData.ticketNumber}`, 20, yPos);
    yPos += 7;
    doc.text(`Violation: ${formData.violation}`, 20, yPos);
    yPos += 7;
    doc.text(`Issue Date: ${formData.issueDate}`, 20, yPos);
    yPos += 15;

    // Authorization Section
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("AUTHORIZATION FOR REPRESENTATION", 20, yPos);
    yPos += 10;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const authText = [
      "I, the undersigned, hereby authorize Fabsy and its designated agents to represent me in all matters",
      "related to the traffic violation referenced above. This authorization includes, but is not limited to:",
      "",
      "• Appearing on my behalf at all court proceedings related to this matter",
      "• Filing and submitting all necessary legal documents and pleadings",
      "• Negotiating with prosecutors and court officials on my behalf",
      "• Making decisions regarding plea negotiations and trial strategy",
      "• Accessing my driving record and related information as needed for my defense",
      "",
      "I understand that:",
      "• Fabsy will make reasonable efforts to achieve the best possible outcome",
      "• No specific outcome can be guaranteed",
      "• I am responsible for the service fee regardless of outcome",
      "• I may be entitled to a refund under the money-back guarantee policy if applicable"
    ];

    authText.forEach(line => {
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }
      doc.text(line, 20, yPos, { maxWidth: pageWidth - 40 });
      yPos += 6;
    });

    yPos += 10;

    // Signature Section
    if (yPos > 230) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("CLIENT SIGNATURE", 20, yPos);
    yPos += 10;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Digital Signature: ${formData.digitalSignature}`, 20, yPos);
    yPos += 7;
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, yPos);
    yPos += 15;

    // Data Processing Consent
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    const consentText = [
      "By signing this form, I consent to the processing of my personal information as outlined in Fabsy's",
      "Privacy Policy. I understand my data will be used solely for the purpose of legal representation",
      "and will not be shared with third parties except as required by law."
    ];
    
    consentText.forEach(line => {
      doc.text(line, 20, yPos, { maxWidth: pageWidth - 40 });
      yPos += 5;
    });

    // Generate PDF as base64
    const pdfBase64 = doc.output('datauristring').split(',')[1];
    const pdfBuffer = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));

    // Upload to storage
    const fileName = `${formData.submissionId}/consent-form.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('consent-forms')
      .upload(fileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      console.error("Error uploading consent form:", uploadError);
      throw uploadError;
    }

    console.log("Consent form uploaded successfully:", fileName);

    // Update ticket submission with consent form path
    const { error: updateError } = await supabase
      .from('ticket_submissions')
      .update({ consent_form_path: fileName })
      .eq('id', formData.submissionId);

    if (updateError) {
      console.error("Error updating submission with consent form path:", updateError);
      throw updateError;
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
  } catch (error: any) {
    console.error("Error in generate-consent-form function:", error);
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
