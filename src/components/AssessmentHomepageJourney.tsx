import { Link } from "react-router-dom";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileSearch,
  Gauge,
  Scale,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  INSURANCE_IMPACT_REPORT,
  RAPID_RESOLUTION,
  RAPID_RESOLUTION_BUNDLE,
} from "@/config/offers";
import { trackAssessmentEvent } from "@/lib/assessment/analytics";

const process = [
  {
    icon: Upload,
    title: "Secure intake and consent",
    text: "Upload the ticket, confirm the details, and sign the authorization needed for the accepted pre-trial service.",
  },
  {
    icon: FileSearch,
    title: "Disclosure request and tracking",
    text: "Fabsy requests the available disclosure and keeps the file moving while you continue to follow the deadline instructions provided.",
  },
  {
    icon: FileCheck2,
    title: "Analysis and prosecutor review",
    text: "Once complete disclosure arrives, it is analyzed, reviewed, and used to prepare or submit the next authorized prosecutor step.",
  },
  {
    icon: BellRing,
    title: "Crown response and your decision",
    text: "You receive a plain-language comparison of the original ticket and any Crown response, then direct whether an available resolution is accepted.",
  },
] as const;

const trustEvidence = [
  {
    icon: ShieldCheck,
    title: "A defined service scope",
    text: "Rapid Resolution covers an eligible pre-trial matter. Trial representation, appeals, government charges, and out-of-scope work are separate.",
  },
  {
    icon: Clock3,
    title: "A measurable action commitment",
    text: "Complete, readable disclosure is reviewed and the next authorized step is prepared or submitted within 48 hours after it is matched to your file.",
  },
  {
    icon: Gauge,
    title: "No inflated promises",
    text: "Outcomes depend on the evidence, charge, procedure, and prosecutor. No withdrawal, reduction, demerit, or insurance result is promised.",
  },
] as const;

const faqItems = [
  {
    q: `What is included for $${RAPID_RESOLUTION.priceCad}?`,
    a: "Secure intake, digital authorization, eligibility and deadline review, disclosure request and tracking, disclosure analysis with qualified review, a fact-specific prosecutor-review submission, client notifications, and explanation of an available Crown response. Applicable GST is extra.",
  },
  {
    q: "When does the 48-hour commitment begin?",
    a: RAPID_RESOLUTION.speedDisclaimer,
  },
  {
    q: "Can Fabsy accept a resolution without asking me?",
    a: "No. Fabsy explains an available Crown response and obtains your file-specific instruction before any resolution is accepted.",
  },
  {
    q: `What is included in the $${RAPID_RESOLUTION_BUNDLE.priceCad} bundle?`,
    a: `The bundle includes Rapid Resolution and the ${INSURANCE_IMPACT_REPORT.name}. The report is educational planning information, not an insurer quote or a promise of premium savings. Applicable GST is extra.`,
  },
  {
    q: "What if I want to go to trial?",
    a: "Trial is not included in Rapid Resolution. If you decline an available pre-trial outcome and want to continue, any available trial representation is quoted separately on a case-by-case basis.",
  },
] as const;

export default function AssessmentHomepageJourney() {
  return (
    <>
      <section className="px-4 py-16 sm:py-20" aria-labelledby="homepage-process-heading">
        <div className="container mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline">How Rapid Resolution works</Badge>
            <h2 id="homepage-process-heading" className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              From ticket upload to an informed client decision
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              One connected file carries your ticket, consent, disclosure, review, Crown response, and instructions.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {process.map(({ icon: Icon, title, text }, index) => (
              <Card key={title} className="p-6 shadow-fab">
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <span className="text-sm font-bold text-muted-foreground">0{index + 1}</span>
                </div>
                <h3 className="mt-5 text-xl font-bold">{title}</h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">{text}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-950 px-4 py-16 text-white sm:py-20" aria-labelledby="homepage-speed-heading">
        <div className="container mx-auto max-w-6xl">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <Badge className="border-primary/30 bg-primary/10 text-primary-light">48-hour Fabsy action commitment</Badge>
              <h2 id="homepage-speed-heading" className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Complete disclosure arrives. Your file moves next.
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-300">{RAPID_RESOLUTION.actionCommitment}</p>
            </div>
            <Card className="border-slate-700 bg-slate-900 p-7 text-white sm:p-8">
              <div className="flex items-start gap-4">
                <Clock3 className="mt-1 h-7 w-7 shrink-0 text-primary-light" aria-hidden="true" />
                <div>
                  <h3 className="text-xl font-bold text-white">What the clock measures</h3>
                  <p className="mt-3 leading-relaxed text-slate-300">{RAPID_RESOLUTION.speedDisclaimer}</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 px-4 py-16 sm:py-20" aria-labelledby="homepage-pricing-heading">
        <div className="container mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline">Simple choices</Badge>
            <h2 id="homepage-pricing-heading" className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Ticket resolution, insurance planning, or both
            </h2>
            <p className="mt-4 text-muted-foreground">Prices are CAD plus applicable GST.</p>
          </div>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            <Card className="flex flex-col border-primary/20 p-7 shadow-fab">
              <Scale className="h-7 w-7 text-primary" aria-hidden="true" />
              <h3 className="mt-5 text-2xl font-bold">{RAPID_RESOLUTION.name}</h3>
              <p className="mt-3 text-4xl font-bold">${RAPID_RESOLUTION.priceCad}</p>
              <p className="mt-4 flex-1 leading-relaxed text-muted-foreground">
                Eligible Alberta pre-trial service from secure intake through an available client-directed resolution.
              </p>
              <Button asChild className="mt-6">
                <Link to={RAPID_RESOLUTION.intakePath}>Start Rapid Resolution</Link>
              </Button>
            </Card>

            <Card className="flex flex-col p-7 shadow-fab">
              <FileCheck2 className="h-7 w-7 text-primary" aria-hidden="true" />
              <h3 className="mt-5 text-2xl font-bold">{INSURANCE_IMPACT_REPORT.shortName}</h3>
              <p className="mt-3 text-4xl font-bold">${INSURANCE_IMPACT_REPORT.priceCad}</p>
              <p className="mt-4 flex-1 leading-relaxed text-muted-foreground">{INSURANCE_IMPACT_REPORT.description}</p>
              <Button asChild variant="outline" className="mt-6">
                <Link to={INSURANCE_IMPACT_REPORT.slug}>View the report</Link>
              </Button>
            </Card>

            <Card className="flex flex-col border-primary/40 bg-primary/5 p-7 shadow-elevated">
              <Badge className="w-fit">Both services</Badge>
              <h3 className="mt-5 text-2xl font-bold">{RAPID_RESOLUTION_BUNDLE.shortName}</h3>
              <p className="mt-3 text-4xl font-bold text-primary">${RAPID_RESOLUTION_BUNDLE.priceCad}</p>
              <p className="mt-4 flex-1 leading-relaxed text-muted-foreground">{RAPID_RESOLUTION_BUNDLE.description}</p>
              <Button asChild className="mt-6">
                <Link to={RAPID_RESOLUTION.intakePath}>Choose the bundle</Link>
              </Button>
            </Card>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:py-20" aria-labelledby="homepage-trust-heading">
        <div className="container mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline">Clear expectations</Badge>
            <h2 id="homepage-trust-heading" className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Fast action without inflated promises</h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {trustEvidence.map(({ icon: Icon, title, text }) => (
              <Card key={title} className="p-6 shadow-fab">
                <Icon className="h-7 w-7 text-primary" aria-hidden="true" />
                <h3 className="mt-4 text-xl font-bold">{title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{text}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-violet-50 px-4 py-16 sm:py-20" aria-labelledby="homepage-faq-heading">
        <div className="container mx-auto max-w-3xl">
          <h2 id="homepage-faq-heading" className="text-center text-3xl font-bold tracking-tight sm:text-4xl">Rapid Resolution FAQs</h2>
          <Accordion type="single" collapsible className="mt-8">
            {faqItems.map((item, index) => (
              <AccordionItem key={item.q} value={`homepage-rapid-faq-${index}`}>
                <AccordionTrigger className="text-left">{item.q}</AccordionTrigger>
                <AccordionContent className="leading-relaxed text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section className="bg-slate-950 px-4 py-16 text-white" aria-labelledby="homepage-final-heading">
        <div className="container mx-auto max-w-4xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.15em] text-primary-light">
            ${RAPID_RESOLUTION.priceCad} CAD + GST · trial separate
          </p>
          <h2 id="homepage-final-heading" className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Put your ticket into motion.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-300">
            Upload the ticket and complete your secure authorization online.
          </p>
          <Button asChild size="lg" className="mt-7 min-h-12 bg-primary px-8 text-base hover:bg-primary-dark">
            <Link
              to={RAPID_RESOLUTION.intakePath}
              onClick={() =>
                trackAssessmentEvent(
                  "assessment_cta_click",
                  {
                    location: "homepage_final_cta",
                    destination: "rapid_resolution_intake",
                    value: RAPID_RESOLUTION.priceCad,
                  },
                  "homepage_final_cta",
                )
              }
            >
              Start Rapid Resolution
              <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
