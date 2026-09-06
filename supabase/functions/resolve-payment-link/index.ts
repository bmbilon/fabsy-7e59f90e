import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { PAYMENT_LINK_CODE_PATTERN } from "../_shared/payment-checkout-link.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const siteUrl = (Deno.env.get("SITE_URL") || "https://fabsy.ca").replace(/\/$/, "");
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const allowedOrigins = new Set([
  siteUrl,
  "https://www.fabsy.ca",
  "https://fabsy-execom.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:8080",
]);

function cors(origin: string) {
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : siteUrl,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store, private",
    "Referrer-Policy": "no-referrer",
    "Vary": "Origin",
  };
}

function response(origin: string, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });
}

serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
  if (req.method !== "POST") return response(origin, { error: "Method not allowed." }, 405);
  if (!allowedOrigins.has(origin)) return response(origin, { error: "Origin is not allowed." }, 403);

  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey || !supabaseUrl || !serviceRoleKey) throw new Error("Payment configuration is unavailable.");
    const payload = await req.json().catch(() => null) as { code?: unknown } | null;
    const code = typeof payload?.code === "string" ? payload.code.trim() : "";
    if (!PAYMENT_LINK_CODE_PATTERN.test(code)) return response(origin, { error: "This payment link is invalid." }, 404);

    const { data: link, error: linkError } = await admin
      .from("ticket_checkout_links")
      .select("checkout_intent_id,submission_id,expires_at")
      .eq("code", code)
      .maybeSingle();
    if (linkError) throw linkError;
    if (!link) return response(origin, { error: "This payment link is invalid." }, 404);
    if (Date.parse(link.expires_at) <= Date.now()) return response(origin, { error: "This payment link has expired." }, 410);

    const { data: intent, error: intentError } = await admin
      .from("idr_checkout_intents")
      .select("id,ticket_submission_id,stripe_checkout_session_id,status")
      .eq("id", link.checkout_intent_id)
      .maybeSingle();
    if (intentError) throw intentError;
    if (!intent || intent.ticket_submission_id !== link.submission_id) {
      return response(origin, { error: "This payment link is unavailable." }, 404);
    }
    if (intent.status === "paid") {
      if (!intent.stripe_checkout_session_id) throw new Error("Paid checkout is missing its Stripe session.");
      const receiptUrl = new URL("/thank-you", `${siteUrl}/`);
      receiptUrl.searchParams.set("session_id", intent.stripe_checkout_session_id);
      return response(origin, { state: "paid", url: receiptUrl.toString() });
    }
    if (!intent.stripe_checkout_session_id || intent.status === "creating") {
      return response(origin, { error: "Secure checkout is still being prepared. Please try again." }, 409);
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });
    const session = await stripe.checkout.sessions.retrieve(intent.stripe_checkout_session_id);
    const sessionSubmissionId = session.client_reference_id || session.metadata?.submission_id;
    const sessionIntentId = session.metadata?.checkout_intent_id;
    if (sessionSubmissionId !== link.submission_id || sessionIntentId !== link.checkout_intent_id) {
      throw new Error("Checkout link ownership mismatch.");
    }
    if (session.status === "complete" || session.payment_status === "paid") {
      const receiptUrl = new URL("/thank-you", `${siteUrl}/`);
      receiptUrl.searchParams.set("session_id", session.id);
      return response(origin, { state: "paid", url: receiptUrl.toString() });
    }
    if (session.status !== "open" || !session.url) {
      return response(origin, { error: "This payment link has expired." }, 410);
    }
    const checkoutUrl = new URL(session.url);
    if (checkoutUrl.protocol !== "https:" || checkoutUrl.hostname !== "checkout.stripe.com") {
      throw new Error("Stripe returned an invalid checkout destination.");
    }
    return response(origin, { state: "open", url: checkoutUrl.toString() });
  } catch {
    return response(origin, { error: "Secure checkout could not be opened. Please try again." }, 500);
  }
});
