import React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HowToSchema from "@/components/HowToSchema";
import { Helmet } from "react-helmet-async";
import { Shield, Upload, FileCheck, Scale, Trophy } from "lucide-react";

/**
 * HowItWorks — content + schema in sync; short meta for AEO.
 */

const HowItWorks: React.FC = () => {
  const steps = [
    {
      name: "Upload your ticket",
      text: "Take a clear photo of your traffic ticket and upload it. Our AI instantly extracts the violation, fine, and court information — it takes under 2 minutes.",
      url: "https://fabsy.ca/submit-ticket",
      icon: Upload,
    },
    {
      name: "Get a free analysis",
      text: "Within minutes, receive a clear analysis showing your chances of success and estimated savings (typically $1,000–$3,000 in insurance increases).",
      url: "https://fabsy.ca/ticket-analysis",
      icon: FileCheck,
    },
    {
      name: "Choose your package",
      text: "Select our $488 zero-risk package. You only pay if we save you money — we handle paperwork, disclosure, and court representation.",
      url: "https://fabsy.ca/services",
      icon: Shield,
    },
    {
      name: "We fight your ticket",
      text: "We request disclosure, review evidence, and represent you in court. Most clients avoid appearing — we handle the legal work so you don't have to.",
      url: "https://fabsy.ca/how-it-works",
      icon: Scale,
    },
    {
      name: "Receive the outcome",
      text: "100% of clients achieve dismissals, reductions, or amendments that protect insurance. We keep you updated and explain next steps.",
      url: "https://fabsy.ca/testimonials",
      icon: Trophy,
    },
  ];

  return (
    <main className="min-h-screen">
      <Helmet>
        <title>How It Works — Fight a Traffic Ticket in Alberta | Fabsy</title>
        <meta
          name="description"
          content="Simple 5-step process: upload your ticket, get a free analysis, choose our $488 zero-risk package, and let Fabsy represent you in Alberta traffic courts."
        />
      </Helmet>

      <HowToSchema
        name="How to Fight a Traffic Ticket in Alberta"
        description="A clear 5-step process for disputing traffic tickets in Alberta. Protect your insurance and driving record with Fabsy."
        steps={steps.map((s) => ({ name: s.name, text: s.text, url: s.url }))}
        totalTime="P3M"
        estimatedCost="499"
      />

      <Header />

      <section className="py-16 px-4">
        <div className="container mx-auto max-w-4xl">
          <h1 className="text-4xl font-bold mb-4">How Fabsy Fights Your Ticket</h1>
          <p className="text-lg text-muted-foreground mb-8">Five simple steps to protect your insurance and driving record in Alberta.</p>

          <div className="space-y-8">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div key={idx} className="bg-white rounded-xl p-6 shadow-sm border border-primary/10">
                  <div className="flex items-start gap-4">
                    <div className="bg-primary text-white rounded-full w-12 h-12 flex items-center justify-center">
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <div className="mb-2">
                        <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-semibold mr-2">Step {idx + 1}</span>
                        <h3 className="font-bold text-xl inline-block">{step.name}</h3>
                      </div>
                      <p className="text-muted-foreground leading-relaxed">{step.text}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
};

export default HowItWorks;
