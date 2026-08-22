import { useEffect, useRef } from "react";
import { ArrowRight, CheckCircle2, Scale } from "lucide-react";
import { Link } from "react-router-dom";
import { TICKET_ASSESSMENT } from "@/config/ticketAssessment";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trackAssessmentEvent } from "@/lib/assessment/analytics";
import { PRODUCT_LADDER_BRIDGE } from "@/components/ProductLadder";

export default function AssessmentOfferCard() {
  const offer = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = offer.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      trackAssessmentEvent("assessment_offer_view", { location: "homepage" }, "homepage_offer_card");
      observer.disconnect();
    }, { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={offer} className="bg-background px-4 py-14 sm:py-20" aria-labelledby="assessment-offer-heading">
      <Card className="container mx-auto max-w-6xl overflow-hidden border-primary/20 shadow-elevated">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
          <div className="p-7 sm:p-10 lg:p-12">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Scale className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-primary">{TICKET_ASSESSMENT.name}</p>
            <h2 id="assessment-offer-heading" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Before you pay or spend hundreds fighting it, find out what the smart move is.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              A human-reviewed Alberta ticket assessment covering the charge, deadlines, demerits,
              likely insurance significance, available options and whether representation is economically sensible.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild size="lg" className="min-h-12 px-7 text-base">
                <Link
                  to={TICKET_ASSESSMENT.intakePath}
                  onClick={() => trackAssessmentEvent(
                    "assessment_cta_click",
                    { location: "homepage_offer_card", destination: "assessment_intake", value: TICKET_ASSESSMENT.priceCad },
                    "homepage_offer_card",
                  )}
                >
                  {TICKET_ASSESSMENT.cta}
                  <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                </Link>
              </Button>
              <p className="text-sm font-medium text-muted-foreground">One price. Clear answers. No pressure to hire us.</p>
            </div>
          </div>
          <div className="bg-slate-950 p-7 text-white sm:p-10 lg:p-12">
            <p className="text-sm font-semibold text-violet-200">Complete assessment</p>
            <p className="mt-2 text-5xl font-bold">${TICKET_ASSESSMENT.priceCad}</p>
            <p className="mt-1 text-sm text-slate-300">CAD total · GST included</p>
            <ul className="mt-7 space-y-3 text-sm text-slate-200">
              {[
                "What the charge and deadline mean",
                "Fine, demerit and conviction distinction",
                "Likely insurance-risk significance",
                "Representation break-even assessment",
                "A clear recommended next step",
                "$149 can be applied to eligible representation when worthwhile",
                "Priority placement if you upgrade",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xs leading-relaxed text-slate-300">{PRODUCT_LADDER_BRIDGE}</p>
          </div>
        </div>
      </Card>
    </section>
  );
}
