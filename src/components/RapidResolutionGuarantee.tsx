import { CheckCircle2, RotateCcw, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { HOMEPAGE_REFUND_COPY } from "@/content/homepageRefundCopy";

export default function RapidResolutionGuarantee() {
  return (
    <section
      id="money-back-guarantee"
      className="scroll-mt-24 border-y border-blue-100 bg-blue-50 px-5 py-14 sm:px-8 sm:py-16"
      aria-labelledby="money-back-guarantee-heading"
    >
      <div className="container mx-auto max-w-6xl px-0">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-primary-dark">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              Our money-back policy
            </p>
            <h2 id="money-back-guarantee-heading" className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              A reduction, a withdrawal, or your fee back.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-700">
              {HOMEPAGE_REFUND_COPY.outcomeQualification}
            </p>
          </div>

          <div className="divide-y divide-blue-200">
            <div className="flex gap-4 pb-6">
              <CheckCircle2 className="mt-1 h-6 w-6 shrink-0 text-emerald-700" aria-hidden="true" />
              <div>
                <h3 className="text-xl font-bold text-slate-950">What counts as success?</h3>
                <p className="mt-2 leading-relaxed text-slate-700">{HOMEPAGE_REFUND_COPY.successDefinition}</p>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{HOMEPAGE_REFUND_COPY.declinedOfferDisclaimer}</p>
              </div>
            </div>
            <div className="flex gap-4 pt-6">
              <RotateCcw className="mt-1 h-6 w-6 shrink-0 text-primary-dark" aria-hidden="true" />
              <div>
                <h3 className="text-xl font-bold text-slate-950">No reduction? Refunded within 30 days.</h3>
                <p className="mt-2 leading-relaxed text-slate-700">{HOMEPAGE_REFUND_COPY.refundCondition}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-blue-200 pt-6 text-sm leading-relaxed text-slate-700">
          <p className="font-semibold text-slate-950">{HOMEPAGE_REFUND_COPY.paymentTiming}</p>
          <p className="mt-2">{HOMEPAGE_REFUND_COPY.refundScope}</p>
          <Link to={HOMEPAGE_REFUND_COPY.termsPath} className="mt-3 inline-flex min-h-11 items-center rounded-sm font-semibold text-primary-dark underline underline-offset-4 hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            Read the full money-back policy
          </Link>
        </div>
      </div>
    </section>
  );
}
