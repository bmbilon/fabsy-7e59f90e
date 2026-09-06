import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useParams } from "react-router-dom";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PAYMENT_LINK_CODE_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export default function PaymentLinkRedirect() {
  const { code = "" } = useParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!PAYMENT_LINK_CODE_PATTERN.test(code)) {
      setError("This payment link is invalid.");
      return () => { active = false; };
    }

    const openCheckout = async () => {
      const { data, error: resolveError } = await supabase.functions.invoke(
        "resolve-payment-link",
        { body: { code } },
      );
      if (!active) return;
      if (resolveError || typeof data?.url !== "string") {
        setError("This payment link could not be opened. Please return to your saved intake or contact Fabsy.");
        return;
      }
      try {
        const destination = new URL(data.url);
        const allowed = destination.origin === "https://checkout.stripe.com" ||
          (destination.origin === window.location.origin && destination.pathname === "/thank-you");
        if (!allowed) throw new Error("Unexpected checkout destination.");
        window.location.replace(destination.toString());
      } catch {
        setError("This payment link could not be opened. Please return to your saved intake or contact Fabsy.");
      }
    };
    void openCheckout();
    return () => { active = false; };
  }, [code]);

  return <>
    <Helmet>
      <title>Secure Fabsy Payment</title>
      <meta name="robots" content="noindex, nofollow, noarchive" />
      <meta name="referrer" content="no-referrer" />
    </Helmet>
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-slate-950">
      <Card className="w-full max-w-md border-slate-200 shadow-2xl">
        <CardHeader className="items-center text-center">
          <div className="mb-2 rounded-full bg-blue-50 p-3 text-blue-600">
            {error ? <ShieldCheck className="h-10 w-10" aria-hidden="true" /> :
              <LoaderCircle className="h-10 w-10 animate-spin" aria-hidden="true" />}
          </div>
          <CardTitle>{error ? "Payment link unavailable" : "Opening secure Fabsy checkout…"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm leading-relaxed text-slate-600" role={error ? "alert" : "status"}>
            {error || "You’ll continue to Stripe to complete your Fabsy payment."}
          </p>
          {error ? <>
            <Button asChild className="w-full"><Link to="/submit-ticket">Return to your intake</Link></Button>
            <a className="inline-block py-2 font-medium text-blue-700 underline" href="tel:+18257932279">Call Fabsy: (825) 793-2279</a>
          </> : null}
        </CardContent>
      </Card>
    </main>
  </>;
}
