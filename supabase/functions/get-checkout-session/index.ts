import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { validatePhotoRadarPaidSession } from "../_shared/photo-radar.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const { sessionId } = await req.json();
    if (typeof sessionId !== "string" || !/^cs_(?:test_|live_)[A-Za-z0-9]+$/.test(sessionId)) {
      return new Response(JSON.stringify({ error: "Missing sessionId" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items"] });
    const isPhotoRadar = session.metadata?.fabsy_product === "photo_radar";
    if (isPhotoRadar && session.payment_status === "paid") validatePhotoRadarPaidSession(session);

    const lineItems = (session.line_items?.data || []).map((li: Stripe.LineItem) => ({
      id: li.id,
      description: li.description,
      quantity: li.quantity,
      amount_total: li.amount_total,
      amount_subtotal: li.amount_subtotal,
      amount_tax: li.amount_tax,
      currency: li.currency,
      price: li.price?.id || null,
      product: li.price?.product || null,
    }));

    const response = {
      id: session.id,
      mode: session.mode,
      amount_total: session.amount_total,
      amount_subtotal: session.amount_subtotal ?? null,
      currency: session.currency,
      payment_status: session.payment_status,
      order_type: session.metadata?.fabsy_product || null,
      pro_discount_applied: !isPhotoRadar && session.metadata?.pro_coupon === "PRO20" && (session.total_details?.amount_discount || 0) > 0,
      // Fulfillment is intentionally webhook-only. This public endpoint is a
      // read-only receipt lookup for the thank-you page.
      submission_status_updated: false,
      total_details: session.total_details || null,
      // Never return customer contact data or internal case IDs from this
      // public receipt endpoint. Private actions use the signed-in portal.
      line_items: lineItems,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    console.error("Checkout receipt lookup failed");
    return new Response(JSON.stringify({
      error: "Unable to confirm the payment receipt.",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
