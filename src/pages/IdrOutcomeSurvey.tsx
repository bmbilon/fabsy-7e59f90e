import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import IdrAccessGate from "@/components/idr/IdrAccessGate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import useSafeHead from "@/hooks/useSafeHead";
import { idrDb } from "@/lib/idr/supabase";

function SurveyContent({ orderId }: { orderId: string }) {
  const [clientId, setClientId] = useState("");
  const [reportId, setReportId] = useState("");
  const [priorCarrier, setPriorCarrier] = useState("");
  const [newCarrier, setNewCarrier] = useState("");
  const [premiumBefore, setPremiumBefore] = useState("");
  const [premiumAfter, setPremiumAfter] = useState("");
  const [switched, setSwitched] = useState<boolean | null>(null);
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    idrDb
      .from("idr_orders")
      .select("client_id,idr_reports(id)")
      .eq("id", orderId)
      .single()
      .then(({ data, error: queryError }) => {
        if (queryError) setError(queryError.message);
        else {
          setClientId(data.client_id);
          const relatedReport = Array.isArray(data.idr_reports) ? data.idr_reports[0] : data.idr_reports;
          setReportId(relatedReport?.id || "");
        }
      });
  }, [orderId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!clientId || !reportId) return;
    setIsSaving(true);
    setError(null);
    const money = (value: string) => value.trim() === "" ? null : Number(value);
    const { error: saveError } = await idrDb.from("outcome_surveys").upsert(
      {
        client_id: clientId,
        idr_report_id: reportId,
        prior_carrier: priorCarrier.trim() || null,
        new_carrier: newCarrier.trim() || null,
        premium_before: money(premiumBefore),
        premium_after: money(premiumAfter),
        switched,
        notes: notes.trim() || null,
        responded_at: new Date().toISOString(),
      },
      { onConflict: "client_id,idr_report_id" },
    );
    if (saveError) setError(saveError.message);
    else setCompleted(true);
    setIsSaving(false);
  };

  if (completed) {
    return (
      <main className="container mx-auto max-w-xl px-4 py-16">
        <Alert className="border-primary/30 bg-primary/5">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Thank you</AlertTitle>
          <AlertDescription>Your response helps Fabsy improve future consumer research.</AlertDescription>
        </Alert>
        <Button asChild className="mt-5"><Link to={`/portal/insurance-reports/${orderId}`}>Return to your report</Link></Button>
      </main>
    );
  }

  return (
    <main className="container mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>What happened after your report?</CardTitle>
          <CardDescription>Every answer is optional. This is a short follow-up designed to take under 90 seconds.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="prior-carrier">Carrier before the report</Label><Input id="prior-carrier" value={priorCarrier} onChange={(event) => setPriorCarrier(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="new-carrier">Carrier now</Label><Input id="new-carrier" value={newCarrier} onChange={(event) => setNewCarrier(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="premium-before">Annual premium before</Label><Input id="premium-before" type="number" min="0" step="0.01" inputMode="decimal" value={premiumBefore} onChange={(event) => setPremiumBefore(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="premium-after">Annual premium now</Label><Input id="premium-after" type="number" min="0" step="0.01" inputMode="decimal" value={premiumAfter} onChange={(event) => setPremiumAfter(event.target.value)} /></div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border p-4">
              <Checkbox id="switched" checked={switched === true} onCheckedChange={(value) => setSwitched(value === true)} />
              <Label htmlFor="switched">I changed insurance carriers after receiving the report</Label>
            </div>
            <div className="space-y-2"><Label htmlFor="survey-notes">Anything else you want to share?</Label><Textarea id="survey-notes" maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" type="submit" disabled={isSaving || !clientId || !reportId}>{isSaving ? "Saving..." : "Submit response"}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

export default function IdrOutcomeSurvey() {
  const { orderId = "" } = useParams();
  useSafeHead({ title: "IDR Outcome Survey | Fabsy", robots: "noindex, nofollow" });
  return <div className="min-h-screen bg-background"><Header /><IdrAccessGate redirectPath={`/portal/insurance-reports/${orderId}/survey`}>{orderId ? <SurveyContent orderId={orderId} /> : <p className="p-8">Missing report order.</p>}</IdrAccessGate><Footer /></div>;
}
