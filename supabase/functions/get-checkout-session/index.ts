import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId } = await req.json();
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "Missing sessionId" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items", "payment_intent"],
    });

    const lineItems = (session.line_items?.data || []).map((li: any) => ({
      id: li.id,
      description: li.description,
      quantity: li.quantity,
      amount_total: li.amount_total,
      currency: li.currency,
      price: li.price?.id || null,
      product: li.price?.product || null,
    }));

    const response = {
      id: session.id,
      amount_total: session.amount_total,
      amount_subtotal: (session as any).amount_subtotal ?? null,
      currency: session.currency,
      payment_status: session.payment_status,
      total_details: (session as any).total_details || null,
      discounts: (session as any).discounts || null,
      invoice: session.invoice || null,
      payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
      customer_email: session.customer_email || null,
      line_items: lineItems,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("get-checkout-session error:", error);
    return new Response(JSON.stringify({ error: (error as any)?.message || "Unknown error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
