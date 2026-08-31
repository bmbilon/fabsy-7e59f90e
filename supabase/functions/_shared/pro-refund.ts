import Stripe from "https://esm.sh/stripe@18.5.0";
import { proRefundAmount, PRO_COUPON } from "./pro-pricing.ts";
import { type ProAdmin, verifiedProEvidence } from "./pro-licence.ts";

export type ProRefundStatus = "not_needed" | "awaiting_payment" | "pending" | "succeeded" | "needs_review";

function stripeId(value: string | { id: string } | null | undefined): string | null {
  return typeof value === "string" ? value : value?.id || null;
}

export async function reconcileProRefund(
  admin: ProAdmin,
  refund: Stripe.Refund,
): Promise<ProRefundStatus> {
  const paymentIntentId = stripeId(refund.payment_intent);
  if (!paymentIntentId) return "needs_review";
  const { data: record, error } = await admin.from("pro_discount_refunds").select("*")
    .eq("stripe_payment_intent_id", paymentIntentId).maybeSingle();
  if (error) throw error;
  if (!record || refund.metadata?.fabsy_pro_order !== record.ticket_submission_id ||
    refund.amount !== record.amount_cents || refund.currency !== "cad" ||
    (record.stripe_refund_id && record.stripe_refund_id !== refund.id)) return "needs_review";
  const status: ProRefundStatus = refund.status === "succeeded" ? "succeeded"
    : refund.status === "pending" || refund.status === "requires_action" ? "pending" : "needs_review";
  const { data: recordedStatus, error: writeError } = await admin.rpc("complete_pro_discount_refund", {
    p_submission_id: record.ticket_submission_id, p_payment_intent_id: paymentIntentId,
    p_refund_id: refund.id, p_amount_cents: refund.amount, p_status: status,
  });
  if (writeError) throw writeError;
  if (!["pending","succeeded","needs_review"].includes(recordedStatus)) throw new Error("Invalid refund reconciliation state.");
  return recordedStatus as ProRefundStatus;
}

// Called by the customer's private verification request, never by a browser-supplied
// amount. One durable reservation and one Stripe idempotency key cover all retries.
export async function applyVerifiedProRefund(admin: ProAdmin, order: Record<string, unknown>): Promise<ProRefundStatus> {
  const evidenceId = await verifiedProEvidence(admin, order);
  if (!evidenceId) return "not_needed";
  const { data: intent, error: intentError } = await admin.from("idr_checkout_intents")
    .select("id,client_id,ticket_submission_id,status,checkout_kind,stripe_checkout_session_id,pro_coupon,attempts")
    .eq("ticket_submission_id", order.id).in("checkout_kind", ["ticket_only","ticket_with_addon"])
    .maybeSingle();
  if (intentError) throw intentError;
  if (!intent || intent.status !== "paid") return "awaiting_payment";
  if (intent.pro_coupon === PRO_COUPON) return "not_needed";
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey || !intent.stripe_checkout_session_id) return "needs_review";
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  const session = await stripe.checkout.sessions.retrieve(intent.stripe_checkout_session_id);
  const paymentIntentId = stripeId(session.payment_intent);
  if (session.status !== "complete" || session.payment_status !== "paid" || session.mode !== "payment" ||
    session.currency !== "cad" || session.client_reference_id !== order.id || !paymentIntentId ||
    session.metadata?.checkout_intent_id !== intent.id ||
    (session.metadata?.ticket_submission_id || session.metadata?.submission_id) !== order.id ||
    session.metadata?.client_id !== order.client_id ||
    Number(session.metadata?.checkout_attempt) !== intent.attempts ||
    session.metadata?.fabsy_checkout_kind !== intent.checkout_kind) return "needs_review";

  let amounts: ReturnType<typeof proRefundAmount>;
  try { amounts = proRefundAmount(session, intent.checkout_kind === "ticket_with_addon"); }
  catch { return "needs_review"; }
  const payment = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
  const charge = payment.latest_charge;
  if (payment.status !== "succeeded" || !charge || typeof charge === "string" ||
    !charge.paid || !charge.captured || charge.disputed ||
    charge.currency !== "cad" || charge.amount !== session.amount_total) return "needs_review";

  const { error: insertError } = await admin.from("pro_discount_refunds").insert({
    ticket_submission_id: order.id, checkout_intent_id: intent.id,
    verification_id: evidenceId, stripe_payment_intent_id: paymentIntentId,
    amount_cents: amounts.amountCents, discount_cents: amounts.discountCents, tax_cents: amounts.taxCents,
  });
  if (insertError && insertError.code !== "23505") throw insertError;
  const { data: record, error: recordError } = await admin.from("pro_discount_refunds").select("*")
    .eq("ticket_submission_id", order.id).single();
  if (recordError) throw recordError;
  if (record.checkout_intent_id !== intent.id || record.stripe_payment_intent_id !== paymentIntentId ||
    record.amount_cents !== amounts.amountCents || record.discount_cents !== amounts.discountCents) return "needs_review";
  if (record.stripe_refund_id) {
    return reconcileProRefund(admin, await stripe.refunds.retrieve(record.stripe_refund_id));
  }
  if (record.status === "needs_review") return "needs_review";

  const refunds = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 });
  const existingAdjustment = refunds.data.find((item: Stripe.Refund) => item.metadata?.fabsy_pro_order === order.id);
  if (existingAdjustment) return reconcileProRefund(admin, existingAdjustment);
  const age = record.attempt_started_at ? Date.now() - Date.parse(record.attempt_started_at) : 0;
  // Stripe only retains idempotency keys for at least 24 hours. After 20 hours,
  // uncertain attempts require reconciliation by an operator, never a new refund.
  if (charge.amount_refunded > 0 || refunds.has_more || refunds.data.some((item: Stripe.Refund) =>
    item.status !== "failed" && item.status !== "canceled") || age > 20 * 60 * 60 * 1000) {
    const { error: holdError } = await admin.from("pro_discount_refunds").update({
      status: "needs_review", last_error_code: "existing_or_uncertain_refund", updated_at: new Date().toISOString(),
    }).eq("ticket_submission_id", order.id).is("stripe_refund_id", null);
    if (holdError) throw holdError;
    return "needs_review";
  }
  if (record.status === "processing" && Date.now() - Date.parse(record.updated_at) < 60_000) return "pending";
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await admin.from("pro_discount_refunds").update({
    status: "processing", attempt_started_at: record.attempt_started_at || now, updated_at: now,
  }).eq("ticket_submission_id", order.id).eq("status", record.status)
    .eq("updated_at", record.updated_at).is("stripe_refund_id", null).select("ticket_submission_id").maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return "pending";
  try {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: amounts.amountCents,
      reason: "requested_by_customer",
      metadata: {
        fabsy_pro_order: String(order.id), fabsy_discount: PRO_COUPON,
        fabsy_pro_verification: evidenceId, fabsy_checkout_intent: intent.id,
      },
    }, { idempotencyKey: "fabsy-pro-refund:" + String(order.id) });
    return await reconcileProRefund(admin, refund);
  } catch {
    // Keep the claim after an uncertain network/provider response. A retry looks
    // up actual Stripe refunds before reusing the exact same idempotency key.
    const { error: uncertainError } = await admin.from("pro_discount_refunds")
      .update({ last_error_code: "stripe_result_uncertain" })
      .eq("ticket_submission_id", order.id).eq("status", "processing").is("stripe_refund_id", null);
    if (uncertainError) throw uncertainError;
    return "pending";
  }
}
