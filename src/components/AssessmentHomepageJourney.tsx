import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  FileSearch,
  Gauge,
  MailCheck,
  Scale,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TICKET_ASSESSMENT } from "@/config/ticketAssessment";
import { trackAssessmentEvent } from "@/lib/assessment/analytics";

const outcomes = [
  "What exactly was I charged with?",
  "What happens if I pay it?",
  "Will I receive demerits?",
  "Could the conviction affect my insurance?",
  "How financially significant could that be?",
  "Can the outcome realistically be improved?",
  "Is spending $500–$1,000 or more on representation worth it?",
  "What should I do next?",
] as const;

const process = [
  {
    icon: Upload,
    title: "Upload your ticket",
    text: "Send a readable PDF or image and answer a few focused questions about the ticket, your record and insurance context.",
  },
  {
    icon: FileSearch,
    title: "A human reviews the full picture",
    text: "Fabsy separates the fine, demerits, conviction risk, possible insurance impact and economics of representation.",
  },
  {
    icon: MailCheck,
    title: "Get a clear recommendation",
    text: "Your assessment is emailed with the options, financial significance, break-even point and recommended next step.",
  },
] as const;

const sampleRows = [
  ["Charge", "Speeding"],
  ["Key deadline", "September 15, 2026"],
  ["Demerit exposure", "3 demerits"],
  ["Insurance-risk level", "Potentially material"],
  ["Estimated financial significance", "$1,200–$2,400 over three years"],
  ["Representation break-even", "Approximately $700"],
  ["Recommended action", "Seek a reduction before conviction"],
  ["Reason", "Potential insurance exposure may materially exceed the cost of a better outcome"],
] as const;

const faqItems = [
  {
    q: "What do I receive for $149?",
    a: "A human-reviewed assessment of the charge and deadline, fine and demerit implications, likely insurance significance, practical options, representation break-even and a recommended next step.",
  },
  {
    q: "Is $149 the total charged at checkout?",
    a: "$149 CAD is the total one-time checkout price and includes applicable GST. Government fines and any later representation are separate.",
  },
  {
    q: "What is the Free Ticket Review?",
    a: "Upload or photograph the ticket and check the OCR-assisted details before choosing paid help. The free stage does not retain Fabsy, pause a deadline or include the human report and policy-based insurance scenarios.",
  },
  {
    q: "Can Fabsy tell me exactly how much my premium will change?",
    a: TICKET_ASSESSMENT.insuranceDisclaimer,
  },
  {
    q: "What if fighting the ticket is not worth the money?",
    a: "Fabsy will say so when paying or handling the matter directly appears more economically sensible. The assessment does not obligate you to buy representation.",
  },
  {
    q: "When will I receive the assessment?",
    a: `${TICKET_ASSESSMENT.deliveryExpectation} Purchasing the assessment does not pause any deadline printed on your ticket.`,
  },
] as const;

const trustEvidence = [
  {
    icon: ShieldCheck,
    title: "Human reviewed",
    text: "A Fabsy team member reviews the ticket and context before the recommendation is delivered.",
  },
  {
    icon: BadgeDollarSign,
    title: "Clear service economics",
    text: "The recommendation compares the potential downside with the cost and realistic value of representation.",
  },
  {
    icon: Gauge,
    title: "Transparent insurance limits",
    text: "Likely significance is assessed cautiously; no insurer treatment or premium amount is guaranteed.",
  },
] as const;

export default function AssessmentHomepageJourney() {
  const representationSection = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = representationSection.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      trackAssessmentEvent(
        "representation_cta_view",
        { location: "homepage_representation_step" },
        "homepage_representation_step",
      );
      observer.disconnect();
    }, { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <section id="assessment-details" className="scroll-mt-20 px-4 py-16 sm:py-20" aria-labelledby="homepage-outcomes-heading">
        <div className="container mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline">The outcome</Badge>
            <h2 id="homepage-outcomes-heading" className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              What you'll know when we're done
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">A decision you can act on, not a generic ticket summary.</p>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {outcomes.map((outcome) => (
              <Card key={outcome} className="flex min-h-28 items-start gap-3 p-5 shadow-fab">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <p className="font-semibold leading-snug">{outcome}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-950 px-4 py-16 text-white sm:py-20" aria-labelledby="homepage-process-heading">
        <div className="container mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <Badge className="border-primary/30 bg-primary/10 text-primary-light">How it works</Badge>
            <h2 id="homepage-process-heading" className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              From ticket upload to a clear next move
            </h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {process.map(({ icon: Icon, title, text }, index) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary-light">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <span className="text-sm font-bold text-slate-400">0{index + 1}</span>
                </div>
                <h3 className="mt-5 text-xl font-bold text-white">{title}</h3>
                <p className="mt-3 leading-relaxed text-slate-300">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:py-20" aria-labelledby="sample-assessment-heading">
        <div className="container mx-auto max-w-5xl">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline">Illustrative sample</Badge>
            <h2 id="sample-assessment-heading" className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              See the kind of answer you receive
            </h2>
          </div>
          <Card className="mt-10 overflow-hidden border-primary/20 shadow-elevated">
            <div className="bg-gradient-hero p-6 text-white sm:p-8">
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary-light">Sample assessment result</p>
              <p className="mt-2 text-lg text-slate-200">A concise decision summary built from the ticket and context supplied.</p>
            </div>
            <dl className="grid sm:grid-cols-2">
              {sampleRows.map(([label, value]) => (
                <div key={label} className="border-b p-5 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 sm:[&:nth-child(odd)]:border-r">
                  <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</dt>
                  <dd className="mt-2 font-semibold leading-relaxed text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="bg-amber-50 p-5 text-sm leading-relaxed text-amber-950">
              Illustrative example only. Figures and recommendations vary by ticket, driving history, insurer context and the information supplied; this is not a promise of a particular result or premium change.
            </p>
          </Card>
        </div>
      </section>

      <section className="bg-slate-50 px-4 py-16 sm:py-20" aria-labelledby="homepage-impact-heading">
        <div className="container mx-auto max-w-6xl">
          <div className="grid gap-9 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <Badge variant="outline">Fine, demerits and insurance are different</Badge>
              <h2 id="homepage-impact-heading" className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                The ticket amount is only part of the decision
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                A fine is the immediate amount due. Demerits affect the driving record system. A conviction may be visible to an insurer, but there is no universal or guaranteed premium increase.
              </p>
            </div>
            <Card className="p-6 shadow-elevated sm:p-8">
              <div className="flex flex-col gap-3 text-center sm:flex-row sm:items-center">
                {["Ticket", "Conviction", "Driving record", "Possible insurance impact"].map((label, index) => (
                  <div key={label} className="contents">
                    <div className="flex-1 rounded-xl border border-primary/20 bg-primary/5 p-4 font-bold">{label}</div>
                    {index < 3 ? <ArrowRight className="mx-auto hidden h-5 w-5 text-primary sm:block" aria-hidden="true" /> : null}
                  </div>
                ))}
              </div>
              <p className="mt-5 text-center text-sm font-semibold text-slate-700">Ticket fine ≠ demerit points ≠ insurance treatment</p>
            </Card>
          </div>
          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">{TICKET_ASSESSMENT.insuranceDisclaimer}</p>
        </div>
      </section>

      <section ref={representationSection} className="px-4 py-16 sm:py-20" aria-labelledby="homepage-representation-heading">
        <div className="container mx-auto max-w-5xl">
          <Card className="border-primary/20 p-7 shadow-elevated sm:p-10">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Scale className="h-6 w-6" aria-hidden="true" />
                </div>
                <h2 id="homepage-representation-heading" className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
                  Representation is the next step only when the economics support it
                </h2>
                <p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground">
                  Fabsy's representation pricing is a $488 base representation fee plus 30% of any fine reduction achieved. If representation is worthwhile and your matter is eligible, the $149 already paid can be applied, leaving a $339 base-fee balance plus applicable tax.
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  Eligible assessment clients also receive priority placement in the representation queue. No reduction means no success fee; outcomes are never promised.
                </p>
              </div>
              <Button asChild size="lg" variant="outline" className="min-h-12 lg:min-w-56">
                <Link
                  to={TICKET_ASSESSMENT.intakePath}
                  onClick={() => trackAssessmentEvent(
                    "representation_cta_click",
                    { location: "homepage_representation_step", destination: "representation_intake" },
                    "homepage_representation_step",
                  )}
                >
                  Start the connected intake
                </Link>
              </Button>
            </div>
          </Card>
        </div>
      </section>

      <section className="bg-violet-50 px-4 py-16 sm:py-20" aria-labelledby="homepage-trust-heading">
        <div className="container mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline">Trust and evidence</Badge>
            <h2 id="homepage-trust-heading" className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Human judgment with clear limits</h2>
            <p className="mt-4 text-lg text-muted-foreground">Fabsy publishes verified facts and does not use anonymous sample stories as client testimonials.</p>
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
          <div className="mt-7 text-center">
            <Link to="/testimonials" className="font-semibold text-primary underline underline-offset-4">Review Fabsy's published outcome standards</Link>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:py-20" aria-labelledby="homepage-faq-heading">
        <div className="container mx-auto max-w-3xl">
          <h2 id="homepage-faq-heading" className="text-center text-3xl font-bold tracking-tight sm:text-4xl">Assessment FAQs</h2>
          <Accordion type="single" collapsible className="mt-8">
            {faqItems.map((item, index) => (
              <AccordionItem key={item.q} value={`homepage-assessment-faq-${index}`}>
                <AccordionTrigger className="text-left">{item.q}</AccordionTrigger>
                <AccordionContent className="leading-relaxed text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Start with the ticket itself: <Link to={TICKET_ASSESSMENT.intakePath} className="font-semibold text-primary underline underline-offset-4">upload or take a photo for the Free Ticket Review</Link>.
          </p>
        </div>
      </section>

      <section className="bg-slate-950 px-4 py-16 text-white" aria-labelledby="homepage-final-heading">
        <div className="container mx-auto max-w-4xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.15em] text-primary-light">${TICKET_ASSESSMENT.priceCad} CAD total · GST included</p>
          <h2 id="homepage-final-heading" className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">Know the smart move before you spend more.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-300">If representation isn't worth the cost, we'll tell you.</p>
          <Button asChild size="lg" className="mt-7 min-h-12 bg-primary px-8 text-base hover:bg-primary-dark">
            <Link
              to={TICKET_ASSESSMENT.intakePath}
              onClick={() => trackAssessmentEvent(
                "assessment_cta_click",
                { location: "homepage_final_cta", destination: "assessment_intake", value: TICKET_ASSESSMENT.priceCad },
                "homepage_final_cta",
              )}
            >
              {TICKET_ASSESSMENT.cta}
              <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
