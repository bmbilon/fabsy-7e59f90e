import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const TICKET_PRICE_ID = Deno.env.get("STRIPE_TICKET_PRICE_ID") || "price_1SAAc9At6NWmIwaSwunab6ML";
const TICKET_BASE_CENTS = 48800;
const IDR_ADDON_CENTS = 9900;
const DISCLAIMER = "This report is consumer research based on publicly available information. Fabsy is not an insurance agent or broker and does not sell, quote, or place insurance.";
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const siteUrl = (Deno.env.get("SITE_URL") || "https://fabsy.ca").replace(/\/$/, "");
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
  if (typeof value !== "string" || !value.trim()) throw new RequestError(`${field} is required.`);
  const result = value.trim();
  if (result.length > maxLength) throw new RequestError(`${field} is too long.`);
  return result;
}

function requiredUuid(value: unknown, field: string) {
  const result = requiredString(value, field, 36);
  if (!UUID_PATTERN.test(result)) throw new RequestError(`${field} is invalid.`);
  return result.toLowerCase();
}

type TicketCheckoutKind = "ticket_only" | "ticket_with_addon";
type TicketIntentType = "ticket" | "addon";

async function verifyTicketPrice(stripe: Stripe) {
  const price = await stripe.prices.retrieve(TICKET_PRICE_ID);
  if (
    !price.active ||
    price.currency.toLowerCase() !== "cad" ||
    price.unit_amount !== TICKET_BASE_CENTS ||
    price.type !== "one_time"
  ) {
    throw new Error("The configured ticket price is not an active one-time CAD $488 price.");
  }
}

async function reserveTicketCheckout(
  stripe: Stripe,
  requestedIntentId: string,
  submissionId: string,
  clientId: string,
  customerEmail: string,
  includeIdrAddon: boolean,
) {
  const expectedType: TicketIntentType = includeIdrAddon ? "addon" : "ticket";
  const expectedCheckoutKind: TicketCheckoutKind = includeIdrAddon
    ? "ticket_with_addon"
    : "ticket_only";
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
    throw new RequestError("The existing checkout does not match this ticket purchase.", 409);
  }
  if (intent.status === "paid") {
    throw new RequestError("This ticket checkout has already been paid.", 409);
  }

  const selectionChanged =
    intent.type !== expectedType ||
    intent.checkout_kind !== expectedCheckoutKind ||
    Number(intent.expected_amount_cents) !== expectedAmountCents;
  if (selectionChanged) {
    if (intent.status === "creating" && !intent.stripe_checkout_session_id) {
      throw new RequestError("The existing checkout is still being created. Please try again.", 409);
    }

    if (intent.stripe_checkout_session_id) {
      const existingSession = await stripe.checkout.sessions.retrieve(intent.stripe_checkout_session_id);
      if (existingSession.status === "complete") {
        throw new RequestError("Payment is being confirmed for this ticket checkout.", 409);
      }
      if (existingSession.status === "open") {
        await stripe.checkout.sessions.expire(intent.stripe_checkout_session_id);
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
      ? conversion.eq("stripe_checkout_session_id", intent.stripe_checkout_session_id)
      : conversion.is("stripe_checkout_session_id", null);
    const { data: converted, error: conversionError } = await conversion
      .select(selectFields)
      .maybeSingle();
    if (conversionError) throw conversionError;
    if (!converted) {
      throw new RequestError("The checkout selection changed elsewhere. Please try again.", 409);
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
      throw new RequestError("This checkout is already being refreshed. Please try again.", 409);
    }
    attempt = nextAttempt;
  }
  if (intent.stripe_checkout_session_id) {
    const existingSession = await stripe.checkout.sessions.retrieve(intent.stripe_checkout_session_id);
    if (existingSession.status === "open" && existingSession.url) {
      return { orderId: intent.id as string, attempt, url: existingSession.url };
    }
    if (existingSession.status === "complete") {
      throw new RequestError("Payment is being confirmed for this ticket checkout.", 409);
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
      throw new RequestError("This checkout is already being refreshed. Please try again.", 409);
    }
    attempt = nextAttempt;
  }

  return { orderId: intent.id as string, attempt, url: null as string | null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405);

  const origin = req.headers.get("origin") || "";
  if (!allowedOrigins.has(origin)) return json(req, { error: "Origin is not allowed." }, 403);

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
    const customerEmail = requiredString(formData.email, "email", 255).toLowerCase();
    const customerName = `${requiredString(formData.firstName, "firstName", 100)} ${requiredString(formData.lastName, "lastName", 100)}`;
    const ticketNumber = requiredString(formData.ticketNumber, "ticketNumber", 50);
    const includeIdrAddon = raw.includeIdrAddon === true;
    const requestedIdrOrderId = includeIdrAddon ? requiredUuid(raw.idrOrderId, "idrOrderId") : null;
    if (!EMAIL_PATTERN.test(customerEmail)) throw new RequestError("email is invalid.");

    const { data: submission, error: submissionError } = await admin
      .from("ticket_submissions")
      .select("id,client_id,ticket_number,status,clients(email)")
      .eq("id", submissionId)
      .maybeSingle();
    if (submissionError) throw submissionError;
    const client = Array.isArray(submission?.clients) ? submission.clients[0] : submission?.clients;
    if (
      !submission ||
      submission.client_id !== clientId ||
      submission.ticket_number !== ticketNumber ||
      client?.email?.toLowerCase() !== customerEmail ||
      submission.status !== "awaiting_payment"
    ) {
      throw new RequestError("Ticket checkout details could not be verified.", 403);
    }

    if (includeIdrAddon) {
      const { data: existingIdr, error: existingIdrError } = await admin
        .from("idr_orders")
        .select("id")
        .eq("ticket_submission_id", submissionId)
        .maybeSingle();
      if (existingIdrError) throw existingIdrError;
      if (existingIdr) throw new RequestError("An IDR order already exists for this ticket.", 409);
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });
    await verifyTicketPrice(stripe);
    const reservation = await reserveTicketCheckout(
      stripe,
      requestedIdrOrderId || crypto.randomUUID(),
      submissionId,
      clientId,
      customerEmail,
      includeIdrAddon,
    );
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
      { price: TICKET_PRICE_ID, quantity: 1 },
    ];
    if (includeIdrAddon) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "cad",
          unit_amount: IDR_ADDON_CENTS,
          product_data: {
            name: "Fabsy Insurance Damage Report Add-on",
            description: DISCLAIMER,
            metadata: { fabsy_product: "insurance_damage_report" },
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
    };
    if (includeIdrAddon && idrOrderId) {
      Object.assign(metadata, {
        idr_order_id: idrOrderId,
        idr_client_id: clientId,
        idr_type: "addon",
        idr_checkout_kind: "ticket_with_addon",
        idr_price_cents: String(IDR_ADDON_CENTS),
      });
    }

    const successUrl = includeIdrAddon
      ? `${siteUrl}/insurance-damage-report/intake?checkout=success&order_id=${idrOrderId}&session_id={CHECKOUT_SESSION_ID}`
      : `${siteUrl}/thank-you?session_id={CHECKOUT_SESSION_ID}`;
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
        throw currentIntentError || new Error("The checkout reservation could not be linked.");
      }
    }
    return json(req, { url: session.url, checkoutIntentId, idrOrderId });
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 500;
    if (status >= 500) console.error("create-payment failed");
    return json(req, {
      error: status >= 500 ? "Unable to create secure checkout." : (error as Error).message,
    }, status);
  }
});
