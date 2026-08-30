import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FileSearch, ShieldCheck } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import IdrAccessGate from "@/components/idr/IdrAccessGate";
import { supabase } from "@/integrations/supabase/client";
import { IDR_DISCLAIMER, IDR_PRICE_ADDON, IDR_PRICE_STANDALONE } from "@/config/idr";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import useSafeHead from "@/hooks/useSafeHead";
import { idrDb } from "@/lib/idr/supabase";
import { INSURANCE_IMPACT_REPORT, RAPID_RESOLUTION } from "@/config/offers";

interface CaseRecord {
  id: string;
  ticket_number: string;
  violation: string;
  fine_amount: string;
  status: string;
  verdict: "winnable" | "reducible" | "unwinnable" | null;
  case_outcome: string | null;
  clients: {
    email: string;
  };
}

function CaseContent({ caseId }: { caseId: string }) {
  const [caseRecord, setCaseRecord] = useState<CaseRecord | null>(null);
  const [hasIdr, setHasIdr] = useState(false);
  const [idrCheckoutOrderId] = useState(() => crypto.randomUUID());
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data, error: caseError } = await idrDb
        .from("ticket_submissions")
        .select("id,ticket_number,violation,fine_amount,status,verdict,case_outcome,clients(email)")
        .eq("id", caseId)
        .single();
      if (caseError) {
        setError(caseError.message);
        setIsLoading(false);
        return;
      }
      setCaseRecord(data);
      const { data: idrOrder } = await idrDb
        .from("idr_orders")
        .select("id")
        .eq("ticket_submission_id", caseId)
        .maybeSingle();
      setHasIdr(Boolean(idrOrder));
      setIsLoading(false);
    };
    load();
  }, [caseId]);

  const startAddonCheckout = async () => {
    if (!caseRecord) return;
    setIsCheckingOut(true);
    setError(null);
    const client = caseRecord.clients;
    const { data, error: checkoutError } = await supabase.functions.invoke("create-idr-payment", {
      body: {
        product: "addon",
        orderId: idrCheckoutOrderId,
        ticketSubmissionId: caseRecord.id,
        email: client.email,
      },
    });
    if (checkoutError || !data?.url) {
      setError(checkoutError?.message || "Unable to start secure checkout.");
      setIsCheckingOut(false);
      return;
    }
    window.location.assign(data.url);
  };

  const startDamageControlCheckout = async () => {
    if (!caseRecord) return;
    setIsCheckingOut(true);
    setError(null);
    const client = caseRecord.clients;
    const { data, error: checkoutError } = await supabase.functions.invoke("create-idr-payment", {
      body: {
        product: "standalone",
        orderId: idrCheckoutOrderId,
        ticketSubmissionId: caseRecord.id,
        email: client.email,
      },
    });
    if (checkoutError || !data?.url) {
      setError(checkoutError?.message || "Unable to start secure checkout.");
      setIsCheckingOut(false);
      return;
    }
    window.location.assign(data.url);
  };

  if (isLoading) return <main className="container mx-auto px-4 py-16 text-center text-muted-foreground">Loading assessment...</main>;
  if (error && !caseRecord) return <main className="container mx-auto px-4 py-16"><Alert variant="destructive"><AlertTitle>Case unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert></main>;
  if (!caseRecord) return null;

  return (
    <main className="container mx-auto max-w-4xl px-4 py-12">
      <Button asChild variant="outline" className="mb-6"><Link to="/portal/cases">Back to cases</Link></Button>
      <Card className="overflow-hidden">
        <div className="bg-slate-950 p-7 text-white">
          <Badge className="mb-3 bg-black/20 text-white">Ticket {caseRecord.ticket_number}</Badge>
          <h1 className="text-3xl font-bold">{caseRecord.violation}</h1>
          <p className="mt-2 text-white/70">Fine listed: ${caseRecord.fine_amount}</p>
        </div>
        <CardContent className="p-6 sm:p-8">
          {caseRecord.status === "awaiting_payment" ? (
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>Payment has not been confirmed</AlertTitle>
              <AlertDescription>
                This submission is not an active Rapid Resolution matter. Return to the ticket form to start the secure ${RAPID_RESOLUTION.priceCad} CAD plus GST checkout.
              </AlertDescription>
            </Alert>
          ) : !caseRecord.verdict ? (
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>Your file is in progress</AlertTitle>
              <AlertDescription>Fabsy is reviewing the current file state and will notify you when an action or decision is required.</AlertDescription>
            </Alert>
          ) : caseRecord.verdict === "unwinnable" || caseRecord.case_outcome === "conviction_stands" ? (
            <div className="space-y-6">
              <div>
                <Badge variant="destructive">
                  {caseRecord.case_outcome === "conviction_stands" ? "Case outcome: conviction stands" : "No supported pre-trial path identified"}
                </Badge>
                <h2 className="mt-4 text-3xl font-bold">
                  {caseRecord.case_outcome === "conviction_stands"
                    ? "The conviction stands. Here is the damage-control plan."
                    : "The current record does not support advancing a pre-trial request. Here is the renewal-planning option."}
                </h2>
                <p className="mt-3 text-muted-foreground">
                  The {INSURANCE_IMPACT_REPORT.name} provides source-backed conviction-impact scenarios, aging dates, public research sources and questions for a licensed broker. It is separate from Rapid Resolution unless purchased in the bundle.
                </p>
              </div>
              {hasIdr ? (
                <Button asChild><Link to="/portal/insurance-reports">Open your IDR order</Link></Button>
              ) : (
                <Button size="lg" onClick={startDamageControlCheckout} disabled={isCheckingOut}>
                  <FileSearch className="mr-2 h-5 w-5" /> {isCheckingOut ? "Opening checkout..." : `Get the damage-control report for $${IDR_PRICE_STANDALONE}`}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <Badge>Pre-trial review can proceed</Badge>
                <h2 className="mt-4 text-3xl font-bold">Fabsy can advance the next authorized step</h2>
                <p className="mt-3 text-muted-foreground">Rapid Resolution is ${RAPID_RESOLUTION.priceCad} CAD plus GST for eligible pre-trial matters. Trial representation and government fines are separate. {RAPID_RESOLUTION.outcomeDisclaimer}</p>
              </div>
              {hasIdr ? (
                <Button asChild><Link to="/portal/insurance-reports">Open your IDR order</Link></Button>
              ) : (
                <>
                  <p className="rounded-lg border border-primary/25 bg-primary/5 p-4 leading-relaxed">
                    Add the {INSURANCE_IMPACT_REPORT.name} for ${IDR_PRICE_ADDON}. Understand possible conviction impact and prepare for renewal with source-backed planning information.
                  </p>
                  <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">{IDR_DISCLAIMER}</p>
                  <Button size="lg" onClick={startAddonCheckout} disabled={isCheckingOut}>
                    <FileSearch className="mr-2 h-5 w-5" /> {isCheckingOut ? "Opening checkout..." : `Add the insurance report for $${IDR_PRICE_ADDON}`}
                  </Button>
                </>
              )}
            </div>
          )}
          {error && <p className="mt-5 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
      {(caseRecord.verdict === "unwinnable" || caseRecord.case_outcome === "conviction_stands") && <p className="mt-6 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">{IDR_DISCLAIMER}</p>}
    </main>
  );
}

export default function ClientCasePage() {
  const { caseId = "" } = useParams();
  useSafeHead({ title: "Your Fabsy Case", robots: "noindex, nofollow" });
  return <div className="min-h-screen bg-background"><Header /><IdrAccessGate redirectPath={`/portal/cases/${caseId}`}>{caseId ? <CaseContent caseId={caseId} /> : <p className="p-8">Missing case.</p>}</IdrAccessGate><Footer /></div>;
}
