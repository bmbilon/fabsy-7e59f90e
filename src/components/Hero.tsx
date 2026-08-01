import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Calculator, Zap, DollarSign, Phone, CheckCircle } from "lucide-react";
import { EligibilityChecker } from "./EligibilityChecker";

const features = [
  { icon: Zap, title: "Online submission", sub: "Upload your ticket" },
  { icon: Shield, title: "Agent service", sub: "Alberta traffic matters" },
  { icon: DollarSign, title: "Clear pricing", sub: "Explained before checkout" },
];

const stats = [
  { value: "Alberta", label: "Service area" },
  { value: "Agent service", label: "Not a law firm" },
  { value: "Online", label: "Ticket submission" },
  { value: "95%+", label: "Historical success rate", note: "Past results do not predict future outcomes" },
];

const Hero = () => {
  const [eligibilityOpen, setEligibilityOpen] = useState(false);

  const scrollToPricing = () =>
    document.getElementById("pricing-overview")?.scrollIntoView({ behavior: "smooth" });

  return (
    <section className="relative bg-gradient-hero overflow-hidden">
      <div className="container mx-auto px-4 py-20 lg:py-28 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
          {/* LEFT column */}
          <div className="space-y-8">
            {/* Pill badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5">
              <span className="text-xs font-semibold tracking-wide text-primary-light">
                Pricing is a flat $488 plus 30% of any fine reduction achieved. If the fine is
                not reduced, there is no additional charge.
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight">
              <span className="block text-white">Take the next step{" "}</span>
              <span className="block text-primary">on your traffic ticket.</span>
            </h1>

            {/* Subcopy */}
            <p className="text-lg lg:text-xl text-slate-300 leading-relaxed max-w-xl">
              Submit your ticket online for review by Fabsy's traffic ticket agent team. We assess
              the information available and explain the next steps without promising an outcome.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary-dark text-white transition-smooth text-base font-semibold px-6 py-6"
                onClick={() => setEligibilityOpen(true)}
              >
                Review your ticket
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="text-white hover:bg-primary/15 hover:text-white transition-smooth text-base font-semibold px-6 py-6"
                onClick={scrollToPricing}
              >
                <Calculator className="mr-2 h-5 w-5" />
                Review pricing
              </Button>
            </div>

            {/* Call option */}
            <p className="text-base text-slate-300">
              Prefer to talk?{" "}
              <a
                href="tel:+18257932279"
                className="inline-flex items-center gap-2 font-semibold text-primary hover:text-primary-light transition-smooth"
              >
                <Phone className="h-4 w-4" />
                Call (825) 793-2279
              </a>
            </p>

            {/* Feature chips */}
            <div className="grid sm:grid-cols-3 gap-4 pt-2">
              {features.map(({ icon: Icon, title, sub }) => (
                <div key={title} className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-sm font-bold text-white">{title}</div>
                    <div className="text-xs text-slate-400">{sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Approach card */}
            <div className="rounded-xl border border-white/15 bg-white/5 p-5">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold text-white">Our approach</h2>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                We review each ticket on its own facts, communicate clearly, and work toward the
                best available outcome. Fabsy is an agent service, not a law firm.
              </p>
            </div>
          </div>

          {/* RIGHT column: service overview */}
          <div className="flex justify-center lg:justify-end">
            <div className="w-full max-w-xl rounded-2xl border border-white/15 bg-slate-950/50 p-8 shadow-elevated backdrop-blur-sm">
              <h2 className="text-2xl font-bold text-white">What the service includes</h2>
              <div className="mt-6 space-y-5">
                {[
                  "Review of the ticket details you submit",
                  "Assessment of agent-service availability",
                  "A representation plan based on available information",
                  "Updates as the matter progresses",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <span className="text-slate-200">{item}</span>
                  </div>
                ))}
              </div>
              <p className="mt-8 border-t border-white/10 pt-5 text-sm leading-relaxed text-slate-400">
                Service availability and outcomes depend on the ticket, court location, and case
                circumstances. No specific result is promised.
              </p>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="mt-16 lg:mt-20 grid grid-cols-2 lg:grid-cols-4 rounded-2xl border border-white/10 divide-x divide-y lg:divide-y-0 divide-white/10">
          {stats.map(({ value, label, note }) => (
            <div key={value} className="px-6 py-6 text-center sm:text-left">
              <div className="text-3xl font-bold text-white">{value}</div>
              <div className="mt-1 text-sm text-slate-400">{label}</div>
              {note && <div className="mt-1 text-xs text-slate-500">{note}</div>}
            </div>
          ))}
        </div>

        {/* Pricing details */}
        <p className="mt-8 text-xs text-muted-foreground max-w-3xl leading-relaxed">
          Pricing is a flat $488 plus 30% of any fine reduction achieved. If the fine is not
          reduced, there is no additional charge.
        </p>
      </div>

      <EligibilityChecker open={eligibilityOpen} onOpenChange={setEligibilityOpen} />
    </section>
  );
};

export default Hero;
