import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { getFabsyEmailSignature } from "../_shared/email-signature.ts";
import { sendResendEmail } from "../_shared/resend-email.ts";
import { parsePreferredLocale } from "../_shared/locale-policy.ts";
import { validatePhotoRadarPaidSession } from "../_shared/photo-radar.ts";
import { PRO_COUPON, validateProPayment } from "../_shared/pro-pricing.ts";
import { recordReferralCheckoutPayment, recordReferralRefund } from "../_shared/referrals.ts";
import { reconcileProRefund } from "../_shared/pro-refund.ts";

type IdrOrderType = "standalone" | "addon";
type CheckoutIntentType = IdrOrderType | "ticket" | "assessment" | "photo_radar";
// This Edge Function intentionally uses the dynamic service-role client without generated DB types.
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = ReturnType<typeof createClient<any>>;

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
  customer?: string | { id?: string } | null;
  customer_details?: { email?: string | null } | null;
  payment_intent?: string | { id?: string } | null;
  total_details?: {
    amount_discount?: number | null;
    amount_tax?: number | null;
    amount_shipping?: number | null;
  } | null;
  metadata: Record<string, string> | null;
}

interface StripeEventData {
  id: string;
  type: string;
  data: { object: CheckoutSessionData };
}

const IDR_PRICE_CENTS: Record<IdrOrderType, ReadonlySet<number>> = {
  standalone: new Set([4900, 12900]),
  addon: new Set([3100, 9900]),
};
const TICKET_BASE_PRICE_CENTS: ReadonlySet<number> = new Set([19800, 48800]);
const TICKET_ADDON_PRICE_PAIRS: ReadonlySet<string> = new Set([
  "19800:3100",
  "48800:9900",
]);
const TICKET_ASSESSMENT_CENTS = 14900;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

function safeMetadataText(
  value: string | undefined,
  field: string,
  maxLength: number,
) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`Checkout session has invalid ${field} metadata.`);
  }
  return normalized;
}

function metadataPriceCents(
  value: string | undefined,
  field: string,
  allowedPrices: ReadonlySet<number>,
) {
  const normalized = String(value || "");
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Checkout session has invalid ${field} metadata.`);
  }
  const priceCents = Number(normalized);
  if (!Number.isSafeInteger(priceCents) || !allowedPrices.has(priceCents)) {
    throw new Error(`Checkout session has unsupported ${field} metadata.`);
  }
  return priceCents;
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
  supabase: SupabaseAdmin,
  session: CheckoutSessionData,
  intentId: string,
  type: CheckoutIntentType,
  checkoutKind: string,
  ticketSubmissionId: string | null,
  expectedAmountCents: number,
) {
  const { data: intent, error: intentError } = await supabase
    .from("idr_checkout_intents")
    .select(
      "id,client_id,ticket_submission_id,type,checkout_kind,expected_amount_cents,purchaser_email,stripe_checkout_session_id,status,attempts,pro_coupon,pro_discount_cents,pro_subtotal_cents,pro_verification_id",
    )
    .eq("id", intentId)
    .maybeSingle();
  if (intentError) throw intentError;
  if (!intent) {
    throw new Error("Paid checkout has no matching IDR reservation.");
  }

  const purchaserEmail = String(
    session.customer_details?.email || session.customer_email || "",
  )
    .trim()
    .toLowerCase();
  if (
    intent.type !== type ||
    intent.checkout_kind !== checkoutKind ||
    Number(intent.expected_amount_cents) !== expectedAmountCents ||
    (intent.ticket_submission_id || null) !== ticketSubmissionId ||
    intent.purchaser_email.toLowerCase() !== purchaserEmail ||
    (intent.stripe_checkout_session_id &&
      intent.stripe_checkout_session_id !== session.id) ||
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

async function persistProPayment(
  supabase: SupabaseAdmin,
  submissionId: string,
  intent: { pro_verification_id?: string | null; pro_discount_cents?: number },
  discounted: boolean,
) {
  if (!discounted) return;
  const { data: evidence, error: evidenceError } = await supabase.from("pro_licence_verifications")
    .select("id,ticket_submission_id,status,declared_class,read_class,jurisdiction,identity_matches")
    .eq("id", intent.pro_verification_id).maybeSingle();
  if (evidenceError) throw evidenceError;
  if (!evidence || evidence.ticket_submission_id !== submissionId || evidence.status !== "verified" ||
    evidence.read_class !== evidence.declared_class || evidence.jurisdiction !== "AB" ||
    evidence.identity_matches !== true) throw new Error("Paid pro discount has no matching licence evidence.");
  const { data: order, error: orderError } = await supabase.from("ticket_submissions")
    .update({ discount_applied: PRO_COUPON, pro_discount_cents: intent.pro_discount_cents })
    .eq("id", submissionId).eq("pro_verified", true).eq("pro_verification_id", evidence.id)
    .eq("ticket_type", "officer_issued").select("id").maybeSingle();
  if (orderError) throw orderError;
  if (!order) throw new Error("Paid pro discount does not match the verified officer order.");
}

async function recordRepresentationPayment(supabase: SupabaseAdmin, session: CheckoutSessionData) {
  const orderId = session.metadata?.ticket_submission_id || session.metadata?.submission_id;
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!isUuid(orderId) || !paymentIntentId) throw new Error("Representation payment identity is missing.");
  const stripeCustomerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  await recordReferralCheckoutPayment(supabase, { orderId, paymentIntentId, stripeCustomerId });
}

async function activateIncludedAssessment(
  supabase: SupabaseAdmin,
  representationId: string,
  sourceAssessmentId: string | undefined,
) {
  if (!isUuid(sourceAssessmentId)) {
    throw new Error(
      "Paid representation is missing its included assessment link.",
    );
  }
  const { data: source, error: sourceError } = await supabase
    .from("ticket_submissions")
    .select(
      "id,status,service_type,assessment_paid_at,assessment_payment_source",
    )
    .eq("id", sourceAssessmentId)
    .maybeSingle();
  if (sourceError) throw sourceError;
  if (!source || source.service_type !== "ticket_insurance_assessment") {
    throw new Error(
      "Paid representation has an invalid included assessment link.",
    );
  }
  if (source.assessment_paid_at) {
    if (source.assessment_payment_source !== "included_with_representation") {
      throw new Error(
        "The linked assessment was paid separately and cannot be activated twice.",
      );
    }
    return;
  }

  const { data: activated, error: activationError } = await supabase
    .from("ticket_submissions")
    .update({
      status: "assessment_pending",
      assessment_paid_at: new Date().toISOString(),
      assessment_payment_source: "included_with_representation",
      representation_credit_eligible: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", source.id)
    .is("assessment_paid_at", null)
    .select("id")
    .maybeSingle();
  if (activationError) throw activationError;
  if (!activated) {
    const { data: raced, error: racedError } = await supabase
      .from("ticket_submissions")
      .select("assessment_payment_source")
      .eq("id", source.id)
      .single();
    if (
      racedError ||
      raced?.assessment_payment_source !== "included_with_representation"
    ) {
      throw racedError ||
        new Error("The included assessment could not be activated.");
    }
  }
  console.log(
    `Activated included assessment for paid representation ${representationId}`,
  );
}

async function persistPaidTicketCheckout(
  supabase: SupabaseAdmin,
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
  const ticketBaseCents = metadataPriceCents(
    metadata.ticket_base_cents,
    "ticket price",
    TICKET_BASE_PRICE_CENTS,
  );
  if (
    session.client_reference_id !== submissionId ||
    session.mode !== "payment" ||
    session.payment_status !== "paid" ||
    session.currency?.toLowerCase() !== "cad" ||
    session.amount_subtotal !== ticketBaseCents
  ) {
    throw new Error(
      "Core ticket checkout does not match the configured product price.",
    );
  }

  // Legacy sessions retain their old validation; new sessions must match the
  // immutable PRO20/no-discount reservation as well as the Stripe subtotal.
  const intent = await validateCheckoutIntent(
    supabase,
    session,
    intentId,
    "ticket",
    checkoutKind,
    submissionId,
    ticketBaseCents,
  );
  if (intent.client_id !== clientId) {
    throw new Error(
      "Paid ticket checkout client does not match its reservation.",
    );
  }
  const proPayment = validateProPayment(session, intent, false);
  await persistProPayment(supabase, submissionId, intent, proPayment.verified);

  const { data: submission, error: submissionError } = await supabase
    .from("ticket_submissions")
    .select(
      "id,client_id,status,source_assessment_id,representation_includes_assessment,ticket_type",
    )
    .eq("id", submissionId)
    .maybeSingle();
  if (submissionError) throw submissionError;
  if (!submission || submission.client_id !== clientId || submission.ticket_type === "photo_radar") {
    throw new Error(
      "Paid ticket checkout does not belong to its reserved client.",
    );
  }
  if (submission.representation_includes_assessment) {
    if (
      !isUuid(submission.source_assessment_id) ||
      metadata.source_assessment_id !== submission.source_assessment_id
    ) {
      throw new Error(
        "Paid representation does not match its exclusive assessment claim.",
      );
    }
    await markSourceAssessmentCheckoutPaid(supabase, session);
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
  if (submission.representation_includes_assessment) {
    await activateIncludedAssessment(
      supabase,
      submission.id,
      submission.source_assessment_id,
    );
  }
  return result;
}

async function persistPaidPhotoRadarCheckout(supabase: SupabaseAdmin, session: CheckoutSessionData) {
  validatePhotoRadarPaidSession(session);
  const metadata = session.metadata!;
  const intentId = metadata.checkout_intent_id;
  const submissionId = metadata.ticket_submission_id;
  const clientId = metadata.client_id;
  const attempt = Number(metadata.checkout_attempt);
  if (!isUuid(intentId) || !isUuid(submissionId) || !isUuid(clientId) ||
      session.client_reference_id !== submissionId || !Number.isSafeInteger(attempt) || attempt < 1) {
    throw new Error("Photo Radar checkout has invalid reservation metadata.");
  }
  const intent = await validateCheckoutIntent(supabase, session, intentId, "photo_radar", "photo_radar", submissionId, 7900);
  if (intent.client_id !== clientId) throw new Error("Photo Radar client does not match its reservation.");
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
  // One transaction locks the stored product, marks payment and creates exactly
  // one ATE review. Stripe retries cannot duplicate a file or restart its clock.
  const { data, error } = await supabase.rpc("activate_photo_radar_checkout", {
    p_intent_id: intentId, p_submission_id: submissionId, p_client_id: clientId,
    p_session_id: session.id, p_attempt: attempt, p_payment_intent_id: paymentIntentId,
  });
  if (error) throw error;
  return data;
}

async function persistPaidTicketAssessment(
  supabase: SupabaseAdmin,
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
    Number(session.total_details?.amount_tax || 0) <= 0 ||
    Number(session.total_details?.amount_tax || 0) >= TICKET_ASSESSMENT_CENTS ||
    metadata.assessment_price_cents !== String(TICKET_ASSESSMENT_CENTS) ||
    metadata.assessment_total_cents !== String(TICKET_ASSESSMENT_CENTS) ||
    metadata.price_includes_applicable_tax !== "true" ||
    Number(session.total_details?.amount_discount || 0) !== 0
  ) {
    throw new Error(
      "Ticket assessment checkout does not match the configured product price.",
    );
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
    throw new Error(
      "Paid ticket assessment client does not match its reservation.",
    );
  }

  const { data: submission, error: submissionError } = await supabase
    .from("ticket_submissions")
    .select(
      "id,client_id,status,service_type,assessment_price_cad,assessment_paid_at,assessment_checkout_session_id,ticket_type",
    )
    .eq("id", submissionId)
    .maybeSingle();
  if (submissionError) throw submissionError;
  if (
    !submission ||
    submission.client_id !== clientId ||
    submission.service_type !== "ticket_insurance_assessment" ||
    submission.ticket_type === "photo_radar" ||
    Number(submission.assessment_price_cad) !== 149 ||
    (submission.assessment_checkout_session_id &&
      submission.assessment_checkout_session_id !== session.id)
  ) {
    throw new Error("Paid ticket assessment does not match its saved intake.");
  }

  await markSourceAssessmentCheckoutPaid(supabase, session);

  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
  let result: "assessment_activated" | "assessment_already_active" = "assessment_already_active";
  if (!submission.assessment_paid_at) {
    const { data: activated, error: activationError } = await supabase
      .from("ticket_submissions")
      .update({
        status: "assessment_pending",
        assessment_paid_at: new Date().toISOString(),
        assessment_checkout_session_id: session.id,
        assessment_payment_intent_id: paymentIntentId,
        assessment_payment_source: "standalone",
        representation_credit_eligible: true,
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
  supabase: SupabaseAdmin,
  submissionId: string,
  includedTicketPriceCents?: number,
) {
  const { data: submission, error: submissionError } = await supabase
    .from("ticket_submissions")
    .select(
      "id,assessment_payment_source,assessment_confirmation_claimed_at,assessment_confirmation_sent_at,preferred_locale,clients(first_name,email)",
    )
    .eq("id", submissionId)
    .single();
  if (submissionError || !submission) {
    throw submissionError || new Error("Paid ticket assessment was not found.");
  }
  if (
    submission.assessment_confirmation_sent_at ||
    submission.assessment_confirmation_claimed_at
  ) return;

  const client = Array.isArray(submission.clients) ? submission.clients[0] : submission.clients;
  if (!client?.email) {
    throw new Error("Paid ticket assessment has no delivery email.");
  }
  const claimedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase.from(
    "ticket_submissions",
  ).update({
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
    const included = submission.assessment_payment_source === "included_with_representation";
    const isRapidResolution = includedTicketPriceCents === 19800;
    const subject = included ? isRapidResolution ? "Fabsy received your Rapid Resolution order and priority review" : "Fabsy received your representation order and priority review" : "Fabsy received your Ticket Triage order";
    const paymentSummary = included ? isRapidResolution ? "Your priority ticket and insurance-impact review is included with the $198 Rapid Resolution service. Applicable tax and any separately disclosed fees are governed by your service terms." : "Your priority ticket and insurance-impact review is included with the $488 base representation service. Applicable tax and any separately disclosed contingent fee are governed by your representation terms." : "$149 CAD total, one-time; applicable GST included";
    const upgradeNote = included ? "<p>Your representation intake is connected to this review, so you do not need to buy the $149 review separately.</p>" : '<div style="background:#f5f3ff;border:1px solid #c4b5fd;border-radius:10px;padding:18px;margin:24px 0"><p style="margin:0 0 8px"><strong>If Rapid Resolution is worthwhile:</strong> the $149 Ticket Triage payment can be applied to Fabsy\'s $198 service fee for the same eligible matter, leaving a $49 service-fee balance plus applicable tax.</p><p style="margin:0">Eligible Ticket Triage clients also receive priority placement. Any additional service is optional and subject to its own terms.</p></div>';
    await sendResendEmail(apiKey, {
      localization: { preferredLocale: submission.preferred_locale, template: "assessment_paid" },
      from: "Fabsy <hello@fabsy.ca>",
      reply_to: "hello@fabsy.ca",
      to: [client.email],
      subject,
      html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1f2937"><h1>Payment received—your priority review is in the queue</h1><p>Hi ${
        escapeHtml(client.first_name)
      },</p><p>Fabsy received your private ticket upload, policy documents and review information.</p><div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:18px;margin:24px 0"><p style="margin:0 0 8px"><strong>Payment:</strong> ${paymentSummary}</p><p style="margin:0 0 8px"><strong>Documents:</strong> received privately</p><p style="margin:0"><strong>Next:</strong> a Fabsy team member will complete the review and email your report and initial dispute plan.</p></div>${upgradeNote}<p>Fabsy will review the charge and deadline, fine and demerit implications, available options, likely insurance-risk significance, cost scenarios, representation economics and the recommended next step.</p><p>If a response deadline is close, reply to this email or call (825) 793-2279 after submitting. The review does not pause any deadline printed on the ticket.</p><p style="font-size:13px;color:#6b7280;line-height:1.5">Insurance treatment varies by insurer, driving history, jurisdiction, renewal timing and other underwriting factors. This is not a binding insurance quote or guarantee of premium changes. Fabsy is an Alberta traffic ticket agent service, not a law firm, and no outcome is promised.</p>${getFabsyEmailSignature()}</div>`,
    }, `ticket-assessment-confirmation/${submissionId}`);
    emailAccepted = true;
    const { error: sentError } = await supabase.from("ticket_submissions")
      .update({
        assessment_confirmation_sent_at: new Date().toISOString(),
        assessment_confirmation_claimed_at: null,
      }).eq("id", submissionId);
    if (sentError) throw sentError;
  } catch (error) {
    if (!emailAccepted) {
      await supabase.from("ticket_submissions").update({
        assessment_confirmation_claimed_at: null,
      })
        .eq("id", submissionId).eq(
          "assessment_confirmation_claimed_at",
          claimedAt,
        );
    } else {
      console.error(
        `Ticket assessment confirmation accepted for ${submissionId} but needs reconciliation`,
      );
    }
    throw error;
  }
}

async function releaseFailedCheckoutIntent(
  supabase: SupabaseAdmin,
  session: CheckoutSessionData,
  status: "failed" | "expired",
) {
  const metadata = session.metadata || {};
  const intentId = metadata.checkout_intent_id || metadata.idr_order_id;
  if (!isUuid(intentId)) return false;

  let attempt: number | null = null;
  if (metadata.checkout_attempt) {
    attempt = Number(metadata.checkout_attempt);
    if (!Number.isInteger(attempt) || attempt < 1) {
      throw new Error("Failed checkout has invalid attempt metadata.");
    }
  }

  // The claim release also transitions the matching intent in one database
  // transaction. If this session does not consume an assessment, fall back to
  // the generic intent-only release below.
  if (attempt !== null) {
    const { data: claimReleased, error: claimReleaseError } = await supabase
      .rpc(
        "release_source_assessment_checkout",
        {
          p_checkout_intent_id: intentId,
          p_checkout_attempt: attempt,
          p_stripe_checkout_session_id: session.id,
          p_intent_status: status,
        },
      );
    if (claimReleaseError) throw claimReleaseError;
    if (claimReleased === true) return true;
  }

  let query = supabase
    .from("idr_checkout_intents")
    .update({ status, stripe_checkout_session_id: null })
    .eq("id", intentId)
    .eq("stripe_checkout_session_id", session.id)
    .neq("status", "paid");
  if (attempt !== null) {
    query = query.eq("attempts", attempt);
  }
  const { data: released, error: releaseError } = await query.select("id")
    .maybeSingle();
  if (releaseError) throw releaseError;
  return Boolean(released);
}

async function markSourceAssessmentCheckoutPaid(
  supabase: SupabaseAdmin,
  session: CheckoutSessionData,
) {
  const metadata = session.metadata || {};
  const sourceAssessmentId = metadata.assessment_submission_id ||
    metadata.source_assessment_id;
  if (!isUuid(sourceAssessmentId)) return false;

  const intentId = metadata.checkout_intent_id || metadata.idr_order_id;
  const attempt = Number(metadata.checkout_attempt);
  if (!isUuid(intentId) || !Number.isInteger(attempt) || attempt < 1) {
    throw new Error(
      "Paid assessment checkout is missing its exact claim metadata.",
    );
  }

  const { data: marked, error: markError } = await supabase.rpc(
    "mark_source_assessment_checkout_paid",
    {
      p_checkout_intent_id: intentId,
      p_checkout_attempt: attempt,
      p_stripe_checkout_session_id: session.id,
    },
  );
  if (markError) throw markError;
  if (marked !== true) {
    throw new Error("Paid assessment checkout claim could not be sealed.");
  }
  return true;
}

async function resolveClientId(
  supabase: SupabaseAdmin,
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
    if (!client) {
      throw new Error("Checkout session references an unknown client.");
    }
    return client.id as string;
  }

  if (
    type !== "standalone" || checkoutKind !== "idr_only" ||
    metadata.ticket_submission_id
  ) {
    throw new Error("Checkout session is missing its IDR client reference.");
  }

  const customerEmail = String(
    session.customer_details?.email || session.customer_email || "",
  )
    .trim()
    .toLowerCase();
  if (!EMAIL_PATTERN.test(customerEmail)) {
    throw new Error("Paid checkout session is missing a valid customer email.");
  }
  const firstName = safeMetadataText(
    metadata.purchaser_first_name,
    "first name",
    100,
  );
  const lastName = safeMetadataText(
    metadata.purchaser_last_name,
    "last name",
    100,
  );
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
      throw new Error(
        "Existing IDR purchaser does not match the paid checkout.",
      );
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
    if (raced?.email?.toLowerCase() === customerEmail) {
      return raced.id as string;
    }
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
    discountApplied: string | null;
  },
): boolean {
  return order.id === expected.id &&
    order.client_id === expected.clientId &&
    (order.ticket_submission_id || null) === expected.ticketSubmissionId &&
    order.type === expected.type &&
    Number(order.price_paid) === expected.pricePaid &&
    (order.discount_applied || null) === expected.discountApplied &&
    (!order.stripe_checkout_session_id ||
      order.stripe_checkout_session_id === expected.checkoutSessionId);
}

async function persistPaidOrder(
  supabase: SupabaseAdmin,
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
  if (checkoutKind !== "ticket_with_addon" && checkoutKind !== "idr_only") {
    throw new Error("Checkout session has an invalid IDR checkout kind.");
  }
  const expectedReference = checkoutKind === "ticket_with_addon" ? ticketSubmissionId : orderId;
  if (session.client_reference_id !== expectedReference) {
    throw new Error("Checkout session reference does not match the IDR order.");
  }
  if (session.mode !== "payment" || session.payment_status !== "paid") {
    throw new Error("Checkout session is not a completed payment.");
  }

  const idrPriceCents = metadataPriceCents(
    metadata.idr_price_cents,
    "insurance planning report price",
    IDR_PRICE_CENTS[type],
  );
  let expectedCheckoutTotal = idrPriceCents;
  if (checkoutKind === "ticket_with_addon") {
    const ticketBaseCents = metadataPriceCents(
      metadata.ticket_base_cents,
      "ticket price",
      TICKET_BASE_PRICE_CENTS,
    );
    if (!TICKET_ADDON_PRICE_PAIRS.has(`${ticketBaseCents}:${idrPriceCents}`)) {
      throw new Error(
        "Combined checkout has an unsupported product-price combination.",
      );
    }
    expectedCheckoutTotal = ticketBaseCents + idrPriceCents;
  }
  if (
    session.currency?.toLowerCase() !== "cad" ||
    session.amount_subtotal !== expectedCheckoutTotal
  ) {
    throw new Error(
      "Checkout session subtotal does not match the configured product prices.",
    );
  }
  if (type === "addon" && !isUuid(ticketSubmissionId || undefined)) {
    throw new Error(
      "Add-on checkout is missing its ticket submission reference.",
    );
  }
  if (checkoutKind === "ticket_with_addon" && type !== "addon") {
    throw new Error("Combined checkout has an invalid IDR type.");
  }
  const intent = await validateCheckoutIntent(
    supabase,
    session,
    orderId,
    type,
    checkoutKind,
    ticketSubmissionId,
    idrPriceCents,
  );
  const proPayment = checkoutKind === "ticket_with_addon"
    ? validateProPayment(session, intent, true) : null;
  if (checkoutKind === "ticket_with_addon" && !proPayment?.verified &&
    Number(session.total_details?.amount_discount || 0) !== 0) {
    throw new Error("Combined checkout requires verified pro pricing for a discount.");
  }
  if (proPayment?.verified && ticketSubmissionId) {
    await persistProPayment(supabase, ticketSubmissionId, intent, true);
  }
  const chargedIdrCents = proPayment?.verified ? proPayment.netAddonCents : idrPriceCents;
  clientId = await resolveClientId(
    supabase,
    session,
    orderId,
    type,
    checkoutKind,
  );
  if (intent.client_id && intent.client_id !== clientId) {
    throw new Error("Paid checkout client does not match its IDR reservation.");
  }

  let combinedRepresentation: {
    id: string;
    source_assessment_id?: string | null;
    representation_includes_assessment?: boolean;
  } | null = null;
  if (ticketSubmissionId) {
    const { data: submission, error: submissionError } = await supabase
      .from("ticket_submissions")
      .select(
        "id,client_id,source_assessment_id,representation_includes_assessment,ticket_type",
      )
      .eq("id", ticketSubmissionId)
      .maybeSingle();
    if (submissionError) throw submissionError;
    if (!submission || submission.client_id !== clientId || submission.ticket_type === "photo_radar") {
      throw new Error("Ticket submission does not belong to the IDR client.");
    }
    combinedRepresentation = submission;
    if (combinedRepresentation.representation_includes_assessment) {
      if (
        !isUuid(combinedRepresentation.source_assessment_id || undefined) ||
        metadata.source_assessment_id !==
          combinedRepresentation.source_assessment_id
      ) {
        throw new Error(
          "Paid representation add-on does not match its exclusive assessment claim.",
        );
      }
      await markSourceAssessmentCheckoutPaid(supabase, session);
    }
  }

  const expectedOrder = {
    id: orderId,
    clientId,
    ticketSubmissionId,
    type,
    pricePaid: chargedIdrCents / 100,
    checkoutSessionId: session.id,
    discountApplied: proPayment?.verified ? PRO_COUPON : null,
  };
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
  const activateCombinedTicket = async () => {
    if (checkoutKind !== "ticket_with_addon" || !ticketSubmissionId) return;
    const { error: activationError } = await supabase
      .from("ticket_submissions")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .eq("id", ticketSubmissionId)
      .eq("status", "awaiting_payment");
    if (activationError) throw activationError;
    if (combinedRepresentation?.representation_includes_assessment) {
      await activateIncludedAssessment(
        supabase,
        combinedRepresentation.id,
        combinedRepresentation.source_assessment_id || undefined,
      );
    }
  };
  const selectFields = "id,client_id,ticket_submission_id,type,price_paid,status,stripe_checkout_session_id,stripe_payment_intent_id,discount_applied";
  const { data: existing, error: existingError } = await supabase
    .from("idr_orders")
    .select(selectFields)
    .eq("id", orderId)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    if (!orderMatches(existing, expectedOrder)) {
      throw new Error(
        "Existing IDR order does not match the paid checkout session.",
      );
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
    throw new Error(
      "Checkout session is already assigned to another IDR order.",
    );
  }

  const { error: insertError } = await supabase.from("idr_orders").insert({
    id: orderId,
    preferred_locale: parsePreferredLocale(metadata.preferred_locale),
    client_id: clientId,
    ticket_submission_id: ticketSubmissionId,
    type,
    price_paid: chargedIdrCents / 100,
    discount_applied: proPayment?.verified ? PRO_COUPON : null,
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
  supabase: SupabaseAdmin,
  orderId: string,
) {
  const { data: order, error: orderError } = await supabase
    .from("idr_orders")
    .select(
      "id,access_email_sent_at,access_email_claimed_at,preferred_locale,clients(first_name,email)",
    )
    .eq("id", orderId)
    .single();
  if (orderError || !order) {
    throw orderError ||
      new Error("Paid IDR order was not found for email delivery.");
  }
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
    await supabase.from("idr_orders").update({ access_email_claimed_at: null })
      .eq("id", orderId);
    throw new Error("Paid IDR client email is unavailable.");
  }
  let emailAccepted = false;
  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) throw new Error("RESEND_API_KEY is unavailable.");
    const siteUrl = (Deno.env.get("SITE_URL") || "https://fabsy.ca").replace(
      /\/$/,
      "",
    );
    await sendResendEmail(apiKey, {
      from: "Fabsy <hello@fabsy.ca>",
      reply_to: "hello@fabsy.ca",
      to: [client.email],
      subject: "Your Fabsy insurance planning report upload instructions",
      localization: { preferredLocale: order.preferred_locale, template: "report_access" },
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#1f2937"><h1>Your Insurance Impact &amp; Renewal Planning Report is ready for your abstract</h1><p>Hi ${escapeHtml(client.first_name)},</p><p>Sign in with your purchase email to order and upload your commercial 5-year Alberta driver abstract.</p><p style="margin:28px 0"><a href="${siteUrl}/insurance-damage-report/intake" style="background:#7c3aed;color:white;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:700">Open your private report intake</a></p><p style="font-size:13px;color:#6b7280;line-height:1.5">${DISCLAIMER}</p>${getFabsyEmailSignature()}</div>`,
    }, `idr-access/${orderId}`);
    emailAccepted = true;
    const { error: sentError } = await supabase
      .from("idr_orders")
      .update({
        access_email_sent_at: new Date().toISOString(),
        access_email_claimed_at: null,
      })
      .eq("id", orderId);
    if (sentError) throw sentError;
  } catch (error) {
    if (!emailAccepted) {
      await supabase.from("idr_orders")
        .update({ access_email_claimed_at: null })
        .eq("id", orderId)
        .eq("access_email_claimed_at", claimedAt);
    } else {
      console.error(
        `IDR access email was accepted but order ${orderId} needs sent-status reconciliation`,
      );
    }
    throw error;
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const stripeSignature = req.headers.get("stripe-signature");
  if (!stripeSignature) {
    return json({ error: "Missing Stripe signature." }, 400);
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!stripeSecretKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    console.error("idr-payment-webhook configuration is incomplete");
    return json({ error: "Webhook configuration is incomplete." }, 500);
  }

  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });
  let event: StripeEventData;
  try {
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

  if (
    ![
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
      "charge.refunded",
      "charge.dispute.created",
      "refund.created",
      "refund.updated",
      "refund.failed",
    ].includes(event.type)
  ) {
    return json({ received: true, handled: false });
  }

  const session = event.data.object;
  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (event.type.startsWith("refund.")) {
      // Fetch current state so a delayed pending event cannot overwrite success.
      const refund = await stripe.refunds.retrieve(session.id);
      const paymentIntentId = typeof refund.payment_intent === "string"
        ? refund.payment_intent : refund.payment_intent?.id;
      if (paymentIntentId && refund.status !== "failed" && refund.status !== "canceled") {
        await recordReferralRefund(supabase, {
          paymentIntentId, refundedAt: new Date(refund.created * 1000).toISOString(), eventId: event.id,
        });
      }
      await reconcileProRefund(supabase, refund);
      return json({ received: true, handled: true });
    }
    if (event.type === "charge.refunded") {
      const charge = session as unknown as Stripe.Charge;
      const paymentIntentId = typeof charge.payment_intent === "string"
        ? charge.payment_intent : charge.payment_intent?.id;
      if (paymentIntentId && charge.amount_refunded > 0) {
        await recordReferralRefund(supabase, { paymentIntentId, eventId: event.id });
      }
      return json({ received: true, handled: true });
    }
    if (event.type === "charge.dispute.created") {
      const dispute = session as unknown as Stripe.Dispute;
      let paymentIntentId = typeof dispute.payment_intent === "string"
        ? dispute.payment_intent : dispute.payment_intent?.id;
      if (!paymentIntentId && dispute.charge) {
        const charge = typeof dispute.charge === "string" ? await stripe.charges.retrieve(dispute.charge) : dispute.charge;
        paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      }
      if (paymentIntentId) await recordReferralRefund(supabase, {
        paymentIntentId, disputedAt: new Date(dispute.created * 1000).toISOString(), eventId: event.id,
      });
      return json({ received: true, handled: true });
    }
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

    if (session.metadata?.fabsy_checkout_kind === "photo_radar") {
      const result = await persistPaidPhotoRadarCheckout(supabase, session);
      await recordRepresentationPayment(supabase, session);
      return json({ received: true, handled: true, result, review_path: "ate" });
    }
    if (session.metadata?.fabsy_checkout_kind === "ticket_assessment") {
      const result = await persistPaidTicketAssessment(supabase, session);
      await sendTicketAssessmentConfirmation(
        supabase,
        session.metadata.assessment_submission_id,
      );
      return json({ received: true, handled: true, result });
    }

    if (session.metadata?.fabsy_checkout_kind === "ticket_only") {
      const result = await persistPaidTicketCheckout(supabase, session);
      await recordRepresentationPayment(supabase, session);
      if (isUuid(session.metadata.source_assessment_id)) {
        const ticketBaseCents = metadataPriceCents(
          session.metadata.ticket_base_cents,
          "ticket price",
          TICKET_BASE_PRICE_CENTS,
        );
        await sendTicketAssessmentConfirmation(
          supabase,
          session.metadata.source_assessment_id,
          ticketBaseCents,
        );
      }
      return json({ received: true, handled: true, result });
    }
    if (!session.metadata?.idr_order_id) {
      return json({ received: true, handled: false });
    }
    const result = await persistPaidOrder(supabase, session);
    if (session.metadata?.fabsy_checkout_kind === "ticket_with_addon") {
      await recordRepresentationPayment(supabase, session);
    }
    await sendAccessEmail(supabase, session.metadata!.idr_order_id);
    if (isUuid(session.metadata?.source_assessment_id)) {
      const ticketBaseCents = metadataPriceCents(
        session.metadata.ticket_base_cents,
        "ticket price",
        TICKET_BASE_PRICE_CENTS,
      );
      await sendTicketAssessmentConfirmation(
        supabase,
        session.metadata.source_assessment_id,
        ticketBaseCents,
      );
    }
    return json({ received: true, handled: true, result });
  } catch {
    console.error(`idr-payment-webhook failed for event ${event.id}`);
    return json({ error: "Paid checkout could not be recorded." }, 500);
  }
});
