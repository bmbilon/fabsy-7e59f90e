import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { IntakeConsentError, parsePhotoUploadConsent } from "../_shared/intake-consent.ts";
import { attachReferralAttribution } from "../_shared/referrals.ts";
import { queuePhotoIntake } from "../_shared/process-photo-intake.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const extensions: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };
const attempts = new Map<string, { count: number; until: number }>();
class RequestError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map(byte => byte.toString(16).padStart(2, "0")).join("");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const input = await req.json();
    if (!input || typeof input !== "object" || typeof input.submissionId !== "string" || !uuid.test(input.submissionId) || typeof input.accessToken !== "string" || !/^[a-f0-9]{64}$/.test(input.accessToken)) throw new RequestError("Submission authorization is invalid.", 403);
    const submissionId = String(input.submissionId).toLowerCase();
    const tokenHash = await hash(input.accessToken);
    if (input.action === "prepare") {
      if (input.ticketType !== undefined && !["officer_issued", "photo_radar"].includes(input.ticketType)) throw new RequestError("Choose an officer-issued or camera ticket.");
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
      const now = Date.now();
      const bucket = attempts.get(ip);
      if (bucket && bucket.until > now && bucket.count >= 10) throw new RequestError("Too many uploads. Please try again later.", 429);
      attempts.set(ip, { count: bucket && bucket.until > now ? bucket.count + 1 : 1, until: bucket && bucket.until > now ? bucket.until : now + 3600000 });
      let ticketPath: string;
      let sourceId: string | null = null;
      if (input.sourceAssessment) {
        const source = input.sourceAssessment;
        if (typeof source.submissionId !== "string" || !uuid.test(source.submissionId) || typeof source.accessToken !== "string" || source.accessToken.length < 32 || source.accessToken.length > 200) throw new RequestError("Saved ticket authorization is invalid.", 403);
        const { data: original, error } = await admin.from("ticket_submissions").select("id,service_type,assessment_ticket_path,assessment_access_token_hash,assessment_paid_at")
          .eq("id", source.submissionId).maybeSingle();
        if (error || !original || original.service_type !== "ticket_insurance_assessment" || original.assessment_access_token_hash !== await hash(source.accessToken) || original.assessment_paid_at || !original.assessment_ticket_path?.startsWith(`${original.id}/`)) throw new RequestError("Saved ticket authorization is invalid.", 403);
        ticketPath = original.assessment_ticket_path;
        sourceId = original.id;
      } else {
        const file = input.file;
        const extension = extensions[file?.contentType];
        if (typeof extension !== "string" || !Number.isInteger(file?.size) || file.size <= 0 || file.size > 10 * 1024 * 1024) throw new RequestError("Choose a ticket photo or PDF, 10 MB or smaller.");
        ticketPath = `${submissionId}/representation-ticket.${extension}`;
      }
      const consent = parsePhotoUploadConsent(input.consent, submissionId, ticketPath);
      const { data: clientId, error } = await admin.rpc("prepare_photo_ticket_intake", {
        p_id: submissionId, p_token_hash: tokenHash, p_consent: consent, p_ticket_path: ticketPath, p_source_assessment_id: sourceId,
        ...(input.ticketType ? { p_ticket_type: input.ticketType } : {}),
      });
      if (error || !clientId) throw new RequestError("Your upload could not be prepared. Please try again.", 409);
      let upload = null;
      if (!sourceId) {
        const { data: signed, error: uploadError } = await admin.storage.from("assessment-tickets").createSignedUploadUrl(ticketPath, { upsert: true });
        if (uploadError || !signed?.token) throw new RequestError("Your private upload could not be prepared. Please try again.", 503);
        upload = { path: ticketPath, token: signed.token };
      }
      await attachReferralAttribution(admin, submissionId, { refCode: input.refCode, refAttributionToken: input.refAttributionToken });
      return json({ success: true, submissionId, clientId, accessToken: input.accessToken, upload });
    }

    const { data: ticket, error } = await admin.from("ticket_submissions")
      .select("id,client_id,intake_mode,intake_review_status,intake_scan_started_at,representation_access_token_hash,consent_form_path,status,first_name,last_name,email,phone,ticket_number,ticket_type,registered_owner_on_offence_date")
      .eq("id", submissionId).maybeSingle();
    if (error || !ticket || ticket.intake_mode !== "photo_only" || ticket.representation_access_token_hash !== tokenHash || !ticket.consent_form_path) throw new RequestError("Submission authorization is invalid.", 403);
    if (input.action === "contact") {
      const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
      const phoneInput = typeof input.phone === "string" ? input.phone.trim() : "";
      const digits = phoneInput.replace(/\D/g, "");
      if (!email) throw new RequestError("Enter your email address so we can send your consent copy and next steps.");
      if (email && (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new RequestError("Enter a valid email address.");
      if (phoneInput && (phoneInput.length > 30 || digits.length < 7 || digits.length > 15)) throw new RequestError("Enter a valid phone number.");
      const phone = phoneInput ? `${phoneInput.startsWith("+") ? "+" : ""}${digits}` : "";
      const { error: saveError } = await admin.rpc("save_photo_intake_contact", { p_id: submissionId, p_token_hash: tokenHash, p_email: email, p_phone: phone });
      if (saveError) throw new RequestError("Your ticket is saved, but your contact details could not be updated. Please try again.", 409);
      ticket.email = email; ticket.phone = phone;
    } else if (input.action === "owner") {
      if (ticket.ticket_type !== "photo_radar" || !["yes", "sold_before", "stolen"].includes(input.answer)) throw new RequestError("Choose an ownership answer.");
      const { data: updated, error: updateError } = await admin.from("ticket_submissions").update({ registered_owner_on_offence_date: input.answer })
        .eq("id", submissionId).eq("status", "awaiting_payment").eq("representation_access_token_hash", tokenHash).select("id").maybeSingle();
      if (updateError || !updated) throw new RequestError("The ownership answer could not be saved.", 409);
      ticket.registered_owner_on_offence_date = input.answer;
    } else if (input.action !== "status") throw new RequestError("Unknown intake action.");
    // A worker interrupted by a runtime restart becomes an explicit staff task.
    if (ticket.intake_review_status === "scanning" && Date.now() - Date.parse(ticket.intake_scan_started_at) > 120000) {
      await admin.from("ticket_submissions").update({ intake_review_status: "needs_review" }).eq("id", submissionId).eq("intake_review_status", "scanning");
      ticket.intake_review_status = "needs_review";
    }
    if (ticket.intake_review_status === "pending_scan") queuePhotoIntake(admin, submissionId);
    return json({ success: true, reviewStatus: ticket.intake_review_status, fields: {
      firstName: ticket.first_name, lastName: ticket.last_name, email: ticket.email, phone: ticket.phone,
      ticketNumber: ticket.ticket_number, ticketType: ticket.ticket_type, registeredOwnerOnOffenceDate: ticket.registered_owner_on_offence_date || "",
    } });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Your request could not be completed." }, error instanceof RequestError || error instanceof IntakeConsentError ? error.status : 500);
  }
};
if (import.meta.main) serve(handler);
