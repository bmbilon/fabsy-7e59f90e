import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Download, Printer } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import IdrAccessGate from "@/components/idr/IdrAccessGate";
import IdrReportView from "@/components/idr/IdrReportView";
import { supabase } from "@/integrations/supabase/client";
import type { IdrReport } from "@/lib/idr/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import useSafeHead from "@/hooks/useSafeHead";
import { idrDb } from "@/lib/idr/supabase";

interface StoredReport {
  id: string;
  report_json: IdrReport;
  pdf_url: string | null;
  generated_at: string;
}

function ReportContent({ orderId }: { orderId: string }) {
  const [report, setReport] = useState<StoredReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    idrDb
      .from("idr_reports")
      .select("id,report_json,pdf_url,generated_at")
      .eq("idr_order_id", orderId)
      .maybeSingle()
      .then(({ data, error: queryError }) => {
        if (queryError) setError(queryError.message);
        else setReport(data);
        setIsLoading(false);
      });
  }, [orderId]);

  const downloadPdf = async () => {
    if (!report?.pdf_url) return;
    setIsDownloading(true);
    const { data, error: signedError } = await supabase.storage
      .from("idr-reports")
      .createSignedUrl(report.pdf_url, 60, { download: "fabsy-insurance-damage-report.pdf" });
    if (signedError || !data?.signedUrl) {
      setError(signedError?.message || "Unable to create a secure download link.");
    } else {
      const link = document.createElement("a");
      link.href = data.signedUrl;
      link.download = "fabsy-insurance-damage-report.pdf";
      link.rel = "noopener";
      link.click();
    }
    setIsDownloading(false);
  };

  if (isLoading) return <main className="container mx-auto px-4 py-16 text-center text-muted-foreground">Loading your report...</main>;
  if (error) return <main className="container mx-auto px-4 py-16"><Card><CardContent className="p-6 text-destructive">{error}</CardContent></Card></main>;
  if (!report) return <main className="container mx-auto px-4 py-16"><Card><CardContent className="p-6">This report is still being prepared.</CardContent></Card></main>;

  return (
    <main className="container mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="outline"><Link to="/portal/insurance-reports">Back to reports</Link></Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print</Button>
          {report.pdf_url && <Button onClick={downloadPdf} disabled={isDownloading}><Download className="mr-2 h-4 w-4" /> {isDownloading ? "Preparing..." : "Download PDF"}</Button>}
        </div>
      </div>
      <IdrReportView report={report.report_json} />
      <div className="mt-8 text-center print:hidden">
        <Button asChild variant="outline"><Link to={`/portal/insurance-reports/${orderId}/survey`}>Share your outcome</Link></Button>
      </div>
    </main>
  );
}

export default function IdrReportPage() {
  const { orderId = "" } = useParams();
  useSafeHead({ title: "Private Insurance Damage Report | Fabsy", robots: "noindex, nofollow" });
  return (
    <div className="min-h-screen bg-background">
      <div className="print:hidden"><Header /></div>
      <IdrAccessGate redirectPath={`/portal/insurance-reports/${orderId}`}>
        {orderId ? <ReportContent orderId={orderId} /> : <p className="p-8">Missing report order.</p>}
      </IdrAccessGate>
      <div className="print:hidden"><Footer /></div>
    </div>
  );
}
