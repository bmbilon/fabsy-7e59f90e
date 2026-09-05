import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { LocaleRequestError, parsePreferredLocale, requireReleasedServiceLocale } from "../_shared/locale-policy.ts";
import { parseTicketClassification, ProductRequestError } from "../_shared/photo-radar.ts";
import { ELIGIBLE_PRO_CLASSES, normalizedLicenceClass } from "../_shared/pro-pricing.ts";
import { attachReferralAttribution, recordReferralDeclaredPlate } from "../_shared/referrals.ts";
import { requireEnglishProductLocale } from "../_shared/product-locale.ts";
import { DraftRequestError, parseDraftAccessToken, requestAddress } from "../_shared/ticket-intake-draft.ts";
import { normalizeSubmissionViolation } from "../_shared/submission-violation.ts";

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
  province: string;
  postalCode: string;
  dateOfBirth?: string;
  smsOptIn: boolean;
  
  // Ticket info
  ticketNumber: string;
  violation?: unknown;
  fineAmount: string;
  violationDate?: string;
  courtLocation?: string;
  courtDate?: string;
  defenseStrategy: string;
  additionalNotes?: string;
  insuranceCompany?: string;
  file?: { contentType?: string; size?: number };
  sourceAssessment?: { submissionId?: string; accessToken?: string };
  draftId?: unknown;
  draftAccessToken?: unknown;
}

interface IntakeDraftRow {
  id: string;
  access_token_hash: string;
  email: string | null;
  phone: string | null;
  preferred_locale: string;
  status: "active" | "converted" | "expired";
  expires_at: string;
  ticket_document_path: string;
  ticket_document_content_type: string;
  ticket_document_size_bytes: number;
  ticket_uploaded_at: string | null;
  converted_submission_id: string | null;
  client_id: string | null;
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
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    // Rate limiting by IP address
    const clientIP = requestAddress(req);
    
    const now = Date.now();
    const tracker = submissionTracker.get(clientIP);
    
    if (tracker) {
      if (now < tracker.resetAt) {
        if (tracker.count >= MAX_SUBMISSIONS_PER_HOUR) {
          console.warn("[Submit Ticket] Rate limit exceeded");
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
    const requiredTextValues = [
      formData.driversLicense, formData.firstName, formData.lastName,
      formData.email, formData.phone, formData.province,
      formData.ticketNumber, formData.fineAmount,
    ];
    if (requiredTextValues.some((value) => typeof value !== "string" || !value.trim())) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }
    if (typeof formData.smsOptIn !== "boolean") throw new RequestError("SMS preference is invalid.");

    const normalizedViolation = normalizeSubmissionViolation(formData.violation);
    if (!normalizedViolation.ok) throw new RequestError(normalizedViolation.error);

    const optionalTextValues = [
      formData.address, formData.city, formData.postalCode, formData.dateOfBirth,
      formData.violationDate, formData.courtLocation, formData.courtDate,
      formData.defenseStrategy, formData.additionalNotes, formData.insuranceCompany,
    ];
    if (optionalTextValues.some((value) => value !== undefined && typeof value !== "string")) {
      throw new RequestError("One or more intake fields are invalid.");
    }

    // Length validation to prevent DoS
    if (formData.firstName.length > 100 || formData.lastName.length > 100 ||
        formData.email.length > 255 || formData.phone.length > 30 ||
        formData.driversLicense.length > 50 || formData.ticketNumber.length > 50 ||
        formData.fineAmount.length > 20 ||
        formData.province.length > 100 ||
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

    let intakeDraft: IntakeDraftRow | null = null;
    let draftAccessToken: string | null = null;
    if (formData.draftAccessToken !== undefined) {
      draftAccessToken = parseDraftAccessToken(formData.draftAccessToken);
      const draftAccessTokenHash = await sha256(draftAccessToken);
      let draftQuery = supabase
        .from("ticket_intake_drafts")
        .select("id,access_token_hash,email,phone,preferred_locale,status,expires_at,ticket_document_path,ticket_document_content_type,ticket_document_size_bytes,ticket_uploaded_at,converted_submission_id,client_id")
        .eq("access_token_hash", draftAccessTokenHash);
      if (formData.draftId !== undefined) {
        if (typeof formData.draftId !== "string" || !UUID_PATTERN.test(formData.draftId)) {
          throw new RequestError("The saved intake is not available.", 403);
        }
        draftQuery = draftQuery.eq("id", formData.draftId.toLowerCase());
      }
      const { data: savedDraft, error: savedDraftError } = await draftQuery.maybeSingle();
      if (savedDraftError) throw new Error("The saved intake could not be verified.");
      if (!savedDraft) throw new RequestError("The saved intake is not available.", 403);
      const verifiedDraft = savedDraft as IntakeDraftRow;
      intakeDraft = verifiedDraft;

      if (Date.parse(verifiedDraft.expires_at) <= Date.now()) {
        throw new RequestError("This saved intake has expired.", 410);
      }

      // A retry after the atomic conversion returns the already-linked case;
      // the caller still had to present the original draft capability.
      if (verifiedDraft.status === "converted") {
        const { data: convertedSubmission, error: convertedError } = await supabase
          .from("ticket_submissions")
          .select("id,client_id,preferred_locale,representation_access_token_hash")
          .eq("id", verifiedDraft.converted_submission_id || verifiedDraft.id)
          .eq("representation_access_token_hash", verifiedDraft.access_token_hash)
          .maybeSingle();
        if (convertedError) throw new Error("The submitted intake could not be verified.");
        if (!convertedSubmission) throw new RequestError("This intake has already been submitted.", 409);
        return new Response(JSON.stringify({
          success: true,
          submissionId: convertedSubmission.id,
          clientId: convertedSubmission.client_id,
          reused: true,
          preferred_locale: convertedSubmission.preferred_locale,
          accessToken: draftAccessToken,
          upload: null,
          referralAttached: false,
        }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      if (verifiedDraft.status !== "active") {
        throw new RequestError("This saved intake has expired.", 410);
      }
      if (!verifiedDraft.ticket_uploaded_at || !verifiedDraft.ticket_document_path) {
        throw new RequestError("Upload and confirm the ticket before continuing.", 409);
      }
      if (verifiedDraft.email && verifiedDraft.email !== normalizedEmail) {
        throw new RequestError("The saved intake contact does not match this submission.", 403);
      }
      if (verifiedDraft.phone && verifiedDraft.phone !== normalizedPhone) {
        throw new RequestError("The saved intake contact does not match this submission.", 403);
      }
      if (verifiedDraft.preferred_locale !== preferredLocale) {
        throw new RequestError("The saved intake language changed. Reload the saved intake before continuing.", 409);
      }
      if (formData.sourceAssessment) {
        throw new RequestError("A saved draft cannot also consume a ticket-review capability.");
      }
      if (formData.file !== undefined) {
        const finalFile = uploadMetadata(formData.file);
        if (finalFile.contentType !== verifiedDraft.ticket_document_content_type ||
            formData.file?.size !== verifiedDraft.ticket_document_size_bytes) {
          throw new RequestError("The submitted ticket metadata does not match the confirmed private upload.", 409);
        }
      }
    }

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
    const directUpload = sourceAssessment || intakeDraft ? null : uploadMetadata(formData.file);
    const representationAccessToken = draftAccessToken || `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
    const representationAccessTokenHash = intakeDraft?.access_token_hash || await sha256(representationAccessToken);

    // Step 1: Check if client exists
    let clientId: string;
    
    const { data: existingClient, error: clientLookupError } = await supabase
      .from('clients')
      .select('id,email')
      .eq('drivers_license', formData.driversLicense.trim())
      .maybeSingle();
    
    if (clientLookupError) {
      console.error('[Submit Ticket] Client lookup failed');
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
        console.error('[Submit Ticket] Client creation failed');
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
      violation: normalizedViolation.value,
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
      ticket_document_path: sourceAssessment?.assessment_ticket_path || intakeDraft?.ticket_document_path || null,
      representation_access_token_hash: representationAccessTokenHash,
    };

    // Identity fields alone are not authority to overwrite an unpaid case.
    // Draft-backed retries use the draft UUID and capability instead.
    if (!intakeDraft) {
      const { data: existingSubmission, error: existingSubmissionError } = await supabase
        .from('ticket_submissions')
        .select('id')
        .eq('client_id', clientId)
        .eq('ticket_number', formData.ticketNumber)
        .eq('status', 'awaiting_payment')
        .limit(1)
        .maybeSingle();
      if (existingSubmissionError) throw new Error('Failed to check existing ticket submission');
      if (existingSubmission) {
        throw new RequestError(
          "An unpaid intake already exists for this ticket. Resume it from the original browser or contact Fabsy.",
          409,
        );
      }
    }

    // Step 2: Create a payment-pending ticket submission.
    console.log('[Submit Ticket] Creating ticket submission');
    const { data: submissionData, error: submissionError } = await supabase
      .from('ticket_submissions')
      .insert(intakeDraft ? { id: intakeDraft.id, ...submissionPayload } : submissionPayload)
      .select('id')
      .single();

    if (submissionError || !submissionData) {
      if (intakeDraft && submissionError?.code === "23505") {
        const { data: concurrentSubmission } = await supabase
          .from("ticket_submissions")
          .select("id,client_id,preferred_locale,representation_access_token_hash")
          .eq("id", intakeDraft.id)
          .eq("representation_access_token_hash", representationAccessTokenHash)
          .maybeSingle();
        if (concurrentSubmission) {
          return new Response(JSON.stringify({
            success: true,
            submissionId: concurrentSubmission.id,
            clientId: concurrentSubmission.client_id,
            reused: true,
            preferred_locale: concurrentSubmission.preferred_locale,
            accessToken: representationAccessToken,
            upload: null,
            referralAttached: false,
          }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
      }
      console.error('[Submit Ticket] Submission insert failed');
      if (submissionError?.message?.includes("TICKET_INTAKE_CONVERSION_INVALID")) {
        throw new RequestError("The saved intake changed or expired before it could be submitted. Reload it and try again.", 409);
      }
      throw new Error('Failed to create ticket submission');
    }

    console.log('[Submit Ticket] Submission created successfully');

    const ticketDocumentPath = sourceAssessment?.assessment_ticket_path || intakeDraft?.ticket_document_path ||
      `${submissionData.id}/representation-ticket.${directUpload!.extension}`;
    if (!intakeDraft) {
      const { error: pathUpdateError } = await supabase
        .from("ticket_submissions")
        .update({ ticket_document_path: ticketDocumentPath })
        .eq("id", submissionData.id);
      if (pathUpdateError) throw pathUpdateError;
    }

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
    const status = error instanceof RequestError || error instanceof DraftRequestError || error instanceof LocaleRequestError || error instanceof ProductRequestError ? error.status : 500;
    if (status >= 500) console.error("[Submit Ticket] Internal failure");
    return new Response(
      JSON.stringify({
        error: status >= 500 ? "Submission failed" : (error as Error).message,
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
