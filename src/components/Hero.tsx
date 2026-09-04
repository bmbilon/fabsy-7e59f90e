import { Link } from "react-router-dom";
import { ArrowDown, ArrowRight, FileCheck2, ShieldCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RAPID_RESOLUTION } from "@/config/offers";
import { HOMEPAGE_REFUND_COPY } from "@/content/homepageRefundCopy";
import { trackAssessmentEvent } from "@/lib/assessment/analytics";

const reassurance = [
  { icon: Upload, title: "Start from your phone", text: "Secure, simple online intake" },
  { icon: FileCheck2, title: "Put experience on your side", text: "Evidence analysis with qualified review" },
  { icon: ShieldCheck, title: "Stay in control", text: "You approve any available resolution" },
] as const;

const Hero = () => (
  <section className="overflow-hidden bg-slate-950 text-white" aria-labelledby="homepage-hero-heading">
    <div className="container mx-auto max-w-7xl px-5 pb-7 pt-10 sm:px-8 sm:pt-12 lg:pt-14">
      <div className="mx-auto max-w-5xl text-center">
        <p className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.17em] text-blue-300">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400" aria-hidden="true" />
          Alberta traffic ticket help
        </p>
        <h1 id="homepage-hero-heading" className="mt-5 text-[2.4rem] font-bold leading-[1.08] tracking-[-0.045em] text-white sm:text-5xl lg:text-[3.5rem] xl:text-[4rem]">
          {HOMEPAGE_REFUND_COPY.headline}
        </h1>
        <p className="mt-5 text-lg font-semibold text-blue-200 sm:text-xl">
          {HOMEPAGE_REFUND_COPY.heroSupport}
        </p>
        <p className="mt-4 text-sm text-slate-200">
          <strong className="font-semibold text-white">${RAPID_RESOLUTION.priceCad} CAD + GST</strong>
          {" "}· Paid upfront; refunded if the policy applies
        </p>

        <div className="mt-5 flex justify-center">
          <Button asChild size="lg" className="min-h-12 w-full bg-primary-dark px-6 text-base font-bold text-white hover:bg-blue-700 sm:w-auto">
            <Link
              to={RAPID_RESOLUTION.intakePath}
              data-funnel-action="primary_cta"
              data-funnel-position="hero"
              onClick={() =>
                trackAssessmentEvent(
                  "assessment_cta_click",
                  { location: "homepage_hero", destination: "rapid_resolution_intake", value: RAPID_RESOLUTION.priceCad },
                  "homepage_hero",
                )
              }
            >
              Get help with my ticket
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        <figure className="mx-auto mt-5 max-w-2xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 sm:mt-6 sm:rounded-3xl">
          <img
            src="/fabsy-way-comparison-2026.webp"
            alt="On your own: research, paperwork, navigating complex and confusing legal procedures, inconvenient deadlines, follow-ups and unpredictable outcomes. The Fabsy way: ticket reviewed, court proceedings handled, options explained, and you in control. Eligible pre-trial matters; trial representation separate."
            width={1305}
            height={1206}
            loading="eager"
            {...{ fetchpriority: "high" }}
            decoding="async"
            className="h-auto w-full"
          />
        </figure>

        <a href="#fabsy-difference" className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-sm text-sm font-semibold text-slate-100 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
          See the Fabsy difference
          <ArrowDown className="h-4 w-4 text-blue-300" aria-hidden="true" />
        </a>
        <p className="mx-auto mt-3 max-w-2xl text-xs leading-relaxed text-slate-300 sm:text-[13px]">
          {HOMEPAGE_REFUND_COPY.outcomeQualification}{" "}
          {HOMEPAGE_REFUND_COPY.refundCondition}
        </p>
        <p className="mx-auto mt-4 max-w-xl text-xs leading-relaxed text-slate-400">
          For eligible Alberta pre-trial matters. Government fines and trial representation are separate.{" "}
          <a href="#money-back-guarantee" className="inline-flex min-h-11 items-center rounded-sm font-semibold text-blue-200 underline underline-offset-4 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
            How the service-fee refund works
          </a>
        </p>
      </div>

      <ul className="mt-9 grid gap-5 border-t border-slate-800 pt-6 sm:grid-cols-3 sm:gap-6 lg:mt-10">
        {reassurance.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-start gap-3">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-white">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  </section>
);

export default Hero;
