import { Link } from "react-router-dom";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileSearch,
  MessageSquareText,
  Upload,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HowToSchema from "@/components/HowToSchema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RAPID_RESOLUTION } from "@/config/offers";
import useSafeHead from "@/hooks/useSafeHead";

const steps = [
  {
    name: "Complete secure intake",
    text: "Upload a clear ticket image or PDF, confirm the ticket details, answer the focused intake questions, and sign the digital authorization.",
    url: `https://fabsy.ca${RAPID_RESOLUTION.intakePath}`,
    icon: Upload,
  },
  {
    name: "Disclosure is requested",
    text: "Fabsy checks the accepted service scope, requests available disclosure, and tracks the request. Keep following every deadline and instruction unless Fabsy confirms otherwise.",
    url: `https://fabsy.ca${RAPID_RESOLUTION.slug}`,
    icon: FileSearch,
  },
  {
    name: "Disclosure is analyzed",
    text: "Once complete, readable disclosure is received and matched to your file, technology-assisted analysis and qualified review examine the evidence and practical pre-trial options.",
    url: `https://fabsy.ca${RAPID_RESOLUTION.slug}`,
    icon: FileCheck2,
  },
  {
    name: "Fabsy advances the prosecutor review",
    text: "Within 48 hours after complete disclosure is received and matched, Fabsy prepares or submits the next authorized prosecutor-review step. The clock covers Fabsy's action, not Crown response time.",
    url: `https://fabsy.ca${RAPID_RESOLUTION.slug}`,
    icon: MessageSquareText,
  },
  {
    name: "You review and direct the response",
    text: "Fabsy notifies you when a Crown response arrives and explains it against the original ticket. You decide whether an available pre-trial resolution should be accepted.",
    url: "https://fabsy.ca/portal/cases",
    icon: BellRing,
  },
] as const;

const HowItWorks = () => {
  useSafeHead({
    title: "How Rapid Resolution Works | Fabsy Alberta",
    description:
      "See the Fabsy Rapid Resolution process from secure ticket intake and disclosure request through analysis, prosecutor review, updates, and client direction.",
    canonical: "https://fabsy.ca/how-it-works",
  });

  return (
    <main className="min-h-screen bg-gradient-hero">
      <HowToSchema
        name="How Fabsy Rapid Resolution Works"
        description="A five-step pre-trial process for an eligible Alberta traffic ticket, from secure intake through a client-directed response."
        steps={steps.map((step) => ({ name: step.name, text: step.text, url: step.url }))}
      />
      <Header />

      <section className="px-4 py-16 sm:py-20">
        <div className="container mx-auto max-w-6xl">
          <div className="mx-auto max-w-4xl text-center">
            <Badge className="border-primary/30 bg-primary/10 text-primary-light">Rapid Resolution · ${RAPID_RESOLUTION.priceCad} CAD + GST</Badge>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              One connected journey for your ticket
            </h1>
            <p className="mx-auto mt-5 max-w-3xl text-lg leading-relaxed text-white/80 sm:text-xl">
              Fabsy keeps the ticket, consent, disclosure, review, Crown response, and your instructions together from start to finish of the accepted pre-trial service.
            </p>
          </div>

          <div className="mx-auto mt-12 max-w-5xl space-y-5">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <Card key={step.name} className="overflow-hidden border-white/20 shadow-elevated">
                  <div className="grid sm:grid-cols-[120px_1fr]">
                    <div className="flex items-center justify-between bg-primary/10 p-6 sm:flex-col sm:justify-center sm:gap-3">
                      <span className="text-sm font-bold uppercase tracking-[0.14em] text-primary">Step {index + 1}</span>
                      <Icon className="h-8 w-8 text-primary" aria-hidden="true" />
                    </div>
                    <div className="p-6 sm:p-8">
                      <h2 className="text-2xl font-bold text-foreground">{step.name}</h2>
                      <p className="mt-3 leading-relaxed text-muted-foreground">{step.text}</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <Card className="mx-auto mt-8 max-w-5xl border-primary/30 bg-slate-950 p-7 text-white sm:p-9">
            <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start">
              <Clock3 className="h-9 w-9 text-primary-light" aria-hidden="true" />
              <div>
                <h2 className="text-2xl font-bold text-white">The 48-hour commitment, precisely defined</h2>
                <p className="mt-3 leading-relaxed text-slate-300">{RAPID_RESOLUTION.speedDisclaimer}</p>
              </div>
            </div>
          </Card>

          <Card className="mx-auto mt-8 max-w-5xl p-7 shadow-elevated sm:p-9">
            <div className="grid gap-7 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 text-primary" aria-hidden="true" />
                  <h2 className="text-2xl font-bold">Pre-trial scope, clearly priced</h2>
                </div>
                <p className="mt-4 leading-relaxed text-muted-foreground">
                  Rapid Resolution costs ${RAPID_RESOLUTION.priceCad} CAD plus applicable GST for an eligible Alberta pre-trial matter. Trial representation, appeals, government charges, and out-of-scope work are separate. Outcomes vary and are not promised.
                </p>
              </div>
              <Button asChild size="lg" className="min-h-12 px-7">
                <Link to={RAPID_RESOLUTION.intakePath}>
                  Start Rapid Resolution
                  <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </Card>
        </div>
      </section>

      <Footer />
    </main>
  );
};

export default HowItWorks;
