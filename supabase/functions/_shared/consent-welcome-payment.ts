import { type ConsentCheckout, type ConsentWelcomeContext, type ConsentWelcomePayment, UUID } from "./consent-welcome-types.ts";

const representationKinds = new Set(["ticket_only", "ticket_with_addon", "photo_radar"]);
const sessionPattern = /^cs_live_[A-Za-z0-9_]{8,240}$/;
const paymentPattern = /^pi_[A-Za-z0-9]{8,240}$/;
type StripeSession = {
  id?: string; livemode?: boolean; mode?: string; status?: string; payment_status?: string;
  client_reference_id?: string; metadata?: Record<string, string> | null; expires_at?: number;
  payment_intent?: string | { id?: string; status?: string; livemode?: boolean } | null;
};
const unknown = (): ConsentWelcomePayment => ({ state: "unknown", paymentUrl: null });

/** Provider reads are fixed-origin and read-only. Unknown never means unpaid. */
export async function consentWelcomePayment(
  context: ConsentWelcomeContext, stripeKey: string, fetcher: typeof fetch = fetch, now = Date.now(), clock: () => number = Date.now,
): Promise<ConsentWelcomePayment> {
  if (!stripeKey || context.payment_unknown || !UUID.test(context.submission_id || "") || !UUID.test(context.client_id || "")
    || !Array.isArray(context.checkout_sessions)) return unknown();
  const references = context.checkout_sessions.filter(item => representationKinds.has(item.checkout_kind));
  if (!references.length) {
    return context.checkout_sessions.length === 0 && context.payment_unknown === false && context.submission_status === "awaiting_payment"
      && context.payment_recorded === false && !context.representation_paid_at && !context.representation_checkout_session_id
      && !context.representation_payment_intent_id ? { state: "unpaid", paymentUrl: null } : unknown();
  }
  if (references.length > 10 || references.some(item => item.status === "creating")) return unknown();
  const seen = new Set<string>();
  const verifiedOpen = new Map<string, { reference: ConsentCheckout; session: StripeSession }>();
  const deadline = clock() + 20000;
  const signal = () => AbortSignal.timeout(Math.max(1, Math.min(10000, deadline - clock())));
  for (const reference of references) {
    if (clock() >= deadline) return unknown();
    const id = reference.stripe_checkout_session_id;
    if (!UUID.test(reference.id) || reference.client_id !== context.client_id || reference.ticket_submission_id !== context.submission_id
      || !id || !sessionPattern.test(id) || seen.has(id)) return unknown();
    seen.add(id);
    let session: StripeSession;
    try {
      const response = await fetcher(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}?expand%5B%5D=payment_intent`, {
        headers: { Authorization: `Bearer ${stripeKey}` }, signal: signal(), redirect: "error",
      });
      const raw = await response.json();
      if (!response.ok || !raw || typeof raw !== "object") return unknown();
      session = raw;
    } catch { return unknown(); }
    const metadata = session.metadata || {};
    const storedClient = reference.checkout_kind === "ticket_with_addon" ? metadata.idr_client_id : metadata.client_id;
    const storedIntent = reference.checkout_kind === "ticket_with_addon" ? metadata.idr_order_id : metadata.checkout_intent_id;
    const storedKind = metadata.fabsy_checkout_kind || metadata.idr_checkout_kind;
    if (session.id !== id || session.livemode !== true || session.mode !== "payment"
      || session.client_reference_id !== context.submission_id || storedClient !== context.client_id
      || storedIntent !== reference.id || storedKind !== reference.checkout_kind
      || (metadata.ticket_submission_id || metadata.submission_id) !== context.submission_id
      || !["paid", "unpaid", "no_payment_required"].includes(session.payment_status || "")
      || !["open", "complete", "expired"].includes(session.status || "")) return unknown();
    const paymentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (context.representation_checkout_session_id === id && context.representation_payment_intent_id
      && paymentId !== context.representation_payment_intent_id) return unknown();
    if (session.payment_status === "paid") return { state: "paid", paymentUrl: null };
    // Completed delayed methods and no-charge sessions must not get a demand.
    if (session.status === "complete" || session.payment_status === "no_payment_required" || reference.status === "paid") return unknown();
    if (paymentId) {
      if (!paymentPattern.test(paymentId)) return unknown();
      let payment: { id?: string; status?: string; livemode?: boolean } | null = typeof session.payment_intent === "object" ? session.payment_intent : null;
      if (!payment?.status) {
        if (clock() >= deadline) return unknown();
        try {
          const response = await fetcher(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentId)}`, {
            headers: { Authorization: `Bearer ${stripeKey}` }, signal: signal(), redirect: "error",
          });
          payment = response.ok ? await response.json() : null;
        } catch { payment = null; }
      }
      if (!payment || payment.id !== paymentId || payment.livemode !== true) return unknown();
      if (payment.status === "succeeded") return { state: "paid", paymentUrl: null };
      if (!["requires_payment_method", "requires_confirmation", "requires_action", "canceled"].includes(payment.status || "")) return unknown();
    }
    if (session.status === "open" && Number.isFinite(session.expires_at) && session.expires_at! * 1000 > now) verifiedOpen.set(id, { reference, session });
  }
  if (clock() >= deadline || context.payment_recorded || context.representation_paid_at
    || (context.representation_checkout_session_id && !seen.has(context.representation_checkout_session_id))
    || (context.representation_payment_intent_id && !context.representation_checkout_session_id)) return unknown();
  const link = context.payment_link;
  let paymentUrl: string | null = null;
  if (link && /^[A-Za-z0-9_-]{22}$/.test(link.code) && Date.parse(link.expires_at) > now) {
    const open = verifiedOpen.get(link.stripe_checkout_session_id);
    if (open && open.reference.id === link.checkout_intent_id) paymentUrl = `https://fabsy.ca/pay/${link.code}`;
  }
  return { state: "unpaid", paymentUrl };
}
