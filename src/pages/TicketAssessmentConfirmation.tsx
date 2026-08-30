import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock3, FileCheck2, Mail, ShieldCheck } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TICKET_ASSESSMENT } from "@/config/ticketAssessment";
import { RAPID_RESOLUTION } from "@/config/offers";
import useSafeHead from "@/hooks/useSafeHead";
import { supabase } from "@/integrations/supabase/client";
import { trackAssessmentEvent } from "@/lib/assessment/analytics";

interface CheckoutLineItem {
  description?: string;
  quantity?: number;
  amount_total?: number;
  currency?: string;
}

interface CheckoutReceipt {
  id?: string;
  amount_total?: number;
  amount_subtotal?: number;
  currency?: string;
  payment_status?: string;
  line_items?: CheckoutLineItem[];
}

const PURCHASE_KEY_PREFIX = "fabsy-assessment-purchase:";

export default function TicketAssessmentConfirmation() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [status, setStatus] = useState<"checking" | "paid" | "pending" | "error">("checking");
  const [message, setMessage] = useState("");

  useSafeHead({
    title: "Legacy Ticket Triage Received | Fabsy",
    description: "Fabsy received your legacy $149 Ticket Triage order and private Alberta traffic-ticket submission.",
    robots: "noindex, nofollow",
  });

  useEffect(() => {
    if (!sessionId || !/^cs_(test_|live_)[A-Za-z0-9]+$/.test(sessionId)) {
      setStatus("error");
      setMessage("The payment receipt link is incomplete. Check your payment email or contact Fabsy.");
      return;
    }

    void (async () => {
      const { data, error } = await supabase.functions.invoke<CheckoutReceipt>("get-checkout-session", {
        body: { sessionId },
      });
      if (error || !data) {
        setStatus("pending");
        setMessage("Payment confirmation can take a short time. Your Stripe receipt remains your payment record.");
        return;
      }

      const isAssessment = data.line_items?.some((item) =>
        item.description === TICKET_ASSESSMENT.name ||
        item.description === TICKET_ASSESSMENT.internalName ||
        item.description === "Traffic Ticket + Insurance Impact Assessment"
      );
      const validAmount = data.amount_subtotal === TICKET_ASSESSMENT.priceCents &&
        data.amount_total === TICKET_ASSESSMENT.priceCents &&
        data.currency?.toLowerCase() === "cad";
      if (data.payment_status !== "paid" || !isAssessment || !validAmount) {
        setStatus("pending");
        setMessage("Stripe has not confirmed this assessment payment yet. Refresh shortly or contact Fabsy if the status does not change.");
        return;
      }

      setStatus("paid");
      try {
        const purchaseKey = `${PURCHASE_KEY_PREFIX}${data.id || sessionId}`;
        if (!window.sessionStorage.getItem(purchaseKey)) {
          trackAssessmentEvent("assessment_purchase", {
            transaction_id: data.id || sessionId,
            value: TICKET_ASSESSMENT.priceCad,
            item_id: "ticket_triage",
            item_name: TICKET_ASSESSMENT.name,
          });
          trackAssessmentEvent("purchase", {
            transaction_id: data.id || sessionId,
            value: TICKET_ASSESSMENT.priceCad,
            items: [{
              item_id: "ticket_triage",
              item_name: TICKET_ASSESSMENT.name,
              price: TICKET_ASSESSMENT.priceCad,
              quantity: 1,
            }],
          });
          window.sessionStorage.setItem(purchaseKey, "1");
        }
        window.sessionStorage.removeItem("fabsy-ticket-assessment-draft-v1");
        window.sessionStorage.removeItem("fabsy-ticket-assessment-order-v1");
      } catch {
        // Receipt rendering is never blocked by browser storage or analytics.
      }
    })();
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="container mx-auto max-w-4xl px-4 py-12 sm:py-16">
        {status === "checking" && (
          <Card className="p-8 text-center shadow-elevated">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
            <h1 className="mt-5 text-2xl font-bold">Confirming your assessment payment…</h1>
          </Card>
        )}

        {status === "paid" && (
          <>
            <div className="text-center">
              <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" aria-hidden="true" />
              <p className="mt-5 text-sm font-bold uppercase tracking-[0.15em] text-emerald-700">Legacy $149 order · payment received</p>
              <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Your legacy Ticket Triage is in Fabsy's review queue</h1>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                We received the ticket and assessment details submitted before checkout. A human reviewer will assess the full picture and email the result to the purchase address.
              </p>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-3">
              <Card className="p-6">
                <FileCheck2 className="h-7 w-7 text-primary" aria-hidden="true" />
                <h2 className="mt-4 text-lg font-bold">Ticket received</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Your private upload and intake answers are attached to this assessment.</p>
              </Card>
              <Card className="p-6">
                <ShieldCheck className="h-7 w-7 text-primary" aria-hidden="true" />
                <h2 className="mt-4 text-lg font-bold">What Fabsy reviews</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">The charge, deadline, options, demerits, likely insurance significance and representation economics.</p>
              </Card>
              <Card className="p-6">
                <Mail className="h-7 w-7 text-primary" aria-hidden="true" />
                <h2 className="mt-4 text-lg font-bold">How you receive it</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Fabsy emails the human-reviewed assessment and recommended next step.</p>
              </Card>
            </div>

            <Alert className="mt-8 border-primary/20 bg-primary/5">
              <Clock3 className="h-4 w-4" />
              <AlertTitle>What happens next</AlertTitle>
              <AlertDescription>{TICKET_ASSESSMENT.deliveryExpectation} The assessment does not pause any deadline printed on your ticket.</AlertDescription>
            </Alert>

            <Alert className="mt-4 border-violet-200 bg-violet-50">
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>Rapid Resolution is a separate current service</AlertTitle>
              <AlertDescription>
                This receipt confirms the legacy $149 assessment only. Rapid Resolution currently
                costs ${RAPID_RESOLUTION.priceCad} CAD plus applicable GST and is purchased
                separately; no credit is automatically applied on this page. If you need Fabsy to
                review terms associated with an older order, contact us before making another payment.
              </AlertDescription>
            </Alert>

            <Card className="mt-8 p-6 sm:p-8">
              <h2 className="text-xl font-bold">Need to add or correct something?</h2>
              <p className="mt-2 leading-relaxed text-muted-foreground">
                Email <a href="mailto:hello@fabsy.ca" className="font-semibold text-primary underline">hello@fabsy.ca</a> from the purchase address or call <a href="tel:+18257932279" className="font-semibold text-primary underline">(825) 793-2279</a>. Do not send sensitive documents through an untrusted link.
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Button asChild><Link to="/">Return home</Link></Button>
                <Button asChild variant="outline"><Link to={RAPID_RESOLUTION.slug}>Review Rapid Resolution</Link></Button>
              </div>
            </Card>
          </>
        )}

        {(status === "pending" || status === "error") && (
          <Card className="p-7 shadow-elevated sm:p-9">
            <Clock3 className="h-10 w-10 text-amber-600" aria-hidden="true" />
            <h1 className="mt-5 text-3xl font-bold">We could not confirm the receipt on this page</h1>
            <p className="mt-4 leading-relaxed text-muted-foreground">{message}</p>
            <p className="mt-4 text-sm text-muted-foreground">No new payment will be attempted from this page.</p>
            <div className="mt-6 flex gap-3">
              {status === "pending" && <Button onClick={() => window.location.reload()}>Refresh status</Button>}
              <Button asChild variant="outline"><Link to="/contact">Contact Fabsy</Link></Button>
            </div>
          </Card>
        )}
      </main>
      <Footer />
    </div>
  );
}
