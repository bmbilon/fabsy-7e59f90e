import { Link } from "react-router-dom";
import {
  BellRing,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileSearch,
  Scale,
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
import { HOMEPAGE_REFUND_COPY } from "@/content/homepageRefundCopy";
import PhotoRadarOfferStrip from "./PhotoRadarOfferStrip";
import PricingLadder from "./PricingLadder";
import InsuranceContextSection from "./InsuranceContextSection";
import ProDriverSection from "./ProDriverSection";
import HomepageDriverSection from "./HomepageDriverSection";

const process = [
  {
    icon: Upload,
    title: "You upload your ticket",
    text: "Start online and authorize Fabsy to help with your eligible ticket.",
  },
  {
    icon: FileSearch,
    title: "We gather the evidence",
    text: "We request the evidence, track the documents, and keep you updated.",
  },
  {
    icon: FileCheck2,
    title: "We pursue your options",
    text: "Qualified review shapes a fact-specific submission to the prosecutor.",
  },
  {
    icon: BellRing,
    title: "You make the call",
    text: "We explain the response. You decide whether to accept an available resolution.",
  },
] as const;

const faqItems = [
  {
    q: `What is included for $${RAPID_RESOLUTION.priceCad}?`,
    a: "Secure intake, digital authorization, eligibility and deadline review, requesting and tracking the evidence package (disclosure), evidence analysis with qualified review, a fact-specific pre-trial prosecutor submission, client updates, and explanation of an available prosecutor response. Applicable GST is extra.",
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
  {
    q: "Can Fabsy promise a specific outcome?",
    a: `${HOMEPAGE_REFUND_COPY.outcomeQualification} ${HOMEPAGE_REFUND_COPY.successDefinition}`,
  },
  {
    q: "When is my service fee refunded if there is no reduction?",
    a: `${HOMEPAGE_REFUND_COPY.refundCondition} ${HOMEPAGE_REFUND_COPY.paymentTiming} ${HOMEPAGE_REFUND_COPY.refundScope}`,
  },
  {
    q: "Will I get a refund if I reject a reduced Crown offer?",
    a: HOMEPAGE_REFUND_COPY.declinedOfferDisclaimer,
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
              Your part is simple. We handle the follow-through.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              A clear process, with support at every step.
            </p>
          </div>
          <ol className="mt-10 grid gap-7 sm:grid-cols-2 lg:grid-cols-4">
            {process.map(({ icon: Icon, title, text }, index) => (
              <li key={title} className="border-t-2 border-blue-100 pt-5">
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-primary-dark">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <span className="text-sm font-semibold text-slate-500" aria-hidden="true">0{index + 1}</span>
                </div>
                <h3 className="mt-4 text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
              </li>
            ))}
          </ol>
          <aside className="mt-10 flex flex-col gap-6 rounded-2xl bg-slate-950 p-6 text-white sm:p-8 md:flex-row md:items-center md:gap-8" aria-labelledby="homepage-speed-heading">
            <div className="flex shrink-0 items-center gap-3 md:flex-col md:items-start md:gap-1">
              <p className="text-6xl font-bold tracking-tight text-blue-300">{RAPID_RESOLUTION.actionCommitmentHours}</p>
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <Clock3 className="h-4 w-4" aria-hidden="true" />
                hour action commitment
              </p>
            </div>
            <div className="border-t border-slate-700 pt-5 md:border-l md:border-t-0 md:pl-8 md:pt-0">
              <h3 id="homepage-speed-heading" className="text-xl font-bold text-white">When the evidence arrives, we get moving.</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                {RAPID_RESOLUTION.speedDisclaimer}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">This measures Fabsy’s next action, not the Crown’s response time or a final result. Continue to follow your deadline instructions.</p>
            </div>
          </aside>
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
            <div className="mt-4"><PricingLadder /></div>
          </div>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            <Card className="flex flex-col border-primary/20 p-7 shadow-fab">
              <Scale className="h-7 w-7 text-primary" aria-hidden="true" />
              <h3 className="mt-5 text-2xl font-bold">{RAPID_RESOLUTION.name}</h3>
              <p className="mt-3 text-4xl font-bold">${RAPID_RESOLUTION.priceCad}</p>
              <p className="mt-4 flex-1 leading-relaxed text-muted-foreground">
                Eligible Alberta pre-trial service from secure intake through an available client-directed resolution.
              </p>
              <ul className="mt-5 space-y-3 text-sm text-slate-700">
                {["Court and prosecutor steps handled", "Evidence analysis with qualified review", "Case updates and options explained"].map((label) => (
                  <li key={label} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-dark" aria-hidden="true" />
                    <span>{label}</span>
                  </li>
                ))}
              </ul>
              <a href="#money-back-guarantee" className="mt-5 text-sm font-semibold text-primary-dark underline underline-offset-4">
                Rapid Resolution service-fee refund · See policy
              </a>
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
              <a href="#money-back-guarantee" className="mt-5 text-sm font-semibold text-primary-dark underline underline-offset-4">
                Service-fee refund guarantee · See policy
              </a>
              <Button asChild className="mt-6">
                <Link to={`${RAPID_RESOLUTION.intakePath}?bundle=1`}>Choose the bundle</Link>
              </Button>
            </Card>
          </div>
          <PhotoRadarOfferStrip />
        </div>
      </section>

      <InsuranceContextSection />
      <ProDriverSection />
      <HomepageDriverSection />

      <section className="bg-white px-4 py-16 sm:py-20" aria-labelledby="homepage-faq-heading">
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
    </>
  );
}
