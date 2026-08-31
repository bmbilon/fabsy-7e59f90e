import { lazy, Suspense, useState } from "react";
import { Link } from "react-router-dom";
import { FileSearch } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import useSafeHead from "@/hooks/useSafeHead";

const EligibilityChecker = lazy(() => import("@/components/EligibilityChecker").then(module => ({ default: module.EligibilityChecker })));

export default function FreeTicketCheck() {
  const [open, setOpen] = useState(false);
  useSafeHead({
    title: "Free Alberta Ticket Check | Fabsy",
    description: "Check your Alberta ticket type and service eligibility before choosing paid help. No payment is required for the free ticket check.",
    canonical: "https://fabsy.ca/free-ticket-check",
  });
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="container mx-auto max-w-3xl px-4 py-16">
        <Card className="p-7 sm:p-10">
          <FileSearch className="h-9 w-9 text-primary" aria-hidden="true" />
          <h1 className="mt-5 text-4xl font-bold">Free Ticket Check</h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">Upload your Alberta ticket and check its details and service eligibility before choosing paid help. A photo radar owner notice has no demerits and no insurance impact.</p>
          <p className="mt-4 leading-relaxed text-muted-foreground">No payment is required for this check. It does not retain Fabsy, enter a plea, request disclosure or pause your ticket deadline. Verify extracted details against the notice.</p>
          <Button size="lg" className="mt-7" onClick={() => setOpen(true)}>Check my ticket</Button>
          <p className="mt-5 text-sm text-muted-foreground">Already know it is an owner notice? <Link to="/photo-radar" className="font-semibold text-primary underline">View Photo Radar · $79 + GST</Link>.</p>
        </Card>
        {open ? <Suspense fallback={<p role="status" className="mt-4">Loading the ticket checker…</p>}><EligibilityChecker open={open} onOpenChange={setOpen} /></Suspense> : null}
      </main>
      <Footer />
    </div>
  );
}
