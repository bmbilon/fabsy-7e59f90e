import { type UploadSmsConfig, UploadSmsSendError, validUploadSmsConfig } from "./ticket-upload-sms.ts";

export const PAYMENT_SMS_TO = "+14036695353";
type Checkout = {
  id: string; livemode: boolean; payment_status: string; mode: string | null;
  amount_total: number | null; currency: string | null;
  payment_intent?: string | { id?: string } | null;
  metadata: Record<string, string> | null;
};
type PaidEvent = { id: string; type: string; created: number; livemode: boolean; data: { object: Checkout } };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Invoke only after the signed webhook's existing product fulfillment succeeds. */
export function paymentSmsFromVerifiedCheckout(event: PaidEvent, session: Checkout) {
  if (!event.livemode || !session.livemode || !["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)
    || session.payment_status !== "paid" || session.mode !== "payment") return null;
  const metadata = session.metadata || {};
  const kind = metadata.fabsy_checkout_kind || metadata.idr_checkout_kind || (metadata.idr_order_id ? "idr_only" : "");
  if (!["ticket_only", "ticket_with_addon", "photo_radar", "ticket_assessment", "idr_only"].includes(kind)) return null;
  const orderId = ["ticket_with_addon", "idr_only"].includes(kind) ? metadata.idr_order_id : null;
  const intentId = orderId || metadata.checkout_intent_id;
  const submissionId = kind === "ticket_assessment" ? metadata.assessment_submission_id
    : metadata.ticket_submission_id || metadata.submission_id || null;
  const clientId = orderId ? metadata.idr_client_id || null : metadata.client_id;
  const paymentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (event.data.object.id !== session.id || !/^evt_[A-Za-z0-9]+$/.test(event.id)
    || !/^cs_live_[A-Za-z0-9]+$/.test(session.id) || !/^pi_[A-Za-z0-9]+$/.test(paymentId || "")
    || !Number.isSafeInteger(event.created) || event.created <= 0
    || !Number.isSafeInteger(session.amount_total) || session.amount_total! <= 0
    || session.currency?.toLowerCase() !== "cad" || !uuid.test(intentId || "")
    || (submissionId !== null && !uuid.test(submissionId || ""))
    || (clientId !== null && !uuid.test(clientId || ""))
    || (kind !== "idr_only" && !submissionId)) throw new Error("payment_sms_checkout_invalid");
  return {
    event_id: event.id, event_type: event.type, occurred_at: new Date(event.created * 1000).toISOString(),
    livemode: true, checkout_session_id: session.id, payment_intent_id: paymentId,
    amount_total: session.amount_total, currency: session.currency.toUpperCase(), checkout_kind: kind,
    intent_id: intentId, submission_id: submissionId, client_id: clientId, order_id: orderId,
  };
}

export async function enqueuePaymentSms(
  db: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> },
  event: PaidEvent, session: Checkout,
) {
  const evidence = paymentSmsFromVerifiedCheckout(event, session);
  if (!evidence) return;
  const { data, error } = await db.rpc("enqueue_verified_payment_sms", { p_event: evidence });
  if (error || !data) throw new Error("payment_sms_enqueue_failed");
}

export type PaymentSms = {
  id: string; claim_id: string; amount_total: number; currency: string;
  client_name: string; ticket_number: string;
};

export function paymentSmsBody(item: Pick<PaymentSms, "amount_total" | "currency" | "client_name" | "ticket_number">) {
  if (!Number.isSafeInteger(item.amount_total) || item.amount_total <= 0 || item.currency !== "CAD"
    || typeof item.client_name !== "string" || !item.client_name.trim() || item.client_name.length > 201
    || Array.from(item.client_name).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    || typeof item.ticket_number !== "string" || !/^[A-Z0-9]{5,30}$/.test(item.ticket_number) || !/[0-9]/.test(item.ticket_number)) {
    throw new UploadSmsSendError("payment_snapshot_invalid", "failed");
  }
  const amount = new Intl.NumberFormat("en-CA", { style: "currency", currency: item.currency }).format(item.amount_total / 100);
  return `💵 Payment received: ${amount} ${item.currency} — ${item.client_name} — Ticket ${item.ticket_number} 💵`;
}

export async function sendPaymentSms(config: UploadSmsConfig, item: PaymentSms, fetcher: typeof fetch = fetch): Promise<string> {
  if (!validUploadSmsConfig(config)) throw new UploadSmsSendError("configuration_missing", "failed");
  const body = paymentSmsBody(item);
  let response: Response;
  try {
    response = await fetcher(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
      method: "POST", redirect: "error", headers: { Authorization: `Basic ${btoa(`${config.accountSid}:${config.authToken}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: PAYMENT_SMS_TO, From: config.from, Body: body }), signal: AbortSignal.timeout(10000),
    });
  } catch { throw new UploadSmsSendError("provider_network_error", "indeterminate"); }
  if (!response.ok) throw new UploadSmsSendError(`provider_http_${response.status}`, response.status >= 400 && response.status < 500 && response.status !== 408 ? "failed" : "indeterminate");
  const value = await response.json().catch(() => ({}));
  if (!value || typeof value !== "object" || typeof value.sid !== "string" || !/^SM[a-fA-F0-9]{32}$/.test(value.sid)) throw new UploadSmsSendError("provider_response_invalid", "indeterminate");
  return value.sid;
}

export async function processPaymentSms(deps: {
  claim: () => Promise<PaymentSms[]>; send: (item: PaymentSms) => Promise<string>;
  finish: (item: PaymentSms, outcome: string, sid: string | null, code: string | null) => Promise<boolean>;
}) {
  const result = { claimed: 0, accepted: 0, failed: 0, indeterminate: 0, recordingFailed: 0 };
  // Claim one at a time: a slow provider call never consumes another row's lease.
  for (let i = 0; i < 5; i++) {
    const item = (await deps.claim())[0];
    if (!item) break;
    result.claimed++;
    let outcome: "accepted" | "failed" | "indeterminate" = "indeterminate";
    let sid: string | null = null, code: string | null = null;
    try { sid = await deps.send(item); outcome = "accepted"; }
    catch (error) { outcome = error instanceof UploadSmsSendError ? error.outcome : "indeterminate"; code = error instanceof UploadSmsSendError ? error.code : "payment_sms_attempt_error"; }
    try { if (await deps.finish(item, outcome, sid, code)) result[outcome]++; else result.recordingFailed++; }
    catch { result.recordingFailed++; }
  }
  return result;
}
