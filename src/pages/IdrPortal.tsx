import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileSearch, FileUp, LogOut } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import IdrAccessGate from "@/components/idr/IdrAccessGate";
import { useIdrAuth } from "@/hooks/useIdrAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import useSafeHead from "@/hooks/useSafeHead";
import { idrDb } from "@/lib/idr/supabase";

interface PortalOrder {
  id: string;
  type: "standalone" | "addon";
  price_paid: number;
  status: "paid" | "awaiting_abstract" | "in_review" | "delivered";
  created_at: string;
  idr_reports?: { id: string } | { id: string }[] | null;
}

function hasReport(value: PortalOrder["idr_reports"]) {
  return Array.isArray(value) ? Boolean(value[0]) : Boolean(value);
}

function PortalContent() {
  const { session, signOut } = useIdrAuth();
  const [orders, setOrders] = useState<PortalOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    idrDb
      .from("idr_orders")
      .select("id,type,price_paid,status,created_at,idr_reports(id)")
      .order("created_at", { ascending: false })
      .then(({ data, error: queryError }) => {
        if (queryError) setError(queryError.message);
        else setOrders(data || []);
        setIsLoading(false);
      });
  }, [session]);

  return (
    <main className="container mx-auto max-w-5xl px-4 py-12">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge className="mb-3">Private portal</Badge>
          <h1 className="text-3xl font-bold sm:text-4xl">Your Insurance Damage Reports</h1>
          <p className="mt-2 text-muted-foreground">Signed in as {session?.user.email}</p>
        </div>
        <Button variant="outline" onClick={() => signOut()}><LogOut className="mr-2 h-4 w-4" /> Sign out</Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading your orders...</p>
      ) : error ? (
        <Card><CardContent className="p-6 text-destructive">{error}</CardContent></Card>
      ) : orders.length === 0 ? (
        <Card>
          <CardHeader><CardTitle>No IDR orders found</CardTitle><CardDescription>Use the same email address entered at checkout.</CardDescription></CardHeader>
          <CardContent><Button asChild><Link to="/insurance-damage-report">View the IDR service</Link></Button></CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="outline" className="capitalize">{order.status.replace("_", " ")}</Badge>
                  <span className="text-sm text-muted-foreground">{new Date(order.created_at).toLocaleDateString()}</span>
                </div>
                <CardTitle>{order.type === "addon" ? "Ticket checkout add-on" : "Standalone IDR"}</CardTitle>
                <CardDescription>${Number(order.price_paid).toFixed(2)} CAD</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                {order.status === "delivered" && hasReport(order.idr_reports) ? (
                  <Button asChild><Link to={`/portal/insurance-reports/${order.id}`}><FileSearch className="mr-2 h-4 w-4" /> View report</Link></Button>
                ) : (
                  <Button asChild><Link to="/insurance-damage-report/intake"><FileUp className="mr-2 h-4 w-4" /> Upload or check status</Link></Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}

export default function IdrPortal() {
  useSafeHead({ title: "Your Insurance Damage Reports | Fabsy", robots: "noindex, nofollow" });
  return <div className="min-h-screen bg-background"><Header /><IdrAccessGate redirectPath="/portal/insurance-reports"><PortalContent /></IdrAccessGate><Footer /></div>;
}
