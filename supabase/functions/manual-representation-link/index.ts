import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  buildManualRepresentationLinks,
  parseManualRepresentationCreate,
  parseCheckoutConsent,
  CHECKOUT_CONSENT_VERSION,
  checkoutConsentMatches,
  publicManualRepresentationRecord,
  type ManualPaymentState,
} from "../_shared/manual-representation.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const siteUrl = (Deno.env.get("SITE_URL") || "https://fabsy.ca").replace(/\/$/, "");
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedOrigins = new Set([
  siteUrl,
  "https://www.fabsy.ca",
  "https://fabsy-execom.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
]);

class RequestError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : siteUrl,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    Vary: "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((part) => part.toString(16).padStart(2, "0")).join("");
}

function accessToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function requireStaff(req: Request) {
  const authorization = req.headers.get("authorization");
  if (!authorization) throw new RequestError("Staff sign-in is required.", 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new RequestError("Staff sign-in is invalid or expired.", 401);
  const { data: role, error: roleError } = await admin.from("user_roles")
    .select("role").eq("user_id", data.user.id).in("role", ["admin", "case_manager"])
    .limit(1).maybeSingle();
  if (roleError) throw roleError;
  if (!role) throw new RequestError("Admin or case-manager access is required.", 403);
  return data.user;
}

async function createLinks(req: Request, raw: Record<string, unknown>) {
  const staff = await requireStaff(req);
  let input;
  try {
    input = parseManualRepresentationCreate(raw);
  } catch (error) {
    throw new RequestError(error instanceof Error ? error.message : "The client details are invalid.");
  }

  const { data: duplicate, error: duplicateError } = await admin.from("ticket_submissions")
    .select("id,status,intake_source,consent_form_path")
    .eq("email", input.email).eq("ticket_number", input.ticketNumber)
    .eq("service_type", "representation").order("created_at", { ascending: false })
    .limit(1).maybeSingle();
  if (duplicateError) throw duplicateError;
  if (duplicate) {
    throw new RequestError(
      duplicate.status === "awaiting_payment"
        ? "A pending representation case already exists for this email and ticket number. Use its original private links or review the case before creating another."
        : "This email and ticket number already belong to an active or completed representation case.",
      409,
    );
  }

  const { data: clientCandidates, error: clientError } = await admin.from("clients")
    .select("id,first_name,last_name,email,drivers_license")
    .eq("email", input.email).limit(3);
  if (clientError) throw clientError;
  const matchingClients = (clientCandidates || []).filter((client) =>
    String(client.first_name).trim().toLocaleLowerCase("en-CA") === input.firstName.toLocaleLowerCase("en-CA") &&
    String(client.last_name).trim().toLocaleLowerCase("en-CA") === input.lastName.toLocaleLowerCase("en-CA")
  );
  if ((clientCandidates?.length || 0) > 0 && matchingClients.length !== 1) {
    throw new RequestError("That email is already associated with different or ambiguous client details. Review the existing client before creating links.", 409);
  }

  const submissionId = crypto.randomUUID();
  const token = accessToken();
  const tokenHash = await sha256(token);
  const placeholderLicence = `emailed-ticket-${submissionId}`;
  let clientId = matchingClients[0]?.id as string | undefined;
  let createdClient = false;
  if (!clientId) {
    const { data: client, error } = await admin.from("clients").insert({
      drivers_license: placeholderLicence,
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      phone: "Not supplied",
      address: "",
      city: "",
      postal_code: "",
      sms_opt_in: false,
    }).select("id").single();
    if (error || !client) throw error || new Error("The client record could not be created.");
    clientId = client.id;
    createdClient = true;
  }

  const markerPath = `${submissionId}/emailed-ticket-receipt.json`;
  const marker = new TextEncoder().encode(JSON.stringify({
    schemaVersion: "fabsy-emailed-ticket-receipt-v1",
    submissionId,
    ticketNumber: input.ticketNumber,
    source: "emailed_ticket",
    statement: "Fabsy staff confirmed the ticket was received separately through the business email process. This marker is not the ticket attachment.",
    recordedBy: staff.id,
    recordedAt: new Date().toISOString(),
  }, null, 2));

  let markerStored = false;
  try {
    const { error: markerError } = await admin.storage.from("assessment-tickets")
      .upload(markerPath, marker, { contentType: "application/json", upsert: false });
    if (markerError) throw markerError;
    markerStored = true;

    const ticketShape = input.ticketType === "photo_radar"
      ? { ticket_type: "photo_radar", registered_owner_on_offence_date: "yes", order_type: "photo_radar", review_path: "ate", insurance_company: null }
      : { ticket_type: "officer_issued", registered_owner_on_offence_date: null, order_type: "rapid_resolution", review_path: "standard", insurance_company: null };
    const { error: submissionError } = await admin.from("ticket_submissions").insert({
      id: submissionId,
      client_id: clientId,
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      phone: "Not supplied",
      address: "",
      city: "",
      postal_code: "",
      drivers_license: "",
      ticket_number: input.ticketNumber,
      violation: input.violation,
      fine_amount: "See ticket supplied by email",
      violation_date: input.violationDate,
      defense_strategy: "Rapid Resolution authorization requested",
      additional_notes: "Ticket received separately through the Fabsy business email process.",
      sms_opt_in: false,
      status: "awaiting_payment",
      service_type: "representation",
      preferred_locale: "en",
      ticket_type_source: "manual",
      representation_includes_assessment: false,
      representation_access_token_hash: tokenHash,
      ticket_document_path: markerPath,
      consent_form_path: null,
      intake_source: "emailed_ticket",
      manual_link_created_by: staff.id,
      manual_link_created_at: new Date().toISOString(),
      ...ticketShape,
    });
    if (submissionError) throw submissionError;
  } catch (error) {
    if (markerStored) await admin.storage.from("assessment-tickets").remove([markerPath]);
    if (createdClient && clientId) await admin.from("clients").delete().eq("id", clientId);
    throw error;
  }

  const links = buildManualRepresentationLinks(siteUrl, submissionId, token);
  const price = input.ticketType === "photo_radar" ? "$79 plus 5% GST ($82.95 total)" : "$198 plus applicable GST";
  const emailSubject = `Ticket ${input.ticketNumber} — Consent and secure payment`;
  const emailBody = `Hi ${input.firstName},\n\nWe received ticket ${input.ticketNumber} by email. Please use this private link to review the authorization, provide consent, and pay the ${input.ticketType === "photo_radar" ? "Rapid Resolution: Photo Radar" : "Rapid Resolution"} service fee (${price}):\n\n${links.checkoutUrl}\n\nYou do not need to upload your ticket again. Please send this link only to the person named on the ticket or an authorized representative of the organization named on the ticket.\n\nThank you,\nFabsy Traffic Ticket Services`;
  return json(req, { submissionId, ...links, emailSubject, emailBody }, 201);
}

async function privateSubmission(raw: Record<string, unknown>) {
  const submissionId = typeof raw.submissionId === "string" ? raw.submissionId.trim().toLowerCase() : "";
  const token = typeof raw.accessToken === "string" ? raw.accessToken.trim() : "";
  if (!UUID_PATTERN.test(submissionId) || token.length < 32 || token.length > 200) {
    throw new RequestError("This private link is invalid or expired.", 403);
  }
  const tokenHash = await sha256(token);
  const { data: submission, error } = await admin.from("ticket_submissions")
    .select("id,client_id,first_name,last_name,email,ticket_number,violation,violation_date,ticket_type,registered_owner_on_offence_date,consent_form_path,intake_consent,status,service_type,intake_source,representation_access_token_hash")
    .eq("id", submissionId).maybeSingle();
  if (error) throw error;
  if (!submission || submission.service_type !== "representation" || submission.intake_source !== "emailed_ticket" || submission.representation_access_token_hash !== tokenHash) {
    throw new RequestError("This private link is invalid or expired.", 403);
  }
  return { submission, submissionId, tokenHash };
}

async function acceptConsent(req: Request, raw: Record<string, unknown>) {
  const { submission, submissionId, tokenHash } = await privateSubmission(raw);
  if (submission.status !== "awaiting_payment") throw new RequestError("This case is no longer awaiting checkout. Contact Fabsy if you need to update your authorization.", 409);
  let consent;
  try { consent = parseCheckoutConsent(raw.consent, submission); }
  catch (error) { throw new RequestError((error as Error).message); }
  let stored = submission.intake_consent;
  if (!stored) {
    // First acceptance wins. Retrying a request cannot replace the original
    // timestamp, wording or plea instruction, even before payment is opened.
    const { data: saved, error } = await admin.from("ticket_submissions")
      .update({ intake_consent: consent }).eq("id", submissionId)
      .eq("status", "awaiting_payment").eq("representation_access_token_hash", tokenHash)
      .is("intake_consent", null).is("consent_form_path", null)
      .select("intake_consent").maybeSingle();
    if (error) throw new RequestError("Your authorization could not be saved. Refresh the page before retrying.", 409);
    if (saved) stored = saved.intake_consent;
    else stored = (await privateSubmission(raw)).submission.intake_consent;
  }
  if (!checkoutConsentMatches({ ...submission, intake_consent: stored }) || stored.pleadNotGuilty !== consent.pleadNotGuilty) {
    throw new RequestError("An authorization was already recorded with different choices. Refresh the page to continue, or contact Fabsy to change your instructions.", 409);
  }
  return json(req, { success: true, acceptedAt: stored.acceptedAt });
}

async function readLink(req: Request, raw: Record<string, unknown>) {
  const { submission, submissionId, tokenHash } = await privateSubmission(raw);
  if (submission.intake_consent?.version === CHECKOUT_CONSENT_VERSION && !checkoutConsentMatches(submission)) {
    throw new RequestError("The ticket details changed after consent was recorded. Contact Fabsy before paying.", 409);
  }
  const expectedConsent = `${submissionId}/consent-form-${tokenHash.slice(0, 16)}.pdf`;
  const { data: checkout, error: checkoutError } = await admin.from("idr_checkout_intents")
    .select("status").eq("ticket_submission_id", submissionId)
    .in("checkout_kind", ["ticket_only", "photo_radar"]).limit(1).maybeSingle();
  if (checkoutError) throw checkoutError;
  const paymentState: ManualPaymentState = checkout?.status === "paid"
    ? "paid"
    : submission.status !== "awaiting_payment" ? "unavailable"
    : checkout?.status === "creating" || checkout?.status === "open" ? "open" : "not_started";
  return json(req, publicManualRepresentationRecord({
    ...submission,
    consent_form_path: submission.consent_form_path === expectedConsent ? submission.consent_form_path : null,
  }, paymentState));
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405);
  const origin = req.headers.get("origin") || "";
  if (!allowedOrigins.has(origin)) return json(req, { error: "Origin is not allowed." }, 403);
  try {
    const raw = await req.json() as Record<string, unknown>;
    if (raw.action === "create") return await createLinks(req, raw);
    if (raw.action === "read") return await readLink(req, raw);
    if (raw.action === "consent") return await acceptConsent(req, raw);
    throw new RequestError("Action is invalid.");
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 500;
    if (status >= 500) console.error("manual-representation-link failed", error);
    return json(req, { error: status >= 500 ? "The private links are temporarily unavailable." : (error as Error).message }, status);
  }
};
if (import.meta.main) serve(handler);
