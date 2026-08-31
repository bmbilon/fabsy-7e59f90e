import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileSearch, Ticket } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import IdrAccessGate from "@/components/idr/IdrAccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import useSafeHead from "@/hooks/useSafeHead";
import { idrDb } from "@/lib/idr/supabase";

interface ClientCase {
  id: string;
  ticket_number: string;
  violation: string;
  status: string;
  verdict: "winnable" | "reducible" | "unwinnable" | null;
  created_at: string;
}

function CasesContent() {
  const [cases, setCases] = useState<ClientCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    idrDb
      .from("ticket_submissions")
      .select("id,ticket_number,violation,status,verdict,created_at")
      .neq("status", "awaiting_payment")
      .order("created_at", { ascending: false })
      .then(({ data, error: queryError }) => {
        if (queryError) setError(queryError.message);
        else setCases(data || []);
        setIsLoading(false);
      });
  }, []);

  return (
    <main className="container mx-auto max-w-4xl px-4 py-12">
      <Badge className="mb-3">Private portal</Badge>
      <h1 className="text-3xl font-bold sm:text-4xl">Your ticket assessments</h1>
      <p className="mt-2 text-muted-foreground">Open a case to see Fabsy's assessment and available next steps.</p>
      <nav aria-label="Portal navigation" className="mt-5 flex flex-wrap gap-3">
        <Button asChild variant="outline"><Link to="/portal/referrals">Refer a driver</Link></Button>
        <Button asChild variant="outline"><Link to="/portal/pro-discount">Verify pro driver discount</Link></Button>
        <Button asChild variant="outline"><Link to="/portal/insurance-reports">My insurance reports</Link></Button>
      </nav>
      <div className="mt-8 space-y-4">
        {isLoading ? <p className="text-muted-foreground">Loading cases...</p> : error ? (
          <Card><CardContent className="p-6 text-destructive">{error}</CardContent></Card>
        ) : cases.length === 0 ? (
          <Card><CardHeader><CardTitle>No ticket cases found</CardTitle><CardDescription>Use the same email address entered with your ticket submission.</CardDescription></CardHeader></Card>
        ) : cases.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2"><Ticket className="h-5 w-5" /> Ticket {item.ticket_number}</CardTitle>
                <Badge variant={item.verdict ? "default" : "outline"} className="capitalize">{item.verdict || "assessment pending"}</Badge>
              </div>
              <CardDescription>{item.violation}</CardDescription>
            </CardHeader>
            <CardContent><Button asChild><Link to={`/portal/cases/${item.id}`}><FileSearch className="mr-2 h-4 w-4" /> View assessment</Link></Button></CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}

export default function ClientCasesPage() {
  useSafeHead({ title: "Your Fabsy Cases", robots: "noindex, nofollow" });
  return <div className="min-h-screen bg-background"><Header /><IdrAccessGate redirectPath="/portal/cases"><CasesContent /></IdrAccessGate><Footer /></div>;
}
