import { useState } from "react";
import { ArrowRight, Camera, CheckCircle2, FileSearch, ShieldCheck, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TICKET_ASSESSMENT } from "@/config/ticketAssessment";
import { trackAssessmentEvent } from "@/lib/assessment/analytics";
import { EligibilityChecker } from "./EligibilityChecker";

const freeReviewSteps = [
  { icon: Upload, label: "Choose a clear ticket image" },
  { icon: Camera, label: "Or take a photo on your phone" },
  { icon: CheckCircle2, label: "Check and correct the captured details" },
] as const;

const trustPoints = [
  { icon: ShieldCheck, label: "No payment to start" },
  { icon: Upload, label: "Simple online upload" },
  { icon: CheckCircle2, label: "You confirm every detail" },
  { icon: FileSearch, label: "Paid help is optional" },
] as const;

const Hero = () => {
  const [reviewOpen, setReviewOpen] = useState(false);

  return (
    <section className="relative overflow-hidden bg-gradient-hero text-white">
      <div className="container relative z-10 mx-auto px-4 py-16 sm:py-20 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:gap-14">
          <div>
            <div className="inline-flex items-center rounded-full border border-primary/35 bg-primary/10 px-4 py-1.5">
              <span className="text-xs font-bold tracking-wide text-primary-light">
                Free Ticket Review · Alberta
              </span>
            </div>

            <h1 className="mt-6 max-w-4xl text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Start with a free review of your traffic ticket.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-slate-200 sm:text-xl">
              Upload a clear image or take a photo. Fabsy's review tool reads the key ticket details
              so you can check them before deciding whether you want any paid help.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                size="lg"
                className="min-h-12 bg-primary px-7 text-base font-bold text-white hover:bg-primary-dark"
                onClick={() => setReviewOpen(true)}
              >
                Start Free Ticket Review
                <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="min-h-12 border-white/30 bg-transparent px-7 text-base font-bold text-white hover:bg-primary/20 hover:text-white"
              >
                <Link to="/how-it-works">See How It Works</Link>
              </Button>
            </div>

            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-slate-300">
              No card required. The free tool captures information from the ticket you provide; it
              does not provide legal advice, decide service eligibility, or promise an outcome.
            </p>
          </div>

          <Card className="border-white/15 bg-white p-7 text-slate-950 shadow-2xl sm:p-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary">Free Ticket Review</p>
                <p className="mt-2 text-sm text-slate-600">Review the captured details before choosing a service.</p>
              </div>
              <p className="text-4xl font-bold">$0</p>
            </div>

            <ul className="mt-6 space-y-4 text-sm text-slate-700">
              {freeReviewSteps.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <span>{label}</span>
                </li>
              ))}
            </ul>

            <Button type="button" className="mt-6 min-h-11 w-full font-bold" onClick={() => setReviewOpen(true)}>
              Choose File or Take Photo
            </Button>

            <div className="my-6 border-t" />
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Optional next steps</p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <p className="font-bold">$149 Priority Review</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  Human-reviewed ticket and insurance-impact assessment. $149 CAD total; applicable GST included.
                </p>
                <Link
                  to={TICKET_ASSESSMENT.slug}
                  className="mt-3 inline-flex items-center text-xs font-bold text-primary hover:underline"
                  onClick={() => trackAssessmentEvent(
                    "assessment_cta_click",
                    { location: "homepage_free_review_card", destination: "assessment_landing", value: TICKET_ASSESSMENT.priceCad },
                    "homepage_free_review_card",
                  )}
                >
                  View Priority Review <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-bold">$488 Full Representation</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  Available for eligible matters. The $488 base fee, applicable tax, and conditional success fee are explained before checkout.
                </p>
                <Link to="/services" className="mt-3 inline-flex items-center text-xs font-bold text-primary hover:underline">
                  View representation <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </div>

            <p className="mt-5 text-xs leading-relaxed text-slate-500">
              Priority Review has no success fee. Full Representation uses a $488 base representation
              fee plus applicable tax and 30% of any fine reduction achieved; there is no success fee
              if the fine is not reduced. Government fines are separate. Fabsy is an Alberta traffic
              ticket agent service, not a law firm, and no result is promised.
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

      <EligibilityChecker open={reviewOpen} onOpenChange={setReviewOpen} />
    </section>
  );
};

export default Hero;
