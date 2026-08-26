import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { TICKET_ASSESSMENT } from "@/config/ticketAssessment";
import { CheckCircle2, CreditCard, FileCheck2, ReceiptText } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

const TermsOfPurchase = () => {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <Helmet>
        <title>Terms of Purchase | Fabsy Traffic Ticket Services</title>
        <meta
          name="description"
          content="Concise purchase terms for Fabsy ticket reviews and Alberta traffic ticket representation services."
        />
        <link rel="canonical" href="https://fabsy.ca/terms-of-purchase" />
        <meta name="robots" content="index,follow" />
      </Helmet>

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
          <p className="mt-4 text-sm text-slate-500">Last updated: August 26, 2026</p>
        </div>
      </div>

      <div className="container mx-auto max-w-4xl px-4 py-10 sm:py-14">
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
                <span>Prices are in Canadian dollars. Applicable GST is included or added as shown before payment.</span>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  The Priority Ticket Review is ${TICKET_ASSESSMENT.priceCad} CAD total, including
                  applicable GST. It is a review and report, not representation.
                </span>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  Representation generally uses a $488 base fee plus applicable GST, subject to
                  eligibility and the written quote for the matter.
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
              consent form by itself as payment authorization. Any later success-based charge must
              be expressly included in the written terms you accept.
            </p>
          </section>
        </div>

        <div className="mt-6 space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold">Upgrade credit and conditional success fee</h2>
            <div className="mt-4 space-y-4 leading-7 text-slate-600">
              <p>
                If representation is worthwhile and the same matter is eligible, the $
                {TICKET_ASSESSMENT.representationCredit.amountCad} Priority Ticket Review payment
                can be applied to the $488 base representation fee. The remaining base-fee balance
                is ${TICKET_ASSESSMENT.representationCredit.upgradeBalanceCad} plus applicable tax.
                The credit is not automatic representation, and you are not required to upgrade.
              </p>
              <p>
                A 30% fee on a fine reduction applies only when it is expressly stated in the
                written quote or order terms you accept. If the fine is not reduced, no such fee is
                charged. If your written quote waives or removes that fee, the written waiver
                controls.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold">What is not included</h2>
            <p className="mt-3 leading-7 text-slate-600">
              Government fines, court costs, driver abstracts or other third-party records, and
              services not expressly listed in your order are separate. A ticket review does not
              start representation. Representation is available only after Fabsy confirms that the
              matter is eligible and accepts the engagement.
            </p>
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
                Any refund is determined by the written terms for your order, the work already
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
