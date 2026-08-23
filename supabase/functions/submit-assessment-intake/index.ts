import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

class RequestError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[\d\s+().-]*$/;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const BASE_ORIGINS = new Set([
  "https://fabsy.ca",
  "https://www.fabsy.ca",
  "https://fabsy-execom.vercel.app",
  "http://localhost:4173",
  "http://localhost:5173",
  "http://localhost:8080",
]);

function isAllowedOrigin(origin: string | null) {
  if (!origin) return true;
  if (BASE_ORIGINS.has(origin)) return true;
  try {
    const configured = (Deno.env.get("ASSESSMENT_ALLOWED_ORIGINS") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (configured.includes(origin)) return true;
    const url = new URL(origin);
    return url.protocol === "https:" && url.hostname.startsWith("fabsy-") && url.hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function headers(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && isAllowedOrigin(origin) ? origin : "https://fabsy.ca",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

function json(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}

function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) throw new RequestError(`${label} is required.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new RequestError(`${label} is too long.`);
  return normalized;
}

function optionalText(value: unknown, label: string, maxLength: number) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new RequestError(`${label} is invalid.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new RequestError(`${label} is too long.`);
  return normalized || null;
}

function enumValue(value: unknown, label: string, allowed: readonly string[]) {
  if (typeof value !== "string" || !allowed.includes(value)) throw new RequestError(`${label} is invalid.`);
  return value;
}

function optionalMoney(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100_000) {
    throw new RequestError(`${label} is invalid.`);
  }
  return Math.round(value * 100) / 100;
}

function optionalIsoDate(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RequestError(`${label} is invalid.`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new RequestError(`${label} is invalid.`);
  }
  return value;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((part) => part.toString(16).padStart(2, "0")).join("");
}

function requestIp(req: Request) {
  return req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
}

function cleanAttribution(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = [
    "gclid",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "llm_source",
    "referrer_host",
    "landing_page",
    "first_touch_at",
  ];
  return allowed.reduce<Record<string, string>>((result, key) => {
    const field = (value as Record<string, unknown>)[key];
    if (typeof field === "string" && field.trim() && field.length <= 250) result[key] = field.trim();
    return result;
  }, {});
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (!isAllowedOrigin(origin)) return json(origin, { error: "Origin is not allowed." }, 403);
  if (req.method === "OPTIONS") return new Response(null, { headers: headers(origin) });
  if (req.method !== "POST") return json(origin, { error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Assessment intake configuration is incomplete.");
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json() as Record<string, unknown>;
    if (typeof body.company === "string" && body.company.trim()) {
      return json(origin, { success: true }, 200);
    }
    if (body.termsAccepted !== true) throw new RequestError("Terms acceptance is required.");
    const orderId = requiredText(body.orderId, "orderId", 36).toLowerCase();
    if (!UUID_PATTERN.test(orderId)) throw new RequestError("orderId is invalid.");

    const contact = body.contact as Record<string, unknown> | undefined;
    const ticket = body.ticket as Record<string, unknown> | undefined;
    const driving = body.driving as Record<string, unknown> | undefined;
    const insurance = body.insurance as Record<string, unknown> | undefined;
    const file = body.file as Record<string, unknown> | undefined;
    if (!contact || !ticket || !driving || !insurance || !file) throw new RequestError("Assessment intake is incomplete.");

    const firstName = requiredText(contact.firstName, "First name", 100);
    const lastName = requiredText(contact.lastName, "Last name", 100);
    const email = requiredText(contact.email, "Email", 255).toLowerCase();
    if (!EMAIL_PATTERN.test(email)) throw new RequestError("Email is invalid.");
    const phone = optionalText(contact.phone, "Phone", 30) || "";
    if (!PHONE_PATTERN.test(phone) || phone.replace(/\D/g, "").length > 15) throw new RequestError("Phone is invalid.");

    const province = requiredText(ticket.province, "Province", 80);
    if (province !== "Alberta") throw new RequestError("This assessment currently accepts Alberta traffic tickets only.", 422);
    const offence = optionalText(ticket.offence, "Offence", 200);
    const ticketDate = optionalIsoDate(ticket.ticketDate, "Ticket date");
    const responseDeadline = optionalIsoDate(ticket.responseDeadline, "Response deadline");
    const fineAmountCad = optionalMoney(ticket.fineAmountCad, "Fine amount");
    const whatHappened = requiredText(ticket.whatHappened, "What happened", 2500);
    if (whatHappened.length < 10) throw new RequestError("What happened must be at least 10 characters.");

    const licensedInCanada = enumValue(driving.licensedInCanada, "Canadian licence duration", ["less_than_1_year", "1_to_3_years", "4_to_9_years", "10_plus_years", "unknown"]);
    const licenceClass = enumValue(driving.licenceClass, "Licence class", ["class_7", "class_5_gdl", "class_5", "commercial", "other", "unknown"]);
    const relevantConvictions = enumValue(driving.relevantConvictions, "Prior convictions", ["0", "1", "2_plus", "unknown"]);
    const currentDemerits = enumValue(driving.currentDemerits, "Current demerits", ["0", "1_to_3", "4_to_7", "8_plus", "unknown"]);
    const drivingUse = enumValue(driving.drivingUse, "Driving use", ["personal", "commercial", "both", "unknown"]);

    const premiumAmountCad = optionalMoney(insurance.premiumAmountCad, "Premium amount");
    const premiumFrequency = enumValue(insurance.premiumFrequency, "Premium frequency", ["monthly", "annual", "unknown"]);
    const renewalMonth = enumValue(insurance.renewalMonth, "Renewal month", ["unknown", "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]);
    const insurer = optionalText(insurance.insurer, "Insurer", 150);

    const contentType = requiredText(file.contentType, "File type", 100);
    const extension = MIME_EXTENSIONS[contentType];
    if (!extension) throw new RequestError("Ticket file type is not supported.");
    if (typeof file.size !== "number" || !Number.isInteger(file.size) || file.size <= 0 || file.size > MAX_FILE_BYTES) {
      throw new RequestError("Ticket file size is invalid.");
    }

    const fingerprint = await sha256(`${serviceRoleKey}:${requestIp(req)}`);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await admin
      .from("ticket_submissions")
      .select("id", { count: "exact", head: true })
      .eq("service_type", "ticket_insurance_assessment")
      .eq("assessment_intake->server->>request_fingerprint", fingerprint)
      .gte("created_at", oneHourAgo);
    if (countError) throw countError;
    if ((count || 0) >= 5) throw new RequestError("Too many assessment attempts. Please try again later.", 429);

    const storagePath = `${orderId}/ticket.${extension}`;
    const accessToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
    const accessTokenHash = await sha256(accessToken);
    const intake = {
      schema_version: 1,
      ticket: {
        province,
        offence,
        ticket_date: ticketDate,
        response_deadline: responseDeadline,
        fine_amount_cad: fineAmountCad,
        what_happened: whatHappened,
      },
      driving: {
        licensed_in_canada: licensedInCanada,
        licence_class: licenceClass,
        relevant_convictions: relevantConvictions,
        current_demerits: currentDemerits,
        driving_use: drivingUse,
      },
      insurance: {
        premium_amount_cad: premiumAmountCad,
        premium_frequency: premiumFrequency,
        renewal_month: renewalMonth,
        insurer,
      },
      attribution: cleanAttribution(body.attribution),
      server: { request_fingerprint: fingerprint },
    };
    const placeholderLicense = `ASSESSMENT-${orderId}`;

    const { data: existingClient, error: existingClientError } = await admin
      .from("clients")
      .select("id,email")
      .eq("drivers_license", placeholderLicense)
      .maybeSingle();
    if (existingClientError) throw existingClientError;
    let clientId: string;
    if (existingClient) {
      const { data: existingSubmission } = await admin
        .from("ticket_submissions")
        .select("assessment_paid_at")
        .eq("id", orderId)
        .maybeSingle();
      if (existingSubmission?.assessment_paid_at) throw new RequestError("This assessment has already been paid.", 409);
      const { error: clientUpdateError } = await admin.from("clients").update({
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
      }).eq("id", existingClient.id);
      if (clientUpdateError) throw clientUpdateError;
      clientId = existingClient.id as string;
    } else {
      const { data: createdClient, error: createdClientError } = await admin.from("clients").insert({
        drivers_license: placeholderLicense,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        sms_opt_in: false,
      }).select("id").single();
      if (createdClientError || !createdClient) throw createdClientError || new Error("Assessment client could not be created.");
      clientId = createdClient.id as string;
    }

    const submissionPayload = {
      client_id: clientId,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      drivers_license: placeholderLicense,
      ticket_number: `ASSESS-${orderId.slice(0, 8).toUpperCase()}`,
      violation: offence || "Ticket pending human review",
      fine_amount: fineAmountCad === null ? "Unknown" : fineAmountCad.toFixed(2),
      violation_date: ticketDate,
      court_date: responseDeadline,
      court_location: "Alberta",
      defense_strategy: "Ticket Triage",
      additional_notes: whatHappened,
      insurance_company: insurer,
      status: "assessment_awaiting_payment",
      service_type: "ticket_insurance_assessment",
      assessment_intake: intake,
      assessment_ticket_path: storagePath,
      assessment_access_token_hash: accessTokenHash,
      assessment_price_cad: 149,
      representation_credit_eligible: true,
      updated_at: new Date().toISOString(),
    };

    const { data: existingSubmission, error: existingSubmissionError } = await admin
      .from("ticket_submissions")
      .select("id,client_id,service_type,assessment_ticket_path")
      .eq("id", orderId)
      .maybeSingle();
    if (existingSubmissionError) throw existingSubmissionError;
    if (existingSubmission) {
      if (existingSubmission.client_id !== clientId || existingSubmission.service_type !== "ticket_insurance_assessment") {
        throw new RequestError("Assessment ownership could not be verified.", 409);
      }
      if (existingSubmission.assessment_ticket_path && existingSubmission.assessment_ticket_path !== storagePath) {
        await admin.storage.from("assessment-tickets").remove([existingSubmission.assessment_ticket_path]);
      }
      const { error: updateError } = await admin.from("ticket_submissions").update(submissionPayload).eq("id", orderId);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await admin.from("ticket_submissions").insert({ id: orderId, ...submissionPayload });
      if (insertError) throw insertError;
    }

    const { data: signedUpload, error: signedUploadError } = await admin.storage
      .from("assessment-tickets")
      .createSignedUploadUrl(storagePath, { upsert: true });
    if (signedUploadError || !signedUpload?.token) throw signedUploadError || new Error("Private upload could not be prepared.");

    return json(origin, {
      submissionId: orderId,
      accessToken,
      upload: { path: storagePath, token: signedUpload.token },
    });
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 500;
    if (status >= 500) console.error("submit-assessment-intake failed");
    return json(origin, { error: status >= 500 ? "The assessment intake could not be saved." : (error as Error).message }, status);
  }
});
