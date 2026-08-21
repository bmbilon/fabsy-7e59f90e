import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  BadgeDollarSign,
  CalendarClock,
  Check,
  CheckCircle2,
  FileSearch,
  Gauge,
  HelpCircle,
  LockKeyhole,
  Route,
  Scale,
  ShieldCheck,
  Upload,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import StaticJsonLd from "@/components/StaticJsonLd";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TICKET_ASSESSMENT } from "@/config/ticketAssessment";
import useSafeHead from "@/hooks/useSafeHead";
import { trackAssessmentEvent } from "@/lib/assessment/analytics";

const outcomes = [
  "What exactly did I get charged with?",
  "What happens if I pay it?",
  "Will I get demerits?",
  "Could my insurance go up?",
  "How much could that matter financially?",
  "Can the outcome realistically be improved?",
  "Is paying for representation actually worth it?",
  "What should I do next?",
] as const;

const included = [
  { icon: FileSearch, title: "Ticket review", text: "The allegation, important dates, what happens if you do nothing and any obvious issues visible from the material supplied." },
  { icon: HelpCircle, title: "Plain-language explanation", text: "The offence, fine, demerit implications and why the conviction itself is different from the amount printed on the ticket." },
  { icon: Route, title: "Options assessment", text: "Pay, seek a resolution where available, dispute, obtain representation or use another available Alberta process." },
  { icon: Gauge, title: "Insurance impact assessment", text: "A cautious estimate of whether the risk appears trivial, moderate or potentially material using the context you provide." },
  { icon: BadgeDollarSign, title: "Representation break-even", text: "A practical comparison between plausible financial exposure and the cost and realistic value of professional representation." },
  { icon: CheckCircle2, title: "Recommended next step", text: "A direct human-reviewed recommendation, including when paying the ticket appears more sensible than hiring Fabsy." },
] as const;

const process = [
  { icon: Upload, title: "Send us your ticket", text: "Securely upload the ticket and answer a few focused questions. You can choose “I don't know” where appropriate." },
  { icon: FileSearch, title: "We assess the full picture", text: "A Fabsy team member reviews the ticket, driving-record context and potential insurance consequences." },
  { icon: Scale, title: "Get a clear recommendation", text: "Understand the options and whether further representation is actually worth paying for." },
] as const;

const faqItems = [
  {
    q: "What exactly do I get for $149?",
    a: "A human-reviewed assessment of your Alberta ticket: the charge and deadline, fine and demerit implications, options, likely insurance-risk significance, representation economics and a recommended next step.",
  },
  {
    q: "Does paying a ticket affect my insurance?",
    a: "Paying generally resolves the ticket as a conviction, but insurance treatment depends on the offence, insurer, record and renewal timing. The assessment explains the likely risk without promising a particular premium result.",
  },
  {
    q: "Are demerits the same thing as an insurance conviction?",
    a: "No. A fine, demerit points and a conviction on a driving record are related but distinct. A ticket with few or no demerits can still matter to an insurer, while not every ticket creates the same insurance risk.",
  },
  {
    q: "Can you tell me exactly how much my insurance will increase?",
    a: TICKET_ASSESSMENT.insuranceDisclaimer,
  },
  {
    q: "Do I need a lawyer or traffic-ticket agent?",
    a: "Not necessarily. The assessment is designed to answer that economic question. Some matters may be sensible to pay or handle directly; others may justify professional help. Some charges or court locations may require a lawyer or may not permit Fabsy agent representation.",
  },
  {
    q: "What if it is cheaper just to pay the ticket?",
    a: "Fabsy will say so when that appears to be the economically sensible option. The assessment is a decision product, not a sales pitch for representation.",
  },
  {
    q: "What if my response deadline has already passed?",
    a: "Submit the ticket and clearly identify the missed date. Available steps depend on the ticket and current procedural status. If the matter is urgent, contact Fabsy after submitting; the assessment does not extend or pause a deadline.",
  },
  {
    q: "What happens if Fabsy recommends representation?",
    a: "The assessment explains why representation may be worthwhile and the next step. Eligibility and pricing are confirmed separately; no later service is automatic or required.",
  },
  {
    q: "Is the $149 applied toward representation?",
    a: TICKET_ASSESSMENT.representationCredit.publicCopy,
  },
  {
    q: "Which provinces does Fabsy currently serve?",
    a: "This assessment currently accepts Alberta traffic tickets only. Fabsy does not claim to provide this service or representation in other provinces or territories.",
  },
  {
    q: "What happens after I submit my ticket?",
    a: `${TICKET_ASSESSMENT.deliveryExpectation} Your payment confirmation explains what was received and how to provide anything missing.`,
  },
] as const;

export default function TicketAssessment() {
  const [searchParams] = useSearchParams();
  const checkoutCancelled = searchParams.get("checkout") === "cancelled";
  const representationSection = useRef<HTMLDivElement | null>(null);

  useSafeHead({
    title: "$149 Alberta Traffic Ticket & Insurance Assessment | Fabsy",
    description:
      "Not sure what to do after an Alberta traffic ticket? For $149 CAD, Fabsy reviews the ticket, likely insurance impact and whether fighting it is worth the cost.",
    canonical: `https://fabsy.ca${TICKET_ASSESSMENT.slug}`,
  });

  useEffect(() => {
    trackAssessmentEvent("assessment_offer_view", { value: TICKET_ASSESSMENT.priceCad });
    if (checkoutCancelled) {
      trackAssessmentEvent("checkout_abandoned", { checkout_stage: "stripe" });
    }
  }, [checkoutCancelled]);

  useEffect(() => {
    const node = representationSection.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    let tracked = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !tracked) {
        tracked = true;
        trackAssessmentEvent("representation_cta_view", { location: "assessment_landing" });
        observer.disconnect();
      }
    }, { threshold: 0.4 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  } as const;

  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: TICKET_ASSESSMENT.name,
    url: `https://fabsy.ca${TICKET_ASSESSMENT.slug}`,
    areaServed: { "@type": "AdministrativeArea", name: "Alberta, Canada" },
    provider: { "@type": "ProfessionalService", name: "Fabsy Traffic Ticket Services", url: "https://fabsy.ca" },
    offers: {
      "@type": "Offer",
      price: String(TICKET_ASSESSMENT.priceCad),
      priceCurrency: TICKET_ASSESSMENT.currency,
      availability: "https://schema.org/InStock",
    },
  } as const;

  return (
    <div className="min-h-screen bg-background">
      <StaticJsonLd schema={faqSchema} dataAttr="assessment-faq" />
      <StaticJsonLd schema={serviceSchema} dataAttr="assessment-service" />
      <Header />
      <main>
        <section className="overflow-hidden bg-slate-950 text-white">
          <div className="container mx-auto grid gap-10 px-4 py-16 sm:py-20 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:py-24">
            <div>
              <Badge className="border-violet-300/30 bg-violet-300/10 text-violet-100">
                Alberta tickets · Human reviewed
              </Badge>
              <h1 className="mt-5 max-w-4xl text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
                {TICKET_ASSESSMENT.heroHeadline}
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-relaxed text-slate-200 sm:text-xl">
                {TICKET_ASSESSMENT.heroSubheadline}
              </p>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                <Button asChild size="lg" className="min-h-13 bg-violet-600 px-7 text-base hover:bg-violet-500">
                  <Link
                    to={TICKET_ASSESSMENT.intakePath}
                    onClick={() => trackAssessmentEvent("assessment_start", { location: "hero" })}
                  >
                    {TICKET_ASSESSMENT.cta}
                    <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                  </Link>
                </Button>
                <p className="text-sm font-semibold text-slate-300">One price. Clear answers. No pressure to hire us.</p>
              </div>
              <p className="mt-5 text-sm text-slate-400">If representation isn't worth the cost, we'll tell you.</p>
            </div>

            <Card className="border-white/10 bg-white p-7 text-slate-950 shadow-2xl sm:p-8">
              <p className="text-sm font-bold uppercase tracking-[0.15em] text-violet-700">Complete assessment</p>
              <p className="mt-2 text-5xl font-bold">${TICKET_ASSESSMENT.priceCad}</p>
              <p className="mt-1 text-sm text-slate-600">CAD · one-time · applicable tax included</p>
              <div className="my-6 border-t" />
              <ul className="space-y-3 text-sm text-slate-700">
                {["Ticket and deadline review", "Demerit and conviction explanation", "Insurance-risk assessment", "Representation break-even analysis", "Recommended next step"].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 rounded-lg bg-slate-100 p-4 text-xs leading-relaxed text-slate-600">
                Government fines and any later representation fee are separate. No percentage or success fee applies to this assessment.
              </p>
            </Card>
          </div>
        </section>

        {checkoutCancelled ? (
          <div className="container mx-auto px-4 pt-8">
            <Alert>
              <CalendarClock className="h-4 w-4" />
              <AlertTitle>Checkout was cancelled</AlertTitle>
              <AlertDescription>No payment was taken. You can restart when you're ready.</AlertDescription>
            </Alert>
          </div>
        ) : null}

        <section className="px-4 py-16 sm:py-20" aria-labelledby="what-you-know-heading">
          <div className="container mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <Badge variant="outline">The outcome</Badge>
              <h2 id="what-you-know-heading" className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">What you'll know when we're done</h2>
              <p className="mt-4 text-lg text-muted-foreground">The point is not more information. It is a confident, financially sensible next decision.</p>
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

        <section className="bg-slate-50 px-4 py-16 sm:py-20" aria-labelledby="not-the-same-heading">
          <div className="container mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
              <div>
                <Badge variant="outline">A distinction worth understanding</Badge>
                <h2 id="not-the-same-heading" className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">The fine is only one part of the decision</h2>
                <p className="mt-4 leading-relaxed text-muted-foreground">
                  A $200 ticket can matter because of downstream record or insurance consequences—or the risk may be small enough that expensive representation makes little sense.
                </p>
              </div>
              <Card className="p-6 shadow-elevated sm:p-8">
                <div className="flex flex-col gap-3 text-center sm:flex-row sm:items-center">
                  {["Ticket", "Conviction", "Driving record", "Possible insurance impact"].map((label, index) => (
                    <div key={label} className="contents">
                      <div className="flex-1 rounded-xl border border-primary/20 bg-primary/5 p-4 font-bold">{label}</div>
                      {index < 3 && <ArrowRight className="mx-auto hidden h-5 w-5 text-primary sm:block" aria-hidden="true" />}
                    </div>
                  ))}
                </div>
                <p className="mt-5 text-center text-sm font-semibold text-slate-700">Ticket fine ≠ demerit points ≠ insurance treatment</p>
              </Card>
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:py-20" aria-labelledby="included-heading">
          <div className="container mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <Badge variant="outline">One substantial bundle</Badge>
              <h2 id="included-heading" className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">What the $149 assessment includes</h2>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {included.map(({ icon: Icon, title, text }) => (
                <Card key={title} className="p-6 shadow-fab">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-xl font-bold">{title}</h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{text}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-slate-950 px-4 py-16 text-white sm:py-20" aria-labelledby="process-heading">
          <div className="container mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <Badge className="border-violet-300/30 bg-violet-300/10 text-violet-100">Three simple steps</Badge>
              <h2 id="process-heading" className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">From confusion to a clear next move</h2>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {process.map(({ icon: Icon, title, text }, index) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/20 text-violet-200">
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

        <section className="px-4 py-16 sm:py-20">
          <div className="container mx-auto max-w-5xl">
            <Card className="border-amber-200 bg-amber-50 p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-amber-800" aria-hidden="true" />
                <div>
                  <h2 className="text-xl font-bold text-amber-950">Clear limits, stated up front</h2>
                  <p className="mt-2 leading-relaxed text-amber-950/80">{TICKET_ASSESSMENT.insuranceDisclaimer}</p>
                  <p className="mt-3 leading-relaxed text-amber-950/80">{TICKET_ASSESSMENT.serviceDisclaimer}</p>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section ref={representationSection} className="bg-violet-50 px-4 py-16 sm:py-20" aria-labelledby="trust-heading">
          <div className="container mx-auto max-w-5xl text-center">
            <LockKeyhole className="mx-auto h-9 w-9 text-primary" aria-hidden="true" />
            <h2 id="trust-heading" className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">We'll tell you when fighting it isn't worth it</h2>
            <p className="mx-auto mt-4 max-w-3xl text-lg leading-relaxed text-muted-foreground">
              If the likely downside does not justify another $500–$1,000 or more, the assessment should save you from that spend. If the exposure appears material, Fabsy will explain the practical path forward without making representation automatic.
            </p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link
                  to={TICKET_ASSESSMENT.intakePath}
                  onClick={() => trackAssessmentEvent("representation_cta_click", { location: "trust_section", destination: "assessment_intake" })}
                >
                  {TICKET_ASSESSMENT.cta}
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link
                  to="/submit-ticket"
                  onClick={() => trackAssessmentEvent("representation_cta_click", { location: "trust_section", destination: "representation_intake" })}
                >
                  I already want representation
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:py-20" aria-labelledby="faq-heading">
          <div className="container mx-auto max-w-3xl">
            <h2 id="faq-heading" className="text-center text-3xl font-bold tracking-tight sm:text-4xl">Ticket assessment FAQs</h2>
            <Accordion type="single" collapsible className="mt-8">
              {faqItems.map((item, index) => (
                <AccordionItem key={item.q} value={`assessment-faq-${index}`}>
                  <AccordionTrigger className="text-left">{item.q}</AccordionTrigger>
                  <AccordionContent className="leading-relaxed text-muted-foreground">{item.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        <section className="bg-slate-950 px-4 py-16 text-white">
          <div className="container mx-auto max-w-4xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.15em] text-violet-200">Complete assessment · ${TICKET_ASSESSMENT.priceCad} CAD</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">Know the smart move before you spend more.</h2>
            <Button asChild size="lg" className="mt-7 min-h-12 bg-violet-600 px-8 text-base hover:bg-violet-500">
              <Link
                to={TICKET_ASSESSMENT.intakePath}
                onClick={() => trackAssessmentEvent("assessment_start", { location: "final_cta" })}
              >
                {TICKET_ASSESSMENT.cta}
                <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
