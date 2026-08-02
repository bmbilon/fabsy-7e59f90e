import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import Stripe from "https://esm.sh/stripe@18.5.0";

type IdrOrderType = "standalone" | "addon";

interface CheckoutRequest {
  orderId?: unknown;
  type?: unknown;
  product?: unknown;
  ticketSubmissionId?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phone?: unknown;
}

interface Purchaser {
  clientId: string | null;
  ticketSubmissionId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

class RequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const DISCLAIMER = "This report is consumer research based on publicly available information. Fabsy is not an insurance agent or broker and does not sell, quote, or place insurance.";
const PRICE_CENTS: Record<IdrOrderType, number> = { standalone: 12900, addon: 9900 };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[\d\s+().-]+$/;
const DEFAULT_ALLOWED_ORIGINS = [
  "https://fabsy.ca",
  "https://www.fabsy.ca",
  "https://fabsy-execom.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:8080",
];

function allowedOrigins() {
  const configured = (Deno.env.get("IDR_ALLOWED_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function responseHeaders(origin: string | null) {
  const selected = origin && allowedOrigins().has(origin) ? origin : "https://fabsy.ca";
  return {
    "Access-Control-Allow-Origin": selected,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(origin) });
}

function text(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) throw new RequestError(`${field} is required.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new RequestError(`${field} is too long.`);
  return normalized;
}

function uuid(value: unknown, field: string) {
  const normalized = text(value, field, 36).toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw new RequestError(`${field} must be a valid UUID.`);
  return normalized;
}

function email(value: unknown) {
  const normalized = text(value, "email", 255).toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) throw new RequestError("email is invalid.");
  return normalized;
}

function phone(value: unknown) {
  const normalized = text(value, "phone", 30);
  const digitCount = normalized.replace(/\D/g, "").length;
  if (!PHONE_PATTERN.test(normalized) || digitCount < 10 || digitCount > 15) {
    throw new RequestError("phone is invalid.");
  }
  return normalized;
}

function orderType(value: unknown): IdrOrderType {
  if (value !== "standalone" && value !== "addon") {
    throw new RequestError("product must be standalone or addon.");
  }
  return value;
}

function siteOrigin() {
  const configured = Deno.env.get("SITE_URL") || "https://fabsy.ca";
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error("SITE_URL is invalid.");
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("SITE_URL must use HTTPS.");
  }
  return parsed.origin;
}

async function signedInIdentity(req: Request, supabaseUrl: string, anonKey: string) {
  const authorization = req.headers.get("authorization");
  if (!authorization) throw new RequestError("Secure portal sign-in is required.", 401);
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data, error: authError } = await client.auth.getUser();
  if (authError || !data.user?.email) {
    throw new RequestError("Secure portal sign-in is required.", 401);
  }
  return { id: data.user.id, email: data.user.email.toLowerCase() };
}

async function resolveCasePurchaser(
  req: Request,
  admin: ReturnType<typeof createClient>,
  supabaseUrl: string,
  anonKey: string,
  body: CheckoutRequest,
  type: IdrOrderType,
): Promise<Purchaser> {
  const ticketSubmissionId = uuid(body.ticketSubmissionId, "ticketSubmissionId");
  const authenticated = await signedInIdentity(req, supabaseUrl, anonKey);
  const requestedEmail = email(body.email);
  if (authenticated.email !== requestedEmail) {
    throw new RequestError("The signed-in email does not match this case.", 403);
  }

  const { data: submission, error: submissionError } = await admin
    .from("ticket_submissions")
    .select("id,client_id,status,verdict,case_outcome,clients(first_name,last_name,email,phone,auth_user_id)")
    .eq("id", ticketSubmissionId)
    .maybeSingle();
  if (submissionError) throw submissionError;
  const client = Array.isArray(submission?.clients) ? submission.clients[0] : submission?.clients;
  if (
    !submission ||
    !client ||
    client.email?.toLowerCase() !== authenticated.email ||
    client.auth_user_id !== authenticated.id
  ) {
    throw new RequestError("Case ownership could not be verified.", 403);
  }
  if (submission.status === "awaiting_payment") {
    throw new RequestError("The $488 ticket defense checkout has not been completed.", 403);
  }
  if (
    type === "addon" &&
    (
      (submission.verdict !== "winnable" && submission.verdict !== "reducible") ||
      submission.case_outcome === "conviction_stands"
    )
  ) {
    throw new RequestError("The $99 add-on is unavailable for this case verdict.", 403);
  }
  if (
    type === "standalone" &&
    submission.verdict !== "unwinnable" &&
    submission.case_outcome !== "conviction_stands"
  ) {
    throw new RequestError("The $129 damage-control report is unavailable for this case state.", 403);
  }

  const { data: existingOrder, error: existingOrderError } = await admin
    .from("idr_orders")
    .select("id")
    .eq("ticket_submission_id", ticketSubmissionId)
    .maybeSingle();
  if (existingOrderError) throw existingOrderError;
  if (existingOrder) throw new RequestError("An IDR order already exists for this ticket.", 409);

  return {
    clientId: submission.client_id,
    ticketSubmissionId,
    firstName: client.first_name,
    lastName: client.last_name,
    email: client.email.toLowerCase(),
    phone: client.phone,
  };
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

async function standaloneFingerprint(req: Request, salt: string) {
  const forwarded = req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return sha256(`${salt}:${forwarded}`);
}

async function reserveIdrCheckout(
  admin: ReturnType<typeof createClient>,
  stripe: Stripe,
  requestedOrderId: string,
  type: IdrOrderType,
  purchaser: Purchaser,
  fingerprint: string | null,
) {
  const selectFields = "id,client_id,ticket_submission_id,type,checkout_kind,expected_amount_cents,purchaser_email,stripe_checkout_session_id,status,attempts";
  let query = admin.from("idr_checkout_intents").select(selectFields);
  query = purchaser.ticketSubmissionId
    ? query.eq("ticket_submission_id", purchaser.ticketSubmissionId).eq("checkout_kind", "idr_only")
    : query.eq("id", requestedOrderId);
  const initialIntent = await query.maybeSingle();
  if (initialIntent.error) throw initialIntent.error;
  let intent = initialIntent.data;

  if (!intent) {
    if (fingerprint) {
      const { data: reservedRows, error: reserveError } = await admin.rpc(
        "reserve_standalone_idr_checkout_intent",
        {
          p_id: requestedOrderId,
          p_expected_amount_cents: PRICE_CENTS[type],
          p_purchaser_email: purchaser.email,
          p_request_fingerprint: fingerprint,
        },
      );
      if (reserveError) {
        if (reserveError.message?.includes("IDR_CHECKOUT_RATE_LIMIT")) {
          throw new RequestError("Too many checkout attempts. Please try again later.", 429);
        }
        throw reserveError;
      }
      intent = Array.isArray(reservedRows) ? reservedRows[0] : reservedRows;
    } else {
      const { data: inserted, error: insertError } = await admin
        .from("idr_checkout_intents")
        .insert({
          id: requestedOrderId,
          client_id: purchaser.clientId,
          ticket_submission_id: purchaser.ticketSubmissionId,
          type,
          checkout_kind: "idr_only",
          expected_amount_cents: PRICE_CENTS[type],
          purchaser_email: purchaser.email,
          request_fingerprint: null,
        })
        .select(selectFields)
        .single();
      if (insertError?.code !== "23505" && insertError) throw insertError;
      if (!insertError) intent = inserted;
    }
    if (!intent) {
      let racedQuery = admin.from("idr_checkout_intents").select(selectFields);
      racedQuery = purchaser.ticketSubmissionId
        ? racedQuery.eq("ticket_submission_id", purchaser.ticketSubmissionId).eq("checkout_kind", "idr_only")
        : racedQuery.eq("id", requestedOrderId);
      const raced = await racedQuery.maybeSingle();
      if (raced.error) throw raced.error;
      intent = raced.data;
    }
  }

  if (
    !intent ||
    (intent.client_id || null) !== purchaser.clientId ||
    (intent.ticket_submission_id || null) !== purchaser.ticketSubmissionId ||
    intent.type !== type ||
    intent.checkout_kind !== "idr_only" ||
    Number(intent.expected_amount_cents) !== PRICE_CENTS[type] ||
    intent.purchaser_email.toLowerCase() !== purchaser.email
  ) {
    throw new RequestError("The existing IDR checkout does not match this purchase.", 409);
  }
  if (intent.status === "paid") {
    throw new RequestError("This IDR order has already been paid.", 409);
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
      throw new RequestError("Payment is being confirmed for this IDR order.", 409);
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
  const origin = req.headers.get("origin");
  if (origin && !allowedOrigins().has(origin)) return json({ error: "Origin is not allowed." }, 403, origin);
  if (req.method === "OPTIONS") return new Response(null, { headers: responseHeaders(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, origin);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!supabaseUrl || !serviceRoleKey || !anonKey || !stripeSecretKey) {
      throw new Error("Required payment configuration is missing.");
    }

    const body = await req.json() as CheckoutRequest;
    const type = orderType(body.type ?? body.product);
    const orderId = body.orderId === undefined ? crypto.randomUUID() : uuid(body.orderId, "orderId");
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: existingOrder, error: existingOrderError } = await admin
      .from("idr_orders")
      .select("id")
      .eq("id", orderId)
      .maybeSingle();
    if (existingOrderError) throw existingOrderError;
    if (existingOrder) throw new RequestError("This IDR order has already been paid.", 409);

    const purchaser = body.ticketSubmissionId
      ? await resolveCasePurchaser(req, admin, supabaseUrl, anonKey, body, type)
      : {
          clientId: null,
          ticketSubmissionId: null,
          firstName: text(body.firstName, "firstName", 100),
          lastName: text(body.lastName, "lastName", 100),
          email: email(body.email),
          phone: phone(body.phone),
        };
    if (type === "addon" && !purchaser.ticketSubmissionId) {
      throw new RequestError("The $99 add-on requires an active ticket case.", 403);
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });
    const fingerprint = purchaser.ticketSubmissionId
      ? null
      : await standaloneFingerprint(req, Deno.env.get("IDR_CHECKOUT_RATE_SALT") || serviceRoleKey);
    const reservation = await reserveIdrCheckout(
      admin,
      stripe,
      orderId,
      type,
      purchaser,
      fingerprint,
    );
    if (reservation.url) {
      return json({
        url: reservation.url,
        orderId: reservation.orderId,
        reused: true,
      }, 200, origin);
    }

    const reservedOrderId = reservation.orderId;
    const amountCents = PRICE_CENTS[type];
    const metadata: Record<string, string> = {
      idr_order_id: reservedOrderId,
      idr_type: type,
      idr_checkout_kind: "idr_only",
      idr_price_cents: String(amountCents),
      checkout_attempt: String(reservation.attempt),
      purchaser_first_name: purchaser.firstName,
      purchaser_last_name: purchaser.lastName,
      purchaser_phone: purchaser.phone,
    };
    if (purchaser.clientId) metadata.idr_client_id = purchaser.clientId;
    if (purchaser.ticketSubmissionId) metadata.ticket_submission_id = purchaser.ticketSubmissionId;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: purchaser.email,
      client_reference_id: reservedOrderId,
      automatic_tax: { enabled: true },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "cad",
          unit_amount: amountCents,
          product_data: {
            name: type === "standalone"
              ? "Fabsy Insurance Damage Report"
              : "Fabsy Insurance Damage Report Add-on",
            description: DISCLAIMER,
            metadata: { fabsy_product: "insurance_damage_report" },
          },
        },
      }],
      metadata,
      success_url: `${siteOrigin()}/insurance-damage-report/intake?checkout=success&order_id=${reservedOrderId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteOrigin()}/insurance-damage-report?checkout=cancelled`,
    }, { idempotencyKey: `idr-checkout:${reservedOrderId}:${reservation.attempt}` });

    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    const { data: linkedIntent, error: intentUpdateError } = await admin
      .from("idr_checkout_intents")
      .update({ stripe_checkout_session_id: session.id, status: "open" })
      .eq("id", reservedOrderId)
      .eq("attempts", reservation.attempt)
      .neq("status", "paid")
      .select("id")
      .maybeSingle();
    if (intentUpdateError) throw intentUpdateError;
    if (!linkedIntent) {
      const { data: currentIntent, error: currentIntentError } = await admin
        .from("idr_checkout_intents")
        .select("stripe_checkout_session_id,status")
        .eq("id", reservedOrderId)
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
    return json({ url: session.url, orderId: reservedOrderId, checkoutSessionId: session.id }, 200, origin);
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 500;
    if (status >= 500) console.error("create-idr-payment failed");
    return json({
      error: status >= 500 ? "Unable to create IDR checkout." : (error as Error).message,
    }, status, origin);
  }
});
