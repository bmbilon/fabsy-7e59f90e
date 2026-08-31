import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { LocaleRequestError, parsePreferredLocale, requireReleasedServiceLocale } from "../_shared/locale-policy.ts";
import { parseTicketClassification, ProductRequestError } from "../_shared/photo-radar.ts";
import { ELIGIBLE_PRO_CLASSES, normalizedLicenceClass } from "../_shared/pro-pricing.ts";
import { attachReferralAttribution, recordReferralDeclaredPlate } from "../_shared/referrals.ts";
import { requireEnglishProductLocale } from "../_shared/product-locale.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Rate limiting: Track submissions by IP
const submissionTracker = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const MAX_SUBMISSIONS_PER_HOUR = 5;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SubmissionData {
  declaredLicenceClass?: unknown;
  refCode?: unknown;
  refAttributionToken?: unknown;
  plateNumber?: unknown;
  ticket_type?: unknown;
  ticket_type_source?: unknown;
  registered_owner_on_offence_date?: unknown;
  preferred_locale?: unknown;
  // Client info
  driversLicense: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  dateOfBirth?: string;
  smsOptIn: boolean;
  
  // Ticket info
  ticketNumber: string;
  violation: string;
  fineAmount: string;
  violationDate?: string;
  courtLocation?: string;
  courtDate?: string;
  defenseStrategy: string;
  additionalNotes?: string;
  insuranceCompany?: string;
  file?: { contentType?: string; size?: number };
  sourceAssessment?: { submissionId?: string; accessToken?: string };
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

function normalizePhone(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) throw new RequestError("Enter a valid phone number.");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

function uploadMetadata(value: SubmissionData["file"]) {
  if (!value || typeof value !== "object") throw new RequestError("A ticket PDF or photo is required.");
  const contentType = typeof value.contentType === "string" ? value.contentType.trim().toLowerCase() : "";
  const extension = MIME_EXTENSIONS[contentType];
  if (!extension) throw new RequestError("Upload a PDF, JPG, PNG, WebP, HEIC or HEIF ticket file.");
  if (typeof value.size !== "number" || !Number.isInteger(value.size) || value.size <= 0 || value.size > MAX_FILE_BYTES) {
    throw new RequestError("The ticket file must be 10 MB or smaller.");
  }
  return { contentType, extension };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting by IP address
    const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0] || 
                     req.headers.get("x-real-ip") || 
                     "unknown";
    
    const now = Date.now();
    const tracker = submissionTracker.get(clientIP);
    
    if (tracker) {
      if (now < tracker.resetAt) {
        if (tracker.count >= MAX_SUBMISSIONS_PER_HOUR) {
          console.warn(`[Submit Ticket] Rate limit exceeded for IP: ${clientIP.substring(0, 10)}...`);
          return new Response(
            JSON.stringify({ error: "Too many submissions. Please try again later." }),
            {
              status: 429,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }
        tracker.count++;
      } else {
        // Reset window
        tracker.count = 1;
        tracker.resetAt = now + RATE_LIMIT_WINDOW;
      }
    } else {
      submissionTracker.set(clientIP, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    }

    const formData: SubmissionData = await req.json();
    const classification = parseTicketClassification(formData as unknown as Record<string, unknown>);
    const preferredLocale = parsePreferredLocale(formData.preferred_locale);
    requireReleasedServiceLocale(
      preferredLocale,
      Deno.env.get("FABSY_LIVE_SERVICE_LOCALES"),
      Deno.env.get("FABSY_REVIEWED_SERVICE_LOCALES"),
    );
    const declaredLicenceClass = normalizedLicenceClass(formData.declaredLicenceClass);
    if (classification.ticket_type === "photo_radar") {
      requireEnglishProductLocale(preferredLocale, "photo_radar");
    } else if (ELIGIBLE_PRO_CLASSES.has(declaredLicenceClass)) {
      requireEnglishProductLocale(preferredLocale, "pro_driver");
    }
    
    console.log("[Submit Ticket] Processing submission");

    // Comprehensive input validation with length limits
    if (!formData.driversLicense || !formData.firstName || !formData.lastName || 
        !formData.email || !formData.phone || !formData.ticketNumber) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Length validation to prevent DoS
    if (formData.firstName.length > 100 || formData.lastName.length > 100 ||
        formData.email.length > 255 || formData.phone.length > 30 ||
        formData.driversLicense.length > 50 || formData.ticketNumber.length > 50 ||
        formData.violation.length > 500 || formData.fineAmount.length > 20 ||
        (formData.address && formData.address.length > 500) ||
        (formData.city && formData.city.length > 100) ||
        (formData.postalCode && formData.postalCode.length > 20) ||
        (formData.courtLocation && formData.courtLocation.length > 200) ||
        (formData.defenseStrategy && formData.defenseStrategy.length > 1000) ||
        (formData.additionalNotes && formData.additionalNotes.length > 2000) ||
        (formData.insuranceCompany && formData.insuranceCompany.length > 200)) {
      return new Response(
        JSON.stringify({ error: "Input field exceeds maximum length" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email address" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const normalizedEmail = formData.email.trim().toLowerCase();
    const normalizedPhone = normalizePhone(formData.phone);

    let sourceAssessment: {
      id: string;
      assessment_ticket_path: string;
    } | null = null;
    if (formData.sourceAssessment) {
      const sourceId = typeof formData.sourceAssessment.submissionId === "string"
        ? formData.sourceAssessment.submissionId.trim().toLowerCase()
        : "";
      const accessToken = typeof formData.sourceAssessment.accessToken === "string"
        ? formData.sourceAssessment.accessToken.trim()
        : "";
      if (!UUID_PATTERN.test(sourceId) || accessToken.length < 32 || accessToken.length > 200) {
        throw new RequestError("The saved review handoff is invalid. Start again from the ticket review.");
      }
      const accessTokenHash = await sha256(accessToken);
      const { data: source, error: sourceError } = await supabase
        .from("ticket_submissions")
        .select("id,email,service_type,assessment_access_token_hash,assessment_ticket_path,assessment_policy_paths,review_consent,assessment_paid_at,ticket_type")
        .eq("id", sourceId)
        .maybeSingle();
      if (sourceError) throw sourceError;
      if (
        !source ||
        source.service_type !== "ticket_insurance_assessment" ||
        source.email?.trim().toLowerCase() !== normalizedEmail ||
        source.assessment_access_token_hash !== accessTokenHash ||
        !source.assessment_ticket_path ||
        (classification.ticket_type !== "photo_radar" && (!Array.isArray(source.assessment_policy_paths) || source.assessment_policy_paths.length < 1 || !source.review_consent)) ||
        source.assessment_paid_at
      ) {
        throw new RequestError(
          source?.assessment_paid_at
            ? "This priority review has already been paid. Contact Fabsy to apply its credit to representation."
            : "The saved review documents could not be verified. Start again from the ticket review.",
          source?.assessment_paid_at ? 409 : 403,
        );
      }
      const { data: linkedRepresentation, error: linkedError } = await supabase
        .from("ticket_submissions")
        .select("id,status")
        .eq("source_assessment_id", sourceId)
        .eq("service_type", "representation")
        .limit(1)
        .maybeSingle();
      if (linkedError) throw linkedError;
      if (linkedRepresentation && linkedRepresentation.status !== "awaiting_payment") {
        throw new RequestError("This review is already connected to a representation case.", 409);
      }
      sourceAssessment = {
        id: source.id,
        assessment_ticket_path: source.assessment_ticket_path,
      };
    }
    const directUpload = sourceAssessment ? null : uploadMetadata(formData.file);
    const representationAccessToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
    const representationAccessTokenHash = await sha256(representationAccessToken);

    // Step 1: Check if client exists
    let clientId: string;
    
    const { data: existingClient, error: clientLookupError } = await supabase
      .from('clients')
      .select('id,email')
      .eq('drivers_license', formData.driversLicense.trim())
      .maybeSingle();
    
    if (clientLookupError) {
      console.error('[Submit Ticket] Client lookup error:', clientLookupError);
      throw new Error('Failed to check existing client');
    }

    if (existingClient) {
      // Public intake must never replace the identity or contact details on an
      // existing client record. Portal ownership is verified through email.
      if (existingClient.email?.trim().toLowerCase() !== normalizedEmail) {
        return new Response(
          JSON.stringify({
            error: "This licence is already connected to a client record. Use the existing email or contact support.",
          }),
          {
            status: 409,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      console.log('[Submit Ticket] Reusing verified-email client');
      clientId = existingClient.id;
    } else {
      // Create new client (using service role key, bypasses RLS)
      console.log('[Submit Ticket] Creating new client');
      const { data: newClient, error: createClientError } = await supabase
        .from('clients')
        .insert({
          drivers_license: formData.driversLicense.trim(),
          first_name: formData.firstName,
          last_name: formData.lastName,
          email: normalizedEmail,
          phone: normalizedPhone,
          address: formData.address,
          city: formData.city,
          postal_code: formData.postalCode,
          date_of_birth: formData.dateOfBirth,
          sms_opt_in: formData.smsOptIn
        })
        .select('id')
        .single();

      if (createClientError || !newClient) {
        console.error('[Submit Ticket] Client creation error:', createClientError);
        throw new Error('Failed to create client record');
      }
      
      clientId = newClient.id;
      console.log('[Submit Ticket] Client created');
    }

    const submissionPayload = {
      declared_licence_class: classification.ticket_type === "photo_radar" ? "unknown" : declaredLicenceClass,
      ...classification,
      client_id: clientId,
      preferred_locale: preferredLocale,
      first_name: formData.firstName,
      last_name: formData.lastName,
      email: normalizedEmail,
      phone: normalizedPhone,
      address: formData.address,
      city: formData.city,
      postal_code: formData.postalCode,
      date_of_birth: formData.dateOfBirth,
      drivers_license: formData.driversLicense,
      ticket_number: formData.ticketNumber,
      violation: formData.violation,
      fine_amount: formData.fineAmount,
      violation_date: formData.violationDate,
      court_location: formData.courtLocation,
      court_date: formData.courtDate,
      defense_strategy: formData.defenseStrategy,
      additional_notes: formData.additionalNotes,
      insurance_company: classification.ticket_type === "photo_radar" ? null : formData.insuranceCompany,
      sms_opt_in: Boolean(formData.smsOptIn),
      status: 'awaiting_payment',
      service_type: 'representation',
      source_assessment_id: sourceAssessment?.id || null,
      representation_includes_assessment: Boolean(sourceAssessment) && classification.ticket_type !== "photo_radar",
      ticket_document_path: sourceAssessment?.assessment_ticket_path || null,
      representation_access_token_hash: representationAccessTokenHash,
    };

    // Reuse an unpaid submission so browser retries cannot create duplicate cases.
    const { data: existingSubmission, error: existingSubmissionError } = await supabase
      .from('ticket_submissions')
      .select('id,consent_form_path')
      .eq('client_id', clientId)
      .eq('ticket_number', formData.ticketNumber)
      .eq('status', 'awaiting_payment')
      .limit(1)
      .maybeSingle();

    if (existingSubmissionError) {
      console.error('[Submit Ticket] Existing submission lookup error:', existingSubmissionError);
      throw new Error('Failed to check existing ticket submission');
    }

    if (existingSubmission) {
      const { data: activeCheckoutIntent, error: activeCheckoutError } = await supabase
        .from("idr_checkout_intents")
        .select("id,status")
        .eq("ticket_submission_id", existingSubmission.id)
        .in("checkout_kind", ["ticket_only", "ticket_with_addon", "photo_radar"])
        .in("status", ["creating", "open", "paid"])
        .limit(1)
        .maybeSingle();
      if (activeCheckoutError) throw activeCheckoutError;
      if (activeCheckoutIntent) {
        throw new RequestError(
          activeCheckoutIntent.status === "paid"
            ? "This representation checkout has already been paid."
            : "A representation checkout is already open for this ticket. Use that checkout or let it expire before changing the intake.",
          409,
        );
      }
      const ticketDocumentPath = sourceAssessment?.assessment_ticket_path ||
        `${existingSubmission.id}/representation-ticket.${directUpload!.extension}`;
      const { data: refreshedSubmission, error: refreshError } = await supabase
        .from('ticket_submissions')
        .update({
          ...submissionPayload,
          ticket_document_path: ticketDocumentPath,
          consent_form_path: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingSubmission.id)
        .eq('status', 'awaiting_payment')
        .select('id')
        .maybeSingle();

      if (refreshError || !refreshedSubmission) {
        console.error('[Submit Ticket] Existing submission refresh error:', refreshError);
        if (refreshError?.message?.includes("REPRESENTATION_CHECKOUT_IMMUTABLE")) {
          throw new RequestError("This representation checkout is already open and its signed intake can no longer be changed.", 409);
        }
        throw refreshError || new RequestError('The ticket intake changed elsewhere. Please try again.', 409);
      }
      if (existingSubmission.consent_form_path) {
        const { error: staleConsentError } = await supabase.storage
          .from("consent-forms")
          .remove([existingSubmission.consent_form_path]);
        if (staleConsentError) console.error("[Submit Ticket] Stale consent cleanup failed");
      }

      let upload = null;
      if (directUpload) {
        const { data: signedUpload, error: signedUploadError } = await supabase.storage
          .from("assessment-tickets")
          .createSignedUploadUrl(ticketDocumentPath, { upsert: true });
        if (signedUploadError || !signedUpload?.token) throw signedUploadError || new Error("Private ticket upload could not be prepared.");
        upload = { path: ticketDocumentPath, token: signedUpload.token, contentType: directUpload.contentType };
      }

      const referralResult = await attachReferralAttribution(supabase, existingSubmission.id, {
        refCode: formData.refCode, refAttributionToken: formData.refAttributionToken,
      });
      await recordReferralDeclaredPlate(supabase, existingSubmission.id, formData.plateNumber);
      return new Response(JSON.stringify({
        success: true,
        submissionId: existingSubmission.id,
        clientId,
        reused: true,
        preferred_locale: preferredLocale,
        accessToken: representationAccessToken,
        upload,
        referralAttached: referralResult.attached,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Step 2: Create a payment-pending ticket submission.
    console.log('[Submit Ticket] Creating ticket submission');
    const { data: submissionData, error: submissionError } = await supabase
      .from('ticket_submissions')
      .insert(submissionPayload)
      .select('id')
      .single();

    if (submissionError || !submissionData) {
      console.error('[Submit Ticket] Submission error:', submissionError);
      throw new Error('Failed to create ticket submission');
    }

    console.log('[Submit Ticket] Submission created successfully');

    const ticketDocumentPath = sourceAssessment?.assessment_ticket_path ||
      `${submissionData.id}/representation-ticket.${directUpload!.extension}`;
    const { error: pathUpdateError } = await supabase
      .from("ticket_submissions")
      .update({ ticket_document_path: ticketDocumentPath })
      .eq("id", submissionData.id);
    if (pathUpdateError) throw pathUpdateError;

    let upload = null;
    if (directUpload) {
      const { data: signedUpload, error: signedUploadError } = await supabase.storage
        .from("assessment-tickets")
        .createSignedUploadUrl(ticketDocumentPath, { upsert: true });
      if (signedUploadError || !signedUpload?.token) throw signedUploadError || new Error("Private ticket upload could not be prepared.");
      upload = { path: ticketDocumentPath, token: signedUpload.token, contentType: directUpload.contentType };
    }

    const referralResult = await attachReferralAttribution(supabase, submissionData.id, {
      refCode: formData.refCode, refAttributionToken: formData.refAttributionToken,
    });
    await recordReferralDeclaredPlate(supabase, submissionData.id, formData.plateNumber);
    return new Response(JSON.stringify({ 
      success: true,
      submissionId: submissionData.id,
      clientId: clientId,
      preferred_locale: preferredLocale,
      accessToken: representationAccessToken,
      upload,
      referralAttached: referralResult.attached,
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: unknown) {
    console.error("[Submit Ticket] Error:", error);
    const status = error instanceof RequestError || error instanceof LocaleRequestError || error instanceof ProductRequestError ? error.status : 500;
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Submission failed",
        ...(error instanceof LocaleRequestError ? { error_code: error.code } : {}),
      }),
      {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
