import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { getFabsyEmailSignature } from "../_shared/email-signature.ts";
import { sendResendEmail } from "../_shared/resend-email.ts";

interface AssessmentResult {
  schema_version: 1;
  charge_summary: string;
  key_deadline: string;
  fine_summary: string;
  demerit_implications: string;
  insurance_risk: "trivial" | "moderate" | "material" | "uncertain";
  insurance_assessment: string;
  financial_exposure: string;
  options_assessment: string;
  representation_economics: string;
  recommendation: string;
  next_step: string;
  representation_recommended: boolean;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RAPID_RESOLUTION_PRICE_CAD = 198;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("\n", "<br>");
}

function assertResult(value: unknown): asserts value is AssessmentResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Assessment result is missing.");
  const result = value as Record<string, unknown>;
  if (result.schema_version !== 1) throw new Error("Assessment result version is invalid.");
  const textFields = [
    "charge_summary",
    "key_deadline",
    "fine_summary",
    "demerit_implications",
    "insurance_assessment",
    "financial_exposure",
    "options_assessment",
    "representation_economics",
    "recommendation",
    "next_step",
  ];
  for (const field of textFields) {
    if (typeof result[field] !== "string" || !String(result[field]).trim() || String(result[field]).length > 5000) {
      throw new Error(`Assessment ${field} is incomplete.`);
    }
  }
  if (!["trivial", "moderate", "material", "uncertain"].includes(String(result.insurance_risk))) {
    throw new Error("Assessment insurance risk is invalid.");
  }
  if (typeof result.representation_recommended !== "boolean") throw new Error("Assessment representation recommendation is invalid.");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !resendApiKey) throw new Error("Assessment delivery configuration is incomplete.");
    const authorization = req.headers.get("authorization");
    if (!authorization) return json({ error: "Staff authentication is required." }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Staff authentication is required." }, 401);
    const { data: staffRole, error: staffError } = await userClient.rpc("idr_staff_role");
    if (staffError || (staffRole !== "admin" && staffRole !== "case_manager")) {
      return json({ error: "Staff permission is required." }, 403);
    }

    const body = await req.json() as Record<string, unknown>;
    const submissionId = typeof body.submissionId === "string" ? body.submissionId.trim().toLowerCase() : "";
    if (!UUID_PATTERN.test(submissionId)) return json({ error: "submissionId is invalid." }, 400);
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: submission, error: submissionError } = await admin.from("ticket_submissions")
      .select("id,status,service_type,assessment_paid_at,assessment_result,assessment_delivered_at,assessment_delivery_claimed_at,assessment_delivery_sent_at,representation_credit_eligible,clients(first_name,email)")
      .eq("id", submissionId).single();
    if (submissionError || !submission) return json({ error: "Assessment submission was not found." }, 404);
    if (submission.service_type !== "ticket_insurance_assessment" || !submission.assessment_paid_at || !submission.representation_credit_eligible) {
      return json({ error: "Only paid assessment orders can be delivered." }, 409);
    }
    assertResult(submission.assessment_result);
    if (submission.assessment_delivered_at || submission.assessment_delivery_sent_at) {
      return json({ success: true, alreadyDelivered: true });
    }
    if (submission.assessment_delivery_claimed_at) {
      return json({ error: "Assessment delivery is already in progress or needs reconciliation." }, 409);
    }

    const client = Array.isArray(submission.clients) ? submission.clients[0] : submission.clients;
    if (!client?.email) throw new Error("Assessment client email is unavailable.");
    const claimedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await admin.from("ticket_submissions").update({
      assessment_delivery_claimed_at: claimedAt,
    }).eq("id", submissionId)
      .is("assessment_delivery_claimed_at", null)
      .is("assessment_delivered_at", null)
      .select("id").maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return json({ error: "Assessment delivery could not be reserved." }, 409);

    const result = submission.assessment_result as AssessmentResult;
    let emailAccepted = false;
    try {
      const representationPath = result.representation_recommended
        ? `<div style="margin-top:24px;padding:18px;border:1px solid #ddd6fe;border-radius:10px;background:#f5f3ff"><h2 style="margin-top:0">Current Fabsy option</h2><p>${escapeHtml(result.next_step)}</p><p><a href="https://fabsy.ca/rapid-resolution" style="display:inline-block;background:#7c3aed;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;font-weight:700">Review Rapid Resolution</a></p><p style="font-size:13px;color:#6b7280">This email delivers a legacy $149 Ticket Triage result. Rapid Resolution is a separate current service costing $${RAPID_RESOLUTION_PRICE_CAD} CAD plus applicable GST for eligible Alberta pre-trial matters; no credit is automatically applied. Trial representation is separate and no outcome is promised.</p></div>`
        : `<div style="margin-top:24px;padding:18px;border:1px solid #bbf7d0;border-radius:10px;background:#f0fdf4"><h2 style="margin-top:0">Fabsy action path</h2><p>${escapeHtml(result.next_step)}</p><p style="font-size:13px;color:#4b5563">No further paid Fabsy service is being recommended in this assessment.</p></div>`;
      const section = (heading: string, content: string) => `<h2 style="margin:28px 0 8px;color:#4c1d95">${heading}</h2><p style="margin:0;line-height:1.6">${escapeHtml(content)}</p>`;
      await sendResendEmail(resendApiKey, {
        from: "Fabsy <hello@fabsy.ca>",
        reply_to: "hello@fabsy.ca",
        to: [client.email],
        subject: "Your legacy Fabsy Ticket Triage result",
        html: `<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#1f2937"><div style="background:#111827;color:#fff;border-radius:12px;padding:28px"><p style="margin:0;color:#ddd6fe;font-weight:700">FABSY · LEGACY $149 ORDER</p><h1 style="margin:8px 0 0">Ticket Triage result</h1><p style="margin:10px 0 0;color:#d1d5db">Human-reviewed historical traffic ticket and insurance-impact assessment for ${escapeHtml(client.first_name)}</p></div>${section("Charge summary", result.charge_summary)}${section("Key deadline", result.key_deadline)}${section("Fine", result.fine_summary)}${section("Demerit implications", result.demerit_implications)}${section(`Insurance impact assessment — ${result.insurance_risk}`, result.insurance_assessment)}${section("Estimated financial significance", result.financial_exposure)}${section("Options", result.options_assessment)}${section("Representation break-even analysis", result.representation_economics)}<div style="margin-top:30px;padding:22px;border:2px solid #7c3aed;border-radius:10px"><h2 style="margin-top:0;color:#4c1d95">Recommended next step</h2><p style="font-size:18px;line-height:1.6">${escapeHtml(result.recommendation)}</p></div>${representationPath}<div style="margin-top:30px;padding:18px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;font-size:13px;color:#4b5563;line-height:1.55"><strong>Important limits</strong><p>This email delivers a legacy Ticket Triage assessment purchased under earlier terms. It does not activate Rapid Resolution or apply a credit to a new purchase.</p><p>Insurance treatment varies by insurer, driving history, jurisdiction, renewal timing and other underwriting factors. Ticket Triage estimates likely risk and financial significance; it is not a binding insurance quote or guarantee of premium changes.</p><p>Fabsy is an Alberta traffic ticket agent service, not a law firm. Ticket Triage does not promise a ticket reduction, withdrawal, insurance saving or any other result. It does not pause the deadline printed on a ticket.</p></div>${getFabsyEmailSignature()}</div>`,
      }, `ticket-assessment-delivery/${submissionId}`);
      emailAccepted = true;
      const deliveredAt = new Date().toISOString();
      const { error: deliveredError } = await admin.from("ticket_submissions").update({
        status: "completed",
        assessment_delivered_at: deliveredAt,
        assessment_delivery_sent_at: deliveredAt,
        assessment_delivery_claimed_at: null,
        updated_at: deliveredAt,
      }).eq("id", submissionId).eq("assessment_delivery_claimed_at", claimedAt);
      if (deliveredError) throw deliveredError;
    } catch (deliveryError) {
      if (!emailAccepted) {
        await admin.from("ticket_submissions").update({ assessment_delivery_claimed_at: null })
          .eq("id", submissionId).eq("assessment_delivery_claimed_at", claimedAt);
      } else {
        console.error(`Assessment delivery accepted for ${submissionId} but needs reconciliation`);
      }
      throw deliveryError;
    }

    return json({ success: true });
  } catch (error) {
    console.error("send-assessment-result failed");
    return json({ error: error instanceof Error ? error.message : "Assessment delivery failed." }, 500);
  }
});
