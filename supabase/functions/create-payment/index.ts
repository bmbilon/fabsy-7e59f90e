import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

interface CheckoutRequest {
  submissionId?: unknown;
  customerEmail?: unknown;
  customerName?: unknown;
  ticketNumber?: unknown;
}

const DEFAULT_ORIGIN = "https://fabsy.ca";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ORIGINS = new Set([
  DEFAULT_ORIGIN,
  "https://www.fabsy.ca",
  "https://fabsy-execom.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:8080",
]);

function requestOrigin(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return DEFAULT_ORIGIN;
  return ALLOWED_ORIGINS.has(origin) ? origin : null;
}

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

function jsonResponse(origin: string, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin),
  });
}

function safeMetadataValue(value: unknown, maxLength = 500): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

serve(async (req) => {
  const origin = requestOrigin(req);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: origin ? 204 : 403,
      headers: corsHeaders(origin || DEFAULT_ORIGIN),
    });
  }

  if (!origin) {
    return jsonResponse(DEFAULT_ORIGIN, { error: "Origin is not allowed." }, 403);
  }
  if (req.method !== "POST") {
    return jsonResponse(origin, { error: "Method not allowed." }, 405);
  }

  try {
    const payload = (await req.json()) as CheckoutRequest;
    const submissionId = safeMetadataValue(payload.submissionId, 36);
    const requestedEmail = safeMetadataValue(payload.customerEmail, 255).toLowerCase();

    if (!UUID_PATTERN.test(submissionId)) {
      return jsonResponse(origin, { error: "A valid submissionId is required." }, 400);
    }
    if (requestedEmail && !EMAIL_PATTERN.test(requestedEmail)) {
      return jsonResponse(origin, { error: "customerEmail is invalid." }, 400);
    }

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!stripeSecretKey || !supabaseUrl || !serviceRoleKey) {
      throw new Error("Payment services are not configured.");
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: submission, error: submissionError } = await admin
      .from("ticket_submissions")
      .select("id,email,first_name,last_name,ticket_number,status")
      .eq("id", submissionId)
      .maybeSingle();

    if (submissionError) throw submissionError;
    if (!submission) {
      return jsonResponse(origin, { error: "Ticket submission was not found." }, 404);
    }
    if (!new Set(["pending", "awaiting_payment"]).has(submission.status)) {
      return jsonResponse(origin, { error: "Checkout is unavailable for this submission." }, 409);
    }

    const customerEmail = safeMetadataValue(submission.email, 255).toLowerCase();
    const customerName = `${safeMetadataValue(submission.first_name, 100)} ${safeMetadataValue(submission.last_name, 100)}`.trim();
    const ticketNumber = safeMetadataValue(submission.ticket_number, 100);
    if (!EMAIL_PATTERN.test(customerEmail)) {
      throw new Error("The submission has no valid customer email.");
    }
    if (requestedEmail && requestedEmail !== customerEmail) {
      return jsonResponse(origin, { error: "Submission details do not match." }, 403);
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-08-27.basil",
    });

    const session = await stripe.checkout.sessions.create(
      {
        customer_email: customerEmail || undefined,
        client_reference_id: submissionId,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "cad",
              unit_amount: 48800,
              product_data: {
                name: "Fabsy Traffic Ticket Agent Service",
                description:
                  "Pricing is a flat $488 plus 30% of any fine reduction achieved; there is no additional charge if the fine is not reduced.",
              },
            },
          },
        ],
        mode: "payment",
        success_url: `${origin}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/payment-canceled`,
        metadata: {
          submission_id: submissionId,
          ticket_number: ticketNumber,
          customer_name: customerName,
        },
      },
      { idempotencyKey: `fabsy-submission-${submissionId}` },
    );

    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return jsonResponse(origin, { url: session.url });
  } catch (error: unknown) {
    console.error("Payment creation error:", error);
    return jsonResponse(origin, { error: "Unable to create secure checkout." }, 500);
  }
});
