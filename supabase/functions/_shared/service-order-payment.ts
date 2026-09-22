import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { validateServicePayment } from "./service-checkout.ts";

// Used by signed webhooks and a server-to-Stripe status check after redirect.
// Browser success parameters alone can never mark an order paid.
export async function recordServiceOrderPayment(admin: SupabaseClient, session: Parameters<typeof validateServicePayment>[1] & {
  payment_intent?: string | { id?: string } | null;
}) {
  const { data: order, error } = await admin.from("service_orders").select("*").eq("id", session.metadata?.service_order_id).single();
  if (error || !order) throw new Error("Service order not found.");
  validateServicePayment(order, session);
  if (["refunded", "disputed"].includes(order.payment_status)) return;
  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntent?.startsWith("pi_")) throw new Error("Payment reference is missing.");
  const { error: paidError } = await admin.from("service_orders").update({ payment_status: "paid", paid_at: order.paid_at || new Date().toISOString(),
    stripe_session_id: session.id, stripe_payment_intent_id: paymentIntent }).eq("id", order.id).eq("checkout_attempt", order.checkout_attempt);
  if (paidError) throw paidError;
  if (["insurance_report", "bundle"].includes(order.product)) {
    const { error: reportError } = await admin.from("idr_orders").upsert({ id: order.id, client_id: order.client_id,
      ticket_submission_id: order.ticket_submission_id, type: order.product === "bundle" ? "addon" : "standalone",
      price_paid: order.product === "bundle" ? 31 : 49, status: "awaiting_abstract", stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntent, paid_at: order.paid_at || new Date().toISOString(), preferred_locale: "en" }, { onConflict: "id", ignoreDuplicates: true });
    if (reportError) throw reportError;
  }
  const { error: matchError } = await admin.rpc("match_service_order", { p_id: order.id });
  if (matchError) throw matchError;
  // A case may need identity/document review first; the paid order remains in the
  // staff queue. Do not roll back real payment evidence if that case is not ready.
  const { error: applyError } = await admin.rpc("apply_service_order", { p_id: order.id });
  if (applyError) console.error("Service order awaits case review", order.id);
}
