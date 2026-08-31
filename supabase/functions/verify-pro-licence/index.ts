import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { decodeLicenceImage, readProLicence, sha256Pro } from "../_shared/pro-licence.ts";
import { ELIGIBLE_PRO_CLASSES, evaluateProLicence, isOfficerOrder, normalizedLicenceClass } from "../_shared/pro-pricing.ts";
import { applyVerifiedProRefund, type ProRefundStatus } from "../_shared/pro-refund.ts";
import { LocaleRequestError, parsePreferredLocale } from "../_shared/locale-policy.ts";
import { requireEnglishProductLocale } from "../_shared/product-locale.ts";

class ProRequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const baseOrigins = new Set(["https://fabsy.ca","https://www.fabsy.ca","https://fabsy-execom.vercel.app",
  "http://localhost:5173","http://localhost:4173","http://localhost:8080"]);
function allowed(origin: string | null) {
  return !origin || baseOrigins.has(origin) ||
    (Deno.env.get("ASSESSMENT_ALLOWED_ORIGINS") || "").split(",").map((part) => part.trim()).includes(origin);
}
function json(origin: string | null, value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: {
    "Access-Control-Allow-Origin": origin && allowed(origin) ? origin : "https://fabsy.ca",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin",
  } });
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (!allowed(origin)) return json(origin, { error: "Origin is not allowed." }, 403);
  if (req.method === "OPTIONS") return json(origin, {});
  if (req.method !== "POST") return json(origin, { error: "Method not allowed." }, 405);
  try {
    if (Number(req.headers.get("content-length") || 0) > 14_100_000) throw new ProRequestError("The licence photo is too large.", 413);
    const raw = await req.text();
    if (raw.length > 14_100_000) throw new ProRequestError("The licence photo is too large.", 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { throw new ProRequestError("Invalid request."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ProRequestError("Invalid request.");
    const submissionId = typeof body.submissionId === "string" ? body.submissionId.toLowerCase() : "";
    if (!UUID.test(submissionId)) throw new ProRequestError("A valid ticket order is required.");
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("PRO_CONFIGURATION");
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: order, error } = await admin.from("ticket_submissions")
      .select("id,client_id,first_name,last_name,drivers_license,status,service_type,ticket_type,preferred_locale,declared_licence_class,pro_verified,pro_verification_id,discount_applied,pro_discount_cents,representation_access_token_hash,clients(email,auth_user_id)")
      .eq("id", submissionId).maybeSingle();
    if (error) throw error;
    const client = Array.isArray(order?.clients) ? order.clients[0] : order?.clients;
    let authorized = false;
    if (order && typeof body.accessToken === "string" && /^[a-f0-9]{32,128}$/i.test(body.accessToken)) {
      authorized = await sha256Pro(body.accessToken) === order.representation_access_token_hash;
    }
    if (!authorized && order) {
      const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
      if (bearer) {
        const { data: userData, error: userError } = await admin.auth.getUser(bearer);
        const user = userData?.user;
        authorized = !userError && Boolean(user?.email_confirmed_at) && Boolean(client &&
          (client.auth_user_id === user?.id || (!client.auth_user_id &&
            user?.email?.toLowerCase() === client.email?.toLowerCase())));
      }
    }
    if (!order || !authorized) throw new ProRequestError("Sign in with the email used for this ticket, or return to your secure intake.", 403);
    requireEnglishProductLocale(parsePreferredLocale(order.preferred_locale), "pro_driver");
    if (!isOfficerOrder(order)) throw new ProRequestError("The pro discount applies to officer-issued Rapid Resolution tickets only.", 422);
    if (body.action === "status") {
      const { data: refund, error: refundError } = await admin.from("pro_discount_refunds")
        .select("status,amount_cents").eq("ticket_submission_id", submissionId).maybeSingle();
      if (refundError) throw refundError;
      return json(origin, {
        verified: order.pro_verified === true, status: order.pro_verified ? "verified" : "unverified",
        declaredLicenceClass: order.declared_licence_class,
        discountApplied: order.discount_applied === "PRO20",
        refundStatus: refund?.status || null, refundAmountCents: refund?.amount_cents || null,
      });
    }
    if (body.action === "refund") {
      if (!order.pro_verified) throw new ProRequestError("Verify your licence before requesting the adjustment.", 409);
      const refundStatus = await applyVerifiedProRefund(admin, order);
      return json(origin, { verified: true, status: "verified", discountPercent: 20, refundStatus });
    }
    if (body.action != null && body.action !== "verify") throw new ProRequestError("Invalid action.");
    const declaredClass = normalizedLicenceClass(body.licenceClass);
    if (!ELIGIBLE_PRO_CLASSES.has(declaredClass)) throw new ProRequestError("Only Alberta Class 1, 2 or 4 licences qualify.", 422);
    let image: ReturnType<typeof decodeLicenceImage>;
    try { image = decodeLicenceImage(body.imageBase64, body.mimeType); }
    catch (imageError) { throw new ProRequestError((imageError as Error).message); }
    const evidenceHash = await sha256Pro(image.bytes);
    const { data: claim, error: claimError } = await admin.rpc("begin_pro_licence_verification", {
      p_submission_id: submissionId, p_declared_class: declaredClass,
      p_evidence_sha256: evidenceHash, p_extension: image.extension,
      p_expected_identity: {
        client_id: order.client_id, drivers_license: order.drivers_license,
        first_name: order.first_name, last_name: order.last_name,
        representation_access_token_hash: order.representation_access_token_hash,
        ticket_type: order.ticket_type,
      },
    });
    if (claimError) {
      const message = String(claimError.message);
      if (message.includes("PRO_CHECKOUT_OPEN")) throw new ProRequestError("A checkout is already open. Complete it at the displayed price, then verify here for the adjustment.", 409);
      if (message.includes("PRO_VERIFICATION_BUSY") || message.includes("PRO_VERIFICATION_RATE_LIMIT")) {
        throw new ProRequestError("Licence verification is busy or has reached its retry limit. Please try again later or contact Fabsy.", 429);
      }
      if (message.includes("PRO_DECLARATION_MISMATCH")) throw new ProRequestError("The selected licence class must match your intake declaration.", 409);
      if (message.includes("PRO_INTAKE_CHANGED")) throw new ProRequestError("Your intake changed while verification was starting. Return to the latest intake or sign in again.", 409);
      if (message.includes("PRO_LOCALE_NOT_RELEASED")) throw new LocaleRequestError("Pro Driver verification currently requires the English intake and terms.", 409, "product_locale_not_released");
      throw claimError;
    }
    let verified = claim?.status === "verified";
    let resultCode = verified ? "verified" : "unreadable";
    if (!verified) {
      const { error: uploadError } = await admin.storage.from("pro-licences").upload(claim.evidence_path, image.bytes, {
        contentType: image.mimeType, upsert: false,
      });
      let result: ReturnType<typeof evaluateProLicence> = {
        verified: false, reason: "unreadable", readClass: null, jurisdiction: null, identityMatches: false, expiresOn: null,
      };
      if (uploadError) resultCode = "upload_failed";
      else {
        try {
          result = evaluateProLicence(await readProLicence(image.dataUrl), order, declaredClass);
          resultCode = result.reason;
        } catch { resultCode = "reader_unavailable"; }
      }
      const { data: accepted, error: finishError } = await admin.rpc("finish_pro_licence_verification", {
        p_id: claim.id, p_read_class: result.readClass, p_jurisdiction: result.jurisdiction,
        p_identity_matches: result.identityMatches, p_expires_on: result.expiresOn, p_result_code: resultCode,
      });
      if (finishError) throw finishError;
      verified = accepted === true;
    }
    let refundStatus: ProRefundStatus | null = null;
    if (verified) {
      try {
        refundStatus = await applyVerifiedProRefund(admin, {
          ...order, declared_licence_class: declaredClass, pro_verified: true, pro_verification_id: claim.id,
        });
      } catch { refundStatus = "needs_review"; }
    }
    return json(origin, {
      verified, status: verified ? "verified" : "unverified", discountPercent: verified ? 20 : 0,
      reason: resultCode, refundStatus,
      message: verified ? "Your Alberta licence class matches your ticket intake."
        : "We could not verify the discount. Full price applies until a clear matching licence photo is verified.",
    });
  } catch (error) {
    const status = error instanceof ProRequestError || error instanceof LocaleRequestError ? error.status : 500;
    if (status === 500) console.error("Pro licence verification could not complete");
    return json(origin, {
      verified: false, status: "unverified", discountPercent: 0,
      error: error instanceof ProRequestError || error instanceof LocaleRequestError ? error.message : "Licence verification is temporarily unavailable. Full price applies until verification.",
      ...(error instanceof LocaleRequestError ? { error_code: error.code } : {}),
    }, status);
  }
});
