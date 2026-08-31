import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { getFabsyEmailSignature } from "../_shared/email-signature.ts";
import { sendResendEmail } from "../_shared/resend-email.ts";
import { clientReferralCode } from "../_shared/referrals.ts";
import { REFERRAL_INVITATION, REFERRAL_EMAIL_TERMS, referralInvitationAvailability, referralInvitationHtml, resolutionCopy, resolutionPreviewFingerprint } from "../_shared/resolution-email.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const siteUrl = (Deno.env.get("SITE_URL") || "https://fabsy.ca").replace(/\/$/, "");
const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
const admin = createClient(supabaseUrl, serviceRoleKey);
const EMAIL_LEASE_MS = 15 * 60 * 1000;

interface EmailEvent {
  id: string;
  status: "pending" | "processing" | "sent" | "failed";
  attempts: number;
  claimed_at: string | null;
  created_at: string;
  referral_invite_included: boolean;
  resolution_payload: { subject?: string; html?: string; fingerprint?: string } | null;
}

const allowedOrigins = new Set([
  siteUrl,
  "https://www.fabsy.ca",
  "https://fabsy-execom.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
]);

const corsHeaders = (req: Request) => ({
  "Access-Control-Allow-Origin": allowedOrigins.has(req.headers.get("origin") || "")
    ? req.headers.get("origin")!
    : siteUrl,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
});

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

async function requireStaff(req: Request) {
  const authorization = req.headers.get("authorization");
  if (!authorization) throw new Error("Missing authorization");
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new Error("Invalid authorization");
  const { data: role, error: roleError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .in("role", ["admin", "case_manager"])
    .limit(1)
    .maybeSingle();
  if (roleError || !role) throw new Error("Staff access required");
  return data.user;
}

async function claimEmailEvent(event: EmailEvent) {
  const claimedAt = new Date().toISOString();
  const staleBefore = new Date(Date.now() - EMAIL_LEASE_MS).toISOString();
  const claimValues = {
    status: "processing",
    claimed_at: claimedAt,
    last_error: null,
  };

  let result = await admin.from("idr_email_events").update(claimValues)
    .eq("id", event.id)
    .in("status", ["pending", "failed"])
    .select("id,attempts")
    .maybeSingle();
  if (result.error) throw result.error;

  if (!result.data && event.status === "processing") {
    result = await admin.from("idr_email_events").update(claimValues)
      .eq("id", event.id)
      .eq("status", "processing")
      .lte("claimed_at", staleBefore)
      .is("last_error", null)
      .select("id,attempts")
      .maybeSingle();
    if (result.error) throw result.error;
  }
  if (!result.data && event.status === "processing" && !event.claimed_at) {
    result = await admin.from("idr_email_events").update(claimValues)
      .eq("id", event.id)
      .eq("status", "processing")
      .is("claimed_at", null)
      .is("last_error", null)
      .select("id,attempts")
      .maybeSingle();
    if (result.error) throw result.error;
  }
  return result.data ? { ...result.data, claimedAt } : null;
}

serve(async (req) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers });

  try {
    const staff = await requireStaff(req);
    const { submissionId, event, preview, previewFingerprint, includeReferralInvite, referralConsentConfirmed } = await req.json();
    if (typeof submissionId !== "string" || !/^[0-9a-f-]{36}$/i.test(submissionId)
      || !["verdict_set", "conviction_stands", "case_resolved"].includes(event)) {
      return new Response(JSON.stringify({ error: "Invalid case update request" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const { data: submission, error: submissionError } = await admin
      .from("ticket_submissions")
      .select("id,ticket_number,violation,status,verdict,case_outcome,client_id,preferred_locale,ticket_type,service_type,clients(first_name,email)")
      .eq("id", submissionId)
      .single();
    if (submissionError || !submission) throw new Error("Ticket submission not found");
    if (submission.ticket_type === "photo_radar" && event !== "case_resolved") {
      return new Response(JSON.stringify({ success: true, skipped: "photo_radar_no_insurance_impact" }), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
    if (submission.status === "awaiting_payment") {
      return new Response(JSON.stringify({ error: "Payment must be confirmed before sending a case assessment" }), {
        status: 409,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
    if (event === "verdict_set" && !["winnable", "reducible", "unwinnable"].includes(submission.verdict)) {
      return new Response(JSON.stringify({ error: "The case does not have a valid verdict" }), {
        status: 409,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
    if (event === "conviction_stands" && submission.case_outcome !== "conviction_stands") {
      return new Response(JSON.stringify({ error: "The case outcome is not conviction_stands" }), {
        status: 409,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const client = Array.isArray(submission.clients) ? submission.clients[0] : submission.clients;
    if (!client?.email) throw new Error("Client email is unavailable");

    let savedOutcome = submission.case_outcome;
    let resolution: ReturnType<typeof resolutionCopy> = null;
    let invitationAvailable = { available: false, reason: "Referral invitations apply only to a final case update." as string | null };
    const mailingAddress = Deno.env.get("FABSY_BUSINESS_MAILING_ADDRESS") || "";
    const includeInvitation = event === "case_resolved" && includeReferralInvite === true;
    let currentPreviewFingerprint: string | null = null;
    if (event === "case_resolved") {
      if (submission.service_type !== "representation") throw new Error("A paid representation file is required");
      const { data: paidIntent, error: paidError } = await admin.from("idr_checkout_intents")
        .select("created_at")
        .eq("ticket_submission_id", submissionId).eq("client_id", submission.client_id).eq("status", "paid")
        .in("checkout_kind", submission.ticket_type === "photo_radar" ? ["photo_radar"] : ["ticket_only", "ticket_with_addon"])
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (paidError) throw paidError;
      if (!paidIntent) return new Response(JSON.stringify({ error: "A confirmed representation payment is required before sending a resolution update." }), { status: 409, headers: { ...headers, "Content-Type": "application/json" } });
      if (submission.ticket_type === "photo_radar") {
        const { data: ate, error: ateError } = await admin.from("ate_reviews").select("outcome,resolved_at")
          .eq("ticket_submission_id", submissionId).maybeSingle();
        if (ateError) throw ateError;
        savedOutcome = ate?.resolved_at ? ate.outcome : null;
      }
      resolution = resolutionCopy(submission.ticket_type, savedOutcome);
      if (!resolution) return new Response(JSON.stringify({ error: "Save a final case outcome before reviewing or sending its resolution update." }), { status: 409, headers: { ...headers, "Content-Type": "application/json" } });
      invitationAvailable = referralInvitationAvailability({
        enabled: Deno.env.get("REFERRAL_EMAIL_ENABLED") === "true", mailingAddress,
        checkoutCreatedAt: paidIntent.created_at,
      });
      currentPreviewFingerprint = await resolutionPreviewFingerprint({
        submissionId, outcome: savedOutcome, recipient: client.email, firstName: client.first_name,
        clientId: submission.client_id, ticketNumber: submission.ticket_number, violation: submission.violation,
        ticketType: submission.ticket_type, locale: submission.preferred_locale, resolution, siteUrl,
        signature: getFabsyEmailSignature(), referralInvitation: REFERRAL_INVITATION, referralTerms: REFERRAL_EMAIL_TERMS,
        invitationAvailable: invitationAvailable.available, mailingAddress,
      });
      if (preview === true) {
        return new Response(JSON.stringify({ success: true, preview: {
          recipient: client.email, ...resolution, outcome: savedOutcome, fingerprint: currentPreviewFingerprint,
          referralInvitation: REFERRAL_INVITATION, referralTerms: REFERRAL_EMAIL_TERMS,
          invitationAvailable: invitationAvailable.available, invitationUnavailableReason: invitationAvailable.reason,
        } }), { headers: { ...headers, "Content-Type": "application/json" } });
      }
      if (typeof previewFingerprint !== "string" || previewFingerprint !== currentPreviewFingerprint) {
        return new Response(JSON.stringify({ error: "The saved result, recipient or email content changed. Review a fresh resolution preview before sending." }), { status: 409, headers: { ...headers, "Content-Type": "application/json" } });
      }
      if (includeInvitation && (!invitationAvailable.available || referralConsentConfirmed !== true)) {
        return new Response(JSON.stringify({ error: invitationAvailable.reason || "Confirm this client's consent and unsubscribe preferences before including a referral invitation." }), { status: 409, headers: { ...headers, "Content-Type": "application/json" } });
      }
    } else if (preview === true) {
      return new Response(JSON.stringify({ error: "Preview is available only for resolution updates." }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
    }

    let eventType = event === "case_resolved" ? "case_resolved" : "verdict_set";
    if (event === "conviction_stands") {
      const { data: existingOrder, error: existingOrderError } = await admin
        .from("idr_orders")
        .select("id")
        .eq("ticket_submission_id", submissionId)
        .limit(1)
        .maybeSingle();
      if (existingOrderError) throw existingOrderError;
      if (existingOrder) {
        return new Response(JSON.stringify({ success: true, skipped: "idr_already_purchased" }), {
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }
      eventType = "conviction_stands_offer";
    }

    const eventVariant = eventType === "verdict_set" ? submission.verdict : eventType === "case_resolved" ? savedOutcome : "conviction_stands";
    const eventKey = `ticket:${submissionId}:${eventType}:${eventVariant}`;

    const caseUrl = `${siteUrl}/portal/cases/${encodeURIComponent(submissionId)}`;
    const isDamageControlOffer = eventType !== "case_resolved" && (eventType === "conviction_stands_offer" || submission.verdict === "unwinnable");
    let subject = resolution?.subject || (eventType === "conviction_stands_offer"
      ? "Your Fabsy damage-control report option"
      : "Your Fabsy ticket assessment is ready");
    const heading = resolution?.heading || (eventType === "conviction_stands_offer"
      ? "Your case result and the next practical step"
      : "Your ticket assessment is ready");
    const mainCopy = resolution?.mainCopy || (eventType === "conviction_stands_offer"
      ? "The case outcome records the conviction standing. Fabsy's optional $49 Insurance Impact & Renewal Planning Report can map source-backed conviction-impact scenarios, aging dates and renewal-planning questions."
      : submission.verdict === "unwinnable"
        ? "Fabsy's review does not identify a supported pre-trial path. Your Rapid Resolution purchase remains the core service. The private case page also explains the optional Insurance Impact & Renewal Planning Report."
        : "Open your private case page to review the verdict and the next steps for your active ticket defense service. This assessment is not a promise of dismissal, a lower fine, or fewer demerits.");
    let invitation = "";
    if (includeInvitation) {
      const code = await clientReferralCode(admin, submission.client_id);
      if (!code) throw new Error("Unable to prepare the client's referral link. Send the resolution update without an invitation or retry after reviewing the referral account.");
      invitation = referralInvitationHtml(code, mailingAddress, siteUrl);
    }
    let html = `
      <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #1f2937;">
        <h1 style="font-size: 26px;">${heading}</h1>
        <p>Hi ${escapeHtml(client.first_name)},</p>
        <p style="line-height: 1.65;">${mainCopy}</p>
        <p><strong>Ticket:</strong> ${escapeHtml(submission.ticket_number)}<br><strong>Violation:</strong> ${escapeHtml(submission.violation)}</p>
        <p style="margin: 28px 0;"><a href="${caseUrl}" style="background: #7c3aed; color: white; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-weight: 700;">Open your private case page</a></p>
        ${isDamageControlOffer ? '<p style="font-size: 13px; color: #6b7280; line-height: 1.5;">This report is consumer research based on publicly available information. Fabsy is not an insurance agent or broker and does not sell, quote, or place insurance.</p>' : ""}
        ${invitation}
        ${getFabsyEmailSignature()}
      </div>`;

    const { error: seedEventError } = await admin.from("idr_email_events").upsert({
      event_key: eventKey,
      ticket_submission_id: submissionId,
      event_type: eventType,
      recipient_email: client.email,
      ...(eventType === "case_resolved" ? {
        requested_by: staff.id, referral_invite_included: includeInvitation,
        resolution_payload: { subject, html, fingerprint: currentPreviewFingerprint },
      } : {}),
    }, { onConflict: "event_key", ignoreDuplicates: true });
    if (seedEventError) throw seedEventError;
    const { data: existingEvent, error: eventLookupError } = await admin
      .from("idr_email_events")
      .select("id,status,attempts,claimed_at,created_at,referral_invite_included,resolution_payload")
      .eq("event_key", eventKey)
      .single();
    if (eventLookupError || !existingEvent) throw new Error("Unable to reserve the client email event");
    if (existingEvent.status === "sent") {
      return new Response(JSON.stringify({ success: true, skipped: "already_sent" }), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    if (eventType === "case_resolved") {
      if (existingEvent.referral_invite_included !== includeInvitation) {
        return new Response(JSON.stringify({ error: "An earlier send attempt reserved different referral-invitation preferences. Review and reconcile that attempt before retrying." }), { status: 409, headers: { ...headers, "Content-Type": "application/json" } });
      }
      const previouslyAttempted = existingEvent.attempts > 0 || existingEvent.status === "processing" || Boolean(existingEvent.claimed_at);
      if (previouslyAttempted && Date.now() - Date.parse(existingEvent.created_at) > 20 * 60 * 60 * 1000) {
        return new Response(JSON.stringify({ error: "This older email attempt requires provider reconciliation before retrying, to avoid a duplicate message." }), { status: 409, headers: { ...headers, "Content-Type": "application/json" } });
      }
      const payload = existingEvent.resolution_payload as EmailEvent["resolution_payload"];
      if (!payload || typeof payload.subject !== "string" || typeof payload.html !== "string") throw new Error("The reserved resolution email is incomplete; staff reconciliation is required.");
      if (payload.fingerprint !== currentPreviewFingerprint) {
        return new Response(JSON.stringify({ error: "An earlier send attempt reserved different content. Reconcile that email event before sending a changed message." }), { status: 409, headers: { ...headers, "Content-Type": "application/json" } });
      }
      subject = payload.subject;
      html = payload.html;
    }

    const emailEvent = await claimEmailEvent(existingEvent as EmailEvent);
    if (!emailEvent) {
      return new Response(JSON.stringify({ success: true, skipped: "already_processing" }), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    let providerAccepted = false;
    try {
      await sendResendEmail(resendApiKey, {
        localization: { preferredLocale: submission.preferred_locale, template: "case_update" },
        from: "Fabsy <hello@fabsy.ca>",
        reply_to: "hello@fabsy.ca",
        to: [client.email],
        subject,
        html,
      }, `idr-case/${eventKey}`);
      providerAccepted = true;
      const { data: sentEvent, error: sentEventError } = await admin.from("idr_email_events").update({
        status: "sent",
        attempts: Number(emailEvent.attempts || 0) + 1,
        sent_at: new Date().toISOString(),
        claimed_at: null,
      })
        .eq("id", emailEvent.id)
        .eq("claimed_at", emailEvent.claimedAt)
        .select("id")
        .maybeSingle();
      if (sentEventError || !sentEvent) {
        throw sentEventError || new Error("Case email claim was lost before completion");
      }
      if (eventType === "conviction_stands_offer") {
        const { error: offerUpdateError } = await admin.from("ticket_submissions").update({ idr_offer_sent_at: new Date().toISOString() }).eq("id", submissionId);
        if (offerUpdateError) console.error("Case offer timestamp update failed", offerUpdateError);
      }
    } catch (sendError) {
      await admin.from("idr_email_events").update({
        status: providerAccepted ? "processing" : "failed",
        attempts: Number(emailEvent.attempts || 0) + 1,
        last_error: providerAccepted
          ? "Email provider accepted delivery. Database completion requires manual reconciliation."
          : sendError instanceof Error ? sendError.message.slice(0, 1000) : "Email send failed",
        claimed_at: providerAccepted ? emailEvent.claimedAt : null,
      })
        .eq("id", emailEvent.id)
        .eq("claimed_at", emailEvent.claimedAt);
      throw sendError;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Case update email failed";
    const status = /authorization|access/i.test(message) ? 401 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
