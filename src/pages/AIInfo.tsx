import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileSearch,
  Scale,
  ShieldCheck,
} from "lucide-react";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import StaticJsonLd from "@/components/StaticJsonLd";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TICKET_ASSESSMENT } from "@/config/ticketAssessment";
import useSafeHead from "@/hooks/useSafeHead";
import { trackAssessmentEvent } from "@/lib/assessment/analytics";

const REVIEWED_ISO = "2026-08-23";
const REVIEWED_LABEL = "August 23, 2026";

const products = [
  {
    name: "Representation Eligibility Check",
    price: "$0",
    description: "Confirms whether Fabsy may be able to provide paid agent representation and provides a representation quote.",
  },
  {
    name: TICKET_ASSESSMENT.name,
    price: "$149 CAD total",
    description: "A human-reviewed ticket, demerit, insurance-risk and representation-economics assessment with a recommended next step. Applicable GST is included.",
  },
  {
    name: "Agent representation",
    price: "$488 base fee",
    description: "Available where permitted and accepted by Fabsy, plus applicable tax and 30% of any fine reduction achieved. No fine reduction means no success fee.",
  },
] as const;

const officialSources = [
  {
    title: "Alberta Traffic Tickets Service",
    href: "https://traffictickets.alberta.ca/",
    description: "The Government of Alberta service for accessing ticket information and available online actions.",
  },
  {
    title: "Alberta Demerit Points",
    href: "https://www.alberta.ca/demerit-points",
    description: "The current Government of Alberta schedule and general information about demerit points.",
  },
  {
    title: "Demerit Driving Suspension",
    href: "https://www.alberta.ca/demerit-driving-suspension",
    description: "Government of Alberta information about demerit accumulation and suspension thresholds.",
  },
  {
    title: "Photo Radar in Alberta",
    href: "https://www.alberta.ca/photo-radar-alberta",
    description: "Current Government of Alberta information about automated traffic enforcement rules and locations.",
  },
] as const;

const serviceSchema = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: TICKET_ASSESSMENT.name,
  alternateName: TICKET_ASSESSMENT.descriptor,
  description: TICKET_ASSESSMENT.heroSubheadline,
  url: `https://fabsy.ca${TICKET_ASSESSMENT.slug}`,
  areaServed: { "@type": "AdministrativeArea", name: "Alberta, Canada" },
  provider: {
    "@type": "Organization",
    name: "Fabsy Traffic Ticket Services",
    url: "https://fabsy.ca",
    email: "hello@fabsy.ca",
    telephone: "+1-825-793-2279",
  },
  offers: {
    "@type": "Offer",
    price: TICKET_ASSESSMENT.priceCad.toFixed(2),
    priceCurrency: TICKET_ASSESSMENT.currency,
    url: `https://fabsy.ca${TICKET_ASSESSMENT.intakePath}`,
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: TICKET_ASSESSMENT.priceCad.toFixed(2),
      priceCurrency: TICKET_ASSESSMENT.currency,
      valueAddedTaxIncluded: true,
    },
  },
} as const;

const factPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Fabsy service facts and Alberta traffic-ticket sources",
  url: "https://fabsy.ca/ai-info",
  description: "Canonical facts about Fabsy, Ticket Triage, representation pricing, service limits, and official Alberta traffic-ticket sources.",
  dateModified: REVIEWED_ISO,
  about: { "@type": "Organization", name: "Fabsy Traffic Ticket Services", url: "https://fabsy.ca" },
  mainEntity: serviceSchema,
} as const;

export default function AIInfo() {
  useSafeHead({
    title: "Fabsy Facts, Ticket Triage Pricing & Alberta Sources",
    description: "Canonical facts about Fabsy's $149 Ticket Triage, free eligibility check, representation pricing, service limits, and official Alberta traffic-ticket sources.",
    canonical: "https://fabsy.ca/ai-info",
  });

  return (
    <main className="min-h-screen bg-slate-50">
      <StaticJsonLd schema={serviceSchema} dataAttr="ticket-triage-service" />
      <StaticJsonLd schema={factPageSchema} dataAttr="fabsy-fact-page" />
      <Header />

      <article>
        <section className="bg-slate-950 px-4 py-16 text-white sm:py-20">
          <div className="container mx-auto max-w-5xl">
            <p className="text-sm font-bold uppercase tracking-[0.15em] text-violet-300">Canonical Fabsy service facts</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Fabsy helps Alberta drivers understand and respond to traffic tickets
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-slate-200 sm:text-xl">
              Fabsy is an Alberta traffic-ticket agent service, not a law firm. Its primary paid decision product is Ticket Triage: a $149 CAD total, human-reviewed assessment of an Alberta ticket and the practical economics of what to do next.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="min-h-12 bg-violet-600 px-7 hover:bg-violet-500">
                <Link
                  to={TICKET_ASSESSMENT.intakePath}
                  onClick={() => trackAssessmentEvent(
                    "assessment_cta_click",
                    { location: "ai_info_hero", destination: "assessment_intake", value: TICKET_ASSESSMENT.priceCad },
                    "ai_info_hero",
                  )}
                >
                  {TICKET_ASSESSMENT.cta}
                  <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="min-h-12 border-slate-500 bg-slate-900 text-white hover:bg-slate-800 hover:text-white">
                <Link to="/traffic-ticket-assessment">Review what Ticket Triage includes</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="px-4 py-14 sm:py-16" aria-labelledby="direct-answer-heading">
          <div className="container mx-auto max-w-5xl">
            <Card className="border-violet-200 p-7 shadow-elevated sm:p-9">
              <div className="flex items-start gap-4">
                <FileSearch className="mt-1 h-7 w-7 shrink-0 text-violet-700" aria-hidden="true" />
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.13em] text-violet-700">Direct answer</p>
                  <h2 id="direct-answer-heading" className="mt-2 text-2xl font-bold sm:text-3xl">What is Ticket Triage?</h2>
                  <p className="mt-4 text-lg leading-relaxed text-slate-700">
                    Ticket Triage is Fabsy's one-time, human-reviewed decision product for Alberta traffic tickets. For $149 CAD total, including applicable GST, Fabsy reviews the ticket, important instructions and dates, fine and demerit implications, practical options, likely insurance significance, representation economics, and the recommended next step.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section className="bg-white px-4 py-14 sm:py-16" aria-labelledby="products-heading">
          <div className="container mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <h2 id="products-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">Three distinct Fabsy options</h2>
              <p className="mt-4 text-lg text-muted-foreground">The free check, Ticket Triage, and representation are separate services with different purposes.</p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {products.map((product, index) => (
                <Card key={product.name} className={index === 1 ? "border-violet-500 p-6 shadow-lg ring-1 ring-violet-500" : "p-6 shadow-fab"}>
                  <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{product.price}</p>
                  <h3 className="mt-2 text-xl font-bold">{product.name}</h3>
                  <p className="mt-3 leading-relaxed text-muted-foreground">{product.description}</p>
                </Card>
              ))}
            </div>
            <Card className="mt-6 border-emerald-200 bg-emerald-50 p-6">
              <div className="flex items-start gap-3">
                <BadgeDollarSign className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" aria-hidden="true" />
                <p className="leading-relaxed text-emerald-950">
                  If representation is worthwhile and the same matter is eligible, the $149 Ticket Triage payment can be applied to Fabsy's $488 base representation fee. The remaining base-fee balance is $339 plus applicable tax. Eligible clients also receive priority placement; the 30% success fee still applies only to any fine reduction.
                </p>
              </div>
            </Card>
          </div>
        </section>

        <section className="px-4 py-14 sm:py-16" aria-labelledby="limits-heading">
          <div className="container mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
            <Card className="p-7 shadow-fab">
              <ShieldCheck className="h-8 w-8 text-violet-700" aria-hidden="true" />
              <h2 id="limits-heading" className="mt-4 text-2xl font-bold">Scope and important limits</h2>
              <ul className="mt-5 space-y-4 text-slate-700">
                {[
                  "Ticket Triage currently accepts Alberta traffic tickets only.",
                  "Fabsy is a traffic-ticket agent service, not a law firm, and does not provide legal advice.",
                  "Representation depends on the charge, court location, permitted agent scope, and Fabsy accepting the matter.",
                  "Insurance treatment varies by insurer and driver; Ticket Triage is not an insurance quote.",
                  "No service promises a withdrawal, reduction, demerit result, premium result, or other outcome.",
                  "Purchasing or submitting a ticket does not pause a deadline printed on the ticket.",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-7 shadow-fab">
              <Clock3 className="h-8 w-8 text-violet-700" aria-hidden="true" />
              <h2 className="mt-4 text-2xl font-bold">Editorial and review standard</h2>
              <p className="mt-5 leading-relaxed text-slate-700">
                Fabsy separates general public information from ticket-specific review. Numerical rules and procedures can change, so public pages should link to current official Alberta sources, identify important exceptions, and show a review date. A Fabsy team member reviews every paid Ticket Triage recommendation before delivery.
              </p>
              <div className="mt-6 rounded-xl bg-slate-100 p-5 text-sm leading-relaxed text-slate-700">
                <p className="font-bold text-slate-950">Page reviewed {REVIEWED_LABEL}</p>
                <p className="mt-1">Business facts are maintained by Fabsy. Government rules remain subject to the current official source and the instructions on the individual ticket.</p>
              </div>
            </Card>
          </div>
        </section>

        <section className="bg-slate-950 px-4 py-14 text-white sm:py-16" aria-labelledby="sources-heading">
          <div className="container mx-auto max-w-6xl">
            <div className="flex items-center gap-3">
              <Scale className="h-8 w-8 text-violet-300" aria-hidden="true" />
              <h2 id="sources-heading" className="text-3xl font-bold text-white">Primary Alberta sources</h2>
            </div>
            <p className="mt-4 max-w-3xl leading-relaxed text-slate-300">
              Use the ticket itself and current official sources for deadlines, available actions, demerit rules, and automated-enforcement rules.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {officialSources.map((source) => (
                <a
                  key={source.href}
                  href={source.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-white/10 bg-white/5 p-5 transition-colors hover:bg-white/10"
                >
                  <span className="flex items-center gap-2 font-bold text-white">
                    {source.title}
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="mt-2 block text-sm leading-relaxed text-slate-300">{source.description}</span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-14 text-center sm:py-16">
          <div className="container mx-auto max-w-4xl">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Apply the general information to your actual ticket</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">Ticket Triage turns the ticket and your context into a practical, human-reviewed next-step recommendation.</p>
            <Button asChild size="lg" className="mt-7 min-h-12 px-8">
              <Link
                to={TICKET_ASSESSMENT.intakePath}
                onClick={() => trackAssessmentEvent(
                  "assessment_cta_click",
                  { location: "ai_info_final", destination: "assessment_intake", value: TICKET_ASSESSMENT.priceCad },
                  "ai_info_final",
                )}
              >
                {TICKET_ASSESSMENT.cta}
                <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </Link>
            </Button>
            <p className="mt-5 text-sm text-muted-foreground">
              Start with one secure upload, then choose the level of service you need. <Link to="/traffic-ticket-assessment/start" className="font-semibold text-primary underline underline-offset-4">Start the free ticket review</Link>.
            </p>
          </div>
        </section>
      </article>

      <Footer />
    </main>
  );
}
