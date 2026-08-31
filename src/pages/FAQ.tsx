import React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FAQSection from "@/components/FAQSection";
import useSafeHead from "@/hooks/useSafeHead";
import FeeRefundNotice from "@/components/FeeRefundNotice";
import { FEE_REFUND } from "@/config/feeRefund";
import {
  INSURANCE_IMPACT_REPORT,
  RAPID_RESOLUTION,
  RAPID_RESOLUTION_BUNDLE,
} from "@/config/offers";

const FAQPage: React.FC = () => {
  const faqs = [
    {
      q: "How much does Fabsy charge?",
      a: `${RAPID_RESOLUTION.name} costs $${RAPID_RESOLUTION.priceCad} CAD plus applicable GST for an eligible Alberta pre-trial matter. The ${INSURANCE_IMPACT_REPORT.name} costs $${INSURANCE_IMPACT_REPORT.priceCad} CAD plus GST, or both services cost $${RAPID_RESOLUTION_BUNDLE.priceCad} CAD plus GST. Government fines, third-party fees, trial representation, and out-of-scope work are separate.`
    },
    {
      q: "Is Fabsy a law firm?",
      a: "No. Fabsy is an Alberta traffic ticket agent service, not a law firm, and does not provide legal advice. Service availability and scope depend on the matter and court location."
    },
    {
      q: "Does Fabsy promise a particular result?",
      a: `${FEE_REFUND.payment} ${FEE_REFUND.condition} A reduction in the fine, demerits, or both counts; a dismissal also improves the original penalty. Government fines are separate.`
    },
    {
      q: "Will disputing a ticket affect my insurance?",
      a: "Disputing a ticket does not itself create a conviction. Insurance treatment may depend on the final outcome, your driving record, and your insurer's underwriting rules. Ask your insurer about your circumstances."
    },
    {
      q: "How long will my matter take?",
      a: RAPID_RESOLUTION.speedDisclaimer
    },
    {
      q: "Does Rapid Resolution include a trial?",
      a: "No. Rapid Resolution covers an accepted, eligible pre-trial matter. Trial representation, appeals, reopenings, government charges, and out-of-scope work are separate. If you want to proceed to trial, any available representation is quoted separately on a case-by-case basis."
    },
    {
      q: "What matters does Fabsy review?",
      a: "Fabsy reviews Alberta traffic ticket matters and may offer traffic ticket agent representation where permitted and available. Scope depends on the ticket, court location, and circumstances. Submitting a ticket does not mean the matter has been accepted."
    },
    {
      q: "What happens after I submit my ticket?",
      a: "Fabsy reviews eligibility and deadlines, confirms the accepted scope, requests and tracks disclosure, analyzes complete disclosure, and prepares or submits the next authorized prosecutor-review step. You receive updates as the file changes and direct whether an available pre-trial resolution is accepted. Keep following every instruction and deadline printed on the ticket unless Fabsy confirms otherwise."
    },
    {
      q: "Will Fabsy automatically accept a Crown response?",
      a: "No. Fabsy explains the original ticket and any Crown response in plain language, then obtains your file-specific instruction before an available resolution is accepted."
    },
    {
      q: `What is the $${INSURANCE_IMPACT_REPORT.priceCad} insurance report?`,
      a: `${INSURANCE_IMPACT_REPORT.description} ${INSURANCE_IMPACT_REPORT.disclaimer}`
    }
  ];

  useSafeHead({
    title: "Traffic Ticket FAQ, Alberta | Fabsy",
    description: "Answers about Fabsy Rapid Resolution, the 48-hour post-disclosure action commitment, trial exclusions, insurance planning, pricing, and client decisions.",
    canonical: "https://fabsy.ca/faq"
    // Schema removed - FAQSection component already handles FAQPage structured data
  });

  return (
    <main className="min-h-screen bg-gradient-hero">
      <Header />
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-4xl">
          <h1 className="text-4xl font-bold mb-4 text-white">Frequently Asked Questions</h1>
          <p className="text-lg text-white/80 mb-8">
            Clear answers about Rapid Resolution, timing, pricing, service scope, and insurance planning.
          </p>
          <FeeRefundNotice tone="dark" className="mb-8" />
          <FAQSection faqs={faqs} pageName="FAQ" pageUrl="https://fabsy.ca/faq" />
        </div>
      </section>
      <Footer />
    </main>
  );
};

export default FAQPage;
