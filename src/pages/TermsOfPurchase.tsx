import Footer from "@/components/Footer";
import Header from "@/components/Header";
import FeeRefundNotice from "@/components/FeeRefundNotice";
import { FEE_REFUND } from "@/config/feeRefund";
import {
  INSURANCE_IMPACT_REPORT,
  PHOTO_RADAR,
  RAPID_RESOLUTION,
  RAPID_RESOLUTION_BUNDLE,
} from "@/config/offers";
import useSafeHead from "@/hooks/useSafeHead";
import { CheckCircle2, CreditCard, FileCheck2, ReceiptText } from "lucide-react";
import { Link } from "react-router-dom";

const TermsOfPurchase = () => {
  useSafeHead({
    title: "Terms of Purchase | Fabsy Traffic Ticket Services",
    description: "Purchase terms for Fabsy Rapid Resolution, insurance planning reports, and bundles, including pricing, tax, scope, payment, and refunds.",
    canonical: "https://fabsy.ca/terms-of-purchase",
    robots: "index, follow",
  });

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <Header />

      <div className="border-b border-slate-200 bg-white">
        <div className="container mx-auto max-w-4xl px-4 py-12 sm:py-16">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            Clear purchase terms
          </p>
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Terms of Purchase
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            These terms apply when you buy a Fabsy service. They are separate from any consent you
            sign to let Fabsy act on a traffic-ticket matter.
          </p>
          <p className="mt-4 text-sm text-slate-500">Last reviewed: August 31, 2026</p>
        </div>
      </div>

      <div className="container mx-auto max-w-4xl px-4 py-10 sm:py-14">
        <FeeRefundNotice className="mb-6" />
        <section className="rounded-2xl border border-primary/20 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-start gap-4">
            <span className="mt-0.5 rounded-xl bg-primary/10 p-2.5 text-primary" aria-hidden="true">
              <FileCheck2 className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-xl font-bold">Your written order controls</h2>
              <p className="mt-2 leading-7 text-slate-600">
                The checkout, invoice, payment link, or written quote for your order states the
                service, price, scope, inclusions, exclusions, and any special fee waiver. If it
                differs from general website pricing, your written order terms control.
              </p>
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <ReceiptText className="h-6 w-6 text-primary" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-bold">Price, tax, and scope</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <li className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>Current offer prices are in Canadian dollars, plus applicable GST. The tax and total charge are shown before payment.</span>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{PHOTO_RADAR.name} costs ${PHOTO_RADAR.priceCad} CAD plus 5% GST (${PHOTO_RADAR.totalCad.toFixed(2)} total), paid upfront for an accepted, eligible registered-owner camera notice. The fee-refund guarantee applies.</span>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  {RAPID_RESOLUTION.name} costs ${RAPID_RESOLUTION.priceCad} CAD {RAPID_RESOLUTION.taxTreatment}
                  {" "}for an accepted, eligible Alberta pre-trial matter. There is no percentage-based success fee.
                </span>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  The {INSURANCE_IMPACT_REPORT.name} costs ${INSURANCE_IMPACT_REPORT.priceCad} CAD
                  {" "}{INSURANCE_IMPACT_REPORT.taxTreatment}. It provides consumer research and planning
                  information, not ticket representation or a licensed broker recommendation.
                </span>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  The {RAPID_RESOLUTION_BUNDLE.name} bundle costs ${RAPID_RESOLUTION_BUNDLE.priceCad}
                  {" "}CAD {RAPID_RESOLUTION_BUNDLE.taxTreatment} and includes both services. Trial
                  representation is not included and is quoted separately.
                </span>
              </li>
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <CreditCard className="h-6 w-6 text-primary" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-bold">Payment authorization</h2>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              By completing checkout or paying an invoice or payment link, you authorize the
              one-time charge displayed, including any displayed tax. Fabsy will not treat a
              consent form by itself as payment authorization. New {RAPID_RESOLUTION.name} orders
              have no success-based charge. Any separately quoted work or additional charge requires
              the written terms and payment authorization you accept.
            </p>
          </section>
        </div>

        <div className="mt-6 space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold">Existing orders and separately quoted work</h2>
            <div className="mt-4 space-y-4 leading-7 text-slate-600">
              <p>
                An already accepted order keeps its original written price, tax treatment, scope,
                eligible credits, and agreed fee waivers unless a change is agreed in writing.
                Current website pricing does not automatically amend an existing order. Any
                eligible historical review credit is subject to the original terms and secure
                verification; it does not start representation or require you to upgrade.
              </p>
              <p>
                A success-based fee under a historical order applies only if it was expressly
                included in the written quote or order terms you accepted. If the fine is not
                reduced, no such fee is charged. A written waiver controls. No percentage-based
                success fee applies to new {RAPID_RESOLUTION.name} orders.
              </p>
              <p>
                If you choose to go to trial or request other work outside the accepted pre-trial
                scope, any available service is quoted separately and requires your acceptance.
                You are not required to purchase additional services.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold">What is not included</h2>
            <p className="mt-3 leading-7 text-slate-600">
              Government fines, court costs, driver abstracts or other third-party records, and
              trial representation, appeals, reopenings, and services not expressly listed in your
              order are separate. {RAPID_RESOLUTION.name} does not include Immediate Roadside
              Sanctions, Notices of Administrative Penalty, or matters outside Fabsy's permitted
              or accepted agent scope. A report purchase or consent form alone does not start
              representation. Representation is available only after Fabsy confirms that the matter
              is eligible and accepts the engagement.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold">The Rapid Resolution action commitment</h2>
            <div className="mt-3 space-y-3 leading-7 text-slate-600">
              <p>{RAPID_RESOLUTION.actionCommitment}</p>
              <p>{RAPID_RESOLUTION.speedDisclaimer}</p>
              <p>
                Fabsy explains any Crown response and obtains your file-specific instructions before
                accepting an available resolution. Nothing is accepted automatically.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold">Cancellation and refunds</h2>
            <div className="mt-3 space-y-3 leading-7 text-slate-600">
              <p>
                You can leave checkout before payment without being charged. After payment, contact
                Fabsy promptly if you want to cancel, ideally before review or representation work
                begins.
              </p>
              <p>
                The fee-refund guarantee applies if a Crown offer reduces neither your original
                fine nor your original demerits. Fabsy refunds the service fee you actually paid,
                together with the corresponding GST, within 30 calendar days of receiving that
                offer. Photo radar and red-light owner notices are assessed on the fine only.
                The guarantee covers Rapid Resolution, Photo Radar and the Rapid Resolution bundle,
                including discounted Pro Driver orders; it does not cover a standalone insurance report.
                Work already performed and payment-processing costs do not reduce a refund due under
                this guarantee. Amounts already refunded are not paid twice. Read the{" "}
                <Link to={FEE_REFUND.termsPath} className="font-semibold text-primary underline underline-offset-4">complete fee-refund terms</Link>.
              </p>
              <p>
                Other refunds are determined by the written terms for your order, the work already
                performed or delivered, non-recoverable third-party costs, and applicable law. A
                cancellation request does not pause a court date, response deadline, payment date,
                or other obligation unless Fabsy confirms that in writing.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold">No guaranteed outcome</h2>
            <p className="mt-3 leading-7 text-slate-600">
              Fabsy does not promise a withdrawal, reduced fine, fewer demerits, a particular court
              result, insurance savings, or any premium outcome. Courts, prosecutors, registries,
              and insurers make their own decisions.
              {" "}The fee-refund guarantee is a commitment to refund Fabsy's fee when its stated
              conditions are met, not a promise of a particular legal outcome.
            </p>
          </section>

          <section className="rounded-2xl bg-slate-950 p-6 text-white shadow-sm sm:p-8">
            <h2 className="text-xl font-bold text-white">Questions about a purchase?</h2>
            <p className="mt-3 max-w-2xl leading-7 text-slate-300">
              Ask before paying if anything in your quote or checkout is unclear.
            </p>
            <div className="mt-5 flex flex-col gap-2 text-sm sm:flex-row sm:gap-6">
              <a className="font-semibold text-white underline underline-offset-4" href="mailto:hello@fabsy.ca">
                hello@fabsy.ca
              </a>
              <a className="font-semibold text-white underline underline-offset-4" href="tel:+18257932279">
                (825) 793-2279
              </a>
            </div>
            <p className="mt-6 text-sm text-slate-400">
              Also see our{" "}
              <Link className="underline underline-offset-4 hover:text-white" to="/terms-of-service">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link className="underline underline-offset-4 hover:text-white" to="/privacy-policy">
                Privacy Policy
              </Link>
              .
            </p>
          </section>
        </div>
      </div>

      <Footer />
    </main>
  );
};

export default TermsOfPurchase;
