import { ArrowRight, CheckCircle2, FileCheck2, Gauge, ShieldCheck, UserRoundCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TICKET_ASSESSMENT } from "@/config/ticketAssessment";
import { trackAssessmentEvent } from "@/lib/assessment/analytics";

const trustPoints = [
  { icon: UserRoundCheck, label: "Human reviewed" },
  { icon: Gauge, label: "Insurance impact included" },
  { icon: ShieldCheck, label: "Clear recommended next step" },
  { icon: FileCheck2, label: "$149 CAD total" },
] as const;

const included = [
  "The charge, deadline, fine and demerit implications",
  "Your practical options and likely insurance significance",
  "The financial break-even for representation",
  "A direct, human-reviewed recommendation",
] as const;

const Hero = () => {
  const scrollToDetails = () =>
    document.getElementById("assessment-details")?.scrollIntoView({ behavior: "smooth" });

  return (
    <section className="relative overflow-hidden bg-gradient-hero text-white">
      <div className="container relative z-10 mx-auto px-4 py-16 sm:py-20 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-14">
          <div>
            <div className="inline-flex items-center rounded-full border border-primary/35 bg-primary/10 px-4 py-1.5">
              <span className="text-xs font-bold tracking-wide text-primary-light">
                {TICKET_ASSESSMENT.name} · Alberta
              </span>
            </div>

            <h1 className="mt-6 max-w-4xl text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
              {TICKET_ASSESSMENT.heroHeadline}
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-slate-200 sm:text-xl">
              {TICKET_ASSESSMENT.heroSubheadline}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="min-h-12 bg-primary px-7 text-base font-bold text-white hover:bg-primary-dark">
                <Link
                  to={TICKET_ASSESSMENT.intakePath}
                  onClick={() => trackAssessmentEvent(
                    "assessment_cta_click",
                    { location: "homepage_hero", destination: "assessment_intake", value: TICKET_ASSESSMENT.priceCad },
                    "homepage_hero",
                  )}
                >
                  {TICKET_ASSESSMENT.cta}
                  <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="min-h-12 border-white/30 bg-transparent px-7 text-base font-bold text-white hover:bg-primary/20 hover:text-white"
                onClick={scrollToDetails}
              >
                See What's Included
              </Button>
            </div>

            <p className="mt-5 text-sm font-semibold text-slate-300">
              If representation isn't worth the cost, we'll tell you.
            </p>
          </div>

          <Card className="border-white/15 bg-white p-7 text-slate-950 shadow-2xl sm:p-8">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary">Complete assessment</p>
            <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
              <p className="text-5xl font-bold">${TICKET_ASSESSMENT.priceCad}</p>
              <p className="pb-1 text-sm font-semibold text-slate-600">CAD total · GST included</p>
            </div>
            <div className="my-6 border-t" />
            <ul className="space-y-4 text-sm text-slate-700">
              {included.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 rounded-xl bg-slate-100 p-4 text-xs leading-relaxed text-slate-600">
              Government fines and any later representation are separate. No success fee applies to this assessment.
            </p>
          </Card>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 sm:grid-cols-4 sm:p-5">
          {trustPoints.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2.5 text-sm font-semibold text-slate-100">
              <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Hero;
