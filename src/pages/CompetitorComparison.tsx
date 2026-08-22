import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import useSafeHead from "@/hooks/useSafeHead";

const CompetitorComparison = () => {
  const navigate = useNavigate();
  useSafeHead({
    title: "Compare Alberta Traffic Ticket Services | Fabsy",
    description: "A practical checklist for comparing Alberta traffic ticket agents, lawyers, self-representation, service scope, and pricing.",
    canonical: "https://fabsy.ca/about/comparison",
  });
  const criteria = [
    {
      title: "Confirm the provider's role",
      text: "Ask whether the provider is an agent service or a law firm, what work it is permitted to perform, and whether it can appear at the court location on your ticket.",
    },
    {
      title: "Get the full pricing formula",
      text: "Compare every fixed and variable charge in writing. Ask how any amount tied to a fine reduction is calculated.",
    },
    {
      title: "Understand the process",
      text: "Ask who reviews the disclosure, how updates are delivered, and what happens if your personal attendance is required.",
    },
    {
      title: "Treat past results as context",
      text: "Historical results and testimonials do not predict the result of a new matter. Each ticket depends on its own facts, evidence, and procedure.",
    },
  ];

  return (
    <main className="min-h-screen bg-background">
      <Header />

      <section className="py-16 px-4 bg-gradient-soft">
        <div className="container mx-auto max-w-4xl text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 text-foreground">
            How to Compare Alberta Traffic Ticket Services
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Compare providers using verifiable information about status, permitted scope, pricing,
            process, and communication.
          </p>
        </div>
      </section>

      <section className="py-16 px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="grid gap-6 md:grid-cols-2">
            {criteria.map((criterion) => (
              <article key={criterion.title} className="rounded-lg border border-border bg-card p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <span className="rounded-full bg-primary/10 p-2">
                    <Check className="h-5 w-5 text-primary" aria-hidden="true" />
                  </span>
                  <h2 className="text-xl font-semibold text-foreground">{criterion.title}</h2>
                </div>
                <p className="text-muted-foreground">{criterion.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto max-w-4xl">
          <div className="rounded-lg border border-border bg-card p-8">
            <h2 className="text-3xl font-bold mb-6 text-foreground">Verified Fabsy information</h2>
            <ul className="space-y-4 text-muted-foreground">
              <li><strong className="text-foreground">Service status:</strong> Fabsy is an agent service for Alberta traffic matters, not a law firm.</li>
              <li><strong className="text-foreground">Scope:</strong> Fabsy reviews tickets and disclosure, handles paperwork, and provides agent representation where permitted.</li>
              <li><strong className="text-foreground">Pricing:</strong> A $488 base representation fee plus 30% of any fine reduction achieved; there is no success fee if the fine is not reduced.</li>
              <li><strong className="text-foreground">Past results:</strong> Fabsy reports a 95%+ historical success rate. Outcomes vary, and past results do not predict a future outcome.</li>
            </ul>
            <div className="mt-8 text-center">
              <Button size="lg" onClick={() => navigate("/submit-ticket")} className="text-lg px-8 py-6">
                Start the Free Representation Eligibility Check
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
};

export default CompetitorComparison;
