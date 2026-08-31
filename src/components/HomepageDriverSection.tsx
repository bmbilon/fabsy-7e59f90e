import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { RAPID_RESOLUTION } from "@/config/offers";
import { HOMEPAGE_REFUND_COPY } from "@/content/homepageRefundCopy";
import { trackAssessmentEvent } from "@/lib/assessment/analytics";
import driverImage from "@/assets/hero-driver-homepage.webp";

export default function HomepageDriverSection() {
  return (
    <section
      id="back-to-your-day"
      className="scroll-mt-20 overflow-hidden bg-slate-950 px-5 py-14 text-white sm:px-8 sm:py-16"
      aria-labelledby="homepage-driver-heading"
    >
      <div className="container mx-auto grid max-w-7xl items-center gap-8 px-0 lg:grid-cols-2 lg:gap-12">
        <div className="max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-blue-300">
            Your life beyond the ticket
          </p>
          <h2 id="homepage-driver-heading" className="mt-4 text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
            You keep living.<br />{" "}
            <span className="text-blue-300">We keep it moving.</span>
          </h2>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-slate-300">
            Let us take the next step on your ticket, so you can get back to your day.
            A reduction, a withdrawal, or your Rapid Resolution service fee back.
          </p>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-300">
            {HOMEPAGE_REFUND_COPY.outcomeQualification}{" "}
            <a href="#money-back-guarantee" className="font-semibold text-blue-200 underline underline-offset-4 hover:text-white">
              See the refund conditions and 30-day timing.
            </a>
          </p>
          <p className="mt-5 text-sm font-semibold text-slate-200">
            ${RAPID_RESOLUTION.priceCad} CAD + GST · Paid upfront; refunded if the policy applies
          </p>
          <Button asChild size="lg" className="mt-6 min-h-12 w-full bg-primary-dark px-7 text-base font-bold text-white hover:bg-blue-700 sm:w-auto">
            <Link
              to={RAPID_RESOLUTION.intakePath}
              onClick={() =>
                trackAssessmentEvent(
                  "assessment_cta_click",
                  { location: "homepage_final_cta", destination: "rapid_resolution_intake", value: RAPID_RESOLUTION.priceCad },
                  "homepage_final_cta",
                )
              }
            >
              Start Rapid Resolution
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
          </Button>
          <p className="mt-4 max-w-lg text-xs leading-relaxed text-slate-400">
            For eligible Alberta pre-trial matters. Trial representation and government fines are separate.
          </p>
        </div>
        <figure className="order-first overflow-hidden rounded-2xl bg-slate-800 sm:rounded-3xl lg:order-none">
          <img
            src={driverImage}
            alt="A smiling driver at the wheel of her car"
            width={1440}
            height={724}
            loading="lazy"
            decoding="async"
            className="aspect-[1.65/1] w-full object-cover object-right sm:aspect-video lg:aspect-[1.35/1]"
          />
        </figure>
      </div>
    </section>
  );
}
