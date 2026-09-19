import { ArrowDown, FileCheck2, ShieldCheck, Upload } from "lucide-react";
import InstantTicketAssessment from "@/components/InstantTicketAssessment";
import { RAPID_RESOLUTION } from "@/config/offers";
import { HOMEPAGE_REFUND_COPY } from "@/content/homepageRefundCopy";

const reassurance = [
  { icon: Upload, title: "Start from your phone", text: "Secure, simple online intake" },
  { icon: FileCheck2, title: "Put experience on your side", text: "Evidence analysis with qualified review" },
  { icon: ShieldCheck, title: "Stay in control", text: "You approve any available resolution" },
] as const;

const Hero = () => (
  <section className="overflow-hidden bg-slate-950 text-white" aria-labelledby="homepage-hero-heading">
    <div className="container mx-auto max-w-7xl px-5 pb-7 pt-10 sm:px-8 sm:pt-12 lg:pt-10">
      <div className="mx-auto max-w-5xl text-center">
        <p className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.17em] text-blue-300">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400" aria-hidden="true" />
          Alberta traffic ticket help
        </p>
        <h1 id="homepage-hero-heading" className="mt-5 text-[2.4rem] font-bold leading-[1.08] tracking-[-0.045em] text-white sm:text-5xl lg:text-[3.25rem] xl:text-[3.5rem]">
          <span className="block">{HOMEPAGE_REFUND_COPY.headline}</span>{" "}
          <span className="block text-blue-200">{HOMEPAGE_REFUND_COPY.headlineAccent}</span>
        </h1>
        <p className="mt-5 text-lg font-semibold text-blue-200 sm:text-xl">
          {HOMEPAGE_REFUND_COPY.heroSupport}
        </p>
      </div>

      <div className="mx-auto mt-8 grid max-w-6xl items-start gap-10 lg:mt-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
        <InstantTicketAssessment />
        <div className="min-w-0 lg:pt-7">
          <figure className="mx-auto w-full max-w-[336px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
            <img
              src="/fabsy-way-comparison-2026.webp"
              alt="The Fabsy way: your ticket reviewed, court proceedings handled, options explained, and you stay in control."
              width={1305}
              height={1206}
              loading="eager"
              {...{ fetchpriority: "high" }}
              decoding="async"
              className="h-auto w-full"
            />
          </figure>
          <div className="mx-auto mt-6 max-w-sm text-center">
            <h2 className="text-xl font-bold text-white">A clear plan. Help at every step.</h2>
            <p className="mt-3 text-sm text-slate-200"><strong className="font-semibold text-white">${RAPID_RESOLUTION.priceCad} CAD + GST</strong></p>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">We review your ticket, pursue a reduction or withdrawal, and explain your options. You approve any available resolution.</p>
            <a href="#fabsy-difference" className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-sm text-sm font-semibold text-blue-200 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
              See the Fabsy difference <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </a>
            <div className="mt-5 border-t border-slate-800 pt-5 text-xs leading-relaxed text-slate-400">
              <p>{HOMEPAGE_REFUND_COPY.refundCondition}</p>
              <p className="mt-2">For eligible Alberta pre-trial matters. Government fines and trial representation are separate.{" "}<a href="#money-back-guarantee" className="inline-flex min-h-11 items-center rounded-sm font-semibold text-blue-200 underline underline-offset-4 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">How the service-fee refund works</a></p>
            </div>
          </div>
        </div>
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
