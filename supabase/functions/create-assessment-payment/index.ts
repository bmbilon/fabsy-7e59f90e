import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import Stripe from "https://esm.sh/stripe@18.5.0";

class RequestError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const ASSESSMENT_CENTS = 14_900;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE_ORIGINS = new Set([
  "https://fabsy.ca",
  "https://www.fabsy.ca",
  "https://fabsy-execom.vercel.app",
  "http://localhost:4173",
  "http://localhost:5173",
  "http://localhost:8080",
]);

function isAllowedOrigin(origin: string | null) {
  if (!origin || BASE_ORIGINS.has(origin)) return true;
  try {
    const configured = (Deno.env.get("ASSESSMENT_ALLOWED_ORIGINS") || "").split(",").map((value) => value.trim()).filter(Boolean);
    if (configured.includes(origin)) return true;
    const url = new URL(origin);
    return url.protocol === "https:" && url.hostname.startsWith("fabsy-") && url.hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function responseHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && isAllowedOrigin(origin) ? origin : "https://fabsy.ca",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

function json(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(origin) });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((part) => part.toString(16).padStart(2, "0")).join("");
}

function siteOrigin() {
  const configured = Deno.env.get("SITE_URL") || "https://fabsy.ca";
  const parsed = new URL(configured);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("SITE_URL must use HTTPS.");
  return parsed.origin;
}

type SupabaseAdmin = ReturnType<typeof createClient>;

function claimRequestError(error: unknown): RequestError | null {
  const message = String((error as { message?: string } | null)?.message || "");
  if (message.includes("ASSESSMENT_CHECKOUT_ALREADY_RESERVED")) {
    return new RequestError(
      "Another checkout is already active for this ticket. Finish or cancel it before choosing a different service.",
      409,
    );
  }
  if (message.includes("ASSESSMENT_CHECKOUT_SOURCE_UNAVAILABLE")) {
    return new RequestError("This priority review is already being activated or has been paid.", 409);
  }
  if (message.includes("ASSESSMENT_CHECKOUT_INVALID_INTENT")) {
    return new RequestError("The assessment checkout reservation changed. Please try again.", 409);
  }
  return null;
}

async function claimAssessmentCheckout(
  admin: SupabaseAdmin,
  submissionId: string,
  intentId: string,
  attempt: number,
  stripeSessionId: string | null,
) {
  const { error } = await admin.rpc("claim_source_assessment_checkout", {
    p_source_assessment_id: submissionId,
    p_checkout_intent_id: intentId,
    p_checkout_attempt: attempt,
    p_claim_kind: "standalone",
    p_stripe_checkout_session_id: stripeSessionId,
  });
  if (error) throw claimRequestError(error) || error;
}

async function releaseAssessmentCheckout(
  admin: SupabaseAdmin,
  intentId: string,
  attempt: number,
  stripeSessionId: string | null,
  status: "failed" | "expired",
) {
  const { data, error } = await admin.rpc("release_source_assessment_checkout", {
    p_checkout_intent_id: intentId,
    p_checkout_attempt: attempt,
    p_stripe_checkout_session_id: stripeSessionId,
    p_intent_status: status,
  });
  if (error) throw error;
  return data === true;
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (!isAllowedOrigin(origin)) return json(origin, { error: "Origin is not allowed." }, 403);
  if (req.method === "OPTIONS") return new Response(null, { headers: responseHeaders(origin) });
  if (req.method !== "POST") return json(origin, { error: "Method not allowed." }, 405);

  let intentId: string | null = null;
  let attempt = 1;
  let admin: SupabaseAdmin | null = null;
  let stripe: Stripe | null = null;
  let createdSession: Stripe.Checkout.Session | null = null;
  let cleanupOnError = false;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey) throw new Error("Assessment payment configuration is incomplete.");
    admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });
    const body = await req.json() as Record<string, unknown>;
    const submissionId = typeof body.submissionId === "string" ? body.submissionId.trim().toLowerCase() : "";
    const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
    if (!UUID_PATTERN.test(submissionId) || accessToken.length < 40 || accessToken.length > 200) {
      throw new RequestError("Assessment checkout details are invalid.");
    }

    const { data: submission, error: submissionError } = await admin
      .from("ticket_submissions")
      .select("id,client_id,status,service_type,assessment_ticket_path,assessment_policy_paths,review_consent,assessment_access_token_hash,assessment_paid_at,assessment_price_cad,clients(first_name,last_name,email)")
      .eq("id", submissionId)
      .maybeSingle();
    if (submissionError) throw submissionError;
    const client = Array.isArray(submission?.clients) ? submission.clients[0] : submission?.clients;
    if (!submission || !client || submission.service_type !== "ticket_insurance_assessment" || Number(submission.assessment_price_cad) !== 149) {
      throw new RequestError("Assessment checkout could not be verified.", 404);
    }
    if (submission.assessment_paid_at) throw new RequestError("This assessment has already been paid.", 409);
    if (await sha256(accessToken) !== submission.assessment_access_token_hash) {
      throw new RequestError("Assessment checkout could not be verified.", 403);
    }
    const storagePath = String(submission.assessment_ticket_path || "");
    if (!storagePath.startsWith(`${submissionId}/`) || storagePath.includes("..")) {
      throw new RequestError("Assessment ticket upload is missing.");
    }
    const objectName = storagePath.slice(submissionId.length + 1);
    const { data: objects, error: objectsError } = await admin.storage
      .from("assessment-tickets")
      .list(submissionId, { limit: 10, search: objectName });
    if (objectsError) throw objectsError;
    const storedObject = objects?.find((item) => item.name === objectName);
    if (!storedObject || !storedObject.id) throw new RequestError("Finish uploading the ticket before checkout.");

    const policyPaths = Array.isArray(submission.assessment_policy_paths)
      ? submission.assessment_policy_paths.filter((path: unknown): path is string => typeof path === "string")
      : [];
    if (policyPaths.length < 1 || !submission.review_consent) {
      throw new RequestError("Add the policy documents and sign the review consent before checkout.");
    }
    const policyStorage = admin.storage.from("assessment-policy-documents");
    await Promise.all(policyPaths.map(async (policyPath: string) => {
      if (!policyPath.startsWith(`${submissionId}/`) || policyPath.includes("..")) {
        throw new RequestError("A policy document path is invalid.");
      }
      const policyObjectName = policyPath.slice(submissionId.length + 1);
      const { data: policyObjects, error: policyObjectsError } = await policyStorage
        .list(submissionId, { limit: 10, search: policyObjectName });
      if (policyObjectsError) throw policyObjectsError;
      if (!policyObjects?.some((item) => item.name === policyObjectName && item.id)) {
        throw new RequestError("Finish uploading every policy document before checkout.");
      }
    }));

    const intentFields = "id,client_id,ticket_submission_id,type,checkout_kind,expected_amount_cents,purchaser_email,stripe_checkout_session_id,status,attempts";
    const { data: existingIntent, error: existingIntentError } = await admin
      .from("idr_checkout_intents")
      .select(intentFields)
      .eq("ticket_submission_id", submissionId)
      .eq("type", "assessment")
      .maybeSingle();
    if (existingIntentError) throw existingIntentError;
    let intent = existingIntent;
    if (!intent) {
      intentId = crypto.randomUUID();
      const { data: inserted, error: insertError } = await admin.from("idr_checkout_intents").insert({
        id: intentId,
        client_id: submission.client_id,
        ticket_submission_id: submissionId,
        type: "assessment",
        checkout_kind: "ticket_assessment",
        expected_amount_cents: ASSESSMENT_CENTS,
        purchaser_email: String(client.email).trim().toLowerCase(),
        request_fingerprint: null,
      }).select(intentFields).single();
      if (insertError?.code === "23505") {
        const { data: raced, error: racedError } = await admin.from("idr_checkout_intents")
          .select(intentFields).eq("ticket_submission_id", submissionId).eq("type", "assessment").single();
        if (racedError) throw racedError;
        intent = raced;
      } else if (insertError) {
        throw insertError;
      } else {
        intent = inserted;
      }
    }

    if (
      !intent ||
      intent.client_id !== submission.client_id ||
      intent.ticket_submission_id !== submissionId ||
      intent.type !== "assessment" ||
      intent.checkout_kind !== "ticket_assessment" ||
      Number(intent.expected_amount_cents) !== ASSESSMENT_CENTS ||
      String(intent.purchaser_email).toLowerCase() !== String(client.email).toLowerCase()
    ) {
      throw new RequestError("The existing assessment checkout does not match this intake.", 409);
    }
    intentId = intent.id as string;
    attempt = Number(intent.attempts || 1);
    if (intent.status === "paid") throw new RequestError("This assessment has already been paid.", 409);

    if (intent.stripe_checkout_session_id) {
      const existingSession = await stripe.checkout.sessions.retrieve(intent.stripe_checkout_session_id);
      await claimAssessmentCheckout(admin, submissionId, intentId, attempt, existingSession.id);
      if (existingSession.status === "open" && existingSession.url) {
        return json(origin, { url: existingSession.url, reused: true });
      }
      if (existingSession.status === "complete") {
        throw new RequestError("Payment is being confirmed for this assessment.", 409);
      }
      const previousAttempt = attempt;
      await releaseAssessmentCheckout(admin, intentId, previousAttempt, existingSession.id, "expired");
      attempt = previousAttempt + 1;
      const { data: refreshed, error: refreshError } = await admin.from("idr_checkout_intents").update({
        attempts: attempt,
        status: "creating",
        stripe_checkout_session_id: null,
      }).eq("id", intentId).eq("attempts", previousAttempt).eq("status", "expired").is("stripe_checkout_session_id", null).select("id").maybeSingle();
      if (refreshError) throw refreshError;
      if (!refreshed) throw new RequestError("Checkout is already being refreshed. Please try again.", 409);
    } else if (intent.status === "failed" || intent.status === "expired") {
      const previousAttempt = attempt;
      attempt = previousAttempt + 1;
      const { data: refreshed, error: refreshError } = await admin.from("idr_checkout_intents").update({
        attempts: attempt,
        status: "creating",
      }).eq("id", intentId).eq("attempts", previousAttempt).eq("status", intent.status)
        .is("stripe_checkout_session_id", null).select("id").maybeSingle();
      if (refreshError) throw refreshError;
      if (!refreshed) throw new RequestError("Checkout is already being refreshed. Please try again.", 409);
    }

    cleanupOnError = true;
    await claimAssessmentCheckout(admin, submissionId, intentId, attempt, null);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: String(client.email).trim().toLowerCase(),
      client_reference_id: submissionId,
      billing_address_collection: "required",
      automatic_tax: { enabled: true },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "cad",
          unit_amount: ASSESSMENT_CENTS,
          tax_behavior: "inclusive",
          product_data: {
            name: "Ticket Triage",
            description: "Human-reviewed Alberta ticket assessment covering options, likely insurance impact, financial significance, representation break-even, and a recommended next step.",
            metadata: {
              fabsy_product: "traffic_ticket_insurance_assessment",
              fabsy_display_name: "Ticket Triage",
              fabsy_internal_name: "Ticket Triage",
              price_includes_applicable_tax: "true",
              representation_priority: "true",
              representation_credit_cents: "14900",
              representation_upgrade_base_balance_cents: "33900",
            },
          },
        },
      }],
      metadata: {
        fabsy_checkout_kind: "ticket_assessment",
        checkout_intent_id: intentId,
        assessment_submission_id: submissionId,
        client_id: submission.client_id,
        assessment_price_cents: String(ASSESSMENT_CENTS),
        assessment_total_cents: String(ASSESSMENT_CENTS),
        price_includes_applicable_tax: "true",
        representation_priority: "true",
        representation_credit_cents: String(ASSESSMENT_CENTS),
        representation_upgrade_base_balance_cents: "33900",
        checkout_attempt: String(attempt),
      },
      success_url: `${siteOrigin()}/traffic-ticket-assessment/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteOrigin()}/traffic-ticket-assessment/start?checkout=cancelled`,
    }, { idempotencyKey: `ticket-assessment:${submissionId}:${attempt}` });
    createdSession = session;
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");

    await claimAssessmentCheckout(admin, submissionId, intentId, attempt, session.id);

    const { data: linked, error: linkError } = await admin.from("idr_checkout_intents").update({
      stripe_checkout_session_id: session.id,
      status: "open",
    }).eq("id", intentId).eq("attempts", attempt).neq("status", "paid").select("id").maybeSingle();
    if (linkError) throw linkError;
    if (!linked) {
      const { data: currentIntent, error: currentIntentError } = await admin
        .from("idr_checkout_intents")
        .select("stripe_checkout_session_id,status,attempts")
        .eq("id", intentId)
        .single();
      if (
        currentIntentError ||
        currentIntent?.stripe_checkout_session_id !== session.id ||
        Number(currentIntent?.attempts) !== attempt ||
        !["open", "paid"].includes(String(currentIntent?.status))
      ) {
        throw currentIntentError || new Error("Assessment checkout reservation could not be linked.");
      }
    }
    const { data: updatedSubmission, error: submissionUpdateError } = await admin.from("ticket_submissions").update({
      status: "assessment_checkout_open",
      assessment_checkout_session_id: session.id,
      updated_at: new Date().toISOString(),
    }).eq("id", submissionId).is("assessment_paid_at", null).select("id").maybeSingle();
    if (submissionUpdateError) throw submissionUpdateError;
    if (!updatedSubmission) {
      const { data: currentSubmission, error: currentSubmissionError } = await admin
        .from("ticket_submissions")
        .select("assessment_paid_at,assessment_checkout_session_id")
        .eq("id", submissionId)
        .single();
      if (
        currentSubmissionError ||
        (!currentSubmission?.assessment_paid_at && currentSubmission?.assessment_checkout_session_id !== session.id)
      ) {
        throw currentSubmissionError || new Error("Assessment checkout could not be attached to the intake.");
      }
    }

    cleanupOnError = false;
    return json(origin, { url: session.url });
  } catch (error) {
    let responseError = error;
    if (cleanupOnError && intentId && admin) {
      let canRelease = true;
      if (createdSession && stripe) {
        try {
          await stripe.checkout.sessions.expire(createdSession.id);
        } catch {
          try {
            const currentSession = await stripe.checkout.sessions.retrieve(createdSession.id);
            canRelease = currentSession.status !== "complete";
          } catch {
            canRelease = false;
          }
        }
      }

      if (canRelease) {
        try {
          const released = await releaseAssessmentCheckout(
            admin,
            intentId,
            attempt,
            createdSession?.id || null,
            "failed",
          );
          if (!released) {
            await admin.from("idr_checkout_intents").update({ status: "failed", stripe_checkout_session_id: null })
              .eq("id", intentId).eq("attempts", attempt).is("stripe_checkout_session_id", null).neq("status", "paid");
          }
        } catch {
          console.error("create-assessment-payment cleanup failed");
        }
      } else {
        responseError = new RequestError("Payment is being confirmed for this assessment.", 409);
      }
    }

    const status = responseError instanceof RequestError ? responseError.status : 500;
    if (status >= 500) {
      console.error("create-assessment-payment failed");
    }
    return json(origin, {
      error: status >= 500 ? "Secure checkout is temporarily unavailable." : (responseError as Error).message,
    }, status);
  }
});
