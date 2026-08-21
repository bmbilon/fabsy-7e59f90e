import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { getFabsyEmailSignature } from "../_shared/email-signature.ts";
import { sendResendEmail } from "../_shared/resend-email.ts";

type IdrOrderType = "standalone" | "addon";
type CheckoutIntentType = IdrOrderType | "ticket" | "assessment";

interface CheckoutSessionData {
  id: string;
  amount_subtotal: number | null;
  amount_total: number | null;
  client_reference_id: string | null;
  currency: string | null;
  mode: string | null;
  payment_status: string;
  status?: string | null;
  customer_email?: string | null;
  customer_details?: { email?: string | null } | null;
  payment_intent?: string | { id?: string } | null;
  total_details?: { amount_discount?: number | null } | null;
  metadata: Record<string, string> | null;
}

interface StripeEventData {
  id: string;
  type: string;
  data: { object: CheckoutSessionData };
}

const PRICE_CENTS: Record<IdrOrderType, number> = {
  standalone: 12900,
  addon: 9900,
};
const TICKET_BASE_CENTS = 48800;
const TICKET_ASSESSMENT_CENTS = 14900;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISCLAIMER = "This report is consumer research based on publicly available information. Fabsy is not an insurance agent or broker and does not sell, quote, or place insurance.";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isUuid(value: string | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isOrderType(value: string | undefined): value is IdrOrderType {
  return value === "standalone" || value === "addon";
}

function safeMetadataText(value: string | undefined, field: string, maxLength: number) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`Checkout session has invalid ${field} metadata.`);
  }
  return normalized;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function validateCheckoutIntent(
  supabase: ReturnType<typeof createClient>,
  session: CheckoutSessionData,
  intentId: string,
  type: CheckoutIntentType,
  checkoutKind: string,
  ticketSubmissionId: string | null,
  expectedAmountCents: number,
) {
  const { data: intent, error: intentError } = await supabase
    .from("idr_checkout_intents")
    .select("id,client_id,ticket_submission_id,type,checkout_kind,expected_amount_cents,purchaser_email,stripe_checkout_session_id,status,attempts")
    .eq("id", intentId)
    .maybeSingle();
  if (intentError) throw intentError;
  if (!intent) throw new Error("Paid checkout has no matching IDR reservation.");

  const purchaserEmail = String(session.customer_details?.email || session.customer_email || "")
    .trim()
    .toLowerCase();
  if (
    intent.type !== type ||
    intent.checkout_kind !== checkoutKind ||
    Number(intent.expected_amount_cents) !== expectedAmountCents ||
    (intent.ticket_submission_id || null) !== ticketSubmissionId ||
    intent.purchaser_email.toLowerCase() !== purchaserEmail ||
    (intent.stripe_checkout_session_id && intent.stripe_checkout_session_id !== session.id) ||
    !["creating", "open", "paid"].includes(intent.status) ||
    (session.metadata?.checkout_attempt &&
      Number(intent.attempts) !== Number(session.metadata.checkout_attempt))
  ) {
    throw new Error("Paid checkout does not match its IDR reservation.");
  }

  if (!intent.stripe_checkout_session_id) {
    const { error: sessionLinkError } = await supabase
      .from("idr_checkout_intents")
      .update({ stripe_checkout_session_id: session.id, status: "open" })
      .eq("id", intentId)
      .eq("attempts", intent.attempts)
      .is("stripe_checkout_session_id", null)
      .neq("status", "paid");
    if (sessionLinkError) throw sessionLinkError;
  }
  return intent;
}

async function persistPaidTicketCheckout(
  supabase: ReturnType<typeof createClient>,
  session: CheckoutSessionData,
): Promise<"ticket_activated" | "ticket_already_active"> {
  const metadata = session.metadata || {};
  const intentId = metadata.checkout_intent_id;
  const submissionId = metadata.ticket_submission_id || metadata.submission_id;
  const clientId = metadata.client_id;
  const checkoutKind = metadata.fabsy_checkout_kind;

  if (
    !isUuid(intentId) ||
    !isUuid(submissionId) ||
    !isUuid(clientId) ||
    checkoutKind !== "ticket_only"
  ) {
    throw new Error("Checkout session has invalid core ticket metadata.");
  }
  if (
    session.client_reference_id !== submissionId ||
    session.mode !== "payment" ||
    session.payment_status !== "paid" ||
    session.currency?.toLowerCase() !== "cad" ||
    session.amount_subtotal !== TICKET_BASE_CENTS ||
    metadata.ticket_base_cents !== String(TICKET_BASE_CENTS)
  ) {
    throw new Error("Core ticket checkout does not match the configured product price.");
  }

  // Stripe's amount_subtotal is before promotion discounts. Core-only checkout
  // deliberately permits configured promotion codes, so no zero-discount check
  // belongs here. The signed subtotal still proves the $488 price was selected.
  const intent = await validateCheckoutIntent(
    supabase,
    session,
    intentId,
    "ticket",
    checkoutKind,
    submissionId,
    TICKET_BASE_CENTS,
  );
  if (intent.client_id !== clientId) {
    throw new Error("Paid ticket checkout client does not match its reservation.");
  }

  const { data: submission, error: submissionError } = await supabase
    .from("ticket_submissions")
    .select("id,client_id,status")
    .eq("id", submissionId)
    .maybeSingle();
  if (submissionError) throw submissionError;
  if (!submission || submission.client_id !== clientId) {
    throw new Error("Paid ticket checkout does not belong to its reserved client.");
  }

  let result: "ticket_activated" | "ticket_already_active" = "ticket_already_active";
  if (submission.status === "awaiting_payment") {
    const { data: activated, error: activationError } = await supabase
      .from("ticket_submissions")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .eq("id", submissionId)
      .eq("status", "awaiting_payment")
      .select("id")
      .maybeSingle();
    if (activationError) throw activationError;
    if (activated) result = "ticket_activated";
  }

  const { error: intentPaidError } = await supabase
    .from("idr_checkout_intents")
    .update({ status: "paid", stripe_checkout_session_id: session.id })
    .eq("id", intentId)
    .eq("attempts", intent.attempts);
  if (intentPaidError) throw intentPaidError;
  return result;
}

async function persistPaidTicketAssessment(
  supabase: ReturnType<typeof createClient>,
  session: CheckoutSessionData,
): Promise<"assessment_activated" | "assessment_already_active"> {
  const metadata = session.metadata || {};
  const intentId = metadata.checkout_intent_id;
  const submissionId = metadata.assessment_submission_id;
  const clientId = metadata.client_id;
  const checkoutKind = metadata.fabsy_checkout_kind;

  if (
    !isUuid(intentId) ||
    !isUuid(submissionId) ||
    !isUuid(clientId) ||
    checkoutKind !== "ticket_assessment"
  ) {
    throw new Error("Checkout session has invalid ticket assessment metadata.");
  }
  if (
    session.client_reference_id !== submissionId ||
    session.mode !== "payment" ||
    session.payment_status !== "paid" ||
    session.currency?.toLowerCase() !== "cad" ||
    session.amount_subtotal !== TICKET_ASSESSMENT_CENTS ||
    session.amount_total !== TICKET_ASSESSMENT_CENTS ||
    metadata.assessment_price_cents !== String(TICKET_ASSESSMENT_CENTS) ||
    Number(session.total_details?.amount_discount || 0) !== 0
  ) {
    throw new Error("Ticket assessment checkout does not match the configured product price.");
  }

  const intent = await validateCheckoutIntent(
    supabase,
    session,
    intentId,
    "assessment",
    checkoutKind,
    submissionId,
    TICKET_ASSESSMENT_CENTS,
  );
  if (intent.client_id !== clientId) {
    throw new Error("Paid ticket assessment client does not match its reservation.");
  }

  const { data: submission, error: submissionError } = await supabase
    .from("ticket_submissions")
    .select("id,client_id,status,service_type,assessment_price_cad,assessment_paid_at,assessment_checkout_session_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (submissionError) throw submissionError;
  if (
    !submission ||
    submission.client_id !== clientId ||
    submission.service_type !== "ticket_insurance_assessment" ||
    Number(submission.assessment_price_cad) !== 149 ||
    (submission.assessment_checkout_session_id && submission.assessment_checkout_session_id !== session.id)
  ) {
    throw new Error("Paid ticket assessment does not match its saved intake.");
  }

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id || null;
  let result: "assessment_activated" | "assessment_already_active" = "assessment_already_active";
  if (!submission.assessment_paid_at) {
    const { data: activated, error: activationError } = await supabase
      .from("ticket_submissions")
      .update({
        status: "assessment_pending",
        assessment_paid_at: new Date().toISOString(),
        assessment_checkout_session_id: session.id,
        assessment_payment_intent_id: paymentIntentId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", submissionId)
      .is("assessment_paid_at", null)
      .select("id")
      .maybeSingle();
    if (activationError) throw activationError;
    if (activated) result = "assessment_activated";
  }

  const { error: intentPaidError } = await supabase
    .from("idr_checkout_intents")
    .update({ status: "paid", stripe_checkout_session_id: session.id })
    .eq("id", intentId)
    .eq("attempts", intent.attempts);
  if (intentPaidError) throw intentPaidError;
  return result;
}

async function sendTicketAssessmentConfirmation(
  supabase: ReturnType<typeof createClient>,
  submissionId: string,
) {
  const { data: submission, error: submissionError } = await supabase
    .from("ticket_submissions")
    .select("id,assessment_confirmation_claimed_at,assessment_confirmation_sent_at,clients(first_name,email)")
    .eq("id", submissionId)
    .single();
  if (submissionError || !submission) throw submissionError || new Error("Paid ticket assessment was not found.");
  if (submission.assessment_confirmation_sent_at || submission.assessment_confirmation_claimed_at) return;

  const client = Array.isArray(submission.clients) ? submission.clients[0] : submission.clients;
  if (!client?.email) throw new Error("Paid ticket assessment has no delivery email.");
  const claimedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase.from("ticket_submissions").update({
    assessment_confirmation_claimed_at: claimedAt,
  }).eq("id", submissionId)
    .is("assessment_confirmation_claimed_at", null)
    .is("assessment_confirmation_sent_at", null)
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return;

  let emailAccepted = false;
  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) throw new Error("RESEND_API_KEY is unavailable.");
    await sendResendEmail(apiKey, {
      from: "Fabsy <hello@fabsy.ca>",
      reply_to: "hello@fabsy.ca",
      to: [client.email],
      subject: "Fabsy received your ticket assessment",
      html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1f2937"><h1>Payment received—your ticket is in the review queue</h1><p>Hi ${escapeHtml(client.first_name)},</p><p>Fabsy received your private ticket upload and the information for your <strong>Traffic Ticket + Insurance Impact Assessment</strong>.</p><div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:18px;margin:24px 0"><p style="margin:0 0 8px"><strong>Payment:</strong> $149 CAD, one-time</p><p style="margin:0 0 8px"><strong>Ticket:</strong> received</p><p style="margin:0"><strong>Next:</strong> a Fabsy team member will complete a human review and email the assessment.</p></div><p>Fabsy will review the charge and deadline, fine and demerit implications, available options, likely insurance-risk significance, representation economics and the recommended next step.</p><p>If a response deadline is close, reply to this email or call (825) 793-2279 after submitting. The assessment does not pause any deadline printed on the ticket.</p><p style="font-size:13px;color:#6b7280;line-height:1.5">Insurance treatment varies by insurer, driving history, jurisdiction, renewal timing and other underwriting factors. Fabsy's assessment is not a binding insurance quote or guarantee of premium changes. Fabsy is an Alberta traffic ticket agent service, not a law firm, and no outcome is promised.</p>${getFabsyEmailSignature()}</div>`,
    }, `ticket-assessment-confirmation/${submissionId}`);
    emailAccepted = true;
    const { error: sentError } = await supabase.from("ticket_submissions").update({
      assessment_confirmation_sent_at: new Date().toISOString(),
      assessment_confirmation_claimed_at: null,
    }).eq("id", submissionId);
    if (sentError) throw sentError;
  } catch (error) {
    if (!emailAccepted) {
      await supabase.from("ticket_submissions").update({ assessment_confirmation_claimed_at: null })
        .eq("id", submissionId).eq("assessment_confirmation_claimed_at", claimedAt);
    } else {
      console.error(`Ticket assessment confirmation accepted for ${submissionId} but needs reconciliation`);
    }
    throw error;
  }
}

async function releaseFailedCheckoutIntent(
  supabase: ReturnType<typeof createClient>,
  session: CheckoutSessionData,
  status: "failed" | "expired",
) {
  const metadata = session.metadata || {};
  const intentId = metadata.checkout_intent_id || metadata.idr_order_id;
  if (!isUuid(intentId)) return false;

  let query = supabase
    .from("idr_checkout_intents")
    .update({ status, stripe_checkout_session_id: null })
    .eq("id", intentId)
    .eq("stripe_checkout_session_id", session.id)
    .neq("status", "paid");
  if (metadata.checkout_attempt) {
    const attempt = Number(metadata.checkout_attempt);
    if (!Number.isInteger(attempt) || attempt < 1) {
      throw new Error("Failed checkout has invalid attempt metadata.");
    }
    query = query.eq("attempts", attempt);
  }
  const { data: released, error: releaseError } = await query.select("id").maybeSingle();
  if (releaseError) throw releaseError;
  return Boolean(released);
}

async function resolveClientId(
  supabase: ReturnType<typeof createClient>,
  session: CheckoutSessionData,
  orderId: string,
  type: IdrOrderType,
  checkoutKind: string,
) {
  const metadata = session.metadata || {};
  if (isUuid(metadata.idr_client_id)) {
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", metadata.idr_client_id)
      .maybeSingle();
    if (clientError) throw clientError;
    if (!client) throw new Error("Checkout session references an unknown client.");
    return client.id as string;
  }

  if (type !== "standalone" || checkoutKind !== "idr_only" || metadata.ticket_submission_id) {
    throw new Error("Checkout session is missing its IDR client reference.");
  }

  const customerEmail = String(session.customer_details?.email || session.customer_email || "")
    .trim()
    .toLowerCase();
  if (!EMAIL_PATTERN.test(customerEmail)) {
    throw new Error("Paid checkout session is missing a valid customer email.");
  }
  const firstName = safeMetadataText(metadata.purchaser_first_name, "first name", 100);
  const lastName = safeMetadataText(metadata.purchaser_last_name, "last name", 100);
  const phone = safeMetadataText(metadata.purchaser_phone, "phone", 30);
  const placeholderLicense = `IDR-${orderId}`;

  const { data: existingClient, error: existingClientError } = await supabase
    .from("clients")
    .select("id,email")
    .eq("drivers_license", placeholderLicense)
    .maybeSingle();
  if (existingClientError) throw existingClientError;
  if (existingClient) {
    if (existingClient.email.toLowerCase() !== customerEmail) {
      throw new Error("Existing IDR purchaser does not match the paid checkout.");
    }
    return existingClient.id as string;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("clients")
    .insert({
      drivers_license: placeholderLicense,
      first_name: firstName,
      last_name: lastName,
      email: customerEmail,
      phone,
      sms_opt_in: false,
    })
    .select("id")
    .single();
  if (!insertError && inserted) return inserted.id as string;
  if (insertError?.code === "23505") {
    const { data: raced, error: racedError } = await supabase
      .from("clients")
      .select("id,email")
      .eq("drivers_license", placeholderLicense)
      .maybeSingle();
    if (racedError) throw racedError;
    if (raced?.email?.toLowerCase() === customerEmail) return raced.id as string;
  }
  throw insertError || new Error("Paid IDR purchaser could not be created.");
}

function orderMatches(
  order: Record<string, unknown>,
  expected: {
    id: string;
    clientId: string;
    ticketSubmissionId: string | null;
    type: IdrOrderType;
    pricePaid: number;
    checkoutSessionId: string;
  },
): boolean {
  return order.id === expected.id &&
    order.client_id === expected.clientId &&
    (order.ticket_submission_id || null) === expected.ticketSubmissionId &&
    order.type === expected.type &&
    Number(order.price_paid) === expected.pricePaid &&
    (!order.stripe_checkout_session_id ||
      order.stripe_checkout_session_id === expected.checkoutSessionId);
}

async function persistPaidOrder(
  supabase: ReturnType<typeof createClient>,
  session: CheckoutSessionData,
): Promise<"created" | "existing"> {
  const metadata = session.metadata || {};
  const orderId = metadata.idr_order_id;
  let clientId = metadata.idr_client_id;
  const type = metadata.idr_type;
  const ticketSubmissionId = metadata.ticket_submission_id || null;
  const checkoutKind = metadata.idr_checkout_kind || "idr_only";

  if (!isUuid(orderId) || !isOrderType(type)) {
    throw new Error("Checkout session has invalid IDR metadata.");
  }
  const expectedReference = checkoutKind === "ticket_with_addon"
    ? ticketSubmissionId
    : orderId;
  if (session.client_reference_id !== expectedReference) {
    throw new Error("Checkout session reference does not match the IDR order.");
  }
  if (session.mode !== "payment" || session.payment_status !== "paid") {
    throw new Error("Checkout session is not a completed payment.");
  }

  const expectedAmount = PRICE_CENTS[type];
  const expectedCheckoutTotal = checkoutKind === "ticket_with_addon"
    ? 48800 + PRICE_CENTS.addon
    : expectedAmount;
  if (session.currency?.toLowerCase() !== "cad" || session.amount_subtotal !== expectedCheckoutTotal) {
    throw new Error("Checkout session subtotal does not match the configured product prices.");
  }
  if (type === "addon" && !isUuid(ticketSubmissionId || undefined)) {
    throw new Error("Add-on checkout is missing its ticket submission reference.");
  }
  if (checkoutKind === "ticket_with_addon" && type !== "addon") {
    throw new Error("Combined checkout has an invalid IDR type.");
  }
  if (checkoutKind === "ticket_with_addon" && Number(session.total_details?.amount_discount || 0) !== 0) {
    throw new Error("Combined IDR checkout cannot include a promotion discount.");
  }
  if (checkoutKind !== "ticket_with_addon" && checkoutKind !== "idr_only") {
    throw new Error("Checkout session has an invalid IDR checkout kind.");
  }
  const intent = await validateCheckoutIntent(
    supabase,
    session,
    orderId,
    type,
    checkoutKind,
    ticketSubmissionId,
    expectedAmount,
  );
  clientId = await resolveClientId(supabase, session, orderId, type, checkoutKind);
  if (intent.client_id && intent.client_id !== clientId) {
    throw new Error("Paid checkout client does not match its IDR reservation.");
  }

  if (ticketSubmissionId) {
    const { data: submission, error: submissionError } = await supabase
      .from("ticket_submissions")
      .select("id,client_id")
      .eq("id", ticketSubmissionId)
      .maybeSingle();
    if (submissionError) throw submissionError;
    if (!submission || submission.client_id !== clientId) {
      throw new Error("Ticket submission does not belong to the IDR client.");
    }
  }

  const expectedOrder = {
    id: orderId,
    clientId,
    ticketSubmissionId,
    type,
    pricePaid: expectedAmount / 100,
    checkoutSessionId: session.id,
  };
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id || null;
  const activateCombinedTicket = async () => {
    if (checkoutKind !== "ticket_with_addon" || !ticketSubmissionId) return;
    const { error: activationError } = await supabase
      .from("ticket_submissions")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .eq("id", ticketSubmissionId)
      .eq("status", "awaiting_payment");
    if (activationError) throw activationError;
  };
  const selectFields =
    "id,client_id,ticket_submission_id,type,price_paid,status,stripe_checkout_session_id,stripe_payment_intent_id";
  const { data: existing, error: existingError } = await supabase
    .from("idr_orders")
    .select(selectFields)
    .eq("id", orderId)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    if (!orderMatches(existing, expectedOrder)) {
      throw new Error("Existing IDR order does not match the paid checkout session.");
    }
    if (!existing.stripe_checkout_session_id) {
      const { error: updateError } = await supabase
        .from("idr_orders")
        .update({
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: paymentIntentId,
          paid_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .is("stripe_checkout_session_id", null);
      if (updateError) throw updateError;
    }
    await activateCombinedTicket();
    const { error: intentPaidError } = await supabase
      .from("idr_checkout_intents")
      .update({ status: "paid", stripe_checkout_session_id: session.id })
      .eq("id", orderId);
    if (intentPaidError) throw intentPaidError;
    return "existing";
  }

  const { data: sessionOrder, error: sessionOrderError } = await supabase
    .from("idr_orders")
    .select("id")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();
  if (sessionOrderError) throw sessionOrderError;
  if (sessionOrder && sessionOrder.id !== orderId) {
    throw new Error("Checkout session is already assigned to another IDR order.");
  }

  const { error: insertError } = await supabase.from("idr_orders").insert({
    id: orderId,
    client_id: clientId,
    ticket_submission_id: ticketSubmissionId,
    type,
    price_paid: expectedAmount / 100,
    status: "awaiting_abstract",
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
    paid_at: new Date().toISOString(),
  });
  if (!insertError) {
    await activateCombinedTicket();
    const { error: intentPaidError } = await supabase
      .from("idr_checkout_intents")
      .update({ status: "paid", stripe_checkout_session_id: session.id })
      .eq("id", orderId);
    if (intentPaidError) throw intentPaidError;
    return "created";
  }

  if (insertError.code === "23505") {
    const { data: raced, error: racedError } = await supabase
      .from("idr_orders")
      .select(selectFields)
      .eq("id", orderId)
      .maybeSingle();
    if (racedError) throw racedError;
    if (raced && orderMatches(raced, expectedOrder)) {
      await activateCombinedTicket();
      const { error: intentPaidError } = await supabase
        .from("idr_checkout_intents")
        .update({ status: "paid", stripe_checkout_session_id: session.id })
        .eq("id", orderId);
      if (intentPaidError) throw intentPaidError;
      return "existing";
    }
  }
  throw insertError;
}

async function sendAccessEmail(
  supabase: ReturnType<typeof createClient>,
  orderId: string,
) {
  const { data: order, error: orderError } = await supabase
    .from("idr_orders")
    .select("id,access_email_sent_at,access_email_claimed_at,clients(first_name,email)")
    .eq("id", orderId)
    .single();
  if (orderError || !order) throw orderError || new Error("Paid IDR order was not found for email delivery.");
  if (order.access_email_sent_at) return;
  // A stale claim is not automatically released. It may represent an email
  // accepted by the provider just before the database completion write failed.
  // Operations must reconcile it before clearing the claim and retrying.
  if (order.access_email_claimed_at) return;

  const claimedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("idr_orders")
    .update({ access_email_claimed_at: claimedAt })
    .eq("id", orderId)
    .is("access_email_sent_at", null)
    .is("access_email_claimed_at", null)
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return;

  const client = Array.isArray(order.clients) ? order.clients[0] : order.clients;
  if (!client?.email) {
    await supabase.from("idr_orders").update({ access_email_claimed_at: null }).eq("id", orderId);
    throw new Error("Paid IDR client email is unavailable.");
  }
  let emailAccepted = false;
  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) throw new Error("RESEND_API_KEY is unavailable.");
    const siteUrl = (Deno.env.get("SITE_URL") || "https://fabsy.ca").replace(/\/$/, "");
    await sendResendEmail(apiKey, {
      from: "Fabsy <hello@fabsy.ca>",
      reply_to: "hello@fabsy.ca",
      to: [client.email],
      subject: "Your Fabsy IDR upload instructions",
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#1f2937"><h1>Your Insurance Damage Report order is ready for your abstract</h1><p>Hi ${escapeHtml(client.first_name)},</p><p>Sign in with your purchase email to order and upload your commercial 5-year Alberta driver abstract.</p><p style="margin:28px 0"><a href="${siteUrl}/insurance-damage-report/intake" style="background:#7c3aed;color:white;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:700">Open private IDR intake</a></p><p style="font-size:13px;color:#6b7280;line-height:1.5">${DISCLAIMER}</p>${getFabsyEmailSignature()}</div>`,
    }, `idr-access/${orderId}`);
    emailAccepted = true;
    const { error: sentError } = await supabase
      .from("idr_orders")
      .update({ access_email_sent_at: new Date().toISOString(), access_email_claimed_at: null })
      .eq("id", orderId);
    if (sentError) throw sentError;
  } catch (error) {
    if (!emailAccepted) {
      await supabase.from("idr_orders")
        .update({ access_email_claimed_at: null })
        .eq("id", orderId)
        .eq("access_email_claimed_at", claimedAt);
    } else {
      console.error(`IDR access email was accepted but order ${orderId} needs sent-status reconciliation`);
    }
    throw error;
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const stripeSignature = req.headers.get("stripe-signature");
  if (!stripeSignature) return json({ error: "Missing Stripe signature." }, 400);

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!stripeSecretKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    console.error("idr-payment-webhook configuration is incomplete");
    return json({ error: "Webhook configuration is incomplete." }, 500);
  }

  let event: StripeEventData;
  try {
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });
    const payload = await req.text();
    const cryptoProvider = Stripe.createSubtleCryptoProvider();
    event = await stripe.webhooks.constructEventAsync(
      payload,
      stripeSignature,
      webhookSecret,
      undefined,
      cryptoProvider,
    ) as unknown as StripeEventData;
  } catch {
    return json({ error: "Stripe signature verification failed." }, 400);
  }

  if (![
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "checkout.session.expired",
  ].includes(event.type)) {
    return json({ received: true, handled: false });
  }

  const session = event.data.object;
  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (
      event.type === "checkout.session.async_payment_failed" ||
      event.type === "checkout.session.expired"
    ) {
      const released = await releaseFailedCheckoutIntent(
        supabase,
        session,
        event.type === "checkout.session.expired" ? "expired" : "failed",
      );
      return json({ received: true, handled: released, released });
    }
    if (session.payment_status !== "paid") {
      return json({ received: true, handled: false });
    }

    if (session.metadata?.fabsy_checkout_kind === "ticket_assessment") {
      const result = await persistPaidTicketAssessment(supabase, session);
      await sendTicketAssessmentConfirmation(supabase, session.metadata.assessment_submission_id);
      return json({ received: true, handled: true, result });
    }

    if (session.metadata?.fabsy_checkout_kind === "ticket_only") {
      const result = await persistPaidTicketCheckout(supabase, session);
      return json({ received: true, handled: true, result });
    }
    if (!session.metadata?.idr_order_id) {
      return json({ received: true, handled: false });
    }
    const result = await persistPaidOrder(supabase, session);
    await sendAccessEmail(supabase, session.metadata!.idr_order_id);
    return json({ received: true, handled: true, result });
  } catch {
    console.error(`idr-payment-webhook failed for event ${event.id}`);
    return json({ error: "Paid IDR order could not be recorded." }, 500);
  }
});
