import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Calculator, Zap, DollarSign, Phone } from "lucide-react";
import { EligibilityChecker } from "./EligibilityChecker";

const features = [
  { icon: Zap, title: "Fast & simple", sub: "Upload in minutes" },
  { icon: Shield, title: "Flat-fee pricing", sub: "$488 + 30% of any reduction" },
  { icon: DollarSign, title: "Save more", sub: "Avoid hikes and demerits" },
];

const stats = [
  { value: "95%+", label: "Success rate" },
  { value: "$993", label: "Average saved" },
  { value: "24 hr", label: "Turnaround" },
  { value: "4.9/5", label: "from 1,200+ drivers", note: "Real results. Real reviews." },
];

const Hero = () => {
  const [eligibilityOpen, setEligibilityOpen] = useState(false);

  const scrollToSavings = () =>
    document.getElementById("savings-calculator")?.scrollIntoView({ behavior: "smooth" });

  return (
    <section className="relative bg-gradient-hero overflow-hidden">
      <div className="container mx-auto px-4 py-20 lg:py-28 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
          {/* LEFT column */}
          <div className="space-y-8">
            {/* Pill badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5">
              <span className="text-xs font-semibold tracking-wide text-primary-light">
                Flat $488* to fight. 30% only if we win.
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight">
              <span className="block text-white">Keep your record clean.</span>
              <span className="block text-primary">Without the usual fight.</span>
            </h1>

            {/* Subcopy */}
            <p className="text-lg lg:text-xl text-slate-300 leading-relaxed max-w-xl">
              We handle the clash with the system so you don't have to. Protect your record,
              avoid demerits, and keep your insurance rates from climbing.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary-dark text-white transition-smooth text-base font-semibold px-6 py-6"
                onClick={() => setEligibilityOpen(true)}
              >
                Check if your ticket qualifies
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="text-white hover:bg-primary/15 hover:text-white transition-smooth text-base font-semibold px-6 py-6"
                onClick={scrollToSavings}
              >
                <Calculator className="mr-2 h-5 w-5" />
                Estimate your savings
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

            {/* Promise card */}
            <div className="rounded-xl border border-white/15 bg-white/5 p-5">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold text-white">Our promise to you</h2>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                We fight for the best possible outcome so you can move on with life. No stress.
                No court visits. No BS.
              </p>
            </div>
          </div>

          {/* RIGHT column: comparison image */}
          <div className="flex justify-center lg:justify-end">
            <img
              src="/fight-traffic-ticket-alberta-fabsy-comparison.webp"
              alt="Fighting an Alberta traffic ticket on your own versus with Fabsy: ticket reviewed, reviewed by experts, best outcome strategy, we handle the process, record protected, low fixed fee."
              width={1305}
              height={1205}
              loading="lazy"
              decoding="async"
              className="w-full h-auto max-w-full"
            />
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

        {/* Fine print */}
        <p className="mt-8 text-xs text-muted-foreground max-w-3xl leading-relaxed">
          *$488 is a flat fee to fight your ticket, non-refundable, win or lose. If we reduce
          your fine, you also pay 30% of the reduction. If there is no reduction, you pay no
          fees beyond the $488.
        </p>
      </div>

      <EligibilityChecker open={eligibilityOpen} onOpenChange={setEligibilityOpen} />
    </section>
  );
};

export default Hero;
