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
                This submission is not an active ticket defense case. Return to the ticket form to start the secure $488 checkout.
              </AlertDescription>
            </Alert>
          ) : !caseRecord.verdict ? (
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>Your assessment is in progress</AlertTitle>
              <AlertDescription>Fabsy has not posted a verdict yet. Your $488 ticket defense service remains the core service while the review is completed.</AlertDescription>
            </Alert>
          ) : caseRecord.verdict === "unwinnable" || caseRecord.case_outcome === "conviction_stands" ? (
            <div className="space-y-6">
              <div>
                <Badge variant="destructive">
                  {caseRecord.case_outcome === "conviction_stands" ? "Case outcome: conviction stands" : "Honest verdict: unwinnable"}
                </Badge>
                <h2 className="mt-4 text-3xl font-bold">
                  {caseRecord.case_outcome === "conviction_stands"
                    ? "The conviction stands. Here is the damage-control plan."
                    : "Fabsy does not see a viable path to beat this ticket. Here is the damage-control plan."}
                </h2>
                <p className="mt-3 text-muted-foreground">
                  The Insurance Damage Report focuses on the estimated insurance impact, conviction aging dates, and carriers worth calling. It is separate from the $488 ticket defense service already purchased.
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
                <Badge>{caseRecord.verdict === "winnable" ? "Winnable" : "Reducible"}</Badge>
                <h2 className="mt-4 text-3xl font-bold">Fabsy can take this ticket forward</h2>
                <p className="mt-3 text-muted-foreground">The ticket defense base fee is $488. A 30% success fee applies to any fine reduction Fabsy achieves and is additional to the $488. If no fine reduction is achieved, no success fee is charged. This assessment is not a promise of dismissal, a lower fine, or fewer demerits.</p>
              </div>
              {hasIdr ? (
                <Button asChild><Link to="/portal/insurance-reports">Open your IDR order</Link></Button>
              ) : (
                <>
                  <p className="rounded-lg border border-primary/25 bg-primary/5 p-4 leading-relaxed">
                    Add the Insurance Damage Report for ${IDR_PRICE_ADDON}. Know your estimated insurance exposure whichever way the ticket goes.
                  </p>
                  <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">{IDR_DISCLAIMER}</p>
                  <Button size="lg" onClick={startAddonCheckout} disabled={isCheckingOut}>
                    <FileSearch className="mr-2 h-5 w-5" /> {isCheckingOut ? "Opening checkout..." : `Add the IDR for $${IDR_PRICE_ADDON}`}
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
