import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const TICKET_BASE_CENTS = 19800;
const IDR_ADDON_CENTS = 3100;
const PRICING_VERSION = "rapid_resolution_2026_08";
const DISCLAIMER = "This report is consumer research based on publicly available information. Fabsy is not an insurance agent or broker and does not sell, quote, or place insurance.";
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const siteUrl = (Deno.env.get("SITE_URL") || "https://fabsy.ca").replace(
  /\/$/,
  "",
);
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedOrigins = new Set([
  siteUrl,
  "https://www.fabsy.ca",
  "https://fabsy-execom.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:8080",
]);

class RequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : siteUrl,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

function requiredString(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new RequestError(`${field} is required.`);
  }
  const result = value.trim();
  if (result.length > maxLength) {
    throw new RequestError(`${field} is too long.`);
  }
  return result;
}

function requiredUuid(value: unknown, field: string) {
  const result = requiredString(value, field, 36);
  if (!UUID_PATTERN.test(result)) {
    throw new RequestError(`${field} is invalid.`);
  }
  return result.toLowerCase();
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest)).map((part) => part.toString(16).padStart(2, "0")).join("");
}

async function requireStoredObject(
  bucket: string,
  path: string,
  ownerId: string,
  label: string,
) {
  if (!path.startsWith(`${ownerId}/`) || path.includes("..")) {
    throw new RequestError(`${label} path could not be verified.`, 409);
  }
  const objectName = path.slice(ownerId.length + 1);
  const { data: objects, error } = await admin.storage
    .from(bucket)
    .list(ownerId, { limit: 10, search: objectName });
  if (error) throw error;
  if (!objects?.some((item) => item.name === objectName && item.id)) {
    throw new RequestError(
      `Finish uploading ${label.toLowerCase()} before checkout.`,
      409,
    );
  }
}

async function claimIncludedAssessmentCheckout(
  sourceAssessmentId: string,
  checkoutIntentId: string,
  checkoutAttempt: number,
  stripeSessionId: string | null,
) {
  const { error } = await admin.rpc("claim_source_assessment_checkout", {
    p_source_assessment_id: sourceAssessmentId,
    p_checkout_intent_id: checkoutIntentId,
    p_checkout_attempt: checkoutAttempt,
    p_claim_kind: "included_representation",
    p_stripe_checkout_session_id: stripeSessionId,
  });
  if (!error) return;
  if (error.message?.includes("ASSESSMENT_CHECKOUT_ALREADY_RESERVED")) {
    throw new RequestError(
      "A $149 review checkout is already open for this intake. Complete or let that checkout expire before starting Rapid Resolution checkout.",
      409,
    );
  }
  if (error.message?.includes("ASSESSMENT_CHECKOUT_SOURCE_UNAVAILABLE")) {
    throw new RequestError(
      "This priority review has already been purchased or activated.",
      409,
    );
  }
  throw error;
}

async function releaseIncludedAssessmentCheckout(
  checkoutIntentId: string,
  checkoutAttempt: number,
  stripeSessionId: string | null,
  suppressErrors = true,
) {
  const { data, error } = await admin.rpc(
    "release_source_assessment_checkout",
    {
      p_checkout_intent_id: checkoutIntentId,
      p_checkout_attempt: checkoutAttempt,
      p_stripe_checkout_session_id: stripeSessionId,
      p_intent_status: "failed",
    },
  );
  if (error) {
    if (!suppressErrors) throw error;
    console.error("create-payment checkout claim cleanup failed");
    return false;
  }
  return data === true;
}

type TicketCheckoutKind = "ticket_only" | "ticket_with_addon";
type TicketIntentType = "ticket" | "addon";

async function reserveTicketCheckout(
  stripe: Stripe,
  requestedIntentId: string,
  submissionId: string,
  clientId: string,
  customerEmail: string,
  includeIdrAddon: boolean,
  sourceAssessmentId: string | null,
) {
  const expectedType: TicketIntentType = includeIdrAddon ? "addon" : "ticket";
  const expectedCheckoutKind: TicketCheckoutKind = includeIdrAddon ? "ticket_with_addon" : "ticket_only";
  const expectedAmountCents = includeIdrAddon ? IDR_ADDON_CENTS : TICKET_BASE_CENTS;
  const selectFields = "id,client_id,ticket_submission_id,type,checkout_kind,expected_amount_cents,purchaser_email,stripe_checkout_session_id,status,attempts";
  const initialIntent = await admin
    .from("idr_checkout_intents")
    .select(selectFields)
    .eq("ticket_submission_id", submissionId)
    .in("checkout_kind", ["ticket_only", "ticket_with_addon"])
    .maybeSingle();
  if (initialIntent.error) throw initialIntent.error;
  let intent = initialIntent.data;

  if (!intent) {
    const { data: inserted, error: insertError } = await admin
      .from("idr_checkout_intents")
      .insert({
        id: requestedIntentId,
        client_id: clientId,
        ticket_submission_id: submissionId,
        type: expectedType,
        checkout_kind: expectedCheckoutKind,
        expected_amount_cents: expectedAmountCents,
        purchaser_email: customerEmail,
      })
      .select(selectFields)
      .single();
    if (insertError?.code === "23505") {
      const raced = await admin
        .from("idr_checkout_intents")
        .select(selectFields)
        .eq("ticket_submission_id", submissionId)
        .in("checkout_kind", ["ticket_only", "ticket_with_addon"])
        .maybeSingle();
      if (raced.error) throw raced.error;
      intent = raced.data;
    } else if (insertError) {
      throw insertError;
    } else {
      intent = inserted;
    }
  }

  if (
    !intent ||
    intent.client_id !== clientId ||
    intent.ticket_submission_id !== submissionId ||
    intent.purchaser_email.toLowerCase() !== customerEmail
  ) {
    throw new RequestError(
      "The existing checkout does not match this ticket purchase.",
      409,
    );
  }
  if (intent.status === "paid") {
    throw new RequestError("This ticket checkout has already been paid.", 409);
  }

  const productSelectionChanged = intent.type !== expectedType ||
    intent.checkout_kind !== expectedCheckoutKind;
  const priceChanged = Number(intent.expected_amount_cents) !== expectedAmountCents;
  const selectionChanged = productSelectionChanged || priceChanged;
  if (selectionChanged) {
    if (
      productSelectionChanged &&
      intent.status === "creating" &&
      !intent.stripe_checkout_session_id
    ) {
      throw new RequestError(
        "The existing checkout is still being created. Please try again.",
        409,
      );
    }

    if (intent.stripe_checkout_session_id) {
      const existingSession = await stripe.checkout.sessions.retrieve(
        intent.stripe_checkout_session_id,
      );
      if (existingSession.status === "complete") {
        throw new RequestError(
          "Payment is being confirmed for this ticket checkout.",
          409,
        );
      }
      if (existingSession.status === "open") {
        await stripe.checkout.sessions.expire(
          intent.stripe_checkout_session_id,
        );
      }
    }

    if (sourceAssessmentId) {
      const claimReleased = await releaseIncludedAssessmentCheckout(
        intent.id as string,
        Number(intent.attempts || 1),
        intent.stripe_checkout_session_id,
        false,
      );
      if (claimReleased) {
        intent = {
          ...intent,
          status: "failed",
          stripe_checkout_session_id: null,
        };
      }
    }

    const previousAttempt = Number(intent.attempts || 1);
    const nextAttempt = previousAttempt + 1;
    let conversion = admin
      .from("idr_checkout_intents")
      .update({
        type: expectedType,
        checkout_kind: expectedCheckoutKind,
        expected_amount_cents: expectedAmountCents,
        attempts: nextAttempt,
        status: "creating",
        stripe_checkout_session_id: null,
      })
      .eq("id", intent.id)
      .eq("attempts", previousAttempt)
      .neq("status", "paid");
    conversion = intent.stripe_checkout_session_id
      ? conversion.eq(
        "stripe_checkout_session_id",
        intent.stripe_checkout_session_id,
      )
      : conversion.is("stripe_checkout_session_id", null);
    const { data: converted, error: conversionError } = await conversion
      .select(selectFields)
      .maybeSingle();
    if (conversionError) throw conversionError;
    if (!converted) {
      throw new RequestError(
        "The checkout selection changed elsewhere. Please try again.",
        409,
      );
    }
    intent = converted;
  }

  let attempt = Number(intent.attempts || 1);
  if (
    !intent.stripe_checkout_session_id &&
    (intent.status === "failed" || intent.status === "expired")
  ) {
    const nextAttempt = attempt + 1;
    const { data: refreshed, error: refreshError } = await admin
      .from("idr_checkout_intents")
      .update({ attempts: nextAttempt, status: "creating" })
      .eq("id", intent.id)
      .eq("attempts", attempt)
      .eq("status", intent.status)
      .is("stripe_checkout_session_id", null)
      .select("id")
      .maybeSingle();
    if (refreshError) throw refreshError;
    if (!refreshed) {
      throw new RequestError(
        "This checkout is already being refreshed. Please try again.",
        409,
      );
    }
    attempt = nextAttempt;
  }
  if (intent.stripe_checkout_session_id) {
    const existingSession = await stripe.checkout.sessions.retrieve(
      intent.stripe_checkout_session_id,
    );
    if (existingSession.status === "open" && existingSession.url) {
      return {
        orderId: intent.id as string,
        attempt,
        url: existingSession.url,
        sessionId: existingSession.id,
      };
    }
    if (existingSession.status === "complete") {
      throw new RequestError(
        "Payment is being confirmed for this ticket checkout.",
        409,
      );
    }

    if (sourceAssessmentId) {
      await releaseIncludedAssessmentCheckout(
        intent.id as string,
        attempt,
        existingSession.id,
        false,
      );
    }

    const nextAttempt = attempt + 1;
    const { data: refreshed, error: refreshError } = await admin
      .from("idr_checkout_intents")
      .update({
        attempts: nextAttempt,
        status: "creating",
        stripe_checkout_session_id: null,
      })
      .eq("id", intent.id)
      .eq("attempts", attempt)
      .neq("status", "paid")
      .select("id")
      .maybeSingle();
    if (refreshError) throw refreshError;
    if (!refreshed) {
      throw new RequestError(
        "This checkout is already being refreshed. Please try again.",
        409,
      );
    }
    attempt = nextAttempt;
  }

  return {
    orderId: intent.id as string,
    attempt,
    url: null as string | null,
    sessionId: null as string | null,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed." }, 405);
  }

  const origin = req.headers.get("origin") || "";
  if (!allowedOrigins.has(origin)) {
    return json(req, { error: "Origin is not allowed." }, 403);
  }

  let cleanupClaim: {
    intentId: string;
    attempt: number;
    sessionId: string | null;
  } | null = null;
  let checkoutStripe: Stripe | null = null;
  let createdStripeSessionId: string | null = null;
  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey || !supabaseUrl || !serviceRoleKey) {
      throw new Error("Required payment configuration is missing.");
    }

    const raw = await req.json();
    const formData = raw?.formData;
    if (!formData || typeof formData !== "object") {
      throw new RequestError("formData is required.");
    }

    const submissionId = requiredUuid(raw.submissionId, "submissionId");
    const clientId = requiredUuid(raw.clientId, "clientId");
    const accessToken = requiredString(raw.accessToken, "accessToken", 200);
    if (accessToken.length < 32) {
      throw new RequestError("Submission authorization is invalid.", 403);
    }
    const accessTokenHash = await sha256(accessToken);
    const customerEmail = requiredString(formData.email, "email", 255)
      .toLowerCase();
    const customerName = `${requiredString(formData.firstName, "firstName", 100)} ${requiredString(formData.lastName, "lastName", 100)}`;
    const ticketNumber = requiredString(
      formData.ticketNumber,
      "ticketNumber",
      50,
    );
    const includeIdrAddon = raw.includeIdrAddon === true;
    const requestedIdrOrderId = includeIdrAddon ? requiredUuid(raw.idrOrderId, "idrOrderId") : null;
    if (!EMAIL_PATTERN.test(customerEmail)) {
      throw new RequestError("email is invalid.");
    }

    const { data: submission, error: submissionError } = await admin
      .from("ticket_submissions")
      .select(
        "id,client_id,ticket_number,status,ticket_document_path,consent_form_path,representation_access_token_hash,source_assessment_id,representation_includes_assessment,clients(email)",
      )
      .eq("id", submissionId)
      .maybeSingle();
    if (submissionError) throw submissionError;
    const client = Array.isArray(submission?.clients) ? submission.clients[0] : submission?.clients;
    if (
      !submission ||
      submission.client_id !== clientId ||
      submission.ticket_number !== ticketNumber ||
      client?.email?.toLowerCase() !== customerEmail ||
      submission.representation_access_token_hash !== accessTokenHash ||
      submission.status !== "awaiting_payment"
    ) {
      throw new RequestError(
        "Ticket checkout details could not be verified.",
        403,
      );
    }

    const ticketDocumentPath = String(submission.ticket_document_path || "");
    const ticketOwnerId = submission.source_assessment_id || submissionId;
    await requireStoredObject(
      "assessment-tickets",
      ticketDocumentPath,
      ticketOwnerId,
      "Ticket document",
    );
    const consentFormPath = String(submission.consent_form_path || "");
    const expectedConsentFormPath = `${submissionId}/consent-form-${accessTokenHash.slice(0, 16)}.pdf`;
    if (consentFormPath !== expectedConsentFormPath) {
      throw new RequestError(
        "Sign and store the current Rapid Resolution consent before checkout.",
        409,
      );
    }
    await requireStoredObject(
      "consent-forms",
      consentFormPath,
      submissionId,
      "Signed consent form",
    );

    if (submission.representation_includes_assessment) {
      if (!submission.source_assessment_id) {
        throw new RequestError(
          "The included priority review could not be verified.",
          409,
        );
      }
      const { data: sourceAssessment, error: sourceAssessmentError } = await admin
        .from("ticket_submissions")
        .select(
          "id,email,service_type,assessment_ticket_path,assessment_policy_paths,review_consent,assessment_paid_at",
        )
        .eq("id", submission.source_assessment_id)
        .maybeSingle();
      if (sourceAssessmentError) throw sourceAssessmentError;
      const policyPaths = Array.isArray(sourceAssessment?.assessment_policy_paths)
        ? sourceAssessment.assessment_policy_paths.filter((
          path: unknown,
        ): path is string => typeof path === "string")
        : [];
      if (
        !sourceAssessment ||
        sourceAssessment.service_type !== "ticket_insurance_assessment" ||
        sourceAssessment.email?.trim().toLowerCase() !== customerEmail ||
        sourceAssessment.assessment_ticket_path !== ticketDocumentPath ||
        sourceAssessment.assessment_paid_at ||
        policyPaths.length < 1 ||
        !sourceAssessment.review_consent
      ) {
        throw new RequestError(
          "The included priority review documents could not be verified.",
          409,
        );
      }
      await Promise.all(
        policyPaths.map((path: string) =>
          requireStoredObject(
            "assessment-policy-documents",
            path,
            sourceAssessment.id,
            "Policy document",
          )
        ),
      );
    }

    if (includeIdrAddon) {
      const { data: existingIdr, error: existingIdrError } = await admin
        .from("idr_orders")
        .select("id")
        .eq("ticket_submission_id", submissionId)
        .maybeSingle();
      if (existingIdrError) throw existingIdrError;
      if (existingIdr) {
        throw new RequestError(
          "An Insurance Impact & Renewal Planning Report already exists for this ticket.",
          409,
        );
      }
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-08-27.basil",
    });
    checkoutStripe = stripe;
    const reservation = await reserveTicketCheckout(
      stripe,
      requestedIdrOrderId || crypto.randomUUID(),
      submissionId,
      clientId,
      customerEmail,
      includeIdrAddon,
      submission.representation_includes_assessment ? submission.source_assessment_id : null,
    );
    if (
      submission.representation_includes_assessment &&
      submission.source_assessment_id
    ) {
      await claimIncludedAssessmentCheckout(
        submission.source_assessment_id,
        reservation.orderId,
        reservation.attempt,
        reservation.sessionId,
      );
      cleanupClaim = {
        intentId: reservation.orderId,
        attempt: reservation.attempt,
        sessionId: reservation.sessionId,
      };
    }
    if (reservation?.url) {
      return json(req, {
        url: reservation.url,
        checkoutIntentId: reservation.orderId,
        idrOrderId: includeIdrAddon ? reservation.orderId : null,
        reused: true,
      });
    }
    const checkoutIntentId = reservation.orderId;
    const idrOrderId = includeIdrAddon ? checkoutIntentId : null;
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        quantity: 1,
        price_data: {
          currency: "cad",
          tax_behavior: "exclusive",
          unit_amount: TICKET_BASE_CENTS,
          product_data: {
            name: "Fabsy Rapid Resolution",
            description: "Eligible Alberta traffic ticket pre-trial resolution service. Trial services are excluded and quoted separately.",
            metadata: {
              fabsy_product: "rapid_resolution",
              fabsy_pricing_version: PRICING_VERSION,
            },
          },
        },
      },
    ];
    if (includeIdrAddon) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "cad",
          tax_behavior: "exclusive",
          unit_amount: IDR_ADDON_CENTS,
          product_data: {
            name: "Fabsy Insurance Impact & Renewal Planning Report Add-on",
            description: DISCLAIMER,
            metadata: {
              fabsy_product: "insurance_impact_review_addon",
              fabsy_pricing_version: PRICING_VERSION,
            },
          },
        },
      });
    }

    const metadata: Record<string, string> = {
      ticket_number: ticketNumber,
      customer_name: customerName,
      submission_id: submissionId,
      ticket_submission_id: submissionId,
      client_id: clientId,
      ticket_base_cents: String(TICKET_BASE_CENTS),
      checkout_intent_id: checkoutIntentId,
      checkout_attempt: String(reservation.attempt),
      fabsy_checkout_kind: includeIdrAddon ? "ticket_with_addon" : "ticket_only",
      fabsy_product: includeIdrAddon ? "rapid_resolution_bundle" : "rapid_resolution",
      fabsy_pricing_version: PRICING_VERSION,
      representation_includes_assessment: submission.representation_includes_assessment ? "true" : "false",
    };
    if (submission.source_assessment_id) {
      metadata.source_assessment_id = submission.source_assessment_id;
    }
    if (includeIdrAddon && idrOrderId) {
      Object.assign(metadata, {
        idr_order_id: idrOrderId,
        idr_client_id: clientId,
        idr_type: "addon",
        idr_checkout_kind: "ticket_with_addon",
        idr_price_cents: String(IDR_ADDON_CENTS),
      });
    }

    const successUrl = includeIdrAddon ? `${siteUrl}/insurance-damage-report/intake?checkout=success&order_id=${idrOrderId}&session_id={CHECKOUT_SESSION_ID}` : `${siteUrl}/thank-you?session_id={CHECKOUT_SESSION_ID}`;
    const params: Stripe.Checkout.SessionCreateParams = {
      customer_email: customerEmail,
      client_reference_id: submissionId,
      line_items: lineItems,
      mode: "payment",
      payment_method_types: ["card"],
      allow_promotion_codes: !includeIdrAddon,
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: false },
      success_url: successUrl,
      cancel_url: `${siteUrl}/payment-canceled`,
      metadata,
    };
    const session = await stripe.checkout.sessions.create(params, {
      idempotencyKey: `ticket-checkout:${checkoutIntentId}:${reservation.attempt}`,
    });
    createdStripeSessionId = session.id;

    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    const { data: linkedIntent, error: intentUpdateError } = await admin
      .from("idr_checkout_intents")
      .update({ stripe_checkout_session_id: session.id, status: "open" })
      .eq("id", checkoutIntentId)
      .eq("attempts", reservation.attempt)
      .neq("status", "paid")
      .select("id")
      .maybeSingle();
    if (intentUpdateError) throw intentUpdateError;
    if (!linkedIntent) {
      const { data: currentIntent, error: currentIntentError } = await admin
        .from("idr_checkout_intents")
        .select("stripe_checkout_session_id,status")
        .eq("id", checkoutIntentId)
        .single();
      if (
        currentIntentError ||
        currentIntent?.stripe_checkout_session_id !== session.id ||
        currentIntent?.status === "failed" ||
        currentIntent?.status === "expired"
      ) {
        throw currentIntentError ||
          new Error("The checkout reservation could not be linked.");
      }
    }
    if (
      submission.representation_includes_assessment &&
      submission.source_assessment_id
    ) {
      await claimIncludedAssessmentCheckout(
        submission.source_assessment_id,
        checkoutIntentId,
        reservation.attempt,
        session.id,
      );
      cleanupClaim = {
        intentId: checkoutIntentId,
        attempt: reservation.attempt,
        sessionId: session.id,
      };
    }
    return json(req, { url: session.url, checkoutIntentId, idrOrderId });
  } catch (error) {
    if (createdStripeSessionId && checkoutStripe) {
      try {
        const currentSession = await checkoutStripe.checkout.sessions.retrieve(
          createdStripeSessionId,
        );
        if (currentSession.status === "open") {
          await checkoutStripe.checkout.sessions.expire(createdStripeSessionId);
        }
      } catch {
        console.error("create-payment Stripe session cleanup failed");
      }
    }
    if (cleanupClaim) {
      await releaseIncludedAssessmentCheckout(
        cleanupClaim.intentId,
        cleanupClaim.attempt,
        createdStripeSessionId || cleanupClaim.sessionId,
      );
    }
    const status = error instanceof RequestError ? error.status : 500;
    if (status >= 500) console.error("create-payment failed");
    return json(req, {
      error: status >= 500 ? "Unable to create secure checkout." : (error as Error).message,
    }, status);
  }
});
