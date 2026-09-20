import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  APPROVAL_TOKEN_PATTERN, approvalHash, approvalPublicSummary, DISCLOSURE_ADMIN_PHONE,
  DISCLOSURE_APPROVAL_SCOPE, newApprovalToken, normalizeApprovalTicket, SHA256_PATTERN, validateTermsUrl,
} from "../_shared/disclosure-approval.ts";
import { verifyDisclosureServiceOperator } from "../_shared/disclosure-operator-auth.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const siteUrl = (Deno.env.get("SITE_URL") || "https://fabsy.ca").replace(/\/$/, "");
const allowedOrigins = new Set([siteUrl, "https://fabsy.ca", "https://www.fabsy.ca"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class RequestError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

function response(req: Request, body: unknown, status = 200) {
  const origin = req.headers.get("origin") || "";
  return new Response(body === null ? null : JSON.stringify(body), { status, headers: {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : siteUrl,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin",
    "Content-Type": "application/json", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  } });
}

function field(raw: Record<string, unknown>, name: string, pattern: RegExp) {
  const value = raw[name];
  if (typeof value !== "string" || !pattern.test(value)) throw new RequestError(`${name} is invalid.`);
  return value;
}

async function requireOperator(req: Request) {
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new RequestError("Operator authentication required.", 401);
  if (await approvalHash(authorization.slice(7)) === await approvalHash(serviceKey)) return;
  if (await verifyDisclosureServiceOperator(authorization, { supabaseUrl, anonKey })) return;
  const { data, error } = await admin.auth.getUser(authorization.slice(7));
  if (error || !data.user) throw new RequestError("Operator authentication required.", 401);
  const { data: role, error: roleError } = await admin.from("user_roles").select("role")
    .eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
  if (roleError || !role) throw new RequestError("Admin access required.", 403);
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await admin.rpc(name, args);
  if (error) {
    if (error.message.includes("APPROVAL_UNAVAILABLE")) throw new RequestError("This approval has expired or already been used.", 409);
    throw new Error("Approval database operation failed.");
  }
  return data;
}

async function consentDigest(snapshot: Record<string, unknown>) {
  const path = String(snapshot.consent_form_path || "");
  if (!path || path.includes("..") || path.startsWith("/")) throw new RequestError("Stored consent is unavailable.", 409);
  const { data, error } = await admin.storage.from("consent-forms").download(path);
  if (error || !data || data.size > 20 * 1024 * 1024) throw new RequestError("Stored consent could not be verified.", 409);
  return approvalHash(await data.arrayBuffer());
}

function operatorSummary(row: Record<string, unknown>) {
  return {
    id: row.id, submission_id: row.submission_id, status: approvalPublicSummary(row).status,
    portal_session_id: row.portal_session_id, case_fingerprint: row.case_fingerprint,
    consent_sha256: row.consent_sha256, terms_sha256: row.terms_sha256,
    expires_at: row.expires_at, decided_at: row.decided_at, consumed_at: row.consumed_at,
  };
}

async function findApproval(id: string) {
  const { data, error } = await admin.from("disclosure_portal_approvals").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("Approval lookup failed.");
  if (!data) throw new RequestError("Approval not found.", 404);
  return data;
}

async function createApproval(raw: Record<string, unknown>) {
  const submissionId = field(raw, "submission_id", uuidPattern);
  const portalSessionId = field(raw, "portal_session_id", uuidPattern);
  const consentSha = field(raw, "consent_sha256", SHA256_PATTERN);
  const ticketNumber = normalizeApprovalTicket(raw.ticket_number);
  if (!/^[A-Z0-9]{5,30}$/.test(ticketNumber)) throw new RequestError("Ticket number is invalid.");
  if (raw.portal_terms_unchecked !== true || raw.case_documents_verified !== true) {
    throw new RequestError("Prepare the live unchecked Terms step and verify the matching ticket and signed consent first.", 409);
  }
  let termsUrl: string;
  try { termsUrl = validateTermsUrl(raw.terms_url); } catch { throw new RequestError("Terms URL must be on the Alberta traffic portal."); }
  const termsText = raw.terms_text;
  const termsVersion = raw.terms_version;
  if (typeof termsText !== "string" || termsText.length < 40 || termsText.length > 60000
    || typeof termsVersion !== "string" || !termsVersion.trim() || termsVersion.length > 200) {
    throw new RequestError("Capture the displayed Terms text and its version or observation date.");
  }
  if (!await rpc("disclosure_approval_case_eligible", { p_id: submissionId })) throw new RequestError("Case is not eligible for an automated plea and disclosure request.", 409);
  const snapshot = await rpc("disclosure_approval_case_snapshot", { p_id: submissionId });
  if (!snapshot || snapshot.ticket_number !== ticketNumber) throw new RequestError("Prepared ticket does not match the stored case.", 409);
  if (snapshot.intake_consent?.pleadNotGuilty !== true && raw.legacy_plea_origin_verified !== true) {
    throw new RequestError("Verify the historical detailed-form not-guilty instruction before requesting approval.", 409);
  }
  if (await consentDigest(snapshot) !== consentSha) throw new RequestError("Prepared consent differs from the stored signed document.", 409);

  const { data: prior, error: priorError } = await admin.from("disclosure_portal_approvals").select("id,status")
    .eq("submission_id", submissionId).in("status", ["consumed", "rejected", "delivery_failed"]).limit(1);
  if (priorError) throw new Error("Approval history lookup failed.");
  if (prior?.length) throw new RequestError("This case needs operator review after a prior decision, uncertain SMS or consumed approval. No new text was sent.", 409);

  const account = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
  const from = Deno.env.get("TWILIO_PHONE_NUMBER") || "";
  const recipient = Deno.env.get("DISCLOSURE_APPROVAL_ADMIN_PHONE") || DISCLOSURE_ADMIN_PHONE;
  if (!/^AC[a-fA-F0-9]{32}$/.test(account) || !authToken || !/^\+[1-9][0-9]{7,14}$/.test(from)
    || !/^\+[1-9][0-9]{7,14}$/.test(recipient) || !siteUrl.startsWith("https://")) {
    throw new RequestError("Approval SMS configuration is unavailable.", 503);
  }

  const now = new Date().toISOString();
  const { error: expireError } = await admin.from("disclosure_portal_approvals")
    .update({ status: "revoked", revoked_at: now }).eq("submission_id", submissionId)
    .in("status", ["creating", "pending", "approved"]).lte("expires_at", now);
  if (expireError) throw new Error("Approval expiry update failed.");
  const token = newApprovalToken();
  const caseLabel = `${String(snapshot.first_name || "Client").slice(0, 60)} ${String(snapshot.last_name || "").slice(0, 1)}.`.trim();
  const termsSha = await approvalHash(termsText);
  const { data: row, error: insertError } = await admin.from("disclosure_portal_approvals").insert({
    submission_id: submissionId, ticket_number: ticketNumber, case_label: caseLabel,
    token_hash: await approvalHash(token), portal_session_id: portalSessionId,
    case_fingerprint: await approvalHash(JSON.stringify(snapshot)), source_snapshot: snapshot,
    consent_sha256: consentSha, terms_url: termsUrl, terms_version: termsVersion,
    terms_text: termsText, terms_sha256: termsSha, scope: DISCLOSURE_APPROVAL_SCOPE, recipient_phone: recipient,
  }).select("*").single();
  if (insertError) {
    if (insertError.code === "23505") throw new RequestError("This case already has an active approval. Check its status; no new text was sent.", 409);
    throw new Error("Approval could not be created.");
  }
  const link = `${siteUrl}/disclosure-approval#token=${token}`;
  const smsBody = `Fabsy: approval needed for ${caseLabel}, ticket ${ticketNumber}. Review Alberta terms and approve the not-guilty plea + disclosure request: ${link} Expires in 30 min. Opening the link does not approve.`;
  try {
    const sent = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account}/Messages.json`, {
      method: "POST", headers: { Authorization: `Basic ${btoa(`${account}:${authToken}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: recipient, From: from, Body: smsBody }), signal: AbortSignal.timeout(15000),
    });
    if (!sent.ok) throw new Error("SMS provider declined request.");
    const provider = await sent.json();
    if (typeof provider.sid !== "string" || !/^SM[a-fA-F0-9]{32}$/.test(provider.sid)) throw new Error("SMS acknowledgement unavailable.");
    const { error: saveError } = await admin.from("disclosure_portal_approvals").update({ status: "pending", sms_provider_id: provider.sid })
      .eq("id", row.id).eq("status", "creating");
    if (saveError) throw new Error("SMS acknowledgement could not be saved.");
    return operatorSummary({ ...row, status: "pending" });
  } catch {
    await admin.from("disclosure_portal_approvals").update({ status: "delivery_failed" }).eq("id", row.id).eq("status", "creating");
    // Do not log provider bodies, phone numbers, bearer links or credentials.
    throw new RequestError(`SMS delivery is uncertain. Review approval ${row.id}; do not resend automatically.`, 502);
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return response(req, null, 204);
  if (req.method !== "POST") return response(req, { error: "Use POST. Opening a link never approves terms." }, 405);
  try {
    const origin = req.headers.get("origin");
    if (origin && !allowedOrigins.has(origin)) throw new RequestError("Origin is not allowed.", 403);
    if (!(req.headers.get("content-type") || "").startsWith("application/json")) throw new RequestError("JSON is required.", 415);
    const text = await req.text();
    if (text.length > 85000) throw new RequestError("Request is too large.", 413);
    let raw: Record<string, unknown>;
    try { raw = JSON.parse(text); } catch { throw new RequestError("Invalid JSON."); }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new RequestError("Invalid request.");
    if (raw.action === "preview" || raw.action === "decide") {
      const tokenHash = await approvalHash(field(raw, "token", APPROVAL_TOKEN_PATTERN));
      if (raw.action === "decide") {
        if (raw.decision !== "approved" && raw.decision !== "rejected") throw new RequestError("Choose approve or reject.");
        const termsSha = field(raw, "terms_sha256", SHA256_PATTERN);
        const result = await rpc("decide_disclosure_portal_approval", { p_token_hash: tokenHash, p_decision: raw.decision, p_terms_sha256: termsSha });
        return response(req, { status: result });
      }
      const { data, error } = await admin.from("disclosure_portal_approvals").select("*").eq("token_hash", tokenHash).maybeSingle();
      if (error) throw new Error("Approval lookup failed.");
      if (!data) throw new RequestError("This approval link is unavailable.", 404);
      return response(req, approvalPublicSummary(data));
    }
    await requireOperator(req);
    if (raw.action === "create") return response(req, await createApproval(raw), 201);
    const id = field(raw, "id", uuidPattern);
    const row = await findApproval(id);
    if (raw.action === "status") return response(req, operatorSummary(row));
    if (raw.action === "revoke") {
      const { data, error } = await admin.from("disclosure_portal_approvals").update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", id).in("status", ["creating", "pending", "approved"]).select("id");
      if (error) throw new Error("Approval revocation failed.");
      return response(req, { revoked: Boolean(data?.length) });
    }
    if (raw.action === "consume") {
      const submissionId = field(raw, "submission_id", uuidPattern);
      const portalSessionId = field(raw, "portal_session_id", uuidPattern);
      const caseFingerprint = field(raw, "case_fingerprint", SHA256_PATTERN);
      const consentSha = field(raw, "consent_sha256", SHA256_PATTERN);
      const termsSha = field(raw, "terms_sha256", SHA256_PATTERN);
      if (row.scope !== DISCLOSURE_APPROVAL_SCOPE) throw new RequestError("The authorized workflow changed; this approval cannot be used.", 409);
      if (row.submission_id !== submissionId || row.status !== "approved" || new Date(row.expires_at).getTime() <= Date.now()) {
        throw new RequestError("No current approval is available for that case.", 409);
      }
      const snapshot = await rpc("disclosure_approval_case_snapshot", { p_id: submissionId });
      if (await consentDigest(snapshot) !== consentSha) throw new RequestError("The signed consent changed; approval cannot be used.", 409);
      const consumed = await rpc("consume_disclosure_portal_approval", {
        p_id: id, p_submission_id: submissionId, p_portal_session_id: portalSessionId,
        p_case_fingerprint: caseFingerprint, p_consent_sha256: consentSha, p_terms_sha256: termsSha,
      });
      if (!consumed) throw new RequestError("Approval expired, was used, or no longer matches this case and portal session.", 409);
      return response(req, { consumed: true, id, submission_id: submissionId, portal_session_id: portalSessionId });
    }
    throw new RequestError("Unknown action.");
  } catch (error) {
    return response(req, { error: error instanceof RequestError ? error.message : "The approval service could not complete the request." }, error instanceof RequestError ? error.status : 500);
  }
}

if (import.meta.main) Deno.serve(handler);
