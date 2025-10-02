import React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FAQSection from "@/components/FAQSection";
import { Helmet } from "react-helmet-async";

/**
 * FAQ page — visible copy is concise and AEO-first (hook-first tone).
 * Meta lengths are intentionally kept within limits (title ≤60, description ≤155).
 */

const FAQPage: React.FC = () => {
  const faqs = [
    {
      q: "How much does it cost to fight a traffic ticket in Alberta?",
      a: "Fabsy's flat fee is $499 with a zero-risk guarantee — you only pay if we save you money. Most clients avoid $1,000–$3,000 in insurance increases over three years."
    },
    {
      q: "What is Fabsy's success rate for traffic tickets?",
      a: "Our results-based practice wins for 94% of clients — dismissals, reduced charges, or amendments that protect insurance. We focus on outcomes that preserve your driving record."
    },
    {
      q: "Will fighting a ticket increase my insurance?",
      a: "No — fighting prevents insurance hikes. A conviction often raises premiums $500–$1,500 yearly for three years; our goal is to avoid that outcome by disputing charges effectively."
    },
    {
      q: "How long does it take to resolve a ticket?",
      a: "The average process is 3–6 months from filing to resolution. Fabsy handles disclosure, filings, and court representation so you can keep living your life."
    },
    {
      q: "Do I have to appear in court if I hire Fabsy?",
      a: "Usually no. We appear on your behalf for most Alberta traffic matters, handling negotiations and courtroom representation so you don't need to attend."
    },
    {
      q: "What tickets does Fabsy handle?",
      a: "We fight speeding, careless driving, distracted driving, red light camera issues, license suspensions, commercial violations, and more across Alberta — Calgary, Edmonton, Red Deer, Lethbridge, Medicine Hat."
    },
    {
      q: "What happens if Fabsy doesn't win my case?",
      a: "You pay nothing under our zero-risk guarantee if we don't save you money. If we can't secure a dismissal, reduction, or amendment that protects insurance, there's no fee."
    },
    {
      q: "How do demerit points affect insurance?",
      a: "Demerit points make convictions visible to insurers and often trigger premium increases. Accumulate 15 points and you risk license suspension in Alberta."
    }
  ];

  return (
    <main className="min-h-screen">
      <Helmet>
        <title>Traffic Ticket FAQ — Alberta | Fabsy</title>
        <meta
          name="description"
          content="Answers to common questions about fighting traffic tickets in Alberta. Learn about costs, success rates, insurance impact, and our zero-risk guarantee."
        />
      </Helmet>

      <Header />

      <section className="py-16 px-4">
        <div className="container mx-auto max-w-4xl">
          <h1 className="text-4xl font-bold mb-4">Frequently Asked Questions</h1>
          <p className="text-lg text-muted-foreground mb-8">
            Clear, direct answers to help you decide whether to fight your ticket — local to Alberta.
          </p>

          <FAQSection faqs={faqs} pageName="FAQ" pageUrl="https://fabsy.ca/faq" />
        </div>
      </section>

      <Footer />
    </main>
  );
};

export default FAQPage;
