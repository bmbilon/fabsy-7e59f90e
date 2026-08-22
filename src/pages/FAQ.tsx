import React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FAQSection from "@/components/FAQSection";
import useSafeHead from "@/hooks/useSafeHead";

const FAQPage: React.FC = () => {
  const faqs = [
    {
      q: "How much does Fabsy charge?",
      a: "Representation uses a $488 base representation fee plus 30% of any fine reduction achieved; there is no success fee if the fine is not reduced."
    },
    {
      q: "Is Fabsy a law firm?",
      a: "No. Fabsy is an Alberta traffic ticket agent service, not a law firm, and does not provide legal advice. Service availability and scope depend on the matter and court location."
    },
    {
      q: "What does Fabsy's 95%+ figure mean?",
      a: "Fabsy reports a 95%+ historical success rate across past matters. It is an aggregate past figure, not a prediction for a particular ticket. Outcomes depend on the facts, evidence, and available options."
    },
    {
      q: "Will disputing a ticket affect my insurance?",
      a: "Disputing a ticket does not itself create a conviction. Insurance treatment may depend on the final outcome, your driving record, and your insurer's underwriting rules. Ask your insurer about your circumstances."
    },
    {
      q: "How long will my matter take?",
      a: "Timing varies by matter, court, and available process. The response deadline is printed on the ticket. Follow the ticket instructions before that date."
    },
    {
      q: "Will I have to attend court?",
      a: "Attendance depends on the matter, court requirements, and the scope of any permitted representation. Some clients may need to attend or complete steps personally. Fabsy will explain the expected process after reviewing the ticket."
    },
    {
      q: "What matters does Fabsy review?",
      a: "Fabsy reviews Alberta traffic ticket matters and may offer traffic ticket agent representation where permitted and available. Scope depends on the ticket, court location, and circumstances. Submitting a ticket does not mean the matter has been accepted."
    },
    {
      q: "What happens after I submit my ticket?",
      a: "Fabsy reviews the information and documents you provide, then explains whether the service is available and what the next steps may be. Keep following every instruction and deadline printed on the ticket unless Fabsy confirms otherwise."
    }
  ];

  useSafeHead({
    title: "Traffic Ticket FAQ, Alberta | Fabsy",
    description: "Conservative answers about Fabsy's Alberta traffic ticket agent service, pricing, attendance, insurance, scope, and next steps.",
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
            Clear answers about Fabsy's Alberta ticket review and traffic ticket agent service.
          </p>
          <FAQSection faqs={faqs} pageName="FAQ" pageUrl="https://fabsy.ca/faq" />
        </div>
      </section>
      <Footer />
    </main>
  );
};

export default FAQPage;
