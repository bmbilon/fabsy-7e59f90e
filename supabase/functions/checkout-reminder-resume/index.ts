import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  checkoutReminderEventId, checkoutReminderResumeUrl, reminderResumeLifetimeMs,
} from "../_shared/checkout-reminder-link.ts";
import { reminderChannel, type CheckoutReminderContext } from "../_shared/ticket-checkout-reminder.ts";
import { createTicketCompletionUrl } from "../_shared/ticket-completion.ts";
import { ticketCompletionSecret } from "../_shared/ticket-completion-secret.ts";
import { normalizePortalLookup } from "../_shared/portal-lookup-values.ts";
import { portalLookupSourceHash, savePortalLookup } from "../_shared/initial-disclosure-material.ts";

const origin = "https://fabsy.ca";
const headers = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const userError = "This private checkout is unavailable. Reply to your Fabsy reminder for help.";
const ticketPattern = /^[A-Z][0-9]{8}[A-Z]$/;
const hashPattern = /^[a-f0-9]{64}$/;
const supportedActions = new Set(["read", "save-owner", "save-lookup", "pay"]);
type ResumeContext = CheckoutReminderContext & { document_path: string };
type ReminderCampaign = {
  source_id: string; source_kind: "submission" | "intake" | "order"; ticket_number: string; status: string;
};
type ReminderRecord = {
  status: string;
  sent_at: string | null;
  channel: "email" | "sms";
  recipient: string;
  source_context: ResumeContext;
  payload: { text?: string; body?: string };
  campaign: ReminderCampaign | null;
};
type Input = { token: string; action: string; answer?: unknown; kind?: unknown; value?: unknown; confirmed?: boolean };

const respond = (data: unknown, status = 200) => Response.json(data, { status, headers });
const redirect = (url: string) => respond({ step: "redirect", url });
const complete = () => respond({ step: "complete" });
const unavailable = () => respond({ error: userError }, 404);
const waitForStaff = (ticketNumber: string) => respond({ step: "review", ticketNumber });
const boundedExpiry = (now: number, until: number) => new Date(Math.min(now + 15 * 60_000, until)).toISOString();

export function matchingReminder(event: ReminderRecord, ctx: ResumeContext, link: string, now: number) {
  const sent = Date.parse(event.sent_at || "");
  const campaign = event.campaign;
  if (event.status !== "sent" || !Number.isFinite(sent) || sent > now || now - sent >= reminderResumeLifetimeMs ||
      !campaign || campaign.status === "cancelled" || !ctx.valid || ctx.review_reason ||
      campaign.ticket_number !== ctx.ticket_number || event.source_context?.ticket_number !== ctx.ticket_number ||
      !ctx.document_path || event.source_context?.document_path !== ctx.document_path) return false;
  const text = event.channel === "email" ? event.payload?.text : event.payload?.body;
  if (!text?.split(/\s+/).includes(link)) return false;
  try {
    const contact = reminderChannel(ctx);
    return event.channel === contact.channel && event.recipient === contact.recipient;
  } catch { return false; }
}

function oldRoute(ctx: ResumeContext) {
  return origin + (ctx.paid ? "/consent" : ctx.consented ? "/payment" : "/checkout");
}

async function stripeHandoff(result: Response) {
  const data = await result.json().catch(() => null);
  if (result.ok && data?.order?.paymentStatus === "paid") return complete();
  if (result.ok && typeof data?.url === "string") {
    const url = new URL(data.url);
    if (url.origin === "https://checkout.stripe.com" && !url.username && !url.password) return redirect(url.href);
  }
  return respond({ error: "Checkout could not open. Please try again or reply to your Fabsy reminder for help." }, 409);
}

export async function resumeCheckout(
  db: SupabaseClient, input: Input, secret: string, signingSecret: string, now = Date.now(),
  invokePayment: (body: unknown) => Promise<Response> = body => fetch(
    Deno.env.get("SUPABASE_URL") + "/functions/v1/create-payment",
    { method: "POST", headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(body), signal: AbortSignal.timeout(25_000) },
  ),
) {
  const id = await checkoutReminderEventId(input.token, secret);
  if (!id) return unavailable();
  const link = checkoutReminderResumeUrl(input.token);
  const eventResult = await db.from("ticket_checkout_reminder_events")
    .select("status,sent_at,channel,recipient,payload,source_context,campaign:ticket_checkout_reminder_campaigns(source_id,source_kind,ticket_number,status)")
    .eq("id", id).eq("status", "sent").maybeSingle();
  if (eventResult.error) throw new Error("REMINDER_RESUME_READ_FAILED");
  const event = eventResult.data as unknown as ReminderRecord | null;
  if (!event?.campaign) return unavailable();
  const campaign = event.campaign;
  const result = await db.rpc("ticket_checkout_reminder_context", { p_kind: campaign.source_kind, p_id: campaign.source_id });
  if (result.error || !result.data) throw new Error("REMINDER_RESUME_CONTEXT_FAILED");
  const ctx = result.data as ResumeContext;
  if (!matchingReminder(event, ctx, link, now)) return unavailable();
  if (ctx.paid && ctx.consented) return complete();
  const expiry = Date.parse(event.sent_at!) + reminderResumeLifetimeMs;

  if (campaign.source_kind === "intake") {
    if (input.action !== "read") return unavailable();
    const { data, error } = await db.from("ticket_intake_drafts").select("access_token_hash,expires_at,ticket_document_path")
      .eq("id", campaign.source_id).is("deleted_at", null).maybeSingle();
    if (error) throw new Error("REMINDER_RESUME_DRAFT_READ_FAILED");
    const draftExpiry = Date.parse(data?.expires_at || "");
    if (data?.ticket_document_path !== ctx.document_path || !Number.isFinite(draftExpiry) || draftExpiry <= now ||
        !hashPattern.test(data.access_token_hash || "")) return redirect(oldRoute(ctx));
    return redirect(await createTicketCompletionUrl({ draftId: campaign.source_id, accessTokenHash: data.access_token_hash,
      expiresAt: new Date(Math.min(expiry, draftExpiry)).toISOString(), secret: signingSecret }));
  }

  if (campaign.source_kind === "order") {
    if (!ctx.consented || ctx.paid) return input.action === "read" ? redirect(oldRoute(ctx)) : unavailable();
    const { data, error } = await db.from("service_orders").select("access_token_hash,total_cents,ticket_number,ticket_document_path,mode")
      .eq("id", campaign.source_id).maybeSingle();
    if (error) throw new Error("REMINDER_RESUME_ORDER_READ_FAILED");
    if (!data || data.mode === "consent" || data.ticket_document_path !== ctx.document_path || data.ticket_number !== ctx.ticket_number ||
        !hashPattern.test(data.access_token_hash || "")) return unavailable();
    if (input.action === "read") return respond({ step: "payment", ticketNumber: ctx.ticket_number, amountCents: data.total_cents });
    if (input.action !== "pay") return unavailable();
    const checkoutEndpoint = new URL("/functions/v1/service-checkout", Deno.env.get("SUPABASE_URL"));
    const checkout = await fetch(checkoutEndpoint, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(25_000),
      headers: { "Content-Type": "application/json", Origin: origin,
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ action: "resume-reminder-checkout", orderId: campaign.source_id,
        accessHash: data.access_token_hash, returnUrl: link }),
    });
    return stripeHandoff(checkout);
  }

  if (!ctx.consented || ctx.paid) return input.action === "read" ? redirect(oldRoute(ctx)) : unavailable();
  const submission = await db.from("ticket_submissions")
    .select("id,client_id,first_name,last_name,email,ticket_number,ticket_type,intake_review_status,intake_mode,intake_bundle_requested,registered_owner_on_offence_date,date_of_birth,drivers_license,ticket_document_path,consent_form_path,representation_access_token_hash,intake_consent,representation_paid_at")
    .eq("id", campaign.source_id).eq("status", "awaiting_payment").is("deleted_at", null).maybeSingle();
  if (submission.error) throw new Error("REMINDER_RESUME_CASE_READ_FAILED");
  const ticket = submission.data;
  if (!ticket || ticket.ticket_number !== ctx.ticket_number || ticket.ticket_document_path !== ctx.document_path ||
      ticket.email.trim().toLowerCase() !== ctx.email || ticket.representation_paid_at ||
      ticket.intake_consent?.accepted !== true || !hashPattern.test(ticket.representation_access_token_hash || "") ||
      ticket.consent_form_path !== ticket.id + "/consent-form-" + ticket.representation_access_token_hash.slice(0, 16) + ".pdf") return unavailable();
  const ticketNumber = ticket.ticket_number;
  if (!ticketPattern.test(ticketNumber) || (ticket.intake_mode === "photo_only" && ticket.intake_review_status !== "ready")) return waitForStaff(ticketNumber);

  if (ticket.ticket_type === "photo_radar" && ticket.registered_owner_on_offence_date !== "yes") {
    if (ticket.registered_owner_on_offence_date) return waitForStaff(ticketNumber);
    if (input.action === "read") return respond({ step: "owner", ticketNumber });
    if (input.action !== "save-owner" || typeof input.answer !== "string" ||
        !["yes", "sold_before", "stolen"].includes(input.answer)) return unavailable();
    const saved = await db.from("ticket_submissions").update({ registered_owner_on_offence_date: input.answer })
      .eq("id", ticket.id).eq("status", "awaiting_payment").eq("ticket_number", ticketNumber)
      .eq("ticket_document_path", ctx.document_path).eq("representation_access_token_hash", ticket.representation_access_token_hash)
      .eq("email", ticket.email).is("deleted_at", null).is("representation_paid_at", null).is("registered_owner_on_offence_date", null)
      .select("id").maybeSingle();
    if (saved.error || !saved.data) return respond({ error: "Could not save your ownership answer. Refresh the page and try again." }, 409);
    if (input.answer !== "yes") return waitForStaff(ticketNumber);
  } else if (input.action === "save-owner") return unavailable();

  const verification = await db.from("case_portal_verifications").select("ticket_number,source_path,source_sha256")
    .eq("submission_id", ticket.id).is("revoked_at", null).maybeSingle();
  if (verification.error) throw new Error("REMINDER_RESUME_LOOKUP_READ_FAILED");
  const recorded = verification.data;
  if (recorded && (recorded.ticket_number !== ticketNumber || recorded.source_path !== ctx.document_path ||
      recorded.source_sha256 !== await portalLookupSourceHash(db, ctx.document_path))) return waitForStaff(ticketNumber);
  const hasDetail = await db.rpc("case_has_portal_lookup", { p_id: ticket.id });
  if (hasDetail.error) throw new Error("REMINDER_RESUME_LOOKUP_READ_FAILED");

  const checkoutAccess = async () => {
    const lookupUrl = await createTicketCompletionUrl({ draftId: ticket.id,
      accessTokenHash: ticket.representation_access_token_hash, expiresAt: boundedExpiry(now, expiry), secret: signingSecret });
    return new URLSearchParams(new URL(lookupUrl).hash.slice(1)).get("access")!;
  };
  if (hasDetail.data !== true) {
    if (input.action === "read" || input.action === "save-owner") return respond({ step: "lookup", ticketNumber });
    if (input.action !== "save-lookup" || input.confirmed !== true) return respond({ error: "Save your ticket lookup detail before continuing." }, 409);
    let value: string;
    try { value = normalizePortalLookup(input.kind, input.value); }
    catch { return respond({ error: "Enter a valid licence plate, driver’s licence number, or date of birth." }, 400); }
    await savePortalLookup(db, { submission_id: ticket.id, kind: input.kind, value, access_token: await checkoutAccess(),
      expected_ticket: ticketNumber, expected_path: ctx.document_path });
  } else if (input.action === "save-lookup") return respond({ step: "payment", ticketNumber });

  if (input.action !== "pay") return respond({ step: "payment", ticketNumber });
  // Reuse the product already selected on an open checkout, or the saved intake choice.
  const existing = await db.from("idr_checkout_intents").select("id,checkout_kind")
    .eq("ticket_submission_id", ticket.id).in("checkout_kind", ["ticket_only", "ticket_with_addon", "photo_radar"])
    .in("status", ["creating", "open"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing.error) throw new Error("REMINDER_RESUME_PAYMENT_READ_FAILED");
  const includeIdrAddon = ticket.ticket_type !== "photo_radar" &&
    (existing.data ? existing.data.checkout_kind === "ticket_with_addon" : ticket.intake_bundle_requested === true);
  return stripeHandoff(await invokePayment({ submissionId: ticket.id, clientId: ticket.client_id,
    accessToken: await checkoutAccess(), includeIdrAddon,
    ...(includeIdrAddon ? { idrOrderId: existing.data?.id || crypto.randomUUID() } : {}),
    formData: { firstName: ticket.first_name, lastName: ticket.last_name, email: ticket.email, ticketNumber },
  }));
}

export async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return respond({ error: userError }, 405);
  try {
    const input = await request.json().catch(() => null);
    if (!input || typeof input.token !== "string" || !supportedActions.has(input.action)) return unavailable();
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } });
    return await resumeCheckout(db, input, Deno.env.get("IDR_CRON_SECRET") || "", ticketCompletionSecret());
  } catch {
    // Never include an actual identifier, private link, or provider response in logs or error bodies.
    return respond({ error: "We could not reopen your saved checkout. Please try again or reply to your Fabsy reminder." }, 503);
  }
}
if (import.meta.main) Deno.serve(handler);
